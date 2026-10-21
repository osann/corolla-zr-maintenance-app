// Maintenance tab.
import { MAINTENANCE_KEY, MAINTENANCE_LOG_KEY, SETTINGS_KEY } from './config.js';
import { DEFAULT_MAINTENANCE_ITEMS, MAINTENANCE_CSV_TEMPLATE } from './data.js';
import { state } from './state.js';
import { storageGet, storageSet, syncPush } from './storage.js';
import { csvField, escAttr, escHtml, formatDate, parseCSVRow, showSaved, triggerDownload } from './util.js';

export function maintenanceIntervalDays(item) {
  const u = { days: 1, weeks: 7, months: 30.44, years: 365.25 };
  return Math.round((item.intervalValue || 1) * (u[item.intervalUnit] || 1));
}

export function maintenanceIntervalLabel(item) {
  if (item.intervalType === 'odometer') return `Every ${(item.intervalKm || 0).toLocaleString()} km`;
  const val = item.intervalValue || 1;
  const unit = item.intervalUnit || 'months';
  return `Every ${val} ${val === 1 ? unit.replace(/s$/, '') : unit}`;
}

export function maintenanceNextDue(item) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (item.intervalType === 'time') {
    if (!item.lastCompletedDate) return { dueDate: null, dueKm: null, status: 'never-done' };
    const days = maintenanceIntervalDays(item);
    const [y, m, d] = item.lastCompletedDate.split('-').map(Number);
    const due = new Date(y, m - 1, d + days);
    const diffDays = Math.round((due - today) / 86400000);
    const status = diffDays < 0 ? 'overdue' : diffDays <= 14 ? 'due-soon' : 'ok';
    return { dueDate: due, dueKm: null, status };
  }
  if (item.lastCompletedOdometer == null) return { dueDate: null, dueKm: null, status: 'never-done' };
  const dueKm = item.lastCompletedOdometer + (item.intervalKm || 0);
  const currentOdo = state.settings.car?.currentOdometer ?? null;
  if (currentOdo == null) return { dueDate: null, dueKm, status: 'ok' };
  const remaining = dueKm - currentOdo;
  const status = remaining <= 0 ? 'overdue' : remaining <= 2000 ? 'due-soon' : 'ok';
  return { dueDate: null, dueKm, status };
}

export function maintenanceDueLabel(item) {
  const { dueDate, dueKm, status } = maintenanceNextDue(item);
  if (status === 'never-done') return 'Not yet recorded';
  if (item.intervalType === 'odometer') {
    const currentOdo = state.settings.car?.currentOdometer ?? null;
    if (currentOdo != null) {
      const remaining = dueKm - currentOdo;
      if (remaining <= 0) return `Overdue — was due at ${dueKm.toLocaleString()} km`;
      return `Due at ${dueKm.toLocaleString()} km (${remaining.toLocaleString()} km away)`;
    }
    return `Due at ${dueKm.toLocaleString()} km`;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dueDate - today) / 86400000);
  if (diffDays < 0) {
    const n = Math.abs(diffDays);
    return `Overdue — was due ${n} day${n !== 1 ? 's' : ''} ago`;
  }
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  const dueFmt = dueDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  return `Due in ${diffDays} days (${dueFmt})`;
}

export function maintenanceItemIsUrgent(item) {
  if (!item.enabled) return false;
  const { status } = maintenanceNextDue(item);
  return status === 'overdue' || status === 'due-soon' || status === 'never-done';
}

export async function loadMaintenance() {
  const saved = await storageGet(MAINTENANCE_KEY);
  if (saved && Array.isArray(saved) && saved.length) state.maintenanceItems = saved;
  else state.maintenanceItems = JSON.parse(JSON.stringify(DEFAULT_MAINTENANCE_ITEMS));
  const savedLog = await storageGet(MAINTENANCE_LOG_KEY);
  if (savedLog && Array.isArray(savedLog)) state.maintenanceLog = savedLog;
  renderMaintenanceUpcoming();
  renderMaintenanceSchedule();
  renderMaintenanceHistory();
  renderMaintenanceConfigCards();
}

export async function saveMaintenance() {
  await storageSet(MAINTENANCE_KEY, state.maintenanceItems);
  syncPush(MAINTENANCE_KEY, state.maintenanceItems);
  renderMaintenanceUpcoming();
  renderMaintenanceSchedule();
  renderMaintenanceHistory();
  renderMaintenanceConfigCards();
  showSaved('maintenance-saved');
}

export async function saveMaintenanceLog() {
  await storageSet(MAINTENANCE_LOG_KEY, state.maintenanceLog);
  syncPush(MAINTENANCE_LOG_KEY, state.maintenanceLog);
  renderMaintenanceHistory();
}

