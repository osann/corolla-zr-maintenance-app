// Inventory → Products sub-tab: product identity, retailer URLs, packs.
import {
  getAllProductSlugs,
  getCategoryAssignment,
  groupSlugsByCategory,
  rebuildBundleComponents,
  resolveProductName,
  saveCategories,
} from './catalog.js';
import { recompute, renderChecklist } from './checklist.js';
import { ALERTS_KEY, BACKEND_URL, CHECKLIST_V3_KEY } from './config.js';
import { RETAILER_NAMES, SCRAPED_RETAILERS } from './data.js';
import { renderInventory, saveInventory } from './inventory.js';
import { loadPriceData, renderPricesTab } from './prices.js';
import { saveRoutines } from './routines.js';
import { state } from './state.js';
import { storageSet, syncPush } from './storage.js';
import { escAttr, escHtml } from './util.js';

// Product identity/management: name, slug (cascading rename), retailer URLs (no price shown),
// category assignment, delete, and pack/multi-buy component configuration. Split off the
// Prices tab so Prices can stay a pure read-only price display. This whole sub-tab lives
// inside the Inventory tab, which is already hidden until signed in (renderAuthUI) — the
// early-return below is defence in depth for the rare case this fires before that gate runs.

export function renderProductsPage() {
  const container = document.getElementById('products-list');
  if (!container) return;
  if (!state.syncEnabled) {
    container.innerHTML = '';
    return;
  }

  const productBySlug = Object.fromEntries(state.liveProducts.map((p) => [p.slug, p]));
  const categoryAssignment = getCategoryAssignment();

  function categorySelectHtml(slug) {
    const current = categoryAssignment[slug];
    const currentValue = current ? `${current.category}::${current.section}` : '';
    let options = `<option value=""${currentValue ? '' : ' selected'}>Uncategorised (Other)</option>`;
    for (const cat of state.allCategories) {
      for (const sec of cat.sections) {
        const val = `${cat.label}::${sec.label}`;
        options += `<option value="${escAttr(val)}"${val === currentValue ? ' selected' : ''}>${escHtml(cat.label)} — ${escHtml(sec.label)}</option>`;
      }
    }
    return `<select class="prices-category-select" onchange="changeProductCategory('${slug}', this.value)" title="Change category">${options}</select>`;
  }

  function nameFormHtml(product) {
    return `
        <div class="url-inline-form" id="product-name-form-${product.id}" style="display:none">
          <div class="url-form-row">
            <input type="text" class="url-input" id="product-name-input-${product.id}" value="${escAttr(product.name)}" placeholder="Product name">
            <button class="alert-set-btn" onclick="saveProductName(${product.id})">Save</button>
          </div>
          <div id="product-name-error-${product.id}" style="display:none;color:var(--danger);font-size:12px;margin-top:4px;"></div>
        </div>`;
  }

  function slugRowHtml(product) {
    return `
        <div class="url-form-row" style="margin-bottom:6px;">
          <span class="prices-retailer-name">Slug: ${escHtml(product.slug)}</span>
          <button class="url-edit-btn" onclick="toggleProductSlugForm(${product.id})" title="Change slug (advanced)">✎</button>
        </div>
        <div class="url-inline-form" id="product-slug-form-${product.id}" style="display:none">
          <div class="url-form-row">
            <input type="text" class="url-input" id="product-slug-input-${product.id}" value="${escAttr(product.slug)}" placeholder="product-slug">
            <button class="alert-set-btn" onclick="requestSlugRename(${product.id})">Save</button>
          </div>
          <div id="product-slug-error-${product.id}" style="display:none;color:var(--danger);font-size:12px;margin-top:4px;"></div>
          <div class="log-confirm-row" id="slug-rename-confirm-${product.id}" hidden>
            <span>Renaming the slug updates checklist, inventory, categories, and price alerts everywhere it's referenced. Continue?</span>
            <button class="log-confirm-cancel" onclick="cancelSlugRenameConfirm(${product.id})">Cancel</button>
            <button class="log-confirm-delete" onclick="confirmSlugRename(${product.id})">Rename</button>
          </div>
        </div>`;
  }

  // Card-level summary only — retailer URLs are edited in the retailer-editor modal
  // (openRetailerEditor), one bounded field-card per retailer instead of inline rows and
  // toggle-forms scattered across the product card.
  function retailerUrlsHtml(product) {
    const names = Object.keys(product.urls ?? {}).map((r) => RETAILER_NAMES[r] || r);
    const summary = names.length ? `${names.join(', ')}. ` : `No retailers linked yet. `;
    return `
        <div class="url-form-row" style="margin-bottom:6px;">
          <span class="prices-retailer-name">${escHtml(summary)}<a href="#" onclick="openRetailerEditor(${product.id});return false;" style="color:var(--accent);">Edit retailers</a></span>
        </div>`;
  }

  // Default volume/usage — the sizes assumed when this product is checked off with no stock
  // recorded yet (volume) and the "sessions remaining" fallback when no routine step
  // references it (usage). Both are nullable overrides on top of the app's hardcoded
  // INVENTORY_DEFAULTS fallback — see getDefaultVolumeMl()/getDefaultUsagePerWashMl().
  function defaultVolumeHtml(product) {
    return `
        <div class="url-form-row" style="margin-bottom:6px;">
          <span class="url-form-label">Default volume</span>
          <input type="number" class="url-input add-product-slug-input" id="default-volume-${product.id}" placeholder="ml" min="1" value="${product.defaultVolumeMl ?? ''}">
          <span class="url-form-label">Usage/wash</span>
          <input type="number" class="url-input add-product-slug-input" id="default-usage-${product.id}" placeholder="ml" min="1" value="${product.defaultUsagePerWashMl ?? ''}">
          <button class="alert-set-btn" onclick="saveProductDefaults(${product.id})">Save</button>
        </div>
        <div id="product-defaults-error-${product.id}" style="display:none;color:var(--danger);font-size:12px;margin:-2px 0 6px;"></div>`;
  }

  // Card-level summary only — the actual component list is edited in the pack-editor modal
  // (openPackEditor), which has room to lay each component out clearly. Keeping the full
  // editor inline here (as before) meant every pack-enabled product's card permanently
  // showed its whole component list, making the Products page extremely long.
  function packEditorHtml(product) {
    const isPack = product.isPack;
    const count = product.components?.length ?? 0;
    const label = isPack
      ? `Pack — ${count} component${count === 1 ? '' : 's'}. <a href="#" onclick="openPackEditor(${product.id});return false;" style="color:var(--accent);">Edit contents</a>`
      : `Is a pack — checking it off in Checklist adds its components to Inventory`;
    return `
        <div style="display:flex;align-items:center;gap:10px;margin:10px 0;">
          <label class="toggle-wrap">
            <input type="checkbox" ${isPack ? 'checked' : ''} onchange="togglePackForCard(${product.id}, this.checked, this)">
            <span class="toggle-track"></span>
          </label>
          <span style="font-size:12.5px;color:var(--ink-mid);">${label}</span>
        </div>
        <div class="log-confirm-row" id="unpack-confirm-${product.id}" hidden>
          <span>Remove pack configuration for "${escHtml(product.name)}"? Its components will no longer be added to Inventory when checked off.</span>
          <button class="log-confirm-cancel" onclick="cancelUnpackConfirm(${product.id})">Cancel</button>
          <button class="log-confirm-delete" onclick="confirmUnpack(${product.id})">Remove</button>
        </div>`;
  }

  function deleteProductHtml(product) {
    return `
        <div class="prices-product-footer">
          <button class="prices-delete-link" onclick="showDeleteProductConfirm(${product.id})">Delete product</button>
        </div>
        <div class="log-confirm-row" id="delete-product-confirm-${product.id}" hidden>
          <span>Delete "${escHtml(product.name)}"? This removes all price history, retailer links, and pack configuration. Cannot be undone.</span>
          <button class="log-confirm-cancel" onclick="cancelDeleteProductConfirm(${product.id})">Cancel</button>
          <button class="log-confirm-delete" onclick="deleteProduct(${product.id})">Delete</button>
        </div>`;
  }

  function renderProductCards(slugs) {
    let html = '';
    for (const slug of slugs) {
      const product = productBySlug[slug];
      if (!product) continue;
      html += `
          <div class="prices-product">
            <div class="prices-product-name">
              ${escHtml(product.name)}
              <button class="url-edit-btn" onclick="toggleProductNameForm(${product.id})" title="Rename product">✎</button>
              ${categorySelectHtml(slug)}
            </div>
            ${nameFormHtml(product)}
            ${slugRowHtml(product)}
            ${retailerUrlsHtml(product)}
            ${defaultVolumeHtml(product)}
            ${packEditorHtml(product)}
            ${deleteProductHtml(product)}
          </div>`;
    }
    return html;
  }

  container.innerHTML = '';
  let anyCard = false;

  for (const category of state.allCategories) {
    let body = '';
    let firstSec = true;
    for (const sec of category.sections) {
      const secHtml = renderProductCards(sec.slugs);
      if (!secHtml) continue;
      const headClass = firstSec ? 'section-head' : 'section-head section-head--gap';
      body += `<div class="${headClass}">${sec.label}</div>${secHtml}`;
      firstSec = false;
    }
    if (!body) continue;
    const card = document.createElement('div');
    card.className = 'phase-spend-card';
    card.innerHTML = `<div class="phase-spend-head"><div class="phase-spend-name">${category.label}</div></div>${body}`;
    container.appendChild(card);
    anyCard = true;
  }

  const categorisedSlugs = new Set(state.allCategories.flatMap((c) => c.sections.flatMap((s) => s.slugs)));
  const uncategorisedSlugs = state.liveProducts.filter((p) => !categorisedSlugs.has(p.slug)).map((p) => p.slug);
  if (uncategorisedSlugs.length > 0) {
    const body = renderProductCards(uncategorisedSlugs);
    if (body) {
      const card = document.createElement('div');
      card.className = 'phase-spend-card';
      card.innerHTML = `<div class="phase-spend-head"><div class="phase-spend-name">Other</div></div>${body}`;
      container.appendChild(card);
      anyCard = true;
    }
  }

  if (!anyCard) {
    container.innerHTML = '<p class="prices-empty">No products yet.</p>';
  }

  const addWrap = document.createElement('div');
  addWrap.className = 'prices-add-product-wrap';
  addWrap.innerHTML = `
      <button class="url-add-retailer-btn" onclick="toggleAddProductForm()">+ Add product</button>
      <div class="url-add-section" id="prices-add-product-form" style="display:none">
        <div class="url-form-row">
          <input type="text" class="url-input" id="add-product-name" placeholder="Product name" oninput="autoFillProductSlug()">
          <input type="text" class="url-input add-product-slug-input" id="add-product-slug" placeholder="product-slug">
        </div>
        <div class="url-form-row" style="margin-top:6px">
          <select class="url-retailer-select" id="add-product-retailer">
            <option value="">No URL yet</option>
            <option value="supercheap">Supercheap Auto</option>
            <option value="autobarn">Auto Barn</option>
          </select>
          <input type="url" class="url-input" id="add-product-url" placeholder="https://...">
          <button class="alert-set-btn" onclick="saveNewProduct()">Add</button>
        </div>
        <div id="add-product-error" style="display:none;color:var(--danger);font-size:12px;margin-top:4px;"></div>
      </div>`;
  container.appendChild(addWrap);
}

