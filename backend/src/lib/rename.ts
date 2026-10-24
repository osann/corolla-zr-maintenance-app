// Product renames reach every account. Users' synced stores reference products by slug (checklist,
// inventory, price alerts, the shared categories) or by name (routine steps), so PATCH
// /products/:id rewrites them all here. The admin's browser also rewrites its own copy, so the UI
// updates without waiting for a reload: renameProductSlugEverywhere() and saveProductName() in
// js/products.js. Keep the two in sync.
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { userData, sharedData } from '../db/schema.js';

type Json = Record<string, unknown>;
type Rewrite = (value: unknown) => unknown;

const renameKey = (obj: Json, from: string, to: string): Json =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k === from ? to : k, v]));

const slugRewrites = (from: string, to: string): Record<string, Rewrite> => ({
  'corolla-checklist-v3': (value) => {
    const checklist = value as { phases?: { items?: string[] }[]; checked?: Json };
    return {
      ...checklist,
      phases: checklist.phases?.map((p) => ({ ...p, items: p.items?.map((s) => (s === from ? to : s)) })),
      checked: checklist.checked && renameKey(checklist.checked, from, to),
    };
  },
  // Keyed by slug, or `packSlug:componentName` for a pack's free-text components.
  'corolla-inventory-v1': (value) =>
    Object.fromEntries(
      Object.entries(value as Json).map(([k, v]) => [
        k === from ? to : k.startsWith(`${from}:`) ? `${to}:${k.slice(from.length + 1)}` : k,
        v,
      ]),
    ),
  'corolla-price-alerts-v1': (value) => renameKey(value as Json, from, to),
});

const renameInCategories =
  (from: string, to: string): Rewrite =>
  (value) =>
    (value as { sections?: { slugs?: string[] }[] }[]).map((cat) => ({
      ...cat,
      sections: cat.sections?.map((sec) => ({ ...sec, slugs: sec.slugs?.map((s) => (s === from ? to : s)) })),
    }));

// Applies each key's rewrite to every user's stored value, writing back only rows that changed.
// A row that doesn't parse, or isn't the expected shape, is left alone.
async function rewriteUserData(rewrites: Record<string, Rewrite>): Promise<void> {
  const rows = await db
    .select()
    .from(userData)
    .where(inArray(userData.key, Object.keys(rewrites)));
  for (const row of rows) {
    let next: string;
    try {
      next = JSON.stringify(rewrites[row.key](JSON.parse(row.valueJson)));
    } catch {
      continue;
    }
    if (next !== row.valueJson) {
      await db
        .update(userData)
        .set({ valueJson: next, updatedAt: new Date().toISOString() })
        .where(eq(userData.id, row.id));
    }
  }
}

export async function renameSlugInUserData(from: string, to: string): Promise<void> {
  await rewriteUserData(slugRewrites(from, to));

  const [categories] = await db.select().from(sharedData).where(eq(sharedData.key, 'corolla-categories-v1'));
  if (categories) {
    try {
      const next = JSON.stringify(renameInCategories(from, to)(JSON.parse(categories.valueJson)));
      if (next !== categories.valueJson) {
        await db
          .update(sharedData)
          .set({ valueJson: next, updatedAt: new Date().toISOString() })
          .where(eq(sharedData.key, categories.key));
      }
    } catch {
      // Not the expected shape; leave it.
    }
  }
}

export async function renameProductInRoutines(from: string, to: string): Promise<void> {
  await rewriteUserData({
    'corolla-routines-v1': (value) =>
      (value as { steps?: { products?: { name?: string }[] }[] }[]).map((routine) => ({
        ...routine,
        steps: routine.steps?.map((step) => ({
          ...step,
          products: step.products?.map((p) => (p.name === from ? { ...p, name: to } : p)),
        })),
      })),
  });
}
