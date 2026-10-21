// Inventory → Checklist sub-tab: purchase phases.
import { getAllProductSlugs, groupSlugsByCategory, resolveCatalogEntry, resolveProductName } from './catalog.js';
import { ALERTS_KEY, CHECKLIST_KEY, CHECKLIST_V2_KEY, CHECKLIST_V3_KEY, INVENTORY_KEY } from './config.js';
import { DEFAULT_PHASES, RETAILER_NAMES } from './data.js';
import { initInventoryStock, renderInventory, showInvToast } from './inventory.js';
import { renderAlertsPanel } from './prices.js';
import { applyPrefs } from './settings.js';
import { state } from './state.js';
import { storageGet, storageSet, syncPush } from './storage.js';
import { escAttr, escHtml } from './util.js';

export const editingPhases = new Set();

export async function loadChecklist() {
  let saved = await storageGet(CHECKLIST_V3_KEY);
  if (!saved) {
    // Try migrating from v2
    const v2 = await storageGet(CHECKLIST_V2_KEY);
    if (v2 && v2.config) {
      const phases = DEFAULT_PHASES.map((p) => ({
        ...p,
        items: [...(v2.config[p.id] || p.items)],
      }));
      saved = { phases, nextId: 5, checked: v2.checked || {} };
      await storageSet(CHECKLIST_V3_KEY, saved);
    } else {
      // Try migrating from v4 (positional IDs)
      const v4 = await storageGet(CHECKLIST_KEY);
      if (v4) {
        const allSlugs = DEFAULT_PHASES.flatMap((p) => p.items);
        const checked = {};
        Object.entries(v4).forEach(([id, val]) => {
          const idx = parseInt(id.replace('item-', ''), 10);
          if (!isNaN(idx) && allSlugs[idx]) checked[allSlugs[idx]] = val;
        });
        saved = { phases: DEFAULT_PHASES.map((p) => ({ ...p, items: [...p.items] })), nextId: 5, checked };
        await storageSet(CHECKLIST_V3_KEY, saved);
      }
    }
  }
  state.checklistState = saved
    ? {
        phases: saved.phases || DEFAULT_PHASES.map((p) => ({ ...p, items: [...p.items] })),
        nextId: saved.nextId || 5,
        checked: saved.checked || {},
      }
    : { phases: DEFAULT_PHASES.map((p) => ({ ...p, items: [...p.items] })), nextId: 5, checked: {} };
  renderChecklist();
  recompute();
}

export async function saveChecklist() {
  const today = new Date().toISOString().split('T')[0];

  // Initialise inventory (purchase date + full stock) for newly-checked items
  state.itemData.forEach((item) => {
    const wasChecked = state.checklistState.checked[item.slug];
    const nowChecked = item.input.checked;
    if (!wasChecked && nowChecked) initInventoryStock(item.slug, today);
  });

  state.itemData.forEach((item) => {
    state.checklistState.checked[item.slug] = item.input.checked;
  });

  // Auto-archive phases where every item is checked
  const completedPhases = state.checklistState.phases.filter(
    (phase) => phase.items.length > 0 && phase.items.every((slug) => state.checklistState.checked[slug]),
  );
  for (const phase of completedPhases) {
    for (const slug of phase.items) initInventoryStock(slug, today);
    showInvToast(`${phase.title} complete — items moved to Inventory`);
  }
  const didArchive = completedPhases.length > 0;
  if (didArchive) {
    const completedIds = new Set(completedPhases.map((p) => p.id));
    state.checklistState.phases = state.checklistState.phases.filter((p) => !completedIds.has(p.id));
  }

  await storageSet(CHECKLIST_V3_KEY, state.checklistState);
  syncPush(CHECKLIST_V3_KEY, state.checklistState);

  if (Object.keys(state.inventoryState).length > 0) {
    await storageSet(INVENTORY_KEY, state.inventoryState);
    syncPush(INVENTORY_KEY, state.inventoryState);
  }

  if (didArchive) {
    renderChecklist();
    recompute();
  }
  renderInventory();
}

