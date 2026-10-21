// Wash log tab.
import { LOG_KEY, SETTINGS_KEY } from './config.js';
import { CATALOG, EQUIPMENT_SLUGS, FREQ_DAYS, FREQ_DEFAULTS, FREQ_OPTIONS } from './data.js';
import { decrementInventoryForSession, showInvToast } from './inventory.js';
import { renderMaintenanceUpcoming } from './maintenance.js';
import { deletePhoto, loadPhotoData, openLightbox, renderPhotoPreviews } from './photos.js';
import { calcScheduleStreak, renderWashReminderCards } from './schedules.js';
import { state } from './state.js';
import { storageGet, storageSet, syncPush } from './storage.js';
import { escAttr, escHtml, formatDate } from './util.js';
import { evalWeatherTriggers, renderWeatherCards } from './weather.js';

// Populate routine dropdown from routines[] and re-render step chips on change
export function renderLogTypeSelect() {
  const sel = document.getElementById('log-type');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = state.routines.map((r) => `<option value="${escAttr(r.id)}">${escHtml(r.name)}</option>`).join('');
  if (current && state.routines.find((r) => r.id === current)) sel.value = current;
  renderStepChipsForRoutine(sel.value);
}

export function renderStepChipsForRoutine(routineId) {
  const container = document.getElementById('steps-checklist');
  if (!container) return;
  const routine = state.routines.find((r) => r.id === routineId);
  const steps = (routine?.steps ?? []).filter((s) => s.enabled !== false);
  container.innerHTML = steps
    .map(
      (s) => `<label class="step-chip"><input type="checkbox" value="${escAttr(s.name)}"> ${escHtml(s.name)}</label>`,
    )
    .join('');
  container.querySelectorAll('.step-chip').forEach((chip) => {
    chip.addEventListener('click', () => chip.classList.toggle('checked', chip.querySelector('input').checked));
    chip.querySelector('input').addEventListener('change', function () {
      chip.classList.toggle('checked', this.checked);
    });
  });
}

export async function loadLog() {
  const saved = await storageGet(LOG_KEY);
  state.washLog = Array.isArray(saved) ? saved : [];
  renderLog();
  if (state.syncEnabled && state.washLog.length) {
    await loadPhotoData(state.washLog.map((e) => e.id));
    renderLog();
  }
}

export async function saveLog() {
  await storageSet(LOG_KEY, state.washLog);
  syncPush(LOG_KEY, state.washLog);
}

export function addLogEntry() {
  const date = document.getElementById('log-date').value;
  const type = document.getElementById('log-type').value;
  const notes = document.getElementById('log-notes').value.trim();
  const steps = Array.from(document.querySelectorAll('.step-chip input:checked')).map((cb) => cb.value);
  const odometerVal = +document.getElementById('log-odometer')?.value || null;

  if (!date) {
    alert('Please select a date.');
    return;
  }

  if (odometerVal && odometerVal > (state.settings.car?.currentOdometer ?? 0)) {
    state.settings.car.currentOdometer = odometerVal;
    const carOdoEl = document.getElementById('car-odometer');
    if (carOdoEl) carOdoEl.value = odometerVal;
    storageSet(SETTINGS_KEY, state.settings);
    syncPush(SETTINGS_KEY, state.settings);
    renderMaintenanceUpcoming();
  }

  if (state.editingEntryId !== null) {
    const savedEntryId = state.editingEntryId;
    const idx = state.washLog.findIndex((e) => e.id === savedEntryId);
    if (idx >= 0) state.washLog[idx] = { ...state.washLog[idx], date, type, steps, notes };
    state.photosByEntryId[savedEntryId] = [...state.pendingPhotos];
    state.pendingEntryId = null;
    state.pendingPhotos = [];
    state.editingEntryId = null;
    resetLogForm();
    renderPhotoPreviews();
    saveLog();
    renderLog();
    document.querySelector('.log-sub-tab[data-log-tab="history"]')?.click();
    // Inventory: steps may have changed — remind user to check stock levels manually
    const hasInventoryItems = steps.some((stepName) => {
      const routine = state.routines.find((r) => r.id === type);
      const step = routine?.steps?.find((s) => s.name === stepName);
      return step?.products?.some(({ name }) => {
        const slug = CATALOG.find((p) => p.name === name)?.slug;
        return slug && !EQUIPMENT_SLUGS.has(slug) && state.checklistState.checked[slug];
      });
    });
    if (hasInventoryItems) showInvToast('Session edited — check Inventory if stock levels need adjusting');
    // Re-fetch from server: catches photos whose upload finished after the save click
    loadPhotoData([savedEntryId]).then(() => renderLog());
    return;
  }

  const entry = { id: state.pendingEntryId ?? Date.now(), date, type, steps, notes };
  state.pendingEntryId = null;
  state.pendingPhotos = [];
  renderPhotoPreviews();

  decrementInventoryForSession(entry);
  state.washLog.unshift(entry);
  saveLog();
  renderLog();
  resetLogForm();
  document.querySelector('.log-sub-tab[data-log-tab="history"]')?.click();
}

