import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../src/db/connection.js';
import {
  products,
  retailerUrls,
  priceHistory,
  deletedProducts,
  users,
  userData,
  sharedData,
} from '../src/db/schema.js';
import { initDb } from '../src/db/init.js';
import { seed } from '../src/db/seed.js';
import { retireCatalogueData, RETIRED_URLS } from '../src/lib/retire.js';

const CHUBBY = 'the-chubby-wheel-brush';
const LITTLE = 'little-chubby-v2';
const AEROSPACE = '303-aerospace';

let annId: number;
let benId: number;
let chubbyId: number;
let retiredIds: number[];
const idOf = async (slug: string) =>
  (await db.select({ id: products.id }).from(products).where(eq(products.slug, slug)))[0].id;
const stored = async (userId: number, key: string) => {
  const [row] = await db
    .select()
    .from(userData)
    .where(and(eq(userData.userId, userId), eq(userData.key, key)));
  return row ? JSON.parse(row.valueJson) : undefined;
};
const sharedCategories = async () => {
  const [row] = await db.select().from(sharedData).where(eq(sharedData.key, 'corolla-categories-v1'));
  return JSON.parse(row.valueJson);
};
const save = (userId: number, data: Record<string, unknown>) =>
  db
    .insert(userData)
    .values(Object.entries(data).map(([key, value]) => ({ userId, key, valueJson: JSON.stringify(value) })));
const step = (...names: string[]) => ({ name: 'Step', products: names.map((name) => ({ name, ml: 10 })) });

beforeAll(async () => {
  await initDb();
  await seed();
  // As in production before the deploy: the two retired products still exist.
  const inserted = await db
    .insert(products)
    .values([
      { name: 'Little Chubby Brush V2', slug: LITTLE, phase: 0 },
      { name: '303 Aerospace Protectant', slug: AEROSPACE, phase: 2 },
    ])
    .returning();
  retiredIds = inserted.map((p) => p.id);
  chubbyId = await idOf(CHUBBY);
  for (const id of [...retiredIds, chubbyId]) {
    await db
      .insert(retailerUrls)
      .values({ productId: id, retailer: 'supercheap', url: `https://www.supercheapauto.com.au/p/${id}.html` })
      .onConflictDoNothing();
    await db.insert(priceHistory).values({ productId: id, retailer: 'supercheap', priceCents: 2999 });
  }

  [{ id: annId }, { id: benId }] = await db
    .insert(users)
    .values([{ email: 'ann@example.com' }, { email: 'ben@example.com' }])
    .returning();

  // Ann owns the Little Chubby and 303, but not the Chubby.
  await save(annId, {
    'corolla-checklist-v3': {
      phases: [{ id: '2', items: ['the-flat-head', LITTLE, AEROSPACE] }],
      checked: { [LITTLE]: true, [AEROSPACE]: true, 'the-flat-head': false },
    },
    'corolla-inventory-v1': { [LITTLE]: { remainingMl: 1 }, [AEROSPACE]: { remainingMl: 200 }, _order: ['Wheels'] },
    'corolla-price-alerts-v1': {
      [LITTLE]: { thresholdCents: 2000, channel: 'email' },
      [AEROSPACE]: { thresholdCents: 2500 },
    },
    'corolla-routines-v1': [
      { id: 'r1', steps: [step('Wheely Clean', 'Little Chubby Brush V2'), step('303 Aerospace Protectant 473ml')] },
    ],
  });
  // Ben already has the Chubby, so the Little Chubby just goes.
  await save(benId, {
    'corolla-checklist-v3': {
      phases: [
        { id: '1', items: [CHUBBY] },
        { id: '2', items: [LITTLE] },
      ],
      checked: { [CHUBBY]: false, [LITTLE]: true },
    },
    'corolla-inventory-v1': { [CHUBBY]: { remainingMl: 1 }, [LITTLE]: { remainingMl: 1 } },
    'corolla-routines-v1': [{ id: 'r1', steps: [step('The Chubby Wheel Brush', 'Little Chubby Brush V2')] }],
  });
  await db.insert(sharedData).values({
    key: 'corolla-categories-v1',
    valueJson: JSON.stringify([
      { label: 'Wheels', sections: [{ label: 'Equipment', slugs: [LITTLE, 'the-flat-head'] }] },
      { label: 'Interior Protect', sections: [{ label: 'Plastic, Vinyl & Rubber', slugs: [AEROSPACE] }] },
    ]),
  });

  await retireCatalogueData();
});