export function createPhaseEl(phase) {
  const isEditing = editingPhases.has(phase.id);
  const div = document.createElement('div');
  div.className = 'phase' + (isEditing ? ' phase--editing' : '');
  div.dataset.phase = phase.id;
  div.innerHTML = `
      <div class="phase-head">
        <div class="phase-head-left">
          ${
            isEditing
              ? `<input class="phase-tag-input" data-phase="${phase.id}" value="${escHtml(phase.tag)}" placeholder="Phase label">`
              : `<div class="phase-tag">${escHtml(phase.tag)}</div>`
          }
          ${
            isEditing
              ? `<input class="phase-title-input" data-phase="${phase.id}" value="${escHtml(phase.title)}" placeholder="Phase title">`
              : `<h2 class="phase-title">${escHtml(phase.title)}</h2>`
          }
        </div>
        <div class="phase-head-right">
          <span class="phase-status" data-phase-status="${phase.id}">0 of ${phase.items.length}</span>
          <button class="phase-edit-btn" data-phase="${phase.id}" type="button">${isEditing ? 'Done' : 'Edit'}</button>
        </div>
      </div>
      <div class="phase-items" id="phase-items-${phase.id}"></div>
      <div class="phase-edit-panel" id="phase-edit-${phase.id}" ${isEditing ? '' : 'hidden'}>
        <div class="phase-edit-add">
          <select class="phase-edit-select" id="phase-edit-select-${phase.id}">
            <option value="">— add a product —</option>
          </select>
          <button class="phase-edit-add-btn" data-phase="${phase.id}" type="button">Add</button>
        </div>
        <button class="phase-delete-btn" data-phase="${phase.id}" type="button">Delete phase</button>
      </div>
    `;
  return div;
}

export function renderChecklist() {
  state.itemData = [];
  const container = document.getElementById('phases-container');
  if (!container) return;
  container.innerHTML = '';

  state.checklistState.phases.forEach((phase) => {
    const phaseEl = createPhaseEl(phase);
    container.appendChild(phaseEl);
    const itemsContainer = phaseEl.querySelector('.phase-items');

    phase.items.forEach((slug) => {
      const entry = resolveCatalogEntry(slug);
      if (!entry) return;
      const checked = state.checklistState.checked[slug] || false;
      const live = state.slugToBest[slug];
      let priceText;
      if (live) {
        priceText = `$${(live.priceCents / 100).toFixed(2)} · ${RETAILER_NAMES[live.retailer] || live.retailer}`;
      } else if (entry.price > 0) {
        priceText = `~$${entry.price}`;
      } else {
        priceText = '—';
      }
      const hasAlert = !!state.priceAlerts[slug];
      const alertBtnTitle = hasAlert ? 'Alert set — click to edit' : 'Set price alert';
      const buyUrl = live?.url || null;
      const label = document.createElement('label');
      label.className = 'item';
      label.dataset.price = String(entry.price);
      label.dataset.slug = slug;
      label.innerHTML = `
          <input type="checkbox"${checked ? ' checked' : ''}>
          <div>
            <div class="item-name">${escHtml(entry.name)}</div>
            ${entry.desc ? `<div class="item-desc">${escHtml(entry.desc)}</div>` : ''}
          </div>
          <div class="item-actions">
            <div class="item-price">${priceText}</div>
            <a class="item-buy-btn"${buyUrl ? ` href="${buyUrl}" target="_blank" rel="noopener noreferrer"` : ''} title="Buy at best price"${buyUrl ? '' : ' hidden'}>→</a>
            ${state.syncEnabled ? `<button class="alert-btn${hasAlert ? ' active' : ''}" id="cl-alert-btn-${slug}" data-alert-slug="${slug}" onclick="toggleChecklistAlert('${escAttr(slug)}')" title="${alertBtnTitle}">🔔</button>` : ''}
          </div>
          <button class="item-remove" type="button" title="Remove from phase">×</button>
        `;
      const input = label.querySelector('input');
      input.addEventListener('change', () => {
        recompute();
        saveChecklist();
      });
      label.querySelector('.item-remove').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeFromPhase(phase.id, slug);
      });
      itemsContainer.appendChild(label);

      if (state.syncEnabled) {
        const alertForm = document.createElement('div');
        alertForm.className = 'alert-inline-form';
        alertForm.id = `cl-alert-form-${slug}`;
        alertForm.style.display = 'none';
        alertForm.innerHTML = `
            <div class="alert-form-row">
              <div class="alert-form-inputs">
                <span class="alert-form-label">Alert when below</span>
                <div class="alert-threshold-wrap"><span class="alert-dollar">$</span><input type="number" class="alert-threshold-input" id="cl-alert-threshold-${slug}" min="0.01" step="0.01" placeholder="0.00"></div>
                <select class="alert-channel-select" id="cl-alert-channel-${slug}">
                  <option value="global">Global setting</option>
                  <option value="ticktick">TickTick</option>
                  <option value="email">Email</option>
                </select>
              </div>
              <div class="alert-form-actions">
                <button class="alert-set-btn" onclick="saveChecklistAlert('${escAttr(slug)}')">Set</button>
                <button class="alert-clear-btn" onclick="clearChecklistAlert('${escAttr(slug)}')">Clear</button>
              </div>
            </div>
          `;
        itemsContainer.appendChild(alertForm);
      }
      state.itemData.push({
        slug,
        el: label,
        input,
        price: live ? Math.round(live.priceCents / 100) : entry.price,
        phase: phase.id,
        name: entry.name,
      });
    });
    updatePhaseEditDropdown(phase.id);
  });
  applyPrefs();
}

