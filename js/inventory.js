// Inventory → Inventory sub-tab: stock levels and depletion.
import {
  getAllProductSlugs,
  getDefaultUsagePerWashMl,
  getDefaultVolumeMl,
  groupSlugsByCategory,
  resolveCatalogEntry,
  resolveProductName,
} from './catalog.js';
import { recompute, renderChecklist } from './checklist.js';
import { CHECKLIST_V3_KEY, INVENTORY_KEY } from './config.js';
import { CANONICAL_SLUG_MAP, CATALOG, EQUIPMENT_SLUGS, SLUG_FAMILIES } from './data.js';
import { state } from './state.js';
import { storageGet, storageSet, syncPush } from './storage.js';
import { escAttr, escHtml } from './util.js';

// Sets purchase date and initialises stock to full volume on first check.
// For bundles, initialises each consumable component. Safe to call repeatedly —
// never overwrites existing remainingMl.
export function initInventoryStock(slug, today) {
  if (!state.inventoryState[slug]) state.inventoryState[slug] = {};
  if (!state.inventoryState[slug].purchaseDate) state.inventoryState[slug].purchaseDate = today;

  const components = state.bundleComponents[slug];
  if (components) {
    for (const comp of components) {
      if (comp.equipment) continue;
      const key = comp.slug ?? `${slug}:${comp.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      if (!state.inventoryState[key]) state.inventoryState[key] = {};
      if (!state.inventoryState[key].purchaseDate) state.inventoryState[key].purchaseDate = today;
      if (state.inventoryState[key].remainingMl == null) {
        const vol = comp.volumeMl ?? (comp.slug ? getDefaultVolumeMl(comp.slug) : null) ?? null;
        if (vol != null) {
          state.inventoryState[key].volumeMl = vol;
          state.inventoryState[key].remainingMl = vol;
        }
      }
    }
  } else if (!EQUIPMENT_SLUGS.has(slug) && state.inventoryState[slug].remainingMl == null) {
    const vol = getDefaultVolumeMl(slug);
    if (vol != null) {
      state.inventoryState[slug].volumeMl = vol;
      state.inventoryState[slug].remainingMl = vol;
    }
  }
}

export async function loadInventory() {
  const saved = await storageGet(INVENTORY_KEY);
  state.inventoryState = saved ?? {};
  renderInventory();
}

export async function saveInventory() {
  await storageSet(INVENTORY_KEY, state.inventoryState);
  syncPush(INVENTORY_KEY, state.inventoryState);
  renderInventory();
}

export function updateInventoryItem(slug, updates) {
  state.inventoryState[slug] = { ...(state.inventoryState[slug] ?? {}), ...updates };
  saveInventory();
}

export function markItemEmpty(slug) {
  updateInventoryItem(slug, { remainingMl: 0 });
}

export async function resetInventory() {
  if (!confirm('Reset all inventory stock levels? Purchase dates are preserved. Cannot be undone.')) return;
  const today = new Date().toISOString().split('T')[0];
  const fresh = {};
  for (const slug of Object.keys(state.inventoryState)) {
    fresh[slug] = { purchaseDate: state.inventoryState[slug].purchaseDate ?? today };
  }
  state.inventoryState = fresh;
  await storageSet(INVENTORY_KEY, state.inventoryState);
  syncPush(INVENTORY_KEY, state.inventoryState);
  renderInventory();
}

export function toggleInvAdjustForm(uid) {
  const form = document.getElementById(`inv-adjust-form-${uid}`);
  if (!form) return;
  const isHidden = form.hidden;
  // Close any other open forms first
  document.querySelectorAll('.inv-adjust-form').forEach((f) => {
    f.hidden = true;
  });
  form.hidden = !isHidden;
}

// Returns ml-per-wash for a slug by looking up its product name across all routine steps.
export function getRoutineUsageMl(slug) {
  const catalogName = CATALOG.find((p) => p.slug === slug)?.name;
  if (!catalogName) return null;
  for (const routine of state.routines) {
    for (const step of routine.steps ?? []) {
      const prod = step.products?.find((p) => p.name === catalogName && p.ml != null);
      if (prod) return prod.ml;
    }
  }
  return null;
}

export function saveInvAdjust(key, uid) {
  const volumeEl = document.getElementById(`inv-vol-${uid}`);
  const remainEl = document.getElementById(`inv-remain-${uid}`);
  const volumeMl =
    volumeEl && volumeEl.value !== ''
      ? +volumeEl.value
      : (state.inventoryState[key]?.volumeMl ?? getDefaultVolumeMl(key) ?? null);
  const remainingMl = remainEl && remainEl.value !== '' ? +remainEl.value : null;

  state.inventoryState[key] = {
    ...(state.inventoryState[key] ?? {}),
    volumeMl,
    remainingMl:
      remainingMl !== null
        ? Math.max(0, Math.min(volumeMl ?? Infinity, remainingMl))
        : (state.inventoryState[key]?.remainingMl ?? null),
    manualOverride: remainingMl !== null,
  };
  renderInventory(); // immediate visual update
  saveInventory(); // async persist
}

export function saveInvEquipDate(key, uid) {
  const dateEl = document.getElementById(`inv-date-${uid}`);
  if (!dateEl) return;
  state.inventoryState[key] = { ...(state.inventoryState[key] ?? {}), purchaseDate: dateEl.value || null };
  renderInventory();
  saveInventory();
}

export function countProductUses(slug) {
  const productName = CATALOG.find((p) => p.slug === slug)?.name;
  if (!productName) return 0;
  let count = 0;
  for (const entry of state.washLog) {
    if (!entry.steps || !entry.steps.length) continue;
    const routine = state.routines.find((r) => r.id === entry.type);
    if (!routine) continue;
    const usedInSession = entry.steps.some((stepName) => {
      const step = routine.steps.find((s) => s.name === stepName);
      return step?.products?.some((p) => p.name === productName);
    });
    if (usedInSession) count++;
  }
  return count;
}

// Resolves a catalog slug to the inventoryState key that actually has remainingMl set,
// accounting for bundle expansion and size-variant fallback via SLUG_FAMILIES.
export function resolveInventoryKey(slug) {
  const bundleKey = (s) => {
    const comps = state.bundleComponents[s];
    if (!comps) return s;
    const first = comps.find((c) => !c.equipment);
    if (!first) return null;
    return first.slug ?? `${s}:${first.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  };

  const family = SLUG_FAMILIES[slug];
  const familySlugs = family
    ? Object.entries(SLUG_FAMILIES)
        .filter(([s, f]) => f === family)
        .map(([s]) => s)
    : [slug];

  const candidateKeys = familySlugs.map(bundleKey).filter(Boolean);
  const owned = candidateKeys.filter((key) => state.inventoryState[key]?.remainingMl != null);

  if (!owned.length) return null;

  // Sort oldest purchaseDate first; items with no date sort last
  owned.sort((a, b) => {
    const tA = state.inventoryState[a]?.purchaseDate
      ? new Date(state.inventoryState[a].purchaseDate).getTime()
      : Infinity;
    const tB = state.inventoryState[b]?.purchaseDate
      ? new Date(state.inventoryState[b].purchaseDate).getTime()
      : Infinity;
    return tA - tB;
  });

  return owned.find((key) => state.inventoryState[key].remainingMl > 0) ?? owned[0];
}

export function decrementInventoryForSession(entry) {
  const routine = state.routines.find((r) => r.id === entry.type);
  if (!routine) return;
  const catalogByName = new Map(CATALOG.map((p) => [p.name, p.slug]));
  let changed = false;
  for (const stepName of entry.steps ?? []) {
    const step = routine.steps.find((s) => s.name === stepName);
    if (!step?.products?.length) continue;
    for (const { name, ml } of step.products) {
      if (ml == null) continue;
      const slug = catalogByName.get(name) ?? CANONICAL_SLUG_MAP[name];
      if (!slug || EQUIPMENT_SLUGS.has(slug)) continue;

      const stateKey = resolveInventoryKey(slug);
      if (!stateKey) continue;

      state.inventoryState[stateKey].remainingMl = Math.max(0, state.inventoryState[stateKey].remainingMl - ml);
      changed = true;
    }
  }
  if (changed) {
    storageSet(INVENTORY_KEY, state.inventoryState);
    syncPush(INVENTORY_KEY, state.inventoryState);
    renderInventory();
  }
}

export function showInvToast(msg) {
  let toast = document.getElementById('inv-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'inv-toast';
    toast.className = 'inv-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

export function getInvCategoryOrder() {
  const defaults = state.allCategories.map((c) => c.label);
  const saved = Array.isArray(state.inventoryState._order) ? state.inventoryState._order : [];
  const merged = saved.filter((l) => defaults.includes(l));
  for (const l of defaults) {
    if (!merged.includes(l)) merged.push(l);
  }
  return merged;
}

// "+ Add product" control for the Inventory sub-tab — lets a product be marked
// owned (and its stock initialised) directly, without going via the Checklist tab.
// Includes both CATALOG products and backend-only ones added via the Prices tab.
export function invAddProductFormHtml() {
  const ownedSlugs = new Set(
    Object.entries(state.checklistState.checked ?? {})
      .filter(([, v]) => v)
      .map(([k]) => k),
  );
  const availableSlugs = getAllProductSlugs().filter((slug) => !ownedSlugs.has(slug));
  if (availableSlugs.length === 0) return '';

  const groups = groupSlugsByCategory(availableSlugs, resolveProductName);
  let options = '<option value="">— add a product —</option>';
  for (const group of groups) {
    options += `<optgroup label="${escAttr(group.label)}">`;
    for (const { slug, name } of group.entries) {
      options += `<option value="${escAttr(slug)}">${escHtml(name)}</option>`;
    }
    options += '</optgroup>';
  }
  return `
      <div class="prices-add-product-wrap">
        <button class="url-add-retailer-btn" onclick="toggleInvAddProductForm()">+ Add product</button>
        <div class="url-add-section" id="inv-add-product-form" style="display:none">
          <div class="url-form-row">
            <select class="phase-edit-select" id="inv-add-product-select">${options}</select>
            <button class="alert-set-btn" onclick="addProductToInventory()">Add</button>
          </div>
        </div>
      </div>`;
}

export function toggleInvAddProductForm() {
  const form = document.getElementById('inv-add-product-form');
  if (!form) return;
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

// Marks a product owned and initialises its stock, independent of any checklist
// phase or the checkbox DOM — safe to call regardless of what's currently rendered
// in the Checklist sub-tab.
export async function addProductToInventory() {
  const select = document.getElementById('inv-add-product-select');
  const slug = select?.value;
  if (!slug) {
    select?.focus();
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  state.checklistState.checked[slug] = true;
  initInventoryStock(slug, today);

  await storageSet(CHECKLIST_V3_KEY, state.checklistState);
  syncPush(CHECKLIST_V3_KEY, state.checklistState);
  await storageSet(INVENTORY_KEY, state.inventoryState);
  syncPush(INVENTORY_KEY, state.inventoryState);

  renderChecklist();
  recompute();
  renderInventory();
}

export function renderInventory() {
  const container = document.getElementById('inventory-list');
  if (!container) return;

  // Per-render counter so duplicate slugs get unique form IDs
  let _uid = 0;
  const nextUid = () => `i${_uid++}`;

  // Build the set of owned slugs from checklist state
  const ownedSlugs = new Set(
    Object.entries(state.checklistState.checked ?? {})
      .filter(([, v]) => v)
      .map(([k]) => k),
  );

  if (ownedSlugs.size === 0) {
    container.innerHTML = `
        <div class="inv-empty-state">
          <p>No items in inventory yet.</p>
          <p>Check off items in the <button class="inv-link-btn" onclick="document.querySelector('.inv-sub-tab[data-inv-tab=\\'checklist\\']')?.click()">Kit Checklist</button>, or add one directly below.</p>
        </div>
        ${invAddProductFormHtml()}`;
    return;
  }

  function renderInvCard(slug) {
    const catalogItem = resolveCatalogEntry(slug);
    if (!catalogItem) return '';
    const uid = nextUid();
    const meta = state.inventoryState[slug] ?? {};
    const isEquip = EQUIPMENT_SLUGS.has(slug);
    const safeSlug = escAttr(slug);
    const name = escHtml(catalogItem.name);

    if (isEquip) {
      const uses = countProductUses(slug);
      const dateStr = meta.purchaseDate
        ? `Since ${new Date(meta.purchaseDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
        : '';
      const usesStr = uses === 1 ? 'Used in 1 session' : uses > 0 ? `Used in ${uses} sessions` : '';
      const meta2 = [dateStr, usesStr].filter(Boolean).join(' · ');
      const dateVal = escAttr(meta.purchaseDate ?? '');
      return `
          <div class="inv-card inv-card--equip">
            <div class="inv-card-row">
              <div class="inv-card-name">${name}</div>
              <button class="inv-adjust-btn" onclick="toggleInvAdjustForm('${uid}')" title="Adjust">Adjust</button>
            </div>
            ${meta2 ? `<div class="inv-equip-meta">${meta2}</div>` : ''}
            <div class="inv-adjust-form" id="inv-adjust-form-${uid}" hidden>
              <div class="inv-adjust-grid inv-adjust-grid--single">
                <label class="inv-adjust-label">Acquired</label>
                <input class="inv-adjust-input" type="date" id="inv-date-${uid}" value="${dateVal}">
              </div>
              <div class="inv-adjust-actions">
                <button class="settings-save-btn" onclick="saveInvEquipDate('${safeSlug}', '${uid}')">Update</button>
              </div>
            </div>
          </div>`;
    }

    // Consumable
    const volumeMl = meta.volumeMl ?? getDefaultVolumeMl(slug);
    const usagePerWashMl = getRoutineUsageMl(slug) || getDefaultUsagePerWashMl(slug);
    const remainingMl = meta.remainingMl;
    const notConfigured = remainingMl == null;
    const pct =
      volumeMl && remainingMl != null ? Math.max(0, Math.min(100, Math.round((remainingMl / volumeMl) * 100))) : null;
    const isLow = pct != null && pct <= 20;

    let stockHtml;
    if (notConfigured) {
      stockHtml = `<div class="inv-not-set">Stock not set — <button class="inv-link-btn" onclick="toggleInvAdjustForm('${uid}')">configure</button></div>`;
    } else {
      const fillColor = pct > 50 ? 'var(--accent)' : pct > 20 ? 'var(--warn)' : 'var(--danger)';
      const label = volumeMl ? `${remainingMl}ml remaining (${pct}%)` : `${remainingMl}ml remaining`;
      stockHtml = `
          <div class="inv-stock-wrap">
            <div class="inv-stock-bar"><div class="inv-stock-fill" style="width:${pct ?? 0}%;background:${fillColor}"></div></div>
            <span class="inv-stock-label">${label}</span>
            ${isLow ? '<span class="inv-low-badge">Running low</span>' : ''}
          </div>`;
    }

    // Sessions remaining estimate
    let sessionsHtml = '';
    if (!notConfigured && usagePerWashMl && remainingMl != null) {
      const sessionsLeft = Math.floor(remainingMl / usagePerWashMl);
      sessionsHtml = `<div class="inv-sessions-left">${sessionsLeft} wash${sessionsLeft !== 1 ? 'es' : ''} remaining</div>`;
    }

    const volVal = volumeMl ?? '';
    const remVal = meta.remainingMl ?? '';

    return `
        <div class="inv-card inv-card--consumable${isLow ? ' inv-card--low' : ''}">
          <div class="inv-card-row">
            <div class="inv-card-name">${name}</div>
            <button class="inv-adjust-btn" onclick="toggleInvAdjustForm('${uid}')" title="Adjust stock">Adjust</button>
          </div>
          ${stockHtml}
          ${sessionsHtml}
          <div class="inv-adjust-form" id="inv-adjust-form-${uid}" hidden>
            <div class="inv-adjust-grid">
              <label class="inv-adjust-label">Volume (ml)</label>
              <label class="inv-adjust-label">Remaining (ml)</label>
              <input class="inv-adjust-input" type="number" id="inv-vol-${uid}" value="${volVal}" min="1" placeholder="e.g. 500">
              <input class="inv-adjust-input" type="number" id="inv-remain-${uid}" value="${remVal}" min="0" placeholder="e.g. 375">
            </div>
            <div class="inv-adjust-actions">
              <button class="settings-save-btn" onclick="saveInvAdjust('${safeSlug}', '${uid}')">Update</button>
              <button class="settings-reset-btn" style="color:var(--danger);border-color:var(--danger);" onclick="markItemEmpty('${safeSlug}')">Mark empty</button>
            </div>
          </div>
        </div>`;
  }

  // Renders a bundle component, which may or may not have its own catalog slug.
  // Inline components (no slug) use a composite state key derived from the bundle slug + component name.
  function renderComponentCard(comp, bundleSlug, stateKey) {
    const compKey = stateKey ?? comp.slug ?? `${bundleSlug}:${comp.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const uid = nextUid();
    const safeKey = escAttr(compKey);
    const name = escHtml(comp.name);
    const isEquip = comp.equipment ?? EQUIPMENT_SLUGS.has(comp.slug ?? '');

    if (!state.inventoryState[compKey]) state.inventoryState[compKey] = {};
    if (!state.inventoryState[compKey].purchaseDate && state.inventoryState[bundleSlug]?.purchaseDate) {
      state.inventoryState[compKey].purchaseDate = state.inventoryState[bundleSlug].purchaseDate;
    }

    const meta = state.inventoryState[compKey];

    if (isEquip) {
      const uses = comp.slug ? countProductUses(comp.slug) : 0;
      const dateStr = meta.purchaseDate
        ? `Since ${new Date(meta.purchaseDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
        : '';
      const usesStr = uses === 1 ? 'Used in 1 session' : uses > 0 ? `Used in ${uses} sessions` : '';
      const metaStr = [dateStr, usesStr].filter(Boolean).join(' · ');
      const dateVal = escAttr(meta.purchaseDate ?? '');
      return `
          <div class="inv-card inv-card--equip">
            <div class="inv-card-row">
              <div class="inv-card-name">${name}</div>
              <button class="inv-adjust-btn" onclick="toggleInvAdjustForm('${uid}')" title="Adjust">Adjust</button>
            </div>
            ${metaStr ? `<div class="inv-equip-meta">${metaStr}</div>` : ''}
            <div class="inv-adjust-form" id="inv-adjust-form-${uid}" hidden>
              <div class="inv-adjust-grid inv-adjust-grid--single">
                <label class="inv-adjust-label">Acquired</label>
                <input class="inv-adjust-input" type="date" id="inv-date-${uid}" value="${dateVal}">
              </div>
              <div class="inv-adjust-actions">
                <button class="settings-save-btn" onclick="saveInvEquipDate('${safeKey}', '${uid}')">Update</button>
              </div>
            </div>
          </div>`;
    }

    const volumeMl = meta.volumeMl ?? comp.volumeMl ?? (comp.slug ? getDefaultVolumeMl(comp.slug) : null);
    const usagePerWashMl = comp.slug
      ? getRoutineUsageMl(comp.slug) || getDefaultUsagePerWashMl(comp.slug)
      : (comp.usagePerWashMl ?? null);
    const remainingMl = meta.remainingMl;
    const notConfigured = remainingMl == null;
    const pct =
      volumeMl && remainingMl != null ? Math.max(0, Math.min(100, Math.round((remainingMl / volumeMl) * 100))) : null;
    const isLow = pct != null && pct <= 20;

    let stockHtml;
    if (notConfigured) {
      stockHtml = `<div class="inv-not-set">Stock not set — <button class="inv-link-btn" onclick="toggleInvAdjustForm('${uid}')">configure</button></div>`;
    } else {
      const fillColor = pct > 50 ? 'var(--accent)' : pct > 20 ? 'var(--warn)' : 'var(--danger)';
      const label = volumeMl ? `${remainingMl}ml remaining (${pct}%)` : `${remainingMl}ml remaining`;
      stockHtml = `
          <div class="inv-stock-wrap">
            <div class="inv-stock-bar"><div class="inv-stock-fill" style="width:${pct ?? 0}%;background:${fillColor}"></div></div>
            <span class="inv-stock-label">${label}</span>
            ${isLow ? '<span class="inv-low-badge">Running low</span>' : ''}
          </div>`;
    }

    let sessionsHtml = '';
    if (!notConfigured && usagePerWashMl && remainingMl != null) {
      const sessionsLeft = Math.floor(remainingMl / usagePerWashMl);
      sessionsHtml = `<div class="inv-sessions-left">${sessionsLeft} wash${sessionsLeft !== 1 ? 'es' : ''} remaining</div>`;
    }

    const volVal = volumeMl ?? '';
    const remVal = meta.remainingMl ?? '';

    return `
        <div class="inv-card inv-card--consumable${isLow ? ' inv-card--low' : ''}">
          <div class="inv-card-row">
            <div class="inv-card-name">${name}</div>
            <button class="inv-adjust-btn" onclick="toggleInvAdjustForm('${uid}')" title="Adjust stock">Adjust</button>
          </div>
          ${stockHtml}
          ${sessionsHtml}
          <div class="inv-adjust-form" id="inv-adjust-form-${uid}" hidden>
            <div class="inv-adjust-grid">
              <label class="inv-adjust-label">Volume (ml)</label>
              <label class="inv-adjust-label">Remaining (ml)</label>
              <input class="inv-adjust-input" type="number" id="inv-vol-${uid}" value="${volVal}" min="1" placeholder="e.g. 500">
              <input class="inv-adjust-input" type="number" id="inv-remain-${uid}" value="${remVal}" min="0" placeholder="e.g. 375">
            </div>
            <div class="inv-adjust-actions">
              <button class="settings-save-btn" onclick="saveInvAdjust('${safeKey}', '${uid}')">Update</button>
              <button class="settings-reset-btn" style="color:var(--danger);border-color:var(--danger);" onclick="markItemEmpty('${safeKey}')">Mark empty</button>
            </div>
          </div>
        </div>`;
  }

  // ── Pre-compute bundle expansion ────────────────────────────────────────────
  // bundleExpansion: componentSlug → [{comp, bundleSlug, stateKey, displayName?}]
  // inlineSectionItems: 'catLabel|secLabel' → [{comp, bundleSlug, stateKey, displayName?}]
  const bundleExpansion = new Map();
  const inlineSectionItems = new Map();

  for (const bSlug of ownedSlugs) {
    const components = state.bundleComponents[bSlug];
    if (!components) continue;

    // Count names within this bundle to detect duplicates needing numbering
    const nameCounts = {};
    for (const comp of components) {
      if (comp.slug && ownedSlugs.has(comp.slug)) continue;
      nameCounts[comp.name] = (nameCounts[comp.name] ?? 0) + 1;
    }
    const nameIdx = {};

    for (const comp of components) {
      if (comp.slug && ownedSlugs.has(comp.slug)) continue;

      // Compute stable state key from original name (before any numbering suffix)
      const stateKey = comp.slug ?? `${bSlug}:${comp.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

      // Apply numbering suffix to display name when the same name appears multiple times
      nameIdx[comp.name] = (nameIdx[comp.name] ?? 0) + 1;
      const displayName = nameCounts[comp.name] > 1 ? `${comp.name} (${nameIdx[comp.name]})` : comp.name;

      const item = { comp, bundleSlug: bSlug, stateKey, displayName };

      if (comp.slug) {
        // Slug-referenced: render in the section where that slug lives in INV_CATEGORIES
        if (!bundleExpansion.has(comp.slug)) bundleExpansion.set(comp.slug, []);
        bundleExpansion.get(comp.slug).push(item);
      } else {
        // Inline: render in the section given by sectionPath, or Equipment/Other by default
        const catLabel = comp.sectionPath?.[0] ?? 'Equipment';
        const secLabel = comp.sectionPath?.[1] ?? 'Other';
        const sKey = `${catLabel}|${secLabel}`;
        if (!inlineSectionItems.has(sKey)) inlineSectionItems.set(sKey, []);
        inlineSectionItems.get(sKey).push(item);
      }
    }
  }

  // Also number same-name inline items across different bundles within the same section
  for (const items of inlineSectionItems.values()) {
    const crossCounts = {};
    for (const it of items) crossCounts[it.comp.name] = (crossCounts[it.comp.name] ?? 0) + 1;
    const crossIdx = {};
    for (const it of items) {
      if (crossCounts[it.comp.name] > 1) {
        crossIdx[it.comp.name] = (crossIdx[it.comp.name] ?? 0) + 1;
        it.displayName = `${it.comp.name} (${crossIdx[it.comp.name]})`;
      }
    }
  }

  // Also number same-slug components across different owned bundles
  for (const items of bundleExpansion.values()) {
    if (items.length > 1) {
      items.forEach((it, i) => {
        it.displayName = `${it.comp.name} (${i + 1})`;
      });
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  let html = '';
  let anyRendered = false;
  const orderedCategories = getInvCategoryOrder()
    .map((label) => state.allCategories.find((c) => c.label === label))
    .filter(Boolean);

  for (const [catIdx, category] of orderedCategories.entries()) {
    let categoryBody = '';
    let firstSec = true;

    for (const sec of category.sections) {
      let secHtml = '';

      for (const slug of sec.slugs) {
        // Bundle slug owned: skip it — its components render at their correct slug positions
        if (state.bundleComponents[slug] && ownedSlugs.has(slug)) continue;

        // Slug-referenced bundle components that belong in this section
        const expansions = bundleExpansion.get(slug);
        if (expansions) {
          for (const { comp, bundleSlug, stateKey, displayName } of expansions) {
            const compMeta = state.inventoryState[stateKey] ?? {};
            const isEquip = comp.equipment ?? EQUIPMENT_SLUGS.has(comp.slug ?? '');
            if (!isEquip && compMeta.remainingMl === 0) continue;
            const displayComp = displayName !== comp.name ? { ...comp, name: displayName } : comp;
            secHtml += renderComponentCard(displayComp, bundleSlug, stateKey);
          }
        }

        // Directly owned non-bundle item
        if (ownedSlugs.has(slug) && !state.bundleComponents[slug]) {
          const inv = state.inventoryState[slug] ?? {};
          if (!EQUIPMENT_SLUGS.has(slug) && inv.remainingMl === 0) continue;
          secHtml += renderInvCard(slug);
        }
      }

      // Inline bundle components assigned to this section
      const sKey = `${category.label}|${sec.label}`;
      for (const { comp, bundleSlug, stateKey, displayName } of inlineSectionItems.get(sKey) ?? []) {
        const compMeta = state.inventoryState[stateKey] ?? {};
        const isEquip = comp.equipment ?? false;
        if (!isEquip && compMeta.remainingMl === 0) continue;
        const displayComp = displayName !== comp.name ? { ...comp, name: displayName } : comp;
        secHtml += renderComponentCard(displayComp, bundleSlug, stateKey);
      }

      if (!secHtml) continue;
      const headClass = firstSec ? 'section-head' : 'section-head section-head--gap';
      categoryBody += `<div class="${headClass}">${escHtml(sec.label)}</div><div class="inv-grid">${secHtml}</div>`;
      firstSec = false;
    }

    if (!categoryBody) continue;
    html += `<div class="inv-category" draggable="true" data-cat-idx="${catIdx}"><div class="inv-category-header"><span class="inv-drag-handle">⠿</span><span class="inv-category-label">${escHtml(category.label)}</span></div>${categoryBody}</div>`;
    anyRendered = true;
  }

  // Owned items (or bundle components) that aren't assigned to any category/section —
  // e.g. moved to "Uncategorised" via the Prices tab, or their category was deleted.
  // Without this fallback they'd be fully tracked (stock, purchase date) but never shown.
  const categorisedSlugs = new Set(state.allCategories.flatMap((c) => c.sections.flatMap((s) => s.slugs)));
  let otherHtml = '';
  for (const slug of new Set([...ownedSlugs, ...bundleExpansion.keys()])) {
    if (categorisedSlugs.has(slug)) continue;
    if (state.bundleComponents[slug] && ownedSlugs.has(slug)) continue;

    const expansions = bundleExpansion.get(slug);
    if (expansions) {
      for (const { comp, bundleSlug, stateKey, displayName } of expansions) {
        const compMeta = state.inventoryState[stateKey] ?? {};
        const isEquip = comp.equipment ?? EQUIPMENT_SLUGS.has(comp.slug ?? '');
        if (!isEquip && compMeta.remainingMl === 0) continue;
        const displayComp = displayName !== comp.name ? { ...comp, name: displayName } : comp;
        otherHtml += renderComponentCard(displayComp, bundleSlug, stateKey);
      }
    }
    if (ownedSlugs.has(slug) && !state.bundleComponents[slug]) {
      const inv = state.inventoryState[slug] ?? {};
      if (!EQUIPMENT_SLUGS.has(slug) && inv.remainingMl === 0) continue;
      otherHtml += renderInvCard(slug);
    }
  }
  if (otherHtml) {
    html += `<div class="inv-category"><div class="inv-category-header"><span class="inv-category-label">Other</span></div><div class="inv-grid">${otherHtml}</div></div>`;
    anyRendered = true;
  }

  if (!anyRendered) {
    html = `<div class="inv-empty-state"><p>No items with stock data yet. Check off items in the <button class="inv-link-btn" onclick="document.querySelector('.inv-sub-tab[data-inv-tab=\\'checklist\\']')?.click()">Kit Checklist</button> to populate your inventory.</p></div>`;
  }
  html += invAddProductFormHtml();

  container.innerHTML = html;

  container.querySelectorAll('.inv-category[data-cat-idx]').forEach((el) => {
    const idx = +el.dataset.catIdx;
    el.addEventListener('dragstart', (e) => {
      state.invCatDragSrc = idx;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', (e) => {
      if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      container.querySelectorAll('.inv-category').forEach((c) => c.classList.remove('drag-over'));
      state.invCatDragSrc = null;
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (state.invCatDragSrc === null || state.invCatDragSrc === idx) return;
      const order = getInvCategoryOrder();
      const moved = order.splice(state.invCatDragSrc, 1)[0];
      order.splice(idx, 0, moved);
      state.inventoryState._order = order;
      state.invCatDragSrc = null;
      saveInventory();
      renderInventory();
    });
  });
}