describe('retiring products', () => {
  it('deletes them with their URLs and prices, and tombstones them', async () => {
    const slugs = (await db.select({ slug: products.slug }).from(products)).map((p) => p.slug);
    expect(slugs).toContain(CHUBBY);
    expect(slugs).not.toContain(LITTLE);
    expect(slugs).not.toContain(AEROSPACE);
    expect((await db.select().from(retailerUrls)).filter((u) => retiredIds.includes(u.productId))).toEqual([]);
    expect((await db.select().from(priceHistory)).map((p) => p.productId)).toEqual([chubbyId]);
    const tombstones = await db
      .select()
      .from(deletedProducts)
      .where(inArray(deletedProducts.slug, [LITTLE, AEROSPACE]));
    expect(tombstones).toHaveLength(2);
  });

  it("moves a duplicate's references to the product it duplicated", async () => {
    expect(await stored(annId, 'corolla-checklist-v3')).toEqual({
      phases: [{ id: '2', items: ['the-flat-head', CHUBBY] }],
      checked: { [CHUBBY]: true, 'the-flat-head': false },
    });
    expect(await stored(annId, 'corolla-inventory-v1')).toEqual({ [CHUBBY]: { remainingMl: 1 }, _order: ['Wheels'] });
    expect(await stored(annId, 'corolla-price-alerts-v1')).toEqual({
      [CHUBBY]: { thresholdCents: 2000, channel: 'email' },
    });
    expect((await stored(annId, 'corolla-routines-v1'))[0].steps[0]).toEqual(
      step('Wheely Clean', 'The Chubby Wheel Brush'),
    );
  });

  it("doesn't list the replacement twice when an account already has it", async () => {
    expect(await stored(benId, 'corolla-checklist-v3')).toEqual({
      phases: [
        { id: '1', items: [CHUBBY] },
        { id: '2', items: [] },
      ],
      checked: { [CHUBBY]: true },
    });
    expect(await stored(benId, 'corolla-inventory-v1')).toEqual({ [CHUBBY]: { remainingMl: 1 } });
    expect((await stored(benId, 'corolla-routines-v1'))[0].steps[0]).toEqual(step('The Chubby Wheel Brush'));
  });

  it('removes a product that has no replacement from every store', async () => {
    const routines = await stored(annId, 'corolla-routines-v1');
    expect(routines[0].steps[1]).toEqual(step());
    expect(JSON.stringify(await stored(annId, 'corolla-checklist-v3'))).not.toContain(AEROSPACE);
    expect(await stored(annId, 'corolla-inventory-v1')).not.toHaveProperty(AEROSPACE);
    expect(await stored(annId, 'corolla-price-alerts-v1')).not.toHaveProperty(AEROSPACE);
  });

  it('updates the shared categories', async () => {
    expect(await sharedCategories()).toEqual([
      { label: 'Wheels', sections: [{ label: 'Equipment', slugs: [CHUBBY, 'the-flat-head'] }] },
      { label: 'Interior Protect', sections: [{ label: 'Plastic, Vinyl & Rubber', slugs: [] }] },
    ]);
  });

  it('changes nothing on later boots, and seed() leaves them retired', async () => {
    const before = await db.select().from(userData);
    await retireCatalogueData();
    await seed();
    expect(await db.select().from(userData)).toEqual(before);
    const slugs = (await db.select({ slug: products.slug }).from(products)).map((p) => p.slug);
    expect(slugs).not.toContain(LITTLE);
    expect(slugs).not.toContain(AEROSPACE);
  });
});

describe('retiring URLs', () => {
  const urlsOf = async (productId: number) =>
    (await db.select().from(retailerUrls).where(eq(retailerUrls.productId, productId))).map((u) => u.retailer).sort();
  const pricesOf = async (productId: number) =>
    (await db.select().from(priceHistory).where(eq(priceHistory.productId, productId))).map((p) => p.retailer).sort();

  it("removes each one with that retailer's prices, then seed() puts in the corrected URL", async () => {
    const ids = await Promise.all(RETIRED_URLS.map(({ slug }) => idOf(slug)));
    // As in production before the deploy, with a price from every retailer.
    for (const [i, { retailer, url }] of RETIRED_URLS.entries()) {
      await db
        .insert(retailerUrls)
        .values({ productId: ids[i], retailer, url })
        .onConflictDoUpdate({ target: [retailerUrls.productId, retailerUrls.retailer], set: { url } });
      for (const r of ['supercheap', 'autobarn', 'bowdens'] as const) {
        await db.insert(priceHistory).values({ productId: ids[i], retailer: r, priceCents: 1999 });
      }
    }

    await retireCatalogueData();
    for (const [i, { retailer }] of RETIRED_URLS.entries()) {
      expect(await urlsOf(ids[i])).not.toContain(retailer);
      expect(await pricesOf(ids[i])).toEqual(['autobarn', 'bowdens', 'supercheap'].filter((r) => r !== retailer));
    }

    await seed();
    const wipeOutId = await idOf('wipe-out-500ml');
    const [wipeOutAutobarn] = await db
      .select()
      .from(retailerUrls)
      .where(and(eq(retailerUrls.productId, wipeOutId), eq(retailerUrls.retailer, 'autobarn')));
    expect(wipeOutAutobarn.url).toMatch(/Wipe-Out-500ml\/p\/210236$/);

    // The corrected URL isn't touched on later boots.
    await db.insert(priceHistory).values({ productId: wipeOutId, retailer: 'autobarn', priceCents: 1699 });
    await retireCatalogueData();
    expect(await pricesOf(wipeOutId)).toEqual(['autobarn', 'bowdens', 'supercheap']);
  });
});
