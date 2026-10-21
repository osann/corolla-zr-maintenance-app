import { beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/connection.js';
import { products, retailerUrls, deletedProducts } from '../src/db/schema.js';
import { initDb } from '../src/db/init.js';
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