export function renderMaintenanceUpcoming() {
  const el = document.getElementById('maintenance-upcoming-cards');
  if (!el) return;
  const urgentOrder = { overdue: 0, 'never-done': 1, 'due-soon': 2 };
  const urgent = state.maintenanceItems
    .filter((item) => item.enabled && maintenanceItemIsUrgent(item))
    .map((item) => ({ item, ...maintenanceNextDue(item) }))
    .sort((a, b) => (urgentOrder[a.status] ?? 3) - (urgentOrder[b.status] ?? 3));
  if (!urgent.length) {
    el.innerHTML = '<div class="maintenance-empty">Everything is on schedule.</div>';
    return;
  }
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentOdo = state.settings.car?.currentOdometer ?? '';
  el.innerHTML = urgent
    .map(({ item, status }) => {
      const cardClass = status === 'overdue' ? 'wash-reminder-card wash-reminder-card--overdue' : 'wash-reminder-card';
      const lastLabel = item.lastCompletedDate
        ? formatDate(item.lastCompletedDate)
        : item.lastCompletedOdometer != null
          ? `${item.lastCompletedOdometer.toLocaleString()} km`
          : 'Never';
      return `
        <div class="${cardClass}">
          <div class="reminder-row">
            <div class="reminder-body">
              <div class="reminder-name">${escHtml(item.name)}</div>
              <div class="reminder-status">${escHtml(maintenanceDueLabel(item))} · ${escHtml(maintenanceIntervalLabel(item))} · Last: ${escHtml(lastLabel)}</div>
              ${item.notes ? `<div class="reminder-status" style="margin-top:4px;">${escHtml(item.notes)}</div>` : ''}
            </div>
            <div class="reminder-actions">
              <button class="reminder-btn reminder-btn--accent" onclick="showMaintenanceCompleteForm('${escAttr(item.id)}')">Mark Complete</button>
            </div>
          </div>
          <div class="maintenance-complete-form" id="maint-form-${escAttr(item.id)}" hidden>
            <div class="log-field">
              <label class="log-label" for="maint-date-${escAttr(item.id)}">Date</label>
              <input class="log-input" type="date" id="maint-date-${escAttr(item.id)}" value="${todayStr}">
            </div>
            <div class="log-field">
              <label class="log-label" for="maint-odo-${escAttr(item.id)}">Odometer (km)</label>
              <input class="log-input" type="number" id="maint-odo-${escAttr(item.id)}" min="0" placeholder="e.g. 12450" value="${escAttr(String(currentOdo))}">
            </div>
            <div class="log-field full">
              <label class="log-label" for="maint-desc-${escAttr(item.id)}">Notes <span style="font-weight:400;color:var(--ink-mid)">(optional)</span></label>
              <input class="log-input" type="text" id="maint-desc-${escAttr(item.id)}" placeholder="e.g. used 0W-20, rotated front-to-back">
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              <button class="settings-save-btn" onclick="saveMaintenanceComplete('${escAttr(item.id)}')">Save</button>
              <button class="settings-reset-btn" onclick="hideMaintenanceCompleteForm('${escAttr(item.id)}')">Cancel</button>
            </div>
          </div>
        </div>`;
    })
    .join('');
}

export function renderMaintenanceSchedule() {
  const el = document.getElementById('maintenance-schedule-list');
  if (!el) return;
  const enabled = state.maintenanceItems.filter((item) => item.enabled);
  if (!enabled.length) {
    el.innerHTML = '<p class="maintenance-schedule-empty">No items configured. Add some in the Configuration tab.</p>';
    return;
  }
  const withDue = enabled.map((item) => ({ item, due: maintenanceNextDue(item) }));
  withDue.sort((a, b) => {
    const ord = { overdue: 0, 'never-done': 1, 'due-soon': 2, ok: 3 };
    return (ord[a.due.status] ?? 4) - (ord[b.due.status] ?? 4);
  });
  el.innerHTML = `
      <table class="routine-table" style="width:100%;table-layout:fixed;">
        <colgroup><col style="width:35%"><col style="width:22%"><col style="width:20%"><col style="width:23%"></colgroup>
        <thead><tr>
          <th style="text-align:left;">Item</th>
          <th style="text-align:left;">Interval</th>
          <th style="text-align:left;">Last done</th>
          <th style="text-align:left;">Next due</th>
        </tr></thead>
        <tbody>
          ${withDue
            .map(({ item, due }) => {
              const lastLabel = item.lastCompletedDate
                ? item.lastCompletedDate
                : item.lastCompletedOdometer != null
                  ? `${item.lastCompletedOdometer.toLocaleString()} km`
                  : '—';
              const nextLabel = maintenanceDueLabel(item);
              const rowStyle = due.status === 'overdue' ? 'style="color:var(--accent);font-weight:600"' : '';
              return `<tr ${rowStyle}>
              <td>${escHtml(item.name)}</td>
              <td>${escHtml(maintenanceIntervalLabel(item))}</td>
              <td>${escHtml(lastLabel)}</td>
              <td>${escHtml(nextLabel)}</td>
            </tr>`;
            })
            .join('')}
        </tbody>
      </table>`;
}