export function toggleProductSlugForm(productId) {
  const form = document.getElementById(`product-slug-form-${productId}`);
  if (!form) return;
  const opening = form.style.display === 'none';
  form.style.display = opening ? 'block' : 'none';
  if (opening) document.getElementById(`product-slug-input-${productId}`)?.focus();
}

export function requestSlugRename(productId) {
  const input = document.getElementById(`product-slug-input-${productId}`);
  const errorEl = document.getElementById(`product-slug-error-${productId}`);
  if (errorEl) errorEl.style.display = 'none';
  const slug = input?.value.trim() ?? '';
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    if (errorEl) {
      errorEl.textContent = 'Slug must be lowercase letters, numbers and hyphens.';
      errorEl.style.display = 'block';
    }
    input?.focus();
    return;
  }
  const product = state.liveProducts.find((p) => p.id === productId);
  if (product && slug === product.slug) {
    if (errorEl) {
      errorEl.textContent = 'That is already the current slug.';
      errorEl.style.display = 'block';
    }
    return;
  }
  document.getElementById(`slug-rename-confirm-${productId}`)?.removeAttribute('hidden');
}

export function cancelSlugRenameConfirm(productId) {
  document.getElementById(`slug-rename-confirm-${productId}`)?.setAttribute('hidden', '');
}

