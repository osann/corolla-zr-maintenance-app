// Routines tab: routine objects, editor, CSV.
import { getAllProductSlugs, groupSlugsByCategory, resolveProductName } from './catalog.js';
import { ROUTINES_KEY } from './config.js';
import {
  CANONICAL_SLUG_MAP,
  CATALOG,
  EQUIPMENT_SLUGS,
  FAMILY_NAMES,
  PRODUCT_ACTIONS,
  ROUTINE_CSV_TEMPLATE,
  SLUG_FAMILIES,
} from './data.js';
import { renderLogTypeSelect } from './log.js';
import { renderSchedulesUI } from './schedules.js';
import { state } from './state.js';
import { storageGet, storageSet, syncPush } from './storage.js';
import { csvField, escAttr, escHtml, parseCSVRow, showSaved, triggerDownload } from './util.js';

export function encodeProducts(products) {
  return (products || []).map((p) => (p.ml ? `${p.name}:${p.ml}` : p.name)).join(';');
}

export function decodeProducts(str) {
  if (!str) return [];
  return str
    .split(';')
    .map((s) => {
      const colon = s.lastIndexOf(':');
      if (colon !== -1) {
        const maybeNum = Number(s.slice(colon + 1));
        if (!isNaN(maybeNum) && s.slice(colon + 1).trim() !== '') {
          return { name: s.slice(0, colon).trim(), ml: maybeNum };
        }
      }
      return { name: s.trim(), ml: null };
    })
    .filter((p) => p.name);
}

export function exportRoutinesCSV() {
  const rows = ['row_type,routine_id,name,subtext,types,action,products,severity,label,text'];
  state.routines.forEach((r) => {
    const types = (r.types || []).join(';');
    rows.push(
      [
        csvField('routine'),
        csvField(r.id),
        csvField(r.name),
        csvField(r.subtext || ''),
        csvField(types),
        '',
        '',
        '',
        '',
        '',
      ].join(','),
    );
    (r.steps || []).forEach((s) => {
      rows.push(
        [
          csvField('step'),
          csvField(r.id),
          csvField(s.name || ''),
          '',
          '',
          csvField(s.action || ''),
          csvField(encodeProducts(s.products)),
          '',
          '',
          '',
        ].join(','),
      );
    });
    (r.alerts || []).forEach((a) => {
      rows.push(
        [
          csvField('alert'),
          csvField(r.id),
          '',
          '',
          '',
          '',
          '',
          csvField(a.severity),
          csvField(a.label || ''),
          csvField(a.text),
        ].join(','),
      );
    });
  });
  const csv = '﻿' + rows.join('\r\n');
  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(csv, `routines-${date}.csv`, 'text/csv;charset=utf-8;');
}

export function parseRoutinesCSV(text) {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVRow(lines[0]);
  const idx = {};
  headers.forEach((h, i) => (idx[h.trim()] = i));
  const get = (row, col) => (row[idx[col]] ?? '').trim();

  const routineMap = {};
  const order = [];
  lines.slice(1).forEach((line) => {
    const row = parseCSVRow(line);
    const type = get(row, 'row_type');
    const rid = get(row, 'routine_id');
    if (!rid) return;
    if (type === 'routine') {
      const types = get(row, 'types')
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean);
      routineMap[rid] = { id: rid, name: get(row, 'name'), subtext: get(row, 'subtext'), types, steps: [], alerts: [] };
      order.push(rid);
    } else if (type === 'step' && routineMap[rid]) {
      routineMap[rid].steps.push({
        name: get(row, 'name'),
        action: get(row, 'action'),
        products: decodeProducts(get(row, 'products')),
      });
    } else if (type === 'alert' && routineMap[rid]) {
      routineMap[rid].alerts.push({
        severity: get(row, 'severity') || 'tip',
        label: get(row, 'label'),
        text: get(row, 'text'),
      });
    }
  });
  return normaliseRoutineProductNames(order.map((rid) => routineMap[rid]));
}