export function renderMaintenanceHistory() {
  const el = document.getElementById('maintenance-history-list');
  if (!el) return;
  if (!state.maintenanceLog.length) {
    el.innerHTML =
      '<div class="maintenance-empty">No completed items yet. Mark items complete in the Upcoming tab.</div>';
    return;
  }
  el.innerHTML = state.maintenanceLog
    .map((entry) => {
      const odoText = entry.odometer ? `${Number(entry.odometer).toLocaleString()} km` : '';
      return `
        <div class="log-entry">
          <button class="log-menu-btn" onclick="showMaintenanceLogDeleteConfirm(${entry.id})" title="Delete">···</button>
          <div class="log-entry-head">
            <div class="log-entry-date">${formatDate(entry.date)}</div>
            <div class="log-entry-type quick">${escHtml(entry.itemName)}</div>
          </div>
          ${odoText ? `<div style="font-size:13px;color:var(--ink-mid);margin-top:4px;">${odoText}</div>` : ''}
          ${entry.description ? `<div class="log-entry-notes">${escHtml(entry.description)}</div>` : ''}
          <div class="log-confirm-row" id="maint-hist-confirm-${entry.id}" hidden>
            <span>Delete this entry?</span>
            <button class="log-confirm-cancel" onclick="cancelMaintenanceLogDelete(${entry.id})">Cancel</button>
            <button class="log-confirm-delete" onclick="deleteMaintenanceLogEntry(${entry.id})">Delete</button>
          </div>
        </div>`;
    })
    .join('');
}

export function renderMaintenanceConfigCards() {
  const el = document.getElementById('maintenance-config-cards');
  if (!el) return;
  el.innerHTML = state.maintenanceItems
    .map(
      (item, idx) => `
      <div class="routine-config-card" draggable="true" id="maint-card-${idx}">
        <div class="routine-config-card-title">⠿ ${escHtml(item.name || 'Untitled item')}</div>
        <div class="log-form-grid" style="margin-bottom:12px;">
          <div class="log-field full">
            <label class="log-label">Name</label>
            <input class="log-input" type="text" value="${escAttr(item.name)}"
              oninput="updateMaintenanceItem(${idx},'name',this.value)">
          </div>
          <div class="log-field full">
            <label class="log-label">Notes <span style="font-weight:400;color:var(--ink-mid)">(optional)</span></label>
            <input class="log-input" type="text" value="${escAttr(item.notes || '')}"
              oninput="updateMaintenanceItem(${idx},'notes',this.value)">
          </div>
        </div>
        <div style="margin-bottom:12px;">
          <label class="log-label">Schedule type</label>
          <div style="display:flex;gap:16px;margin-top:6px;">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px;">
              <input type="radio" name="maint-type-${idx}" value="time"
                ${item.intervalType === 'time' ? 'checked' : ''}
                onchange="updateMaintenanceItem(${idx},'intervalType','time')"> Time-based
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px;">
              <input type="radio" name="maint-type-${idx}" value="odometer"
                ${item.intervalType === 'odometer' ? 'checked' : ''}
                onchange="updateMaintenanceItem(${idx},'intervalType','odometer')"> Odometer
            </label>
          </div>
        </div>
        <div id="maint-time-fields-${idx}" ${item.intervalType === 'odometer' ? 'hidden' : ''}>
          <div class="log-form-grid" style="margin-bottom:12px;">
            <div class="log-field">
              <label class="log-label">Every</label>
              <input class="log-input" type="number" min="1" max="365" value="${escAttr(String(item.intervalValue || 1))}"
                oninput="updateMaintenanceItem(${idx},'intervalValue',+this.value||1)">
            </div>
            <div class="log-field">
              <label class="log-label">Unit</label>
              <select class="log-select" onchange="updateMaintenanceItem(${idx},'intervalUnit',this.value)">
                ${['days', 'weeks', 'months', 'years']
                  .map((u) => `<option value="${u}"${item.intervalUnit === u ? ' selected' : ''}>${u}</option>`)
                  .join('')}
              </select>
            </div>
          </div>
        </div>
        <div id="maint-odo-fields-${idx}" ${item.intervalType === 'time' ? 'hidden' : ''} style="margin-bottom:12px;">
          <div class="log-field">
            <label class="log-label">Every (km)</label>
            <input class="log-input" type="number" min="100" step="100" value="${escAttr(String(item.intervalKm || ''))}"
              placeholder="e.g. 10000" oninput="updateMaintenanceItem(${idx},'intervalKm',+this.value||null)">
          </div>
        </div>
        <div style="margin-bottom:16px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;">
            <input type="checkbox" ${item.enabled ? 'checked' : ''}
              onchange="updateMaintenanceItem(${idx},'enabled',this.checked)"> Enabled
          </label>
        </div>
        <div class="settings-save-bar">
          <button class="settings-save-btn" onclick="saveMaintenance()">Save</button>
          <button class="settings-reset-btn routine-delete-btn" onclick="showMaintenanceDeleteConfirm(${idx})">Delete</button>
        </div>
        <div id="maintenance-confirm-${idx}" hidden class="maintenance-confirm-row">
          <span style="color:var(--ink-mid);font-size:13px;">Delete this item?</span>
          <button class="settings-save-btn" onclick="deleteMaintenanceItem(${idx})">Delete</button>
          <button class="settings-reset-btn" onclick="cancelMaintenanceDelete(${idx})">Cancel</button>
        </div>
      </div>`,
    )
    .join('');

  el.querySelectorAll('.routine-config-card').forEach((card, idx) => {
    card.addEventListener('dragstart', (e) => {
      state.maintenanceDragSrc = idx;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      if (state.maintenanceDragSrc === null || state.maintenanceDragSrc === idx) return;
      const [moved] = state.maintenanceItems.splice(state.maintenanceDragSrc, 1);
      state.maintenanceItems.splice(idx, 0, moved);
      state.maintenanceDragSrc = null;
      renderMaintenanceConfigCards();
    });
  });
}