export async function confirmSlugRename(productId) {
  const input = document.getElementById(`product-slug-input-${productId}`);
  const errorEl = document.getElementById(`product-slug-error-${productId}`);
  const newSlug = input?.value.trim() ?? '';
  const product = state.liveProducts.find((p) => p.id === productId);
  const oldSlug = product?.slug;
  if (!newSlug || !oldSlug) return;
  try {
    const res = await fetch(`${BACKEND_URL}/api/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ slug: newSlug }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to rename slug.' }));
      cancelSlugRenameConfirm(productId);
      if (errorEl) {
        errorEl.textContent = err.error || 'Failed to rename slug.';
        errorEl.style.display = 'block';
      }
      return;
    }
    product.slug = newSlug;
    await renameProductSlugEverywhere(oldSlug, newSlug);
  } catch (e) {
    console.error('confirmSlugRename:', e);
    cancelSlugRenameConfirm(productId);
    if (errorEl) {
      errorEl.textContent = 'Network error — try again.';
      errorEl.style.display = 'block';
    }
  }
}

// Updates every client-side store that keys data by product slug, after a successful
// PATCH /products/:id slug rename. Bypasses saveChecklist() (which would overwrite
// checklistState.checked from the still-old-slug itemData snapshot built by the last
// renderChecklist() call) — persists directly instead, then re-renders.
export async function renameProductSlugEverywhere(oldSlug, newSlug) {
  for (const cat of state.allCategories) {
    for (const sec of cat.sections) {
      const i = sec.slugs.indexOf(oldSlug);
      if (i !== -1) sec.slugs[i] = newSlug;
    }
  }
  await saveCategories();

  for (const phase of state.checklistState.phases) {
    const i = phase.items.indexOf(oldSlug);
    if (i !== -1) phase.items[i] = newSlug;
  }
  if (oldSlug in state.checklistState.checked) {
    state.checklistState.checked[newSlug] = state.checklistState.checked[oldSlug];
    delete state.checklistState.checked[oldSlug];
  }
  await storageSet(CHECKLIST_V3_KEY, state.checklistState);
  syncPush(CHECKLIST_V3_KEY, state.checklistState);
  renderChecklist();
  recompute();

  const renamedInventory = {};
  for (const [key, val] of Object.entries(state.inventoryState)) {
    if (key === oldSlug) renamedInventory[newSlug] = val;
    else if (key.startsWith(`${oldSlug}:`)) renamedInventory[`${newSlug}:${key.slice(oldSlug.length + 1)}`] = val;
    else renamedInventory[key] = val;
  }
  state.inventoryState = renamedInventory;
  await saveInventory();

  if (oldSlug in state.priceAlerts) {
    state.priceAlerts[newSlug] = state.priceAlerts[oldSlug];
    delete state.priceAlerts[oldSlug];
    await storageSet(ALERTS_KEY, state.priceAlerts);
    syncPush(ALERTS_KEY, state.priceAlerts);
  }

  // Other packs may have this slug cached in their in-memory components snapshot — rather
  // than hunting every pack's component list for a stale slug string, refetch liveProducts
  // wholesale (this also rebuilds bundleComponents and re-renders Products/Prices/Inventory).
  await loadPriceData();
}

export async function saveProductDefaults(productId) {
  const volInput = document.getElementById(`default-volume-${productId}`);
  const usageInput = document.getElementById(`default-usage-${productId}`);
  const errorEl = document.getElementById(`product-defaults-error-${productId}`);
  if (errorEl) errorEl.style.display = 'none';

  const volRaw = volInput?.value?.trim();
  const usageRaw = usageInput?.value?.trim();
  const defaultVolumeMl = volRaw ? parseInt(volRaw, 10) : null;
  const defaultUsagePerWashMl = usageRaw ? parseInt(usageRaw, 10) : null;

  try {
    const res = await fetch(`${BACKEND_URL}/api/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ defaultVolumeMl, defaultUsagePerWashMl }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to save.' }));
      if (errorEl) {
        errorEl.textContent = err.error || 'Failed to save.';
        errorEl.style.display = 'block';
      }
      return;
    }
    const product = state.liveProducts.find((p) => p.id === productId);
    if (product) {
      product.defaultVolumeMl = defaultVolumeMl;
      product.defaultUsagePerWashMl = defaultUsagePerWashMl;
    }
    // Doesn't retroactively change already-recorded stock (initInventoryStock never
    // overwrites an existing remainingMl), but usage-per-wash feeds the "sessions remaining"
    // estimate live at render time, so already-owned items need a re-render to pick it up.
    renderInventory();
    renderProductsPage();
  } catch (e) {
    console.error('saveProductDefaults:', e);
    if (errorEl) {
      errorEl.textContent = 'Network error — try again.';
      errorEl.style.display = 'block';
    }
  }
}

