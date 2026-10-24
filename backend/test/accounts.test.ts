import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../src/db/connection.js';
import { users, sessions, magicTokens, userData, photos } from '../src/db/schema.js';
import { initDb } from '../src/db/init.js';
import { sessionExpiresAt } from '../src/lib/auth.js';
import { sendInvite, sendMagicLink } from '../src/lib/email.js';
import { deleteFromR2 } from '../src/lib/r2.js';
import authRouter from '../src/routes/auth.js';
import adminRouter from '../src/routes/admin.js';

// Record outgoing email and R2 deletes instead of performing them; the rest of each module is real.
vi.mock('../src/lib/email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/email.js')>()),
  sendMagicLink: vi.fn(async () => {}),
  sendInvite: vi.fn(async () => {}),
}));
vi.mock('../src/lib/r2.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/r2.js')>()),
  deleteFromR2: vi.fn(async () => {}),
}));

// Mirrors the mounting in src/index.ts without its side effects (server, cron).
const app = new Hono();
app.route('/api', authRouter);
app.route('/api', adminRouter);

// setup.ts sets OWNER_EMAIL to owner@example.com, which makes that account the admin.
const ADMIN = 'admin-session';
const MEMBER = 'member-session';
let ownerId: number;

const json = (body: unknown, session?: string): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(session ? { cookie: `session=${session}` } : {}) },
  body: JSON.stringify(body),
});
const asUser = (session: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: { cookie: `session=${session}` },
});
const invite = (email: string, session = ADMIN) => app.request('/api/admin/invites', json({ email }, session));
const tokenOf = (link: string) => new URL(link).searchParams.get('token')!;
const verify = (token: string) => app.request('/api/auth/verify', json({ token }));
const userByEmail = async (email: string) => (await db.select().from(users).where(eq(users.email, email)))[0];

beforeAll(async () => {
  await initDb();
  [{ id: ownerId }] = await db
    .insert(users)
    .values({ email: 'owner@example.com', joinedAt: new Date().toISOString() })
    .returning();
  const [member] = await db
    .insert(users)
    .values({ email: 'member@example.com', joinedAt: new Date().toISOString() })
    .returning();
  await db.insert(sessions).values([
    { sessionId: ADMIN, userId: ownerId, expiresAt: sessionExpiresAt(1) },
    { sessionId: MEMBER, userId: member.id, expiresAt: sessionExpiresAt(1) },
  ]);
});

beforeEach(() => {
  vi.mocked(sendMagicLink).mockClear();
  vi.mocked(sendInvite).mockClear();
  vi.mocked(deleteFromR2).mockClear();
});

describe('POST /api/auth/request', () => {
  it('quietly ignores an address with no account or invite', async () => {
    const res = await app.request('/api/auth/request', json({ email: 'stranger@example.com' }));
    expect(await res.json()).toEqual({ ok: true });
    expect(sendMagicLink).not.toHaveBeenCalled();
    expect(await userByEmail('stranger@example.com')).toBeUndefined();
  });

  it("creates the admin's account on their first sign-in", async () => {
    await db.delete(sessions).where(eq(sessions.userId, ownerId));
    await db.delete(users).where(eq(users.id, ownerId));

    await app.request('/api/auth/request', json({ email: 'Owner@Example.com' }));
    expect(sendMagicLink).toHaveBeenCalledWith('owner@example.com', expect.any(String));
    const owner = await userByEmail('owner@example.com');
    expect(owner).toBeDefined();

    ownerId = owner.id;
    await db.insert(sessions).values({ sessionId: ADMIN, userId: ownerId, expiresAt: sessionExpiresAt(1) });
  });
});

describe('admin routes', () => {
  it.each([
    ['GET', '/api/admin/users'],
    ['POST', '/api/admin/invites'],
    ['DELETE', '/api/admin/users/1'],
  ])('%s %s is admin only', async (method, path) => {
    expect((await app.request(path, { method })).status).toBe(401);
    expect((await app.request(path, asUser(MEMBER, { method }))).status).toBe(403);
  });
});