export function showMaintenanceCompleteForm(itemId) {
  document.getElementById(`maint-form-${itemId}`)?.removeAttribute('hidden');
}

export function hideMaintenanceCompleteForm(itemId) {
  document.getElementById(`maint-form-${itemId}`)?.setAttribute('hidden', '');
}

export function showMaintenanceLogDeleteConfirm(entryId) {
  document.getElementById(`maint-hist-confirm-${entryId}`)?.removeAttribute('hidden');
}

export function cancelMaintenanceLogDelete(entryId) {
  document.getElementById(`maint-hist-confirm-${entryId}`)?.setAttribute('hidden', '');
}

export async function deleteMaintenanceLogEntry(entryId) {
  const deleted = state.maintenanceLog.find((e) => e.id === entryId);
  state.maintenanceLog = state.maintenanceLog.filter((e) => e.id !== entryId);

  if (deleted) {
    const item = state.maintenanceItems.find((i) => i.id === deleted.itemId);
    if (item) {
      const remaining = state.maintenanceLog.filter((e) => e.itemId === deleted.itemId);
      item.lastCompletedDate = remaining[0]?.date ?? null;
      item.lastCompletedOdometer = remaining[0]?.odometer ?? null;
    }
  }

  await saveMaintenanceLog();
  await saveMaintenance();
}

export async function saveMaintenanceComplete(itemId) {
  const item = state.maintenanceItems.find((i) => i.id === itemId);
  if (!item) return;
  const dateVal = document.getElementById(`maint-date-${itemId}`)?.value || '';
  const odoVal = +document.getElementById(`maint-odo-${itemId}`)?.value || null;
  const descVal = document.getElementById(`maint-desc-${itemId}`)?.value.trim() || '';
  if (!dateVal) {
    alert('Please select a date.');
    return;
  }
  item.lastCompletedDate = dateVal;
  if (odoVal) item.lastCompletedOdometer = odoVal;
  if (odoVal && odoVal > (state.settings.car?.currentOdometer ?? 0)) {
    state.settings.car.currentOdometer = odoVal;
    const carOdoEl = document.getElementById('car-odometer');
    if (carOdoEl) carOdoEl.value = odoVal;
    storageSet(SETTINGS_KEY, state.settings);
    syncPush(SETTINGS_KEY, state.settings);
  }
  state.maintenanceLog.unshift({
    id: Date.now(),
    itemId: item.id,
    itemName: item.name,
    date: dateVal,
    odometer: odoVal,
    description: descVal || null,
  });
  saveMaintenanceLog();
  await saveMaintenance();
}