export function resetLogForm() {
  document.getElementById('log-notes').value = '';
  const sel = document.getElementById('log-type');
  if (sel && sel.options.length) sel.selectedIndex = 0;
  renderStepChipsForRoutine(sel?.value ?? '');
  const submitBtn = document.getElementById('log-submit-btn');
  const cancelBtn = document.getElementById('log-cancel-btn');
  const dupeWarn = document.getElementById('log-dupe-warn');
  if (submitBtn) submitBtn.textContent = 'Save session';
  if (cancelBtn) cancelBtn.hidden = true;
  if (dupeWarn) dupeWarn.hidden = true;
  const editTab = document.getElementById('log-edit-tab');
  if (editTab) editTab.style.display = 'none';
  // Reset date to today
  const d = new Date();
  document.getElementById('log-date').value =
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const logOdoEl = document.getElementById('log-odometer');
  if (logOdoEl) logOdoEl.value = state.settings.car?.currentOdometer || '';
}

export function startEditEntry(id) {
  const entry = state.washLog.find((e) => e.id === id);
  if (!entry) return;
  state.editingEntryId = id;
  state.pendingEntryId = id;
  state.pendingPhotos = (state.photosByEntryId[id] ?? []).map((p) => ({ ...p }));

  document.getElementById('log-date').value = entry.date;
  document.getElementById('log-notes').value = entry.notes || '';
  const sel = document.getElementById('log-type');
  if (sel) sel.value = entry.type;
  renderStepChipsForRoutine(entry.type);
  document.querySelectorAll('.step-chip input').forEach((cb) => {
    const checked = (entry.steps ?? []).includes(cb.value);
    cb.checked = checked;
    cb.closest('.step-chip')?.classList.toggle('checked', checked);
  });

  const submitBtn = document.getElementById('log-submit-btn');
  const cancelBtn = document.getElementById('log-cancel-btn');
  const dupeWarn = document.getElementById('log-dupe-warn');
  if (submitBtn) submitBtn.textContent = 'Save changes';
  if (cancelBtn) cancelBtn.hidden = false;
  if (dupeWarn) dupeWarn.hidden = true;

  const editTab = document.getElementById('log-edit-tab');
  if (editTab) {
    editTab.style.display = '';
    editTab.click();
  }
  renderPhotoPreviews();
  renderLog();
}

export function cancelEditEntry() {
  state.editingEntryId = null;
  state.pendingEntryId = null;
  state.pendingPhotos = [];
  renderPhotoPreviews();
  resetLogForm();
  renderLog();
  document.querySelector('.log-sub-tab[data-log-tab="history"]')?.click();
}

export function deleteLogEntry(id) {
  state.washLog = state.washLog.filter((e) => e.id !== id);
  delete state.photosByEntryId[id];
  saveLog();
  renderLog();
}

export function typeLabel(type) {
  const routine = state.routines.find((r) => r.id === type);
  if (routine) return routine.name;
  const map = { full: 'Full wash', quick: 'Quick wash', interior: 'Interior only', both: 'Full wash + interior' };
  return map[type] || type;
}

export function calcStreak() {
  if (!state.washLog.length) return { streak: 0, lastWash: null, unit: 'weeks' };
  const sorted = [...state.washLog].sort((a, b) => b.date.localeCompare(a.date));
  const lastWash = sorted[0].date;
  const schedules = state.settings.schedules ?? [];
  if (schedules.length > 0) {
    // Use first schedule's streak for the global bar
    return { streak: calcScheduleStreak(schedules[0], state.weatherCache), lastWash, unit: 'sessions' };
  }
  // Legacy: weekly streak — count consecutive Mon-Sun weeks with at least one wash
  const uniqueDates = [...new Set(sorted.map((e) => e.date))].sort((a, b) => b.localeCompare(a));
  let streak = 0;
  const today = new Date();
  for (let week = 0; week < 52; week++) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1) - week * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const fmt = (d) => d.toISOString().split('T')[0];
    const hasWash = uniqueDates.some((d) => d >= fmt(weekStart) && d <= fmt(weekEnd));
    if (hasWash) streak++;
    else if (week > 0) break;
  }
  return { streak, lastWash, unit: 'weeks' };
}

