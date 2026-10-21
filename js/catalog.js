// Product lookups across the static CATALOG and backend-only products, plus the category model.
import { renderCustomCategoryCards } from './categories.js';
import {
  BUNDLE_COMPONENTS_CACHE_KEY,
  CATEGORIES_KEY,
  CATEGORY_OVERRIDES_KEY,
  CUSTOM_CATEGORIES_KEY,
} from './config.js';
import { CATALOG, INVENTORY_DEFAULTS, INV_CATEGORIES } from './data.js';
import { renderInventory } from './inventory.js';
import { renderPricesTab } from './prices.js';
import { renderProductsPage } from './products.js';
import { state } from './state.js';
import { storageGet, storageSet, syncPush } from './storage.js';

// Per-product overrides from the backend (Products tab) take precedence over the hardcoded
// INVENTORY_DEFAULTS (data.js), which stays as the fallback for slugs nobody has customised yet.
export function getDefaultVolumeMl(slug) {
  const product = state.liveProducts.find((p) => p.slug === slug);
  return product?.defaultVolumeMl ?? INVENTORY_DEFAULTS[slug]?.volumeMl ?? null;
}

// usagePerWashMl here is only ever a fallback — the primary source for "sessions remaining"
// is getRoutineUsageMl(slug) (summed from actual routine step ml values). This only kicks in
// for a product no routine currently references.
export function getDefaultUsagePerWashMl(slug) {
  const product = state.liveProducts.find((p) => p.slug === slug);
  return product?.defaultUsagePerWashMl ?? INVENTORY_DEFAULTS[slug]?.usagePerWashMl ?? null;
}

// Rebuilds the pack lookup from liveProducts and caches it locally so pack expansion still
// works (from last-known-good data) if the backend is briefly unreachable — packs used to be
// a synchronous hardcoded constant with no network dependency; this keeps that offline-first
// behaviour intact per the app's graceful-degradation principle.
export function rebuildBundleComponents() {
  state.bundleComponents = Object.fromEntries(
    state.liveProducts.filter((p) => p.isPack).map((p) => [p.slug, p.components]),
  );
  storageSet(BUNDLE_COMPONENTS_CACHE_KEY, state.bundleComponents);
}

// All product slugs selectable in Routines/Checklist dropdowns: the static CATALOG
// plus any backend-only products (added via the Prices tab "+ Add product" form).
export function getAllProductSlugs() {
  return [...new Set([...CATALOG.map((c) => c.slug), ...state.liveProducts.map((p) => p.slug)])];
}

export function resolveProductName(slug) {
  return CATALOG.find((c) => c.slug === slug)?.name ?? state.liveProducts.find((p) => p.slug === slug)?.name ?? slug;
}

// Checklist items need a full entry shape (desc/price); backend-only products get
// a minimal stand-in so they can still be added to a phase before being catalogued.
export function resolveCatalogEntry(slug) {
  const catalogEntry = CATALOG.find((c) => c.slug === slug);
  if (catalogEntry) return catalogEntry;
  const liveProduct = state.liveProducts.find((p) => p.slug === slug);
  if (liveProduct) return { slug: liveProduct.slug, name: liveProduct.name, desc: '', price: 0 };
  return null;
}

// Groups a list of slugs the same way the Prices tab does (allCategories), with
// an "Other" bucket for anything uncategorised. Returns [{ label, entries: [{ slug, name }] }].
export function groupSlugsByCategory(slugs, nameForSlug) {
  const assignment = getCategoryAssignment();
  const groupsByLabel = new Map();
  for (const cat of state.allCategories) {
    for (const sec of cat.sections) groupsByLabel.set(`${cat.label} — ${sec.label}`, []);
  }
  const other = [];
  for (const slug of slugs) {
    const place = assignment[slug];
    const key = place ? `${place.category} — ${place.section}` : null;
    const entry = { slug, name: nameForSlug(slug) };
    (key && groupsByLabel.has(key) ? groupsByLabel.get(key) : other).push(entry);
  }
  const groups = [];
  for (const [label, entries] of groupsByLabel) {
    if (!entries.length) continue;
    entries.sort((a, b) => a.name.localeCompare(b.name));
    groups.push({ label, entries });
  }
  if (other.length) {
    other.sort((a, b) => a.name.localeCompare(b.name));
    groups.push({ label: 'Other', entries: other });
  }
  return groups;
}

// Loads the unified category list, migrating once from the legacy split
// (hardcoded INV_CATEGORIES defaults + synced overrides + synced custom
// categories) if this account/browser hasn't been migrated yet.
export async function loadCategories() {
  const saved = await storageGet(CATEGORIES_KEY);
  if (Array.isArray(saved) && saved.length) {
    state.allCategories = saved;
  } else {
    state.allCategories = INV_CATEGORIES.map((cat) => ({
      label: cat.label,
      sections: cat.sections.map((sec) => ({ label: sec.label, slugs: [...sec.slugs] })),
    }));

    const legacyCustom = await storageGet(CUSTOM_CATEGORIES_KEY);
    if (Array.isArray(legacyCustom)) {
      for (const cat of legacyCustom) {
        state.allCategories.push({
          label: cat.label,
          sections: (cat.sections || []).map((sec) => ({ label: sec.label, slugs: [] })),
        });
      }
    }

    const legacyOverrides = await storageGet(CATEGORY_OVERRIDES_KEY);
    if (legacyOverrides && typeof legacyOverrides === 'object') {
      for (const [slug, place] of Object.entries(legacyOverrides)) {
        // Remove from wherever the freshly-seeded defaults placed it, then
        // re-place it per the override (or leave it out if explicitly uncategorised).
        for (const cat of state.allCategories) {
          for (const sec of cat.sections) {
            const i = sec.slugs.indexOf(slug);
            if (i !== -1) sec.slugs.splice(i, 1);
          }
        }
        if (place) {
          const cat = state.allCategories.find((c) => c.label === place.category);
          const sec = cat?.sections.find((s) => s.label === place.section);
          if (sec) sec.slugs.push(slug);
        }
      }
    }

    await storageSet(CATEGORIES_KEY, state.allCategories);
    syncPush(CATEGORIES_KEY, state.allCategories);
  }
  renderCustomCategoryCards();
}

export async function saveCategories() {
  await storageSet(CATEGORIES_KEY, state.allCategories);
  syncPush(CATEGORIES_KEY, state.allCategories);
  renderInventory();
  renderPricesTab();
  renderProductsPage();
}

export function getCategoryAssignment() {
  const assignment = {};
  for (const cat of state.allCategories) {
    for (const sec of cat.sections) {
      for (const slug of sec.slugs) assignment[slug] = { category: cat.label, section: sec.label };
    }
  }
  return assignment;
}

export async function changeProductCategory(slug, value) {
  for (const cat of state.allCategories) {
    for (const sec of cat.sections) {
      const i = sec.slugs.indexOf(slug);
      if (i !== -1) sec.slugs.splice(i, 1);
    }
  }
  if (value) {
    const [catLabel, secLabel] = value.split('::');
    const cat = state.allCategories.find((c) => c.label === catLabel);
    const sec = cat?.sections.find((s) => s.label === secLabel);
    if (sec) sec.slugs.push(slug);
  }
  await saveCategories();
}
