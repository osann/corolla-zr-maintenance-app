import { Hono } from 'hono';
import { and, asc, eq, isNull, max } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { users, sessions, magicTokens, userData, photos } from '../db/schema.js';
import {
  sessionMiddleware,
  requireAdmin,
  generateToken,
  hashToken,
  tokenExpiresAt,
  isAdminEmail,
  type AppEnv,
} from '../lib/auth.js';
import { INVITE_DAYS, sendInvite, signInLink } from '../lib/email.js';
import { deleteFromR2 } from '../lib/r2.js';

const router = new Hono<AppEnv>();

// Every route in this file is admin-only, including any added later.
router.use('/admin/*', sessionMiddleware, requireAdmin);

// SQLite's CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" in UTC, which Safari won't parse.
const toIso = (ts: string | null) => (ts && !ts.includes('T') ? `${ts.replace(' ', 'T')}Z` : ts);

// GET /admin/users — every account, oldest first. joinedAt null = invite not accepted yet;
// inviteExpiresAt is when the latest unused link stops working (null if there's none).
router.get('/admin/users', async (c) => {
  const [rows, pendingLinks] = await Promise.all([
    db
      .select({ id: users.id, email: users.email, createdAt: users.createdAt, joinedAt: users.joinedAt })
      .from(users)
      .orderBy(asc(users.id)),
    db
      .select({ userId: magicTokens.userId, expiresAt: max(magicTokens.expiresAt) })
      .from(magicTokens)
      .where(isNull(magicTokens.usedAt))
      .groupBy(magicTokens.userId),
  ]);
  const linkExpiry = new Map(pendingLinks.map((l) => [l.userId, l.expiresAt]));

  return c.json(
    rows.map((u) => ({
      id: u.id,
      email: u.email,
      isAdmin: isAdminEmail(u.email),
      createdAt: toIso(u.createdAt),
      joinedAt: u.joinedAt,
      inviteExpiresAt: u.joinedAt ? null : (linkExpiry.get(u.id) ?? null),
    })),
  );
});

// POST /admin/invites { email } — invite someone, or resend their invite (a new link replaces any
// unused one). The invite is a magic-link token that lasts INVITE_DAYS, so accepting it is a normal
// sign-in. The link comes back in the response too, so the admin can share it another way if the
// email doesn't arrive (emailed: false when Resend rejected it).
router.post('/admin/invites', async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => ({ email: '' }));
  const email = (body.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ error: 'Enter a valid email address.' }, 400);

  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (user?.joinedAt || isAdminEmail(email)) return c.json({ error: 'That address already has an account.' }, 409);
  if (!user) [user] = await db.insert(users).values({ email }).returning();

  await db.delete(magicTokens).where(and(eq(magicTokens.userId, user.id), isNull(magicTokens.usedAt)));
  const raw = generateToken();
  await db.insert(magicTokens).values({
    tokenHash: hashToken(raw),
    userId: user.id,
    expiresAt: tokenExpiresAt(INVITE_DAYS * 24 * 60),
  });

  let emailed = true;
  try {
    await sendInvite(email, raw);
  } catch (err) {
    console.error('Invite email failed:', err);
    emailed = false;
  }
  return c.json({ ok: true, id: user.id, link: signInLink(raw), emailed });
});

// DELETE /admin/users/:id — remove an account and everything it owns: photos (in R2 and the DB),
// synced data (including TickTick tokens), sessions and links. Foreign keys aren't enforced on
// libSQL, so nothing cascades; each table is cleared explicitly. The admin can't be removed.
router.delete('/admin/users/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: 'Invalid id.' }, 400);

  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) return c.json({ error: 'Not found.' }, 404);
  if (isAdminEmail(user.email)) return c.json({ error: "The admin account can't be removed." }, 400);

  const userPhotos = await db
    .select({ r2Key: photos.r2Key, thumbKey: photos.thumbKey })
    .from(photos)
    .where(eq(photos.userId, id));
  await Promise.allSettled(userPhotos.flatMap((p) => [deleteFromR2(p.r2Key), deleteFromR2(p.thumbKey)]));

  await db.delete(photos).where(eq(photos.userId, id));
  await db.delete(userData).where(eq(userData.userId, id));
  await db.delete(sessions).where(eq(sessions.userId, id));
  await db.delete(magicTokens).where(eq(magicTokens.userId, id));
  await db.delete(users).where(eq(users.id, id));

  return c.json({ ok: true });
});

export default router;