export function updateMaintenanceItem(idx, field, val) {
  if (!state.maintenanceItems[idx]) return;
  state.maintenanceItems[idx][field] = val;
  if (field === 'intervalType') {
    const isOdo = val === 'odometer';
    document.getElementById(`maint-time-fields-${idx}`)?.toggleAttribute('hidden', isOdo);
    document.getElementById(`maint-odo-fields-${idx}`)?.toggleAttribute('hidden', !isOdo);
  }
}

export function addMaintenanceItem() {
  state.maintenanceItems.push({
    id: `maint-custom-${Date.now()}`,
    name: '',
    notes: '',
    intervalType: 'time',
    intervalValue: 1,
    intervalUnit: 'months',
    intervalKm: null,
    lastCompletedDate: null,
    lastCompletedOdometer: null,
    enabled: true,
  });
  renderMaintenanceConfigCards();
  document
    .getElementById('maintenance-config-cards')
    ?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function showMaintenanceDeleteConfirm(idx) {
  document.getElementById(`maintenance-confirm-${idx}`)?.removeAttribute('hidden');
}

export function cancelMaintenanceDelete(idx) {
  document.getElementById(`maintenance-confirm-${idx}`)?.setAttribute('hidden', '');
}

export async function deleteMaintenanceItem(idx) {
  state.maintenanceItems.splice(idx, 1);
  await saveMaintenance();
}

export function exportMaintenanceCSV() {
  const header = 'row_type,item_id,name,notes,interval_type,interval_value,interval_unit,interval_km';
  const rows = [header];
  state.maintenanceItems.forEach((item) => {
    rows.push(
      [
        csvField('ITEM'),
        csvField(item.id),
        csvField(item.name),
        csvField(item.notes || ''),
        csvField(item.intervalType),
        csvField(item.intervalType === 'time' ? item.intervalValue : ''),
        csvField(item.intervalType === 'time' ? item.intervalUnit : ''),
        csvField(item.intervalType === 'odometer' ? item.intervalKm : ''),
      ].join(','),
    );
  });
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  triggerDownload('﻿' + rows.join('\r\n'), `maintenance-${date}.csv`, 'text/csv;charset=utf-8;');
}

export function parseMaintenanceCSV(text) {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const items = [];
  for (const line of lines) {
    const cols = parseCSVRow(line);
    if (!cols || cols[0]?.toUpperCase() !== 'ITEM') continue;
    const [, itemId, name, notes, intervalType, intervalValue, intervalUnit, intervalKm] = cols;
    if (!name) continue;
    items.push({
      id: itemId || `maint-import-${Date.now()}`,
      name: name.trim(),
      notes: (notes || '').trim(),
      intervalType: intervalType === 'odometer' ? 'odometer' : 'time',
      intervalValue: intervalValue ? +intervalValue : 1,
      intervalUnit: intervalUnit || 'months',
      intervalKm: intervalKm ? +intervalKm : null,
      lastCompletedDate: null,
      lastCompletedOdometer: null,
      enabled: true,
    });
  }
  return items;
}

export function importMaintenanceCSV() {
  const input = document.getElementById('maintenance-csv-input');
  input.value = '';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseMaintenanceCSV(text);
    if (!parsed.length) {
      alert('No valid ITEM rows found in the file.');
      return;
    }
    if (
      !confirm(
        `Import ${parsed.length} item${parsed.length !== 1 ? 's' : ''}? They will be appended to your existing items.`,
      )
    )
      return;
    const ts = Date.now();
    parsed.forEach((item, i) => {
      item.id = `maint-import-${item.id}-${ts + i}`;
    });
    state.maintenanceItems.push(...parsed);
    await saveMaintenance();
  };
  input.click();
}

export function downloadMaintenanceTemplate() {
  triggerDownload(MAINTENANCE_CSV_TEMPLATE, 'maintenance-template.txt', 'text/plain;charset=utf-8;');
}

export async function resetMaintenance() {
  if (!confirm('Reset maintenance schedule to defaults? Your items and history will be lost.')) return;
  state.maintenanceItems = JSON.parse(JSON.stringify(DEFAULT_MAINTENANCE_ITEMS));
  state.maintenanceLog = [];
  await storageSet(MAINTENANCE_KEY, state.maintenanceItems);
  await storageSet(MAINTENANCE_LOG_KEY, state.maintenanceLog);
  syncPush(MAINTENANCE_KEY, state.maintenanceItems);
  syncPush(MAINTENANCE_LOG_KEY, state.maintenanceLog);
  renderMaintenanceUpcoming();
  renderMaintenanceSchedule();
  renderMaintenanceHistory();
  renderMaintenanceConfigCards();
}