export function updatePhaseEditDropdown(phaseId) {
  const select = document.getElementById(`phase-edit-select-${phaseId}`);
  if (!select) return;
  const phase = state.checklistState.phases.find((p) => p.id === phaseId);
  const inPhase = new Set(phase ? phase.items : []);
  const prev = select.value;

  const slugs = getAllProductSlugs().filter((slug) => !inPhase.has(slug));
  const groups = groupSlugsByCategory(slugs, resolveProductName);

  select.innerHTML = '<option value="">— add a product —</option>';
  for (const group of groups) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    group.entries.forEach(({ slug, name }) => {
      const opt = document.createElement('option');
      opt.value = slug;
      opt.textContent = name;
      optgroup.appendChild(opt);
    });
    select.appendChild(optgroup);
  }
  if (prev && !inPhase.has(prev)) select.value = prev;
}

export function addToPhase(phaseId, slug) {
  const phase = state.checklistState.phases.find((p) => p.id === phaseId);
  if (!phase || phase.items.includes(slug)) return;
  phase.items.push(slug);
  saveChecklist();
  renderChecklist();
  recompute();
}

export function removeFromPhase(phaseId, slug) {
  const phase = state.checklistState.phases.find((p) => p.id === phaseId);
  if (!phase) return;
  phase.items = phase.items.filter((s) => s !== slug);
  delete state.checklistState.checked[slug];
  saveChecklist();
  renderChecklist();
  recompute();
}

