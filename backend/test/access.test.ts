import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { createClient } from '@libsql/client';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/connection.js';
import { users, sessions, magicTokens, userData } from '../src/db/schema.js';
import { initDb } from '../src/db/init.js';
import { hashToken, sessionExpiresAt, tokenExpiresAt } from '../src/lib/auth.js';
import authRouter from '../src/routes/auth.js';
import productsRouter from '../src/routes/products.js';
import ticktickRouter from '../src/routes/ticktick.js';

// Mirrors the mounting in src/index.ts without its side effects (server, cron).
const app = new Hono();
app.route('/api', authRouter);
app.route('/api', productsRouter);
app.route('/api', ticktickRouter);

// setup.ts sets OWNER_EMAIL to owner@example.com, which makes that account the admin.
const ADMIN = 'admin-session';
const MEMBER = 'member-session';
const withSession = (session: string, init: RequestInit = {}) => ({
  ...init,
  headers: { cookie: `session=${session}` },
});
const joinedAt = async (email: string) =>
  (await db.select({ joinedAt: users.joinedAt }).from(users).where(eq(users.email, email)))[0]?.joinedAt;

beforeAll(async () => {
  // The users table as it was before invites: no joined_at column.
  const client = createClient({ url: process.env.TURSO_URL! });
  await client.execute(`CREATE TABLE users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT    NOT NULL UNIQUE,
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await client.execute(`INSERT INTO users (email, created_at) VALUES ('owner@example.com', '2026-07-01 09:30:00')`);
  client.close();

  await initDb();

  const [owner] = await db.select().from(users).where(eq(users.email, 'owner@example.com'));
  const [member] = await db.insert(users).values({ email: 'member@example.com' }).returning();
  await db.insert(sessions).values([
    { sessionId: ADMIN, userId: owner.id, expiresAt: sessionExpiresAt(1) },
    { sessionId: MEMBER, userId: member.id, expiresAt: sessionExpiresAt(1) },
  ]);
});

describe('users.joined_at', () => {
  it('backfills accounts from before invites as joined, only when the column is added', async () => {
    expect(await joinedAt('owner@example.com')).toBe('2026-07-01T09:30:00.000Z');
    expect(await joinedAt('member@example.com')).toBeNull();

    await initDb();
    expect(await joinedAt('member@example.com')).toBeNull();
  });

  it('is set by the first sign-in and kept on later ones', async () => {
    const [pending] = await db.insert(users).values({ email: 'pending@example.com' }).returning();
    const verify = async (raw: string) => {
      await db
        .insert(magicTokens)
        .values({ tokenHash: hashToken(raw), userId: pending.id, expiresAt: tokenExpiresAt() });
      return app.request('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: raw }),
      });
    };

    expect((await verify('first-link')).status).toBe(200);
    const first = await joinedAt('pending@example.com');
    expect(first).toMatch(/^\d{4}-\d\d-\d\dT/);

    expect((await verify('second-link')).status).toBe(200);
    expect(await joinedAt('pending@example.com')).toBe(first);
  });
});

describe('GET /api/auth/me', () => {
  it('reports the OWNER_EMAIL account as admin', async () => {
    const res = await app.request('/api/auth/me', withSession(ADMIN));
    expect(await res.json()).toEqual({ authenticated: true, email: 'owner@example.com', isAdmin: true });
  });

  it('reports anyone else as a regular user', async () => {
    const res = await app.request('/api/auth/me', withSession(MEMBER));
    expect(await res.json()).toEqual({ authenticated: true, email: 'member@example.com', isAdmin: false });
  });

  it('treats a session whose user was deleted as signed out', async () => {
    const [gone] = await db.insert(users).values({ email: 'gone@example.com' }).returning();
    await db.insert(sessions).values({ sessionId: 'orphan', userId: gone.id, expiresAt: sessionExpiresAt(1) });
    await db.delete(users).where(eq(users.id, gone.id));
    expect(await (await app.request('/api/auth/me', withSession('orphan'))).json()).toEqual({ authenticated: false });
  });
});

describe('product catalogue writes', () => {
  const writes: [string, string][] = [
    ['POST', '/api/products'],
    ['PUT', '/api/products/1/url'],
    ['PATCH', '/api/products/1'],
    ['PUT', '/api/products/1/pack'],
    ['DELETE', '/api/products/1/pack'],
    ['DELETE', '/api/products/1/url/supercheap'],
    ['DELETE', '/api/products/1'],
  ];

  it.each(writes)('%s %s needs a session', async (method, path) => {
    expect((await app.request(path, { method })).status).toBe(401);
  });

  it.each(writes)('%s %s is admin only', async (method, path) => {
    expect((await app.request(path, withSession(MEMBER, { method }))).status).toBe(403);
  });
});

describe('TickTick', () => {
  const guarded: [string, string][] = [
    ['GET', '/api/ticktick/auth'],
    ['GET', '/api/ticktick/projects'],
    ['DELETE', '/api/ticktick/disconnect'],
  ];

  it.each(guarded)('%s %s needs a session', async (method, path) => {
    expect((await app.request(path, { method })).status).toBe(401);
  });

  it.each(guarded)('%s %s is admin only', async (method, path) => {
    expect((await app.request(path, withSession(MEMBER, { method }))).status).toBe(403);
  });

  it('reports not connected to anyone but the admin', async () => {
    expect(await (await app.request('/api/ticktick/status')).json()).toEqual({ connected: false });
    expect(await (await app.request('/api/ticktick/status', withSession(MEMBER))).json()).toEqual({ connected: false });
  });

  it('rejects a callback whose state the app never issued', async () => {
    const res = await app.request('/api/ticktick/callback?code=abc&state=forged');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toMatch(/\?ticktick=error$/);
  });

  it('accepts the state it issued, once', async () => {
    const start = await app.request('/api/ticktick/auth', withSession(ADMIN));
    expect(start.status).toBe(302);
    const state = new URL(start.headers.get('location')!).searchParams.get('state');
    expect(state).toMatch(/^[0-9a-f]{64}$/);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }));
    try {
      const done = await app.request(`/api/ticktick/callback?code=abc&state=${state}`);
      expect(done.headers.get('location')).toMatch(/\?ticktick=connected$/);

      const replay = await app.request(`/api/ticktick/callback?code=abc&state=${state}`);
      expect(replay.headers.get('location')).toMatch(/\?ticktick=error$/);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }

    const [owner] = await db.select().from(users).where(eq(users.email, 'owner@example.com'));
    const stored = await db
      .select()
      .from(userData)
      .where(and(eq(userData.userId, owner.id), eq(userData.key, 'ticktick-oauth-v1')));
    expect(stored).toHaveLength(1);
  });
});