export function togglePackForCard(productId, checked, checkboxEl) {
  const product = state.liveProducts.find((p) => p.id === productId);
  if (!product) return;
  if (checked) {
    // Jump straight into the editor for a brand-new pack — nothing is saved until "Save
    // pack" there, so there's no half-configured state left behind if the user backs out.
    openPackEditor(productId);
    return;
  }
  if (product.isPack) {
    if (checkboxEl) checkboxEl.checked = true; // hold visually checked until the confirm resolves
    document.getElementById(`unpack-confirm-${productId}`)?.removeAttribute('hidden');
  }
}

export function cancelUnpackConfirm(productId) {
  document.getElementById(`unpack-confirm-${productId}`)?.setAttribute('hidden', '');
}

// Opens the pack-contents modal for a product, seeding a draft from its saved components
// (or one blank row for a brand-new pack) if one isn't already in progress.
export function openPackEditor(productId) {
  const product = state.liveProducts.find((p) => p.id === productId);
  if (!product) return;
  if (!state.packDrafts[productId]) {
    state.packDrafts[productId] = product.components?.length ? product.components.map((c) => ({ ...c })) : [{}];
  }
  state.activePackEditorId = productId;
  renderPackEditorModal();
  document.getElementById('pack-editor-modal')?.removeAttribute('hidden');
}

export function closePackEditor() {
  document.getElementById('pack-editor-modal')?.setAttribute('hidden', '');
  state.activePackEditorId = null;
}

