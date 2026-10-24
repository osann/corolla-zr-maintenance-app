import { beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/connection.js';
import { products, retailerUrls, deletedProducts, isRetailerUrl } from '../src/db/schema.js';
import { createClient } from '@libsql/client';
import { initDb, RETIRED_RETAILERS } from '../src/db/init.js';
import { seed, seedPacks } from '../src/db/seed.js';

const reseed = async () => {
  await seed();
  await seedPacks();
};
const productCount = async () => (await db.select({ id: products.id }).from(products)).length;

beforeAll(async () => {
  await initDb();
  await reseed();
});

it('seeds the catalogue with retailer URLs', async () => {
  expect(await productCount()).toBeGreaterThan(20);
  expect((await db.select().from(retailerUrls)).length).toBeGreaterThan(20);
});

it('seeds no URLs for retired retailers', async () => {
  const retailers = new Set((await db.select({ r: retailerUrls.retailer }).from(retailerUrls)).map((x) => x.r));
  expect([...retailers].sort()).toEqual(['autobarn', 'supercheap']);
});

// Production cleanup: rows for retired retailers left over in Turso are deleted on boot.
it('initDb removes URLs and price history for retired retailers', async () => {
  const [p] = await db.select().from(products).limit(1);
  const client = createClient({ url: process.env.TURSO_URL! });
  for (const r of RETIRED_RETAILERS) {
    await client.execute({
      sql: `INSERT OR REPLACE INTO retailer_urls (product_id, retailer, url) VALUES (?, ?, 'https://example.com')`,
      args: [p.id, r],
    });
    await client.execute({
      sql: `INSERT INTO price_history (product_id, retailer, price_cents) VALUES (?, ?, 1000)`,
      args: [p.id, r],
    });
  }
  const count = async (table: string) =>
    Number(
      (await client.execute(`SELECT COUNT(*) AS n FROM ${table} WHERE retailer IN ('repco','autopro','bowdens')`))
        .rows[0].n,
    );
  expect(await count('retailer_urls')).toBe(3);
  expect(await count('price_history')).toBe(3);

  await initDb();

  expect(await count('retailer_urls')).toBe(0);
  expect(await count('price_history')).toBe(0);
  expect((await db.select().from(retailerUrls)).length).toBeGreaterThan(20); // active retailers untouched
  client.close();
});

it('seeds every URL on its own retailer’s site', async () => {
  const wrong = (await db.select().from(retailerUrls)).filter((row) => !isRetailerUrl(row.retailer, row.url));
  expect(wrong).toEqual([]);
});

// Production cleanup: two Auto Barn URLs had been saved as Supercheap ones and never got a price.
it('initDb removes URLs on the wrong retailer’s site', async () => {
  const [p] = await db.select().from(products).where(eq(products.slug, 'foursome-brush-set'));
  const autobarnPage = 'https://autobarn.com.au/ab/p/CC07299?queryID=abc&indexUsed=autobarnProductIndex';
  await db.insert(retailerUrls).values({ productId: p.id, retailer: 'supercheap', url: autobarnPage });
  const before = (await db.select().from(retailerUrls)).length;

  await initDb();

  const after = await db.select().from(retailerUrls);
  expect(after.length).toBe(before - 1);
  expect(after.some((row) => row.url === autobarnPage)).toBe(false);
  expect(after.some((row) => row.productId === p.id && row.retailer === 'autobarn')).toBe(true);
});

it('is idempotent', async () => {
  const before = await productCount();
  await reseed();
  expect(await productCount()).toBe(before);
});

// Production regression (2026-07-14): a slug renamed in the UI made seed() hit the UNIQUE
// name constraint and crash the whole `npm start` sequence.
it('survives a product whose slug was renamed in the UI', async () => {
  const [p] = await db.select().from(products).limit(1);
  await db.update(products).set({ slug: 'renamed-in-ui' }).where(eq(products.id, p.id));
  const before = await productCount();

  await expect(reseed()).resolves.not.toThrow();

  expect(await productCount()).toBe(before);
  const [after] = await db.select().from(products).where(eq(products.id, p.id));
  expect(after.slug).toBe('renamed-in-ui');
});

it('does not resurrect a product deleted in the UI', async () => {
  const [p] = await db.select().from(products).where(eq(products.isPack, false)).limit(1);
  await db.insert(deletedProducts).values({ slug: p.slug, name: p.name });
  await db.delete(retailerUrls).where(eq(retailerUrls.productId, p.id));
  await db.delete(products).where(eq(products.id, p.id));

  await reseed();

  expect(await db.select().from(products).where(eq(products.slug, p.slug))).toHaveLength(0);
});
