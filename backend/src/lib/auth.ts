import { createHash, randomBytes } from 'node:crypto';
import type { Context, Next } from 'hono';
import { db } from '../db/connection.js';
import { sessions, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export type AppEnv = { Variables: { userId: number | null; isAdmin: boolean } };

export const generateToken = () => randomBytes(32).toString('hex');
export const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');
export const tokenExpiresAt = (mins = 15) => new Date(Date.now() + mins * 60_000).toISOString();
export const sessionExpiresAt = (days = 30) => new Date(Date.now() + days * 86_400_000).toISOString();

// The admin is whoever signs in as OWNER_EMAIL. It isn't stored in the DB, so it can't drift from
// the env var. With OWNER_EMAIL unset there's no admin at all.
export function isAdminEmail(email: string): boolean {
  const owner = (process.env.OWNER_EMAIL ?? '').trim().toLowerCase();
  return owner !== '' && email.trim().toLowerCase() === owner;
}

export async function sessionMiddleware(c: Context<AppEnv>, next: Next) {
  c.set('userId', null);
  c.set('isAdmin', false);
  const cookieHeader = c.req.header('cookie') ?? '';
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  const sessionId = match?.[1] ?? null;

  if (sessionId) {
    // Inner join: a session whose user row has been deleted no longer counts.
    const rows = await db
      .select({ userId: sessions.userId, expiresAt: sessions.expiresAt, email: users.email })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.sessionId, sessionId))
      .limit(1);

    if (rows.length > 0 && new Date(rows[0].expiresAt) > new Date()) {
      c.set('userId', rows[0].userId);
      c.set('isAdmin', isAdminEmail(rows[0].email));
    }
  }
  await next();
}

// Use after sessionMiddleware on routes only the admin may call (the shared product catalogue).
export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  if (!c.var.userId) return c.json({ error: 'Unauthorised' }, 401);
  if (!c.var.isAdmin) return c.json({ error: 'Admin only' }, 403);
  await next();
}