export function importRoutinesCSV() {
  const input = document.getElementById('routine-csv-input');
  if (!input) return;
  input.value = '';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const parsed = parseRoutinesCSV(ev.target.result);
      if (!parsed.length) {
        alert('No valid routines found in the CSV file.');
        return;
      }
      if (!confirm(`Import ${parsed.length} routine(s)? They will be added to your existing routines.`)) return;
      const ts = Date.now();
      parsed.forEach((r, i) => {
        r.id = `routine-import-${r.id}-${ts + i}`;
      });
      state.routines.push(...parsed);
      await saveRoutines();
    };
    reader.readAsText(file);
  };
  input.click();
}

export function downloadRoutineTemplate() {
  triggerDownload(ROUTINE_CSV_TEMPLATE, 'routine-template.txt', 'text/plain;charset=utf-8;');
}

export function normaliseRoutineProductNames(routinesList) {
  const nameToCanonical = new Map();
  for (const [family, canonicalName] of Object.entries(FAMILY_NAMES)) {
    for (const [slug, fam] of Object.entries(SLUG_FAMILIES)) {
      if (fam !== family) continue;
      const cat = CATALOG.find((c) => c.slug === slug);
      if (cat) nameToCanonical.set(cat.name, canonicalName);
    }
  }
  // Legacy DEFAULT_ROUTINES names that don't match exact CATALOG display names
  nameToCanonical.set('Wet Dreams Sealant 770ml', 'Wet Dreams');
  nameToCanonical.set('Happy Ending Cannon Bottle', 'Happy Ending');
  return routinesList.map((r) => ({
    ...r,
    steps: (r.steps || []).map((s) => ({
      ...s,
      products: (s.products || []).map((p) => ({ ...p, name: nameToCanonical.get(p.name) ?? p.name })),
    })),
  }));
}

export async function loadRoutines() {
  const saved = await storageGet(ROUTINES_KEY);
  if (saved && Array.isArray(saved) && saved.length) state.routines = saved;
  // Migrate old step shape { product, action, enabled } → { name, action, products }
  state.routines = state.routines.map((routine) => ({
    ...routine,
    steps: (routine.steps || []).map((step) => {
      if ('product' in step && !('name' in step)) {
        return {
          name: '',
          action: step.action || '',
          products: step.product ? [{ name: step.product, ml: null }] : [],
        };
      }
      if (!('products' in step)) step.products = [];
      return step;
    }),
  }));
  renderRoutinesView();
  renderRoutineConfigCards();
  renderSchedulesUI();
  renderLogTypeSelect();
}

export async function saveRoutines() {
  await storageSet(ROUTINES_KEY, state.routines);
  syncPush(ROUTINES_KEY, state.routines);
  renderRoutinesView();
  renderRoutineConfigCards();
  renderLogTypeSelect();
  renderSchedulesUI();
  showSaved('routines-v1-saved');
}