// Each component gets its own bordered card (name+remove on top, ml/equipment below, and
// a category picker for inline items) instead of one long flex row — six fields packed
// into a single row wrapped unpredictably with no visual boundary between components.
export function packComponentCardHtml(product, comp, idx) {
  let statusRow;
  if (comp.slug) {
    statusRow = `
        <div class="url-form-row">
          <span style="font-size:11.5px;color:var(--accent);">🔗 Linked to ${escHtml(resolveProductName(comp.slug))} — its category follows the product, and it shares inventory with any standalone copy you own.</span>
        </div>`;
  } else {
    const current = comp.sectionCategory && comp.sectionLabel ? `${comp.sectionCategory}::${comp.sectionLabel}` : '';
    let opts = `<option value="">Equipment — Other</option>`;
    for (const cat of state.allCategories) {
      for (const sec of cat.sections) {
        const val = `${cat.label}::${sec.label}`;
        opts += `<option value="${escAttr(val)}"${val === current ? ' selected' : ''}>${escHtml(cat.label)} — ${escHtml(sec.label)}</option>`;
      }
    }
    statusRow = `
        <div class="url-form-row">
          <span style="font-size:11.5px;color:var(--ink-low);white-space:nowrap;">Not linked —</span>
          <select class="url-retailer-select" onchange="updatePackDraftField(${product.id},${idx},'sectionPath',this.value)">${opts}</select>
        </div>`;
  }
  return `
      <div class="field-card">
        <div class="url-form-row">
          <input type="text" class="url-input" placeholder="Search products or type a custom name…"
            value="${escAttr(comp.name || '')}"
            oninput="onPackComponentInput(event,${product.id},${idx})"
            onfocus="openPackProductDropdown(event,${product.id},${idx})"
            onblur="hidePackProductDropdown()">
          <button class="step-remove-btn" onclick="removePackDraftRow(${product.id},${idx})" title="Remove component">✕</button>
        </div>
        <div class="url-form-row">
          <input type="number" class="url-input add-product-slug-input" placeholder="ml (optional)" value="${comp.volumeMl ?? ''}" oninput="updatePackDraftField(${product.id},${idx},'volumeMl',this.value)">
          <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--ink-mid);white-space:nowrap;">
            <input type="checkbox" ${comp.equipment ? 'checked' : ''} onchange="updatePackDraftField(${product.id},${idx},'equipment',this.checked)"> Equipment
          </label>
        </div>
        ${statusRow}
      </div>`;
}

export function renderPackEditorModal() {
  const productId = state.activePackEditorId;
  const product = state.liveProducts.find((p) => p.id === productId);
  const draft = state.packDrafts[productId];
  const titleEl = document.getElementById('pack-editor-title');
  const bodyEl = document.getElementById('pack-editor-body');
  if (!product || !draft || !titleEl || !bodyEl) return;

  titleEl.textContent = `Pack contents — ${product.name}`;
  bodyEl.innerHTML = `
      ${draft.map((comp, idx) => packComponentCardHtml(product, comp, idx)).join('')}
      <button class="add-step-btn" onclick="addPackDraftRow(${productId})">+ Add component</button>
      <div class="settings-save-bar">
        <button class="settings-save-btn" onclick="savePackDraft(${productId})">Save pack</button>
        <button class="settings-reset-btn" onclick="cancelPackEdit()">Cancel</button>
      </div>
      <div id="pack-error-${productId}" style="display:none;color:var(--danger);font-size:12px;margin-top:8px;"></div>`;
}

// One bounded field-card per retailer (always all four, whether linked or not) instead of
// separate "existing row + toggle edit form" vs "+ Retailer add form" flows — a retailer
// with no URL yet is just an empty input ready to fill in, saved the same way as an edit.
export function retailerFieldCardHtml(product, retailer) {
  const url = product.urls?.[retailer] || '';
  const retailerName = RETAILER_NAMES[retailer] || retailer;
  const linkedRow = url
    ? `
      <div class="url-form-row" style="justify-content:flex-end;">
        <a href="${escAttr(url)}" target="_blank" rel="noopener noreferrer" class="price-row-link">Visit →</a>
        <button class="prices-delete-link" onclick="showRemoveRetailerConfirm(${product.id},'${retailer}')">Remove</button>
      </div>
      <div class="log-confirm-row" id="remove-retailer-confirm-${product.id}-${retailer}" hidden>
        <span>Stop tracking ${escHtml(retailerName)} for this product? Its price history will be deleted.</span>
        <button class="log-confirm-cancel" onclick="cancelRemoveRetailerConfirm(${product.id},'${retailer}')">Cancel</button>
        <button class="log-confirm-delete" onclick="removeRetailer(${product.id},'${retailer}')">Remove</button>
      </div>`
    : '';
  return `
      <div class="field-card">
        <div class="url-form-row">
          <span class="url-form-label" style="min-width:100px;">${escHtml(retailerName)}</span>
          <input type="url" class="url-input" id="url-input-${product.id}-${retailer}" value="${escAttr(url)}" placeholder="https://...">
          <button class="alert-set-btn" onclick="saveRetailerUrl(${product.id},'${retailer}')">Save</button>
        </div>
        ${linkedRow}
      </div>`;
}