export function calcNextDue(freqKey) {
  const label = FREQ_OPTIONS[freqKey]?.[state.settings.freq[freqKey] ?? FREQ_DEFAULTS[freqKey]];
  const intervalDays = FREQ_DAYS[label];
  if (!intervalDays) return null;

  let lastDate = null;
  if (freqKey === 'fullWash') {
    const sorted = [...state.washLog].sort((a, b) => b.date.localeCompare(a.date));
    if (sorted.length) lastDate = sorted[0].date;
  } else {
    const keyword = { beadMachine: 'Bead Machine' }[freqKey];
    if (!keyword) return null;
    const relevant = state.washLog
      .filter((e) => Array.isArray(e.steps) && e.steps.some((s) => s.toLowerCase().includes(keyword.toLowerCase())))
      .sort((a, b) => b.date.localeCompare(a.date));
    if (!relevant.length) return null;
    lastDate = relevant[0].date;
  }

  if (!lastDate) return null;
  const [y, m, d] = lastDate.split('-').map(Number);
  return new Date(y, m - 1, d + intervalDays);
}

export function renderLog() {
  const { streak, lastWash, unit } = calcStreak();
  const streakUnit = unit === 'weeks' ? (streak === 1 ? 'week' : 'weeks') : streak === 1 ? 'session' : 'sessions';
  document.getElementById('streak-val').textContent = streak > 0 ? `${streak} ${streakUnit}` : '—';
  document.getElementById('log-total-sessions').textContent = state.washLog.length;
  document.getElementById('log-last-wash').textContent = lastWash
    ? formatDate(lastWash).split(',')[0] + ' ' + lastWash.split('-').slice(1).reverse().join('/')
    : '—';

  const label = document.getElementById('log-history-label');
  label.textContent =
    state.washLog.length > 0
      ? `History (${state.washLog.length} session${state.washLog.length !== 1 ? 's' : ''})`
      : 'History';

  renderWashReminderCards();
  if (state.weatherCache) renderWeatherCards(evalWeatherTriggers(state.weatherCache));

  const container = document.getElementById('log-entries');
  if (!state.washLog.length) {
    container.innerHTML = `<div class="log-empty"><div class="log-empty-icon">🪣</div>No sessions logged yet.<br>Log your first wash above.</div>`;
    return;
  }

  container.innerHTML = '';
  // Sort newest first
  const sorted = [...state.washLog].sort((a, b) => b.date.localeCompare(a.date));
  sorted.forEach((entry) => {
    const div = document.createElement('div');
    div.className = 'log-entry';
    const entryPhotos = state.photosByEntryId[entry.id] ?? [];
    const rtypes = state.routines.find((r) => r.id === entry.type)?.types ?? [];
    const typeClass =
      rtypes.includes('exterior') && rtypes.includes('interior')
        ? 'full'
        : rtypes.includes('interior')
          ? 'interior'
          : rtypes.length
            ? 'quick'
            : entry.type === 'full' || entry.type === 'both'
              ? 'full'
              : entry.type === 'interior'
                ? 'interior'
                : 'quick';
    div.innerHTML = `
        <button class="log-menu-btn" data-id="${entry.id}" title="Options">···</button>
        <div class="log-menu-dropdown" id="log-menu-${entry.id}" hidden>
          <button class="log-menu-item" data-action="edit" data-id="${entry.id}">Edit</button>
          <button class="log-menu-item log-menu-item--danger" data-action="delete" data-id="${entry.id}">Delete</button>
        </div>
        <div class="log-entry-head">
          <div class="log-entry-date">${formatDate(entry.date)}</div>
          <div class="log-entry-type ${typeClass}">${typeLabel(entry.type)}</div>
        </div>
        ${entry.steps.length ? `<div class="log-chips">${entry.steps.map((s) => `<span class="log-chip">${s}</span>`).join('')}</div>` : ''}
        ${entry.notes ? `<div class="log-entry-notes">${entry.notes}</div>` : ''}
        ${
          entryPhotos.length
            ? `<div class="log-carousel">${entryPhotos
                .map(
                  (p, i) => `
          <div class="log-carousel-item">
            <img src="${p.thumbUrl}" loading="lazy" alt="Session photo" data-carousel-index="${i}" data-entry-id="${entry.id}">
            ${state.editingEntryId === entry.id ? `<button class="log-photo-remove" data-photo-id="${p.id}" data-entry-id="${entry.id}" title="Remove photo">✕</button>` : ''}
          </div>`,
                )
                .join('')}</div>`
            : ''
        }
        <div class="log-confirm-row" id="log-confirm-${entry.id}" hidden>
          <span>Delete this session?</span>
          <button class="log-confirm-cancel" data-id="${entry.id}">Cancel</button>
          <button class="log-confirm-delete" data-id="${entry.id}">Delete</button>
        </div>
      `;
    container.appendChild(div);
  });
}

