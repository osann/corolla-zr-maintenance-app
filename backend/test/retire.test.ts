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
import { retireProducts } from '../src/lib/retire.js';

const CHUBBY = 'the-chubby-wheel-brush';
const LITTLE = 'little-chubby-v2';
const AEROSPACE = '303-aerospace';

let annId: number;
let benId: number;
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
  // As in production: the Chubby was renamed in the app, and the two retired products exist.
  const inserted = await db
    .insert(products)
    .values([
      { name: 'The Chubby Wheel Brush', slug: CHUBBY, phase: 0 },
      { name: 'Little Chubby Brush V2', slug: LITTLE, phase: 0 },
      { name: '303 Aerospace Protectant', slug: AEROSPACE, phase: 2 },
    ])
    .returning();
  for (const p of inserted) {
    await db
      .insert(retailerUrls)
      .values({ productId: p.id, retailer: 'supercheap', url: `https://www.supercheapauto.com.au/p/${p.slug}.html` });
    await db.insert(priceHistory).values({ productId: p.id, retailer: 'supercheap', priceCents: 2999 });
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

  await retireProducts();
});

describe('retiring products', () => {
  it('deletes them with their URLs and prices, and tombstones them', async () => {
    const slugs = (await db.select({ slug: products.slug }).from(products)).map((p) => p.slug);
    expect(slugs).toContain(CHUBBY);
    expect(slugs).not.toContain(LITTLE);
    expect(slugs).not.toContain(AEROSPACE);
    expect(
      (await db.select().from(retailerUrls)).every((u) => !u.url.includes(LITTLE) && !u.url.includes(AEROSPACE)),
    ).toBe(true);
    const [chubby] = await db.select({ id: products.id }).from(products).where(eq(products.slug, CHUBBY));
    expect((await db.select().from(priceHistory)).map((p) => p.productId)).toEqual([chubby.id]);
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
    await retireProducts();
    await seed();
    expect(await db.select().from(userData)).toEqual(before);
    const slugs = (await db.select({ slug: products.slug }).from(products)).map((p) => p.slug);
    expect(slugs).not.toContain(LITTLE);
    expect(slugs).not.toContain(AEROSPACE);
  });
});