export function _buildCatalogGroups() {
  const slugToName = (slug) => {
    const family = SLUG_FAMILIES[slug];
    if (!family) return resolveProductName(slug);
    // Equipment slugs that share a family with consumables keep their full CATALOG name,
    // so the canonical family name is reserved for the consumable (e.g. cannon bottle
    // stays "Happy Ending Cannon Bottle"; the foam liquid gets "Happy Ending").
    if (EQUIPMENT_SLUGS.has(slug)) {
      const hasConsumable = CATALOG.some((c) => SLUG_FAMILIES[c.slug] === family && !EQUIPMENT_SLUGS.has(c.slug));
      if (hasConsumable) return resolveProductName(slug);
    }
    return FAMILY_NAMES[family] ?? resolveProductName(slug);
  };

  // Grouped the same way as the Prices tab (built-in + custom categories/sections,
  // "Other" for anything uncategorised), then collapsed to canonical family names —
  // routine steps reference products by name, not slug, so size/SKU variants collapse.
  const rawGroups = groupSlugsByCategory(getAllProductSlugs(), slugToName);
  const seen = new Set();
  const groups = [];
  for (const g of rawGroups) {
    const names = [];
    for (const { name } of g.entries) {
      if (seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
    if (names.length) groups.push({ label: g.label, names });
  }
  return groups;
}

export function openCatalogDropdown(event, rIdx, sIdx, pIdx) {
  state._catalogDropdownInput = event.target;
  let dd = document.getElementById('catalog-dropdown');
  if (!dd) {
    dd = document.createElement('div');
    dd.id = 'catalog-dropdown';
    dd.className = 'catalog-dropdown';
    document.body.appendChild(dd);
    dd.addEventListener('mousedown', (e) => {
      const item = e.target.closest('.catalog-dropdown-item');
      if (!item) return;
      e.preventDefault();
      const { ridx, sidx, pidx } = dd.dataset;
      const name = item.dataset.name;
      if (state._catalogDropdownInput) state._catalogDropdownInput.value = name;
      updateStepProduct(+ridx, +sidx, +pidx, 'name', name);
      dd.style.display = 'none';
      renderRoutineConfigCards();
    });
  }
  Object.assign(dd.dataset, { ridx: rIdx, sidx: sIdx, pidx: pIdx });
  dd.innerHTML = _buildCatalogGroups()
    .map(
      (g) => `
      <div class="catalog-dd-cat">
        <div class="catalog-dd-header">${escHtml(g.label)}</div>
        ${g.names.map((n) => `<div class="catalog-dropdown-item" data-name="${escAttr(n)}">${escHtml(n)}</div>`).join('')}
      </div>
    `,
    )
    .join('');
  const rect = state._catalogDropdownInput.getBoundingClientRect();
  Object.assign(dd.style, {
    display: 'block',
    top: `${rect.bottom + window.scrollY + 2}px`,
    left: `${rect.left + window.scrollX}px`,
    width: `${Math.max(rect.width, 220)}px`,
  });
  _filterCatalogDropdown(state._catalogDropdownInput.value);
}

export function filterCatalogDropdown(event) {
  _filterCatalogDropdown(event.target.value);
}

export function _filterCatalogDropdown(query) {
  const dd = document.getElementById('catalog-dropdown');
  if (!dd || dd.style.display === 'none') return;
  const q = query.toLowerCase().trim();
  dd.querySelectorAll('.catalog-dd-cat').forEach((cat) => {
    let catHas = false;
    cat.querySelectorAll('.catalog-dropdown-item').forEach((item) => {
      const show = !q || item.dataset.name.toLowerCase().includes(q);
      item.style.display = show ? '' : 'none';
      if (show) catHas = true;
    });
    cat.style.display = catHas ? '' : 'none';
  });
}

export function hideCatalogDropdown() {
  setTimeout(() => {
    const dd = document.getElementById('catalog-dropdown');
    if (dd) dd.style.display = 'none';
  }, 150);
}

export function renderRoutinesView() {
  const container = document.getElementById('routines-view');
  if (!container) return;
  container.innerHTML = '';
  state.routines.forEach((routine) => {
    const steps = routine.steps || [];
    if (steps.length === 0) return;
    const section = document.createElement('div');
    section.className = 'product-section';
    section.id = `routine-view-${routine.id}`;
    const typeLabel = (routine.types || []).map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(', ');
    const rows = steps
      .map((step, i) => {
        const productsList = (step.products || [])
          .map((p) => (p.ml ? `${escHtml(p.name)} (${p.ml} ml)` : escHtml(p.name)))
          .join('<br>');
        return `<tr>
          <td>${i + 1}</td>
          <td>${escHtml(step.name || '')}</td>
          <td>${escHtml(step.action || '')}</td>
          <td class="routine-products-cell">${productsList}</td>
        </tr>`;
      })
      .join('');
    const alertsHtml = (routine.alerts || [])
      .map((a) => {
        const label = a.label ? `<span class="callout-label">${escHtml(a.label)}</span>` : '';
        return `<div class="callout ${a.severity}">${label}${escHtml(a.text)}</div>`;
      })
      .join('');
    section.innerHTML = `
        <div class="product-num">${typeLabel}</div>
        <h2>${escHtml(routine.name)}</h2>
        ${routine.subtext ? `<p class="product-intro">${escHtml(routine.subtext)}</p>` : ''}
        <table class="routine-table">
          <thead><tr><th>#</th><th>Step</th><th>Action</th><th>Products</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${alertsHtml}
      `;
    container.appendChild(section);
  });
}

export function renderRoutineConfigCards() {
  const container = document.getElementById('routine-config-cards');
  if (!container) return;
  container.innerHTML = '';
  state.routines.forEach((routine, rIdx) => {
    const card = document.createElement('div');
    card.className = 'routine-config-card';
    card.draggable = true;
    card.dataset.idx = rIdx;
    card.innerHTML = buildRoutineConfigCardHTML(routine, rIdx);
    card.addEventListener('dragstart', (e) => {
      state.routineDragSrc = rIdx;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      container.querySelectorAll('.routine-config-card').forEach((c) => c.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      if (state.routineDragSrc === null || state.routineDragSrc === rIdx) return;
      const moved = state.routines.splice(state.routineDragSrc, 1)[0];
      state.routines.splice(rIdx, 0, moved);
      renderRoutineConfigCards();
    });
    container.appendChild(card);
  });
}

export function buildRoutineConfigCardHTML(routine, rIdx) {
  const typeKeys = ['exterior', 'interior', 'maintenance'];
  const typeCheckboxes = typeKeys
    .map(
      (t) =>
        `<label class="routine-type-label">
        <input type="checkbox" ${(routine.types || []).includes(t) ? 'checked' : ''}
          onchange="toggleRoutineType(${rIdx},'${t}',this.checked)">
        ${t.charAt(0).toUpperCase() + t.slice(1)}
      </label>`,
    )
    .join('');

  const stepsHtml = routine.steps
    .map((step, sIdx) => {
      const productsHtml = (step.products || [])
        .map((p, pIdx) => {
          const catEntry = CATALOG.find((c) => c.name === p.name);
          const isEquipment = catEntry && EQUIPMENT_SLUGS.has(catEntry.slug);
          return `
        <div class="step-product-row${isEquipment ? ' step-product-row--equipment' : ''}">
          <input value="${escAttr(p.name)}"
            onfocus="openCatalogDropdown(event,${rIdx},${sIdx},${pIdx})"
            onchange="updateStepProduct(${rIdx},${sIdx},${pIdx},'name',this.value)"
            oninput="updateStepProduct(${rIdx},${sIdx},${pIdx},'name',this.value);filterCatalogDropdown(event)"
            onblur="hideCatalogDropdown()"
            placeholder="Product name…" class="step-product-input" autocomplete="off">
          ${
            isEquipment
              ? ''
              : `<input type="number" value="${p.ml ?? ''}" min="0" step="5"
            onchange="updateStepProduct(${rIdx},${sIdx},${pIdx},'ml',this.value)"
            placeholder="ml" class="step-ml-input">`
          }
          <button class="step-remove-btn" onclick="removeStepProduct(${rIdx},${sIdx},${pIdx})" title="Remove product">✕</button>
        </div>
      `;
        })
        .join('');
      const totalSteps = routine.steps.length;
      return `
        <div class="step-editor-block">
          <div class="step-editor-header">
            <span class="step-number-label">Step ${sIdx + 1}</span>
            <div class="step-reorder-btns">
              <button class="step-reorder-btn" onclick="moveRoutineStep(${rIdx},${sIdx},-1)" ${sIdx === 0 ? 'disabled' : ''} title="Move up">↑</button>
              <button class="step-reorder-btn" onclick="moveRoutineStep(${rIdx},${sIdx},1)" ${sIdx === totalSteps - 1 ? 'disabled' : ''} title="Move down">↓</button>
            </div>
            <button class="step-remove-btn" onclick="removeRoutineStep(${rIdx},${sIdx})" title="Remove step">✕</button>
          </div>
          <div class="step-editor-field-group">
            <label class="step-field-label">Step</label>
            <input value="${escAttr(step.name || '')}"
              onchange="updateRoutineStep(${rIdx},${sIdx},'name',this.value)"
              oninput="updateRoutineStep(${rIdx},${sIdx},'name',this.value)"
              placeholder="Short description…" class="step-name-input">
          </div>
          <div class="step-editor-field-group">
            <label class="step-field-label">Action</label>
            <input value="${escAttr(step.action || '')}"
              id="step-action-${rIdx}-${sIdx}"
              onchange="updateRoutineStep(${rIdx},${sIdx},'action',this.value)"
              oninput="updateRoutineStep(${rIdx},${sIdx},'action',this.value)"
              placeholder="What to do (detail)…" class="step-action-input">
          </div>
          <div class="step-products-section">
            <div class="step-products-header">
              <span class="step-field-label">Products</span>
              <button class="add-product-btn" onclick="addStepProduct(${rIdx},${sIdx})">+ Add</button>
            </div>
            ${productsHtml || '<p class="step-no-products">No products yet…</p>'}
          </div>
        </div>
      `;
    })
    .join('');

  const alertsHtml = (routine.alerts || [])
    .map(
      (alert, aIdx) => `
      <div class="alert-editor-row">
        <select class="alert-severity-select" onchange="updateRoutineAlert(${rIdx},${aIdx},'severity',this.value)">
          <option value="tip"    ${alert.severity === 'tip' ? 'selected' : ''}>Tip</option>
          <option value="warn"   ${alert.severity === 'warn' ? 'selected' : ''}>Warning</option>
          <option value="danger" ${alert.severity === 'danger' ? 'selected' : ''}>Danger</option>
        </select>
        <input value="${escAttr(alert.label || '')}"
          onchange="updateRoutineAlert(${rIdx},${aIdx},'label',this.value)"
          placeholder="Label (optional)…" class="alert-label-input">
        <input value="${escAttr(alert.text)}"
          onchange="updateRoutineAlert(${rIdx},${aIdx},'text',this.value)"
          placeholder="Alert text…" class="alert-text-input">
        <button class="step-remove-btn" onclick="removeRoutineAlert(${rIdx},${aIdx})" title="Remove">✕</button>
      </div>
    `,
    )
    .join('');

  return `
      <div class="routine-config-card-title"><span class="drag-handle routine-card-handle">⠿</span>${escHtml(routine.name || 'Untitled routine')}</div>
      <div class="routine-config-field">
        <span class="routine-config-label">Name</span>
        <input value="${escAttr(routine.name)}" oninput="updateRoutineMeta(${rIdx},'name',this.value)" style="width:100%;" class="log-input">
      </div>
      <div class="routine-config-field">
        <span class="routine-config-label">Subtext</span>
        <input value="${escAttr(routine.subtext || '')}" oninput="updateRoutineMeta(${rIdx},'subtext',this.value)" style="width:100%;" class="log-input">
      </div>
      <div class="routine-config-field">
        <span class="routine-config-label">Type</span>
        <div class="routine-type-checkboxes">${typeCheckboxes}</div>
      </div>
      <div class="routine-config-label" style="margin-bottom:8px;">Steps</div>
      ${stepsHtml}
      <button class="add-step-btn" onclick="addRoutineStep(${rIdx})" style="margin:8px 0 20px;">+ Add step</button>
      <div class="routine-config-label" style="margin-bottom:8px;">Alerts</div>
      ${alertsHtml}
      <button class="add-step-btn" onclick="addRoutineAlert(${rIdx})" style="margin:8px 0 16px;">+ Add alert</button>
      <div class="settings-save-bar" style="padding-top:12px;">
        <button class="settings-save-btn" onclick="saveRoutines()">Save</button>
        <button class="settings-reset-btn" style="color:var(--danger);" onclick="showRoutineDeleteConfirm(${rIdx})">Delete routine</button>
      </div>
      <div class="log-confirm-row" id="routine-confirm-${rIdx}" hidden>
        <span>Delete this routine?</span>
        <button class="log-confirm-cancel" onclick="cancelRoutineDelete(${rIdx})">Cancel</button>
        <button class="log-confirm-delete" onclick="deleteRoutine(${rIdx})">Delete</button>
      </div>
    `;
}

export function updateRoutineMeta(rIdx, field, val) {
  state.routines[rIdx][field] = val;
  const card = document.querySelectorAll('.routine-config-card')[rIdx];
  if (card) {
    const title = card.querySelector('.routine-config-card-title');
    if (title && field === 'name') title.textContent = val || 'Untitled routine';
  }
}

export function toggleRoutineType(rIdx, type, checked) {
  const types = state.routines[rIdx].types || [];
  if (checked && !types.includes(type)) types.push(type);
  if (!checked) state.routines[rIdx].types = types.filter((t) => t !== type);
  else state.routines[rIdx].types = types;
}

export function updateRoutineStep(rIdx, sIdx, field, val) {
  state.routines[rIdx].steps[sIdx][field] = val;
}

export function addRoutineStep(rIdx) {
  state.routines[rIdx].steps.push({ name: '', action: '', products: [] });
  renderRoutineConfigCards();
}

export function removeRoutineStep(rIdx, sIdx) {
  state.routines[rIdx].steps.splice(sIdx, 1);
  renderRoutineConfigCards();
}

export function moveRoutineStep(rIdx, sIdx, dir) {
  const steps = state.routines[rIdx].steps;
  const newIdx = sIdx + dir;
  if (newIdx < 0 || newIdx >= steps.length) return;
  [steps[sIdx], steps[newIdx]] = [steps[newIdx], steps[sIdx]];
  renderRoutineConfigCards();
}

export function addStepProduct(rIdx, sIdx) {
  state.routines[rIdx].steps[sIdx].products.push({ name: '', ml: null });
  renderRoutineConfigCards();
}

export function removeStepProduct(rIdx, sIdx, pIdx) {
  state.routines[rIdx].steps[sIdx].products.splice(pIdx, 1);
  renderRoutineConfigCards();
}

export function updateStepProduct(rIdx, sIdx, pIdx, field, val) {
  state.routines[rIdx].steps[sIdx].products[pIdx][field] = field === 'ml' ? (val === '' ? null : Number(val)) : val;
  if (field === 'name') {
    const matchSlug = CATALOG.find((c) => c.name === val)?.slug ?? CANONICAL_SLUG_MAP[val];
    if (matchSlug && PRODUCT_ACTIONS[matchSlug]) {
      const actionEl = document.getElementById(`step-action-${rIdx}-${sIdx}`);
      if (actionEl && !actionEl.value.trim()) {
        actionEl.value = PRODUCT_ACTIONS[matchSlug];
        state.routines[rIdx].steps[sIdx].action = PRODUCT_ACTIONS[matchSlug];
      }
    }
  }
}

export function updateRoutineAlert(rIdx, aIdx, field, val) {
  state.routines[rIdx].alerts[aIdx][field] = val;
}

export function addRoutineAlert(rIdx) {
  state.routines[rIdx].alerts = state.routines[rIdx].alerts || [];
  state.routines[rIdx].alerts.push({ severity: 'tip', label: '', text: '' });
  renderRoutineConfigCards();
}

export function removeRoutineAlert(rIdx, aIdx) {
  state.routines[rIdx].alerts.splice(aIdx, 1);
  renderRoutineConfigCards();
}

export function addRoutine() {
  state.routines.push({
    id: 'routine-' + Date.now(),
    name: 'New Routine',
    subtext: '',
    types: [],
    steps: [],
    alerts: [],
  });
  renderRoutineConfigCards();
}

export function showRoutineDeleteConfirm(rIdx) {
  document.getElementById(`routine-confirm-${rIdx}`)?.removeAttribute('hidden');
}

export function cancelRoutineDelete(rIdx) {
  document.getElementById(`routine-confirm-${rIdx}`)?.setAttribute('hidden', '');
}

export function deleteRoutine(rIdx) {
  state.routines.splice(rIdx, 1);
  renderRoutineConfigCards();
  renderRoutinesView();
  renderLogTypeSelect();
  renderSchedulesUI();
}
