// Backend URL, build date and storage keys. deploy.yml substitutes the __PLACEHOLDERS__ in this file.

export const BACKEND_URL = '__BACKEND_URL__';

export const BUILD_DATE = '__BUILD_DATE__';

export const AUTH_CACHE_KEY = 'corolla-auth-v1';

export const CHECKLIST_KEY = 'corolla-detailing-app-v4'; // v4: legacy positional IDs

export const CHECKLIST_V2_KEY = 'corolla-checklist-v2'; // v2: slug-keyed, used for migration only

export const CHECKLIST_V3_KEY = 'corolla-checklist-v3'; // v3: phases array with tag + title

export const ROUTINES_KEY = 'corolla-routines-v1';

export const MAINTENANCE_KEY = 'corolla-maintenance-v1';

export const MAINTENANCE_LOG_KEY = 'corolla-maintenance-log-v1';

export const INVENTORY_KEY = 'corolla-inventory-v1';

// All categories — built-in defaults (seeded once from INV_CATEGORIES below) plus
// any the user has added — fully editable from Settings. Shape:
// [{ label, sections: [{ label, slugs: string[] }] }]. A product's category is
// simply whichever section's slugs array it's listed in.
export const CATEGORIES_KEY = 'corolla-categories-v1';

// Legacy keys, read once during migration into CATEGORIES_KEY then no longer
// written to. Kept only so existing synced data isn't stranded on old devices.
export const CATEGORY_OVERRIDES_KEY = 'corolla-category-overrides-v1';

export const CUSTOM_CATEGORIES_KEY = 'corolla-custom-categories-v1';

// Maps bundle/pack slugs → ordered component definitions. Sourced from the backend
// (products[].isPack / products[].components via GET /api/products) and rebuilt by
// loadPriceData() whenever liveProducts refreshes — see rebuildBundleComponents() below.
// Formerly a hardcoded constant; packs are now configured from the Inventory → Products tab.
// Components with a slug are looked up in INVENTORY_DEFAULTS for volume/usage defaults.
// Components without a slug (inline) use the values defined here; their state is stored
// under a composite key `bundleSlug:component-name-normalised`.
// sectionPath: [categoryLabel, sectionLabel] — tells the renderer where to place inline
// components (those without a catalog slug), matched by label against allCategories.
// Slug-referenced components are placed wherever their slug currently sits in
// allCategories. Equipment inline items default to Equipment/Other. Renaming the
// "Equipment"/"Exterior Wash" etc. categories/sections in Settings will orphan any
// sectionPath referencing the old label — a narrow, cosmetic edge case.
export const BUNDLE_COMPONENTS_CACHE_KEY = 'corolla-pack-components-v1';

// The budget feature was removed; the key is only kept so sign-out and "Reset everything"
// still clear any value left over from it.
export const BUDGET_KEY = 'corolla-budget-v1';

export const LOG_KEY = 'corolla-washlog-v1';

export const SETTINGS_KEY = 'corolla-settings-v1';

export const ALERTS_KEY = 'corolla-price-alerts-v1';
