// Product renames reach every account. Users' synced stores reference products by slug (checklist,
// inventory, price alerts, the shared categories) or by name (routine steps), so PATCH
// /products/:id rewrites them all here. The admin's browser also rewrites its own copy, so the UI
// updates without waiting for a reload: renameProductSlugEverywhere() and saveProductName() in
// js/products.js. Keep the two in sync. Retired products (lib/retire.ts) are taken out of the same
// stores by removeProductFromUserData().
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

async function rewriteSharedCategories(rewrite: Rewrite): Promise<void> {
  const [categories] = await db.select().from(sharedData).where(eq(sharedData.key, 'corolla-categories-v1'));
  if (categories) {
    try {
      const next = JSON.stringify(rewrite(JSON.parse(categories.valueJson)));
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

export async function renameSlugInUserData(from: string, to: string): Promise<void> {
  await rewriteUserData(slugRewrites(from, to));
  await rewriteSharedCategories(renameInCategories(from, to));
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

// Keys `from` and `from:component` move to `to`, or are dropped when there's no `to` or the object
// already has the target key.
const moveKeys = (obj: Json, from: string, to: string | null): Json =>
  Object.fromEntries(
    Object.entries(obj).flatMap(([k, v]) => {
      if (k !== from && !k.startsWith(`${from}:`)) return [[k, v]];
      const target = to && to + k.slice(from.length);
      return target && !(target in obj) ? [[target, v]] : [];
    }),
  );

// Replaces `from` with `to` the first time it appears across a set of lists, and drops it
// everywhere else, including when `to` is already listed.
const listReplacer = (from: string, to: string | null, toListed: boolean) => {
  let placed = toListed;
  return (list: string[]) =>
    list.flatMap((s) => {
      if (s !== from) return [s];
      if (!to || placed) return [];
      placed = true;
      return [to];
    });
};

// Takes a retired product out of every account's data. With a replacement (a duplicate being
// merged), its references move to the replacement instead, without listing anything twice.
// `names` are the names routine steps may use for it.
export async function removeProductFromUserData(
  slug: string,
  names: string[],
  replacement: { slug: string; name: string } | null,
): Promise<void> {
  const to = replacement?.slug ?? null;

  await rewriteUserData({
    'corolla-checklist-v3': (value) => {
      const checklist = value as { phases?: { items?: string[] }[]; checked?: Record<string, boolean> };
      const replace = listReplacer(slug, to, !!checklist.phases?.some((p) => to && p.items?.includes(to)));
      const checked = checklist.checked;
      return {
        ...checklist,
        phases: checklist.phases?.map((p) => ({ ...p, items: p.items && replace(p.items) })),
        // Owning either counts as owning the replacement.
        checked: checked && { ...moveKeys(checked, slug, to), ...(to && checked[slug] ? { [to]: true } : {}) },
      };
    },
    'corolla-inventory-v1': (value) => moveKeys(value as Json, slug, to),
    'corolla-price-alerts-v1': (value) => moveKeys(value as Json, slug, to),
    'corolla-routines-v1': (value) =>
      (value as { steps?: { products?: { name?: string }[] }[] }[]).map((routine) => ({
        ...routine,
        steps: routine.steps?.map((step) => {
          if (!step.products) return step;
          let placed = !!replacement && step.products.some((p) => p.name === replacement.name);
          return {
            ...step,
            products: step.products.flatMap((p) => {
              if (!names.includes(p.name ?? '')) return [p];
              if (!replacement || placed) return [];
              placed = true;
              return [{ ...p, name: replacement.name }];
            }),
          };
        }),
      })),
  });

  await rewriteSharedCategories((value) => {
    const categories = value as { sections?: { slugs?: string[] }[] }[];
    const replace = listReplacer(
      slug,
      to,
      categories.some((cat) => cat.sections?.some((sec) => to && sec.slugs?.includes(to))),
    );
    return categories.map((cat) => ({
      ...cat,
      sections: cat.sections?.map((sec) => ({ ...sec, slugs: sec.slugs && replace(sec.slugs) })),
    }));
  });
}