export function addPhase() {
  const id = String(state.checklistState.nextId++);
  state.checklistState.phases.push({
    id,
    tag: `Phase ${state.checklistState.phases.length}`,
    title: 'New phase',
    items: [],
  });
  editingPhases.add(id);
  saveChecklist();
  renderChecklist();
  recompute();
  setTimeout(() => {
    const el = document.querySelector(`[data-phase="${id}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const titleInput = document.querySelector(`.phase-title-input[data-phase="${id}"]`);
    if (titleInput) {
      titleInput.select();
    }
  }, 50);
}

export function deletePhase(phaseId) {
  const phase = state.checklistState.phases.find((p) => p.id === phaseId);
  if (!phase) return;
  if (phase.items.length > 0 && !confirm(`Delete "${phase.title}" and remove its ${phase.items.length} item(s)?`))
    return;
  phase.items.forEach((slug) => delete state.checklistState.checked[slug]);
  state.checklistState.phases = state.checklistState.phases.filter((p) => p.id !== phaseId);
  editingPhases.delete(phaseId);
  saveChecklist();
  renderChecklist();
  recompute();
}

export function setupChecklist() {
  const container = document.getElementById('phases-container');
  if (container) {
    container.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.phase-edit-btn');
      if (editBtn) {
        const id = editBtn.dataset.phase;
        if (editingPhases.has(id)) editingPhases.delete(id);
        else editingPhases.add(id);
        renderChecklist();
        return;
      }
      const addBtn = e.target.closest('.phase-edit-add-btn');
      if (addBtn) {
        const id = addBtn.dataset.phase;
        const select = document.getElementById(`phase-edit-select-${id}`);
        if (select && select.value) addToPhase(id, select.value);
        return;
      }
      const deleteBtn = e.target.closest('.phase-delete-btn');
      if (deleteBtn) {
        deletePhase(deleteBtn.dataset.phase);
        return;
      }
    });

    // Tag / title live edits — update state without re-rendering so inputs keep focus
    container.addEventListener('input', (e) => {
      if (e.target.classList.contains('phase-tag-input')) {
        const p = state.checklistState.phases.find((p) => p.id === e.target.dataset.phase);
        if (p) {
          p.tag = e.target.value;
          saveChecklist();
        }
      }
      if (e.target.classList.contains('phase-title-input')) {
        const p = state.checklistState.phases.find((p) => p.id === e.target.dataset.phase);
        if (p) {
          p.title = e.target.value;
          saveChecklist();
        }
      }
    });
  }

  const addPhaseBtn = document.getElementById('add-phase-btn');
  if (addPhaseBtn) addPhaseBtn.addEventListener('click', addPhase);
}

export function recompute() {
  const byPhase = {};
  state.itemData.forEach((item) => {
    if (!byPhase[item.phase]) byPhase[item.phase] = { done: 0, count: 0 };
    byPhase[item.phase].count++;
    if (item.input.checked) {
      item.el.classList.add('done');
      byPhase[item.phase].done++;
    } else {
      item.el.classList.remove('done');
    }
  });
  Object.keys(byPhase).forEach((p) => {
    const el = document.querySelector(`[data-phase-status="${p}"]`);
    if (!el) return;
    const { done, count } = byPhase[p];
    if (done === count) {
      el.textContent = 'Complete';
      el.classList.add('done');
    } else {
      el.textContent = `${done} of ${count}`;
      el.classList.remove('done');
    }
  });
}

export function toggleChecklistAlert(slug) {
  const form = document.getElementById(`cl-alert-form-${slug}`);
  if (!form) return;
  const opening = form.style.display === 'none' || form.style.display === '';
  form.style.display = opening ? 'block' : 'none';
  if (opening) {
    const alert = state.priceAlerts[slug];
    const inp = document.getElementById(`cl-alert-threshold-${slug}`);
    const sel = document.getElementById(`cl-alert-channel-${slug}`);
    if (inp) inp.value = alert ? (alert.thresholdCents / 100).toFixed(2) : '';
    if (sel) sel.value = alert?.channel || 'global';
  }
}

export async function saveChecklistAlert(slug) {
  const inp = document.getElementById(`cl-alert-threshold-${slug}`);
  const sel = document.getElementById(`cl-alert-channel-${slug}`);
  const val = parseFloat(inp?.value ?? '');
  if (!val || val <= 0) {
    inp?.focus();
    return;
  }
  state.priceAlerts[slug] = { thresholdCents: Math.round(val * 100), channel: sel?.value || 'global' };
  await storageSet(ALERTS_KEY, state.priceAlerts);
  syncPush(ALERTS_KEY, state.priceAlerts);
  document.querySelectorAll(`[data-alert-slug="${slug}"]`).forEach((btn) => {
    btn.classList.add('active');
    btn.title = 'Alert set — click to edit';
  });
  const clForm = document.getElementById(`cl-alert-form-${slug}`);
  if (clForm) clForm.style.display = 'none';
  renderAlertsPanel();
}

export async function clearChecklistAlert(slug) {
  delete state.priceAlerts[slug];
  await storageSet(ALERTS_KEY, state.priceAlerts);
  syncPush(ALERTS_KEY, state.priceAlerts);
  document.querySelectorAll(`[data-alert-slug="${slug}"]`).forEach((btn) => {
    btn.classList.remove('active');
    btn.title = 'Set price alert';
  });
  const clForm = document.getElementById(`cl-alert-form-${slug}`);
  if (clForm) clForm.style.display = 'none';
  const form = document.getElementById(`alert-form-${slug}`);
  if (form) form.style.display = 'none';
  renderAlertsPanel();
}