describe('inviting someone', () => {
  let firstLink: string;

  it('rejects an address that already has an account, or is not an address', async () => {
    expect((await invite('member@example.com')).status).toBe(409);
    expect((await invite('owner@example.com')).status).toBe(409);
    expect((await invite('not-an-email')).status).toBe(400);
  });

  it('creates a pending account and emails a 7-day link, also returned to the admin', async () => {
    const res = await invite(' New@Example.com ');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { link: string; emailed: boolean };
    expect(body.emailed).toBe(true);
    firstLink = body.link;
    expect(sendInvite).toHaveBeenCalledWith('new@example.com', tokenOf(firstLink));

    const pending = await userByEmail('new@example.com');
    expect(pending.joinedAt).toBeNull();
    const [token] = await db.select().from(magicTokens).where(eq(magicTokens.userId, pending.id));
    const days = (new Date(token.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
  });

  it('still returns the link when the email fails', async () => {
    vi.mocked(sendInvite).mockRejectedValueOnce(new Error('Resend rejected the invite'));
    const res = await invite('bounce@example.com');
    const body = (await res.json()) as { link: string; emailed: boolean };
    expect(res.status).toBe(200);
    expect(body.emailed).toBe(false);
    expect(body.link).toMatch(/\?token=[0-9a-f]{64}$/);
  });

  it('replaces the old link when the invite is resent', async () => {
    const { link } = (await (await invite('new@example.com')).json()) as { link: string };
    expect((await verify(tokenOf(firstLink))).status).toBe(401);
    firstLink = link;
  });

  it('signs the invitee in as a regular user when they accept', async () => {
    const res = await verify(tokenOf(firstLink));
    expect(res.status).toBe(200);
    const session = res.headers.get('set-cookie')?.match(/session=([^;]+)/)?.[1];
    expect(session).toBeTruthy();

    const me = await (await app.request('/api/auth/me', asUser(session!))).json();
    expect(me).toEqual({ authenticated: true, email: 'new@example.com', isAdmin: false });
    expect((await userByEmail('new@example.com')).joinedAt).not.toBeNull();
    expect((await invite('new@example.com')).status).toBe(409);
  });

  it('lets the invitee request sign-in links afterwards', async () => {
    await app.request('/api/auth/request', json({ email: 'new@example.com' }));
    expect(sendMagicLink).toHaveBeenCalledWith('new@example.com', expect.any(String));
  });
});

describe('GET /api/admin/users', () => {
  it('lists every account with its status', async () => {
    const list = (await (await app.request('/api/admin/users', asUser(ADMIN))).json()) as {
      email: string;
      isAdmin: boolean;
      joinedAt: string | null;
      inviteExpiresAt: string | null;
      createdAt: string;
    }[];
    const byEmail = Object.fromEntries(list.map((u) => [u.email, u]));

    expect(byEmail['owner@example.com'].isAdmin).toBe(true);
    expect(byEmail['new@example.com']).toMatchObject({ isAdmin: false, inviteExpiresAt: null });
    expect(byEmail['new@example.com'].joinedAt).not.toBeNull();
    expect(byEmail['bounce@example.com'].joinedAt).toBeNull();
    expect(byEmail['bounce@example.com'].inviteExpiresAt).not.toBeNull();
    expect(byEmail['bounce@example.com'].createdAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  });
});

describe('DELETE /api/admin/users/:id', () => {
  it('removes the account and everything it owns', async () => {
    const user = await userByEmail('new@example.com');
    await db.insert(userData).values({ userId: user.id, key: 'corolla-washlog-v1', valueJson: '[]' });
    await db.insert(photos).values({
      userId: user.id,
      logEntryId: 1,
      r2Key: `photos/${user.id}/1/a.jpg`,
      thumbKey: `photos/${user.id}/1/thumb_a.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: 1,
    });
    await db.insert(sessions).values({ sessionId: 'new-session', userId: user.id, expiresAt: sessionExpiresAt(1) });

    const res = await app.request(`/api/admin/users/${user.id}`, asUser(ADMIN, { method: 'DELETE' }));
    expect(res.status).toBe(200);

    expect(
      vi
        .mocked(deleteFromR2)
        .mock.calls.map((call) => call[0])
        .sort(),
    ).toEqual([`photos/${user.id}/1/a.jpg`, `photos/${user.id}/1/thumb_a.jpg`]);
    expect(await userByEmail('new@example.com')).toBeUndefined();
    for (const table of [photos, userData, sessions, magicTokens]) {
      expect(await db.select().from(table).where(eq(table.userId, user.id))).toHaveLength(0);
    }
    expect(await (await app.request('/api/auth/me', asUser('new-session'))).json()).toEqual({
      authenticated: false,
    });
  });

  it("won't remove the admin, and 404s for an unknown id", async () => {
    expect((await app.request(`/api/admin/users/${ownerId}`, asUser(ADMIN, { method: 'DELETE' }))).status).toBe(400);
    expect((await app.request('/api/admin/users/99999', asUser(ADMIN, { method: 'DELETE' }))).status).toBe(404);
  });

  it('cancels a pending invite', async () => {
    const pending = await userByEmail('bounce@example.com');
    await app.request(`/api/admin/users/${pending.id}`, asUser(ADMIN, { method: 'DELETE' }));
    const unused = await db
      .select()
      .from(magicTokens)
      .where(and(eq(magicTokens.userId, pending.id), isNull(magicTokens.usedAt)));
    expect(unused).toHaveLength(0);
    expect(await userByEmail('bounce@example.com')).toBeUndefined();
  });
});