export function openRetailerEditor(productId) {
  state.activeRetailerEditorId = productId;
  renderRetailerEditorModal();
  document.getElementById('retailer-editor-modal')?.removeAttribute('hidden');
}

export function closeRetailerEditor() {
  document.getElementById('retailer-editor-modal')?.setAttribute('hidden', '');
  state.activeRetailerEditorId = null;
}

export function renderRetailerEditorModal() {
  const productId = state.activeRetailerEditorId;
  const product = state.liveProducts.find((p) => p.id === productId);
  const titleEl = document.getElementById('retailer-editor-title');
  const bodyEl = document.getElementById('retailer-editor-body');
  if (!product || !titleEl || !bodyEl) return;

  titleEl.textContent = `Retailer URLs — ${product.name}`;
  bodyEl.innerHTML = SCRAPED_RETAILERS.map((r) => retailerFieldCardHtml(product, r)).join('');
}

export async function confirmUnpack(productId) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/products/${productId}/pack`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error(await res.text());
    const product = state.liveProducts.find((p) => p.id === productId);
    if (product) {
      product.isPack = false;
      product.components = [];
    }
    delete state.packDrafts[productId];
    rebuildBundleComponents();
    renderInventory();
    renderProductsPage();
  } catch (e) {
    console.error('confirmUnpack:', e);
  }
}

export function cancelPackEdit() {
  if (state.activePackEditorId != null) delete state.packDrafts[state.activePackEditorId];
  closePackEditor();
  renderProductsPage();
}

export function addPackDraftRow(productId) {
  if (!state.packDrafts[productId]) state.packDrafts[productId] = [];
  state.packDrafts[productId].push({});
  renderPackEditorModal();
}

export function removePackDraftRow(productId, idx) {
  state.packDrafts[productId]?.splice(idx, 1);
  renderPackEditorModal();
}

export function updatePackDraftSlug(productId, idx, slug) {
  const comp = state.packDrafts[productId]?.[idx];
  if (!comp) return;
  if (slug) {
    // Picking a suggestion is an explicit choice — always take its name, even if the user
    // had already typed something different before selecting.
    comp.slug = slug;
    comp.name = resolveProductName(slug);
    delete comp.sectionCategory;
    delete comp.sectionLabel;
  } else {
    delete comp.slug;
  }
  renderPackEditorModal();
}

export function updatePackDraftField(productId, idx, field, val) {
  const comp = state.packDrafts[productId]?.[idx];
  if (!comp) return;
  if (field === 'volumeMl') comp.volumeMl = val ? parseInt(val, 10) : undefined;
  else if (field === 'equipment') comp.equipment = val;
  else if (field === 'sectionPath') {
    if (val) {
      const [c, s] = val.split('::');
      comp.sectionCategory = c;
      comp.sectionLabel = s;
    } else {
      delete comp.sectionCategory;
      delete comp.sectionLabel;
    }
  } else {
    comp.name = val;
  }
}

// Typing in the component search/name field diverges from any previously-linked product
// until a suggestion is explicitly clicked (updatePackDraftSlug) — no re-render here so
// typing doesn't lose focus/cursor position; the "linked" status row catches up on the next
// full re-render (add/remove a row, pick a suggestion, or reopen the editor).
export function onPackComponentInput(event, productId, idx) {
  const comp = state.packDrafts[productId]?.[idx];
  if (comp) {
    comp.name = event.target.value;
    delete comp.slug;
    delete comp.sectionCategory;
    delete comp.sectionLabel;
  }
  _filterPackProductDropdown(event.target.value);
}

// Searchable existing-product picker for pack components — same floating-dropdown pattern as
// the Routine step editor's product picker (openCatalogDropdown/_buildCatalogGroups), but
// keyed by slug (not collapsed to a family name) since a pack component needs the exact
// product, and scoped to a higher z-index so it renders above the pack-editor modal overlay.
export function openPackProductDropdown(event, productId, idx) {
  state._packDropdownInput = event.target;
  let dd = document.getElementById('pack-product-dropdown');
  if (!dd) {
    dd = document.createElement('div');
    dd.id = 'pack-product-dropdown';
    dd.className = 'catalog-dropdown';
    document.body.appendChild(dd);
    dd.addEventListener('mousedown', (e) => {
      const item = e.target.closest('.catalog-dropdown-item');
      if (!item) return;
      e.preventDefault();
      const { pid, idx: i } = dd.dataset;
      updatePackDraftSlug(+pid, +i, item.dataset.slug);
      dd.style.display = 'none';
    });
  }
  Object.assign(dd.dataset, { pid: productId, idx });

  const product = state.liveProducts.find((p) => p.id === productId);
  const candidateSlugs = getAllProductSlugs().filter(
    (s) => s !== product?.slug && !state.liveProducts.find((p) => p.slug === s)?.isPack,
  );
  const groups = groupSlugsByCategory(candidateSlugs, resolveProductName);
  dd.innerHTML = groups
    .map(
      (g) => `
      <div class="catalog-dd-cat">
        <div class="catalog-dd-header">${escHtml(g.label)}</div>
        ${g.entries.map((e) => `<div class="catalog-dropdown-item" data-slug="${escAttr(e.slug)}">${escHtml(e.name)}</div>`).join('')}
      </div>
    `,
    )
    .join('');

  const rect = state._packDropdownInput.getBoundingClientRect();
  Object.assign(dd.style, {
    display: 'block',
    top: `${rect.bottom + window.scrollY + 2}px`,
    left: `${rect.left + window.scrollX}px`,
    width: `${Math.max(rect.width, 240)}px`,
  });
  _filterPackProductDropdown(state._packDropdownInput.value);
}

export function _filterPackProductDropdown(query) {
  const dd = document.getElementById('pack-product-dropdown');
  if (!dd || dd.style.display === 'none') return;
  const q = query.toLowerCase().trim();
  dd.querySelectorAll('.catalog-dd-cat').forEach((cat) => {
    let catHas = false;
    cat.querySelectorAll('.catalog-dropdown-item').forEach((item) => {
      const show = !q || item.textContent.toLowerCase().includes(q);
      item.style.display = show ? '' : 'none';
      if (show) catHas = true;
    });
    cat.style.display = catHas ? '' : 'none';
  });
}

export function hidePackProductDropdown() {
  setTimeout(() => {
    const dd = document.getElementById('pack-product-dropdown');
    if (dd) dd.style.display = 'none';
  }, 150);
}

export async function savePackDraft(productId) {
  const draft = state.packDrafts[productId];
  const errorEl = document.getElementById(`pack-error-${productId}`);
  if (errorEl) errorEl.style.display = 'none';
  if (!draft || draft.length === 0) {
    if (errorEl) {
      errorEl.textContent = 'Add at least one component.';
      errorEl.style.display = 'block';
    }
    return;
  }
  for (const c of draft) {
    if (!c.name || !c.name.trim()) {
      if (errorEl) {
        errorEl.textContent = 'Every component needs a name.';
        errorEl.style.display = 'block';
      }
      return;
    }
  }
  const slugToId = Object.fromEntries(state.liveProducts.map((p) => [p.slug, p.id]));
  const components = draft.map((c) => ({
    componentProductId: c.slug ? slugToId[c.slug] : undefined,
    name: c.name.trim(),
    volumeMl: c.volumeMl || undefined,
    equipment: c.equipment || undefined,
    sectionCategory: c.sectionCategory || undefined,
    sectionLabel: c.sectionLabel || undefined,
  }));
  try {
    const res = await fetch(`${BACKEND_URL}/api/products/${productId}/pack`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ components }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to save pack.' }));
      if (errorEl) {
        errorEl.textContent = err.error || 'Failed to save pack.';
        errorEl.style.display = 'block';
      }
      return;
    }
    const data = await res.json();
    const product = state.liveProducts.find((p) => p.id === productId);
    if (product) {
      product.isPack = true;
      product.components = data.components;
    }
    delete state.packDrafts[productId];
    closePackEditor();
    rebuildBundleComponents();
    renderInventory();
    renderProductsPage();
  } catch (e) {
    console.error('savePackDraft:', e);
    if (errorEl) {
      errorEl.textContent = 'Network error — try again.';
      errorEl.style.display = 'block';
    }
  }
}

export async function saveRetailerUrl(productId, retailer) {
  const input = document.getElementById(`url-input-${productId}-${retailer}`);
  const url = input?.value?.trim();
  if (!url || !url.startsWith('http')) {
    input?.focus();
    return;
  }
  try {
    const res = await fetch(`${BACKEND_URL}/api/products/${productId}/url`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ retailer, url }),
    });
    if (!res.ok) throw new Error(await res.text());
    const prod = state.liveProducts.find((p) => p.id === productId);
    if (prod) {
      prod.urls = prod.urls ?? {};
      prod.urls[retailer] = url;
    }
    renderPricesTab();
    renderProductsPage();
    if (state.activeRetailerEditorId === productId) renderRetailerEditorModal();
  } catch (e) {
    console.error('saveRetailerUrl:', e);
  }
}

export function showRemoveRetailerConfirm(productId, retailer) {
  document.getElementById(`remove-retailer-confirm-${productId}-${retailer}`)?.removeAttribute('hidden');
}

export function cancelRemoveRetailerConfirm(productId, retailer) {
  document.getElementById(`remove-retailer-confirm-${productId}-${retailer}`)?.setAttribute('hidden', '');
}

export async function removeRetailer(productId, retailer) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/products/${productId}/url/${retailer}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error(await res.text());
    const prod = state.liveProducts.find((p) => p.id === productId);
    if (prod) {
      delete prod.urls?.[retailer];
      delete prod.latestPrice?.[retailer];
    }
    renderPricesTab();
    renderProductsPage();
    if (state.activeRetailerEditorId === productId) renderRetailerEditorModal();
  } catch (e) {
    console.error('removeRetailer:', e);
  }
}

export function toggleAddProductForm() {
  const form = document.getElementById('prices-add-product-form');
  if (!form) return;
  const opening = form.style.display === 'none';
  form.style.display = opening ? 'block' : 'none';
  if (opening) document.getElementById('add-product-name')?.focus();
}

export function autoFillProductSlug() {
  const name = document.getElementById('add-product-name')?.value ?? '';
  const slugEl = document.getElementById('add-product-slug');
  if (slugEl)
    slugEl.value = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
}

export async function saveNewProduct() {
  const nameEl = document.getElementById('add-product-name');
  const slugEl = document.getElementById('add-product-slug');
  const retEl = document.getElementById('add-product-retailer');
  const urlEl = document.getElementById('add-product-url');
  const errorEl = document.getElementById('add-product-error');

  const name = nameEl?.value.trim() ?? '';
  const slug = slugEl?.value.trim() ?? '';
  const retailer = retEl?.value || null;
  const url = urlEl?.value.trim() || null;

  function showErr(msg) {
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    }
  }
  if (errorEl) errorEl.style.display = 'none';

  if (!name) {
    showErr('Product name is required.');
    nameEl?.focus();
    return;
  }
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    showErr('Slug must be lowercase letters, numbers and hyphens.');
    slugEl?.focus();
    return;
  }
  if (retailer && (!url || !url.startsWith('http'))) {
    showErr('A URL is required when a retailer is selected.');
    urlEl?.focus();
    return;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, slug, retailer: retailer || undefined, url: url || undefined }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      showErr(err.error || 'Failed to add product.');
      return;
    }
    const newProd = await res.json();
    state.liveProducts.push({
      ...newProd,
      isPack: false,
      components: [],
      latestPrice: {},
      urls: retailer && url ? { [retailer]: url } : {},
    });
    renderPricesTab();
    renderProductsPage();
  } catch (e) {
    console.error('saveNewProduct:', e);
    if (errorEl) {
      errorEl.textContent = 'Network error — try again.';
      errorEl.style.display = 'block';
    }
  }
}

export function toggleProductNameForm(productId) {
  const form = document.getElementById(`product-name-form-${productId}`);
  if (!form) return;
  const opening = form.style.display === 'none';
  form.style.display = opening ? 'block' : 'none';
  if (opening) document.getElementById(`product-name-input-${productId}`)?.focus();
}

export async function saveProductName(productId) {
  const input = document.getElementById(`product-name-input-${productId}`);
  const errorEl = document.getElementById(`product-name-error-${productId}`);
  if (errorEl) errorEl.style.display = 'none';

  const name = input?.value.trim() ?? '';
  if (!name) {
    if (errorEl) {
      errorEl.textContent = 'Name is required.';
      errorEl.style.display = 'block';
    }
    input?.focus();
    return;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to rename product.' }));
      if (errorEl) {
        errorEl.textContent = err.error || 'Failed to rename product.';
        errorEl.style.display = 'block';
      }
      return;
    }
    const prod = state.liveProducts.find((p) => p.id === productId);
    const oldName = prod?.name;
    if (prod) prod.name = name;

    // Routine steps store the product name, not its id/slug — keep them in sync
    // so a rename doesn't silently break inventory depletion or auto-fill matching.
    if (oldName && oldName !== name) {
      let changed = false;
      for (const routine of state.routines) {
        for (const step of routine.steps || []) {
          for (const p of step.products || []) {
            if (p.name === oldName) {
              p.name = name;
              changed = true;
            }
          }
        }
      }
      if (changed) await saveRoutines();
    }
    renderPricesTab();
    renderProductsPage();
  } catch (e) {
    console.error('saveProductName:', e);
    if (errorEl) {
      errorEl.textContent = 'Network error — try again.';
      errorEl.style.display = 'block';
    }
  }
}

export function showDeleteProductConfirm(productId) {
  document.getElementById(`delete-product-confirm-${productId}`)?.removeAttribute('hidden');
}

export function cancelDeleteProductConfirm(productId) {
  document.getElementById(`delete-product-confirm-${productId}`)?.setAttribute('hidden', '');
}

export async function deleteProduct(productId) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/products/${productId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error(await res.text());
    state.liveProducts = state.liveProducts.filter((p) => p.id !== productId);
    delete state.priceHistories[productId];
    delete state.packDrafts[productId];
    renderPricesTab();
    renderProductsPage();
    // The deleted product may have been a component of another pack (backend cascades that
    // removal server-side) — refetch so any such pack's card and Inventory reflect it too.
    await loadPriceData();
  } catch (e) {
    console.error('deleteProduct:', e);
  }
}
