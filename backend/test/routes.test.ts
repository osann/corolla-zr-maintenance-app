import { beforeAll, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/connection.js';
import { products, priceHistory, deletedProducts, users, sessions } from '../src/db/schema.js';
import { initDb } from '../src/db/init.js';
import { seed, seedPacks } from '../src/db/seed.js';
import { sessionExpiresAt } from '../src/lib/auth.js';
import productsRouter from '../src/routes/products.js';
import pricesRouter from '../src/routes/prices.js';

// Mirrors the mounting in src/index.ts without its side effects (server, cron).
const app = new Hono();
app.route('/api', productsRouter);
app.route('/api', pricesRouter);

const SESSION = 'test-session-id';
let slug: string;

beforeAll(async () => {
  await initDb();
  await seed();
  await seedPacks();
  const [user] = await db.insert(users).values({ email: 'owner@example.com' }).returning();
  await db.insert(sessions).values({ sessionId: SESSION, userId: user.id, expiresAt: sessionExpiresAt(1) });
  [{ slug }] = await db.select({ slug: products.slug }).from(products).where(eq(products.isPack, false)).limit(1);
});

const postPrices = (body: unknown, secret = 'test-secret') =>
  app.request('/api/prices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
  });

describe('GET /api/products', () => {
  it('lists seeded products with retailer URLs and pack info', async () => {
    const res = await app.request('/api/products');
    expect(res.status).toBe(200);
    const list = (await res.json()) as { slug: string; urls?: Record<string, string>; isPack?: boolean }[];
    expect(list.length).toBeGreaterThan(20);
    expect(list.some((p) => p.urls && Object.keys(p.urls).length > 0)).toBe(true);
    expect(list.some((p) => p.isPack)).toBe(true);
  });
});

describe('POST /api/prices', () => {
  it('rejects a wrong scrape secret', async () => {
    expect(
      (await postPrices([{ slug, retailer: 'supercheap', priceCents: 1000, compareAtCents: null }], 'nope')).status,
    ).toBe(401);
  });

  it('stores known slugs and skips unknown ones', async () => {
    const res = await postPrices([
      { slug, retailer: 'supercheap', priceCents: 2500, compareAtCents: null },
      { slug: 'no-such-product', retailer: 'supercheap', priceCents: 100, compareAtCents: null },
    ]);
    expect(await res.json()).toEqual({ inserted: 1, skipped: 1 });
  });

  it('skips observations for retired retailers', async () => {
    const res = await postPrices([{ slug, retailer: 'repco', priceCents: 1500, compareAtCents: null }]);
    expect(await res.json()).toEqual({ inserted: 0, skipped: 1 });
  });

  it('flags a sale when the compare-at price is higher', async () => {
    await postPrices([{ slug, retailer: 'autobarn', priceCents: 1999, compareAtCents: 2999 }]);
    const rows = await db.select().from(priceHistory).where(eq(priceHistory.retailer, 'autobarn'));
    expect(rows).toHaveLength(1);
    expect(rows[0].onSale).toBe(true);
  });
});

describe('DELETE /api/products/:id', () => {
  it('requires a session', async () => {
    const [p] = await db.select().from(products).where(eq(products.slug, slug));
    expect((await app.request(`/api/products/${p.id}`, { method: 'DELETE' })).status).toBe(401);
  });

  it('deletes the product, its price history, and records a tombstone that survives a reseed', async () => {
    const [p] = await db.select().from(products).where(eq(products.slug, slug));
    const res = await app.request(`/api/products/${p.id}`, {
      method: 'DELETE',
      headers: { cookie: `session=${SESSION}` },
    });
    expect(res.status).toBe(200);
    expect(await db.select().from(priceHistory).where(eq(priceHistory.productId, p.id))).toHaveLength(0);
    expect(await db.select().from(deletedProducts).where(eq(deletedProducts.slug, slug))).toHaveLength(1);

    await seed();
    expect(await db.select().from(products).where(eq(products.slug, slug))).toHaveLength(0);
  });
});