// Listeners and DOM defaults that ran at load time in the old single-file app.js.
export function setupLog() {
  // Set today's date as default
  (function () {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    document.getElementById('log-date').value = `${yyyy}-${mm}-${dd}`;
  })();

  document.getElementById('log-type')?.addEventListener('change', () => {
    renderStepChipsForRoutine(document.getElementById('log-type').value);
  });

  document.getElementById('log-entries').addEventListener('click', (e) => {
    // Ellipsis menu button
    const menuBtn = e.target.closest('.log-menu-btn');
    if (menuBtn) {
      const id = menuBtn.dataset.id;
      if (state.openMenuId && state.openMenuId !== id) {
        document.getElementById(`log-menu-${state.openMenuId}`)?.setAttribute('hidden', '');
      }
      const dropdown = document.getElementById(`log-menu-${id}`);
      if (state.openMenuId === id) {
        dropdown?.setAttribute('hidden', '');
        state.openMenuId = null;
      } else {
        dropdown?.removeAttribute('hidden');
        state.openMenuId = id;
      }
      return;
    }
    // Edit action
    const editItem = e.target.closest('.log-menu-item[data-action="edit"]');
    if (editItem) {
      if (state.openMenuId) {
        document.getElementById(`log-menu-${state.openMenuId}`)?.setAttribute('hidden', '');
        state.openMenuId = null;
      }
      startEditEntry(Number(editItem.dataset.id));
      return;
    }
    // Delete action (from menu — shows confirm row)
    const deleteItem = e.target.closest('.log-menu-item[data-action="delete"]');
    if (deleteItem) {
      if (state.openMenuId) {
        document.getElementById(`log-menu-${state.openMenuId}`)?.setAttribute('hidden', '');
        state.openMenuId = null;
      }
      document.getElementById(`log-confirm-${deleteItem.dataset.id}`)?.removeAttribute('hidden');
      return;
    }
    // Confirm row — cancel
    const cancelBtn = e.target.closest('.log-confirm-cancel');
    if (cancelBtn) {
      document.getElementById(`log-confirm-${cancelBtn.dataset.id}`)?.setAttribute('hidden', '');
      return;
    }
    // Confirm row — delete
    const confirmBtn = e.target.closest('.log-confirm-delete');
    if (confirmBtn) {
      deleteLogEntry(Number(confirmBtn.dataset.id));
      return;
    }
    // Photo remove (carousel in edit mode)
    const removePhotoBtn = e.target.closest('.log-photo-remove');
    if (removePhotoBtn) {
      const item = removePhotoBtn.closest('.log-carousel-item');
      const pid = Number(removePhotoBtn.dataset.photoId);
      const eid = Number(removePhotoBtn.dataset.entryId);
      if (item) {
        item.classList.add('removing');
        item.addEventListener('animationend', () => deletePhoto(pid, eid), { once: true });
      } else {
        deletePhoto(pid, eid);
      }
      return;
    }
    // Carousel image → open lightbox
    const carouselImg = e.target.closest('.log-carousel-item img');
    if (carouselImg) {
      openLightbox(Number(carouselImg.dataset.entryId), Number(carouselImg.dataset.carouselIndex));
      return;
    }
  });

  // Dismiss open menu on outside click
  document.addEventListener('click', (e) => {
    if (state.openMenuId && !e.target.closest('.log-menu-btn') && !e.target.closest('.log-menu-dropdown')) {
      document.getElementById(`log-menu-${state.openMenuId}`)?.setAttribute('hidden', '');
      state.openMenuId = null;
    }
  });

  // Dupe warning on date change
  document.getElementById('log-date').addEventListener('change', () => {
    const date = document.getElementById('log-date').value;
    const warn = document.getElementById('log-dupe-warn');
    if (!warn) return;
    const hasDupe =
      state.editingEntryId !== null
        ? state.washLog.some((e) => e.date === date && e.id !== state.editingEntryId)
        : state.washLog.some((e) => e.date === date);
    warn.hidden = !hasDupe;
  });
}
