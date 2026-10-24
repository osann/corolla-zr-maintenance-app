import { beforeAll, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/connection.js';
import { users, sessions, userData, sharedData, products } from '../src/db/schema.js';
import { initDb } from '../src/db/init.js';
import { seed } from '../src/db/seed.js';
import { sessionExpiresAt } from '../src/lib/auth.js';
import authRouter from '../src/routes/auth.js';
import productsRouter from '../src/routes/products.js';

// Mirrors the mounting in src/index.ts without its side effects (server, cron).
const app = new Hono();
app.route('/api', authRouter);
app.route('/api', productsRouter);

// setup.ts sets OWNER_EMAIL to owner@example.com, which makes that account the admin.
const ADMIN = 'admin-session';
const MEMBER = 'member-session';
const CATEGORIES = 'corolla-categories-v1';
let ownerId: number;
let memberId: number;

const request = (session: string, path: string, init: RequestInit = {}) =>
  app.request(path, {
    ...init,
    headers: { cookie: `session=${session}`, 'Content-Type': 'application/json' },
  });
const pull = async (session: string) => (await (await request(session, '/api/sync')).json()) as Record<string, unknown>;
const push = (session: string, key: string, value: unknown) =>
  request(session, `/api/sync/${key}`, { method: 'POST', body: JSON.stringify(value) });
const stored = async (userId: number, key: string) => {
  const [row] = await db
    .select()
    .from(userData)
    .where(and(eq(userData.userId, userId), eq(userData.key, key)));
  return row ? JSON.parse(row.valueJson) : undefined;
};
const sharedCategories = async () => {
  const [row] = await db.select().from(sharedData).where(eq(sharedData.key, CATEGORIES));
  return row ? JSON.parse(row.valueJson) : undefined;
};

beforeAll(async () => {
  await initDb();
  await seed();
  [{ id: ownerId }] = await db.insert(users).values({ email: 'owner@example.com' }).returning();
  [{ id: memberId }] = await db.insert(users).values({ email: 'member@example.com' }).returning();
  await db.insert(sessions).values([
    { sessionId: ADMIN, userId: ownerId, expiresAt: sessionExpiresAt(1) },
    { sessionId: MEMBER, userId: memberId, expiresAt: sessionExpiresAt(1) },
  ]);
});

describe('moving the owner categories into shared_data', () => {
  const ownCategories = [{ label: 'Exterior', sections: [{ label: 'Wash', slugs: ['a'] }] }];

  it("moves the owner's copy once, and never overwrites the shared one", async () => {
    await db.insert(userData).values({ userId: ownerId, key: CATEGORIES, valueJson: JSON.stringify(ownCategories) });
    await initDb();
    expect(await sharedCategories()).toEqual(ownCategories);
    expect(await stored(ownerId, CATEGORIES)).toBeUndefined();

    // A stray per-user copy appearing later is left where it is.
    await db.insert(userData).values({ userId: ownerId, key: CATEGORIES, valueJson: '[]' });
    await initDb();
    expect(await sharedCategories()).toEqual(ownCategories);
    await db.delete(userData).where(eq(userData.key, CATEGORIES));
  });
});

describe('sync', () => {
  const categories = [{ label: 'Interior', sections: [{ label: 'Glass', slugs: ['b'] }] }];

  it('lets only the admin change the shared categories', async () => {
    expect((await push(MEMBER, CATEGORIES, [])).status).toBe(403);
    expect((await push(ADMIN, CATEGORIES, categories)).status).toBe(200);
    expect(await sharedCategories()).toEqual(categories);
    expect(await stored(ownerId, CATEGORIES)).toBeUndefined();
  });

  it('gives every account the shared categories', async () => {
    expect((await pull(MEMBER))[CATEGORIES]).toEqual(categories);
    expect((await pull(ADMIN))[CATEGORIES]).toEqual(categories);
  });

  it("keeps each account's own stores to itself", async () => {
    const log = [{ id: 1, date: '2026-10-01', type: 'r1', steps: [], notes: 'member wash' }];
    expect((await push(MEMBER, 'corolla-washlog-v1', log)).status).toBe(200);
    expect((await pull(MEMBER))['corolla-washlog-v1']).toEqual(log);
    expect((await pull(ADMIN))['corolla-washlog-v1']).toBeUndefined();
  });
});

describe('renaming a product', () => {
  let product: { id: number; slug: string; name: string };

  beforeAll(async () => {
    [product] = await db
      .select({ id: products.id, slug: products.slug, name: products.name })
      .from(products)
      .where(eq(products.isPack, false))
      .limit(1);
    const s = product.slug;
    await push(MEMBER, 'corolla-checklist-v3', {
      phases: [{ id: 1, tag: 'P1', title: 'Essentials', items: [s, 'other'] }],
      nextId: 2,
      checked: { [s]: true, other: false },
    });
    await push(MEMBER, 'corolla-inventory-v1', {
      [s]: { remainingMl: 100 },
      [`${s}:Sponge`]: { remainingMl: 1 },
      [`${s}-xl`]: { remainingMl: 5 },
      _order: ['Exterior'],
    });
    await push(MEMBER, 'corolla-price-alerts-v1', { [s]: { thresholdCents: 999, channel: 'email' } });
    await push(MEMBER, 'corolla-routines-v1', [
      { id: 'r1', name: 'Wash', steps: [{ name: 'Foam', products: [{ name: product.name, ml: 30 }] }] },
    ]);
    await push(ADMIN, CATEGORIES, [{ label: 'Exterior', sections: [{ label: 'Wash', slugs: [s, 'other'] }] }]);
  });

  it("rewrites every account's slug references, including the shared categories", async () => {
    const res = await request(ADMIN, `/api/products/${product.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ slug: 'renamed-slug' }),
    });
    expect(res.status).toBe(200);

    expect(await stored(memberId, 'corolla-checklist-v3')).toEqual({
      phases: [{ id: 1, tag: 'P1', title: 'Essentials', items: ['renamed-slug', 'other'] }],
      nextId: 2,
      checked: { 'renamed-slug': true, other: false },
    });
    expect(await stored(memberId, 'corolla-inventory-v1')).toEqual({
      'renamed-slug': { remainingMl: 100 },
      'renamed-slug:Sponge': { remainingMl: 1 },
      [`${product.slug}-xl`]: { remainingMl: 5 }, // a different product that merely starts with the slug
      _order: ['Exterior'],
    });
    expect(await stored(memberId, 'corolla-price-alerts-v1')).toEqual({
      'renamed-slug': { thresholdCents: 999, channel: 'email' },
    });
    expect(await sharedCategories()).toEqual([
      { label: 'Exterior', sections: [{ label: 'Wash', slugs: ['renamed-slug', 'other'] }] },
    ]);
  });

  it("rewrites every account's routine steps that use the product by name", async () => {
    const res = await request(ADMIN, `/api/products/${product.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed Product' }),
    });
    expect(res.status).toBe(200);
    expect(await stored(memberId, 'corolla-routines-v1')).toEqual([
      { id: 'r1', name: 'Wash', steps: [{ name: 'Foam', products: [{ name: 'Renamed Product', ml: 30 }] }] },
    ]);
  });
});
