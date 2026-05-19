import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { users, magicTokens, sessions, userData } from '../db/schema.js';
import {
  type AppEnv,
  generateToken,
  hashToken,
  tokenExpiresAt,
  sessionExpiresAt,
  sessionMiddleware,
} from '../lib/auth.js';
import { sendMagicLink } from '../lib/email.js';

const router = new Hono<AppEnv>();

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? '';
const ALLOWED_KEYS = [
  'corolla-detailing-app-v4',
  'corolla-washlog-v1',
  'corolla-budget-v1',
  'corolla-settings-v1',
  'corolla-price-alerts-v1',
  'corolla-routines-v1',
  'corolla-maintenance-v1',
  'corolla-maintenance-log-v1',
];

// In-memory 60s per-email cooldown (resets on Render restart — acceptable)
const cooldowns = new Map<string, number>();

// ── POST /auth/request ────────────────────────────────────────────────────────
router.post('/auth/request', async (c) => {
  const body = await c.req.json<{ email?: string }>();
  const email = (body.email ?? '').trim().toLowerCase();

  if (!email) return c.json({ error: 'Email required' }, 400);

  // Non-owner emails: silently accept — prevents enumeration
  if (email !== OWNER_EMAIL.toLowerCase()) return c.json({ ok: true });

  // 60s cooldown
  const last = cooldowns.get(email) ?? 0;
  if (Date.now() - last < 60_000) {
    return c.json({ error: 'Please wait before requesting another link.' }, 429);
  }
  cooldowns.set(email, Date.now());

  // Upsert user
  let user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (!user) {
    const inserted = await db.insert(users).values({ email }).returning();
    user = inserted[0];
  }

  // Invalidate existing unused tokens
  await db.delete(magicTokens)
    .where(and(eq(magicTokens.userId, user.id), isNull(magicTokens.usedAt)));

  // Create new token
  const raw = generateToken();
  await db.insert(magicTokens).values({
    tokenHash: hashToken(raw),
    userId:    user.id,
    expiresAt: tokenExpiresAt(15),
  });

  await sendMagicLink(email, raw);
  return c.json({ ok: true });
});

// ── POST /auth/verify ─────────────────────────────────────────────────────────
router.post('/auth/verify', async (c) => {
  const body  = await c.req.json<{ token?: string }>();
  const raw   = (body.token ?? '').trim();
  if (!raw) return c.json({ error: 'Token required' }, 400);

  const hash  = hashToken(raw);
  const rows  = await db.select().from(magicTokens).where(eq(magicTokens.tokenHash, hash)).limit(1);
  const token = rows[0];

  if (!token)          return c.json({ error: 'Invalid token' }, 401);
  if (token.usedAt)    return c.json({ error: 'Token already used' }, 401);
  if (new Date(token.expiresAt) < new Date()) return c.json({ error: 'Token expired' }, 401);

  // Mark used before creating session (prevents race on double-click)
  await db.update(magicTokens)
    .set({ usedAt: new Date().toISOString() })
    .where(eq(magicTokens.id, token.id));

  const sessionId = generateToken();
  await db.insert(sessions).values({
    sessionId,
    userId:    token.userId,
    expiresAt: sessionExpiresAt(30),
  });

  // SameSite=None required: frontend (corolla.jhosan.top) and backend (*.onrender.com) are different origins
  setCookie(c, 'session', sessionId, {
    httpOnly: true,
    secure:   true,
    sameSite: 'None',
    maxAge:   30 * 24 * 60 * 60,
    path:     '/',
  });

  return c.json({ ok: true });
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────
router.post('/auth/logout', async (c) => {
  const cookieHeader = c.req.header('cookie') ?? '';
  const match        = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  const sessionId    = match?.[1] ?? null;

  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.sessionId, sessionId));
  }

  deleteCookie(c, 'session', { path: '/' });
  return c.json({ ok: true });
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────
router.get('/auth/me', sessionMiddleware, async (c) => {
  const userId = c.var.userId;
  if (!userId) return c.json({ authenticated: false });

  const user = (await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) return c.json({ authenticated: false });

  return c.json({ authenticated: true, email: user.email });
});

// ── GET /sync ─────────────────────────────────────────────────────────────────
router.get('/sync', sessionMiddleware, async (c) => {
  const userId = c.var.userId;
  if (!userId) return c.json({ error: 'Unauthorised' }, 401);

  const rows = await db.select().from(userData).where(eq(userData.userId, userId));
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try { result[row.key] = JSON.parse(row.valueJson); } catch {}
  }
  return c.json(result);
});

// ── POST /sync/:key ───────────────────────────────────────────────────────────
router.post('/sync/:key', sessionMiddleware, async (c) => {
  const userId = c.var.userId;
  if (!userId) return c.json({ error: 'Unauthorised' }, 401);

  const key = c.req.param('key') ?? '';
  if (!ALLOWED_KEYS.includes(key)) return c.json({ error: 'Unknown key' }, 400);

  const value     = await c.req.json();
  const valueJson = JSON.stringify(value);
  const updatedAt = new Date().toISOString();

  await db.insert(userData)
    .values({ userId, key, valueJson, updatedAt })
    .onConflictDoUpdate({
      target: [userData.userId, userData.key],
      set:    { valueJson, updatedAt },
    });

  return c.json({ ok: true });
});

export default router;
