import { createHash, randomBytes } from 'node:crypto';
import type { Context, Next } from 'hono';
import { db } from '../db/connection.js';
import { sessions } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export type AppEnv = { Variables: { userId: number | null } };

export const generateToken    = () => randomBytes(32).toString('hex');
export const hashToken        = (raw: string) => createHash('sha256').update(raw).digest('hex');
export const tokenExpiresAt   = (mins = 15) => new Date(Date.now() + mins * 60_000).toISOString();
export const sessionExpiresAt = (days = 30) => new Date(Date.now() + days * 86_400_000).toISOString();

export async function sessionMiddleware(c: Context<AppEnv>, next: Next) {
  c.set('userId', null);
  const cookieHeader = c.req.header('cookie') ?? '';
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  const sessionId = match?.[1] ?? null;

  if (sessionId) {
    const rows = await db
      .select({ userId: sessions.userId, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(eq(sessions.sessionId, sessionId))
      .limit(1);

    if (rows.length > 0 && new Date(rows[0].expiresAt) > new Date()) {
      c.set('userId', rows[0].userId);
    }
  }
  await next();
}
