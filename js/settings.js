// Settings tab: preferences, vehicle, notifications, data management.
import { renderAuthUI } from './auth.js';
import {
  ALERTS_KEY,
  BACKEND_URL,
  BUDGET_KEY,
  CATEGORIES_KEY,
  CATEGORY_OVERRIDES_KEY,
  CHECKLIST_V3_KEY,
  CUSTOM_CATEGORIES_KEY,
  INVENTORY_KEY,
  LOG_KEY,
  MAINTENANCE_KEY,
  MAINTENANCE_LOG_KEY,
  ROUTINES_KEY,
  SETTINGS_KEY,
  SHARED_KEYS,
} from './config.js';
import { DEFAULT_NOTIFICATIONS, DEFAULT_PREFS, DEFAULT_ROUTINES, FREQ_DEFAULTS } from './data.js';
import { renderLog, renderStepChipsForRoutine, saveLog } from './log.js';
import { renderPricesTab } from './prices.js';
import { loadRoutines } from './routines.js';
import { renderSchedulesUI, renderWashReminderCards } from './schedules.js';
import { state } from './state.js';
import { storageGet, storageSet, syncPush } from './storage.js';
import { showSaved, triggerDownload } from './util.js';
import { loadWeather } from './weather.js';

// Preferences
export function loadPrefsUI() {
  document.getElementById('pref-show-prices').checked = state.settings.prefs.showPrices;
  document.getElementById('pref-show-badges').checked = state.settings.prefs.showBadges;
  document.getElementById('pref-show-desc').checked = state.settings.prefs.showDesc;
  document.getElementById('pref-show-buy-buttons').checked = state.settings.prefs.showBuyButtons ?? true;
  document.getElementById('pref-show-sparklines').checked = state.settings.prefs.showSparklines ?? true;
}

export function applyPrefs() {
  // Prices
  document.querySelectorAll('.item-price').forEach((el) => {
    el.style.display = state.settings.prefs.showPrices ? '' : 'none';
  });
  // Phase badges
  document.querySelectorAll('[data-phase-status]').forEach((el) => {
    el.style.display = state.settings.prefs.showBadges ? '' : 'none';
  });
  // Item descriptions
  document.querySelectorAll('.item-desc').forEach((el) => {
    el.style.display = state.settings.prefs.showDesc ? '' : 'none';
  });
  // Buy buttons — override display; individual hidden attr still controls per-item visibility
  const showBuy = state.settings.prefs.showBuyButtons ?? true;
  document.querySelectorAll('.item-buy-btn').forEach((el) => {
    el.style.display = showBuy ? '' : 'none';
  });
}

// Car info
export function loadCarUI() {
  document.getElementById('car-model').value = state.settings.car.model || '';
  document.getElementById('car-year').value = state.settings.car.year || '';
  document.getElementById('car-colour').value = state.settings.car.colour || '';
  document.getElementById('car-display-name').value = state.settings.car.displayName || '';
  document.getElementById('car-postcode').value = state.settings.car.postcode || '';
  document.getElementById('car-odometer').value = state.settings.car.currentOdometer || '';
}

export async function loadNotificationsUI() {
  document.getElementById('pref-sale-alerts').checked = state.settings.notifications.saleAlerts ?? true;
  document.getElementById('pref-threshold-alerts').checked = state.settings.notifications.thresholdAlerts ?? true;
  document.getElementById('pref-ticktick-alerts').checked = state.settings.notifications.ticktickAlerts;
  document.getElementById('ticktick-tags').value = (state.settings.notifications.ticktickTags ?? []).join(', ');
  document.getElementById('ticktick-priority').value = String(state.settings.notifications.ticktickPriority ?? 0);
  document.getElementById('pref-email-alerts').checked = state.settings.notifications.emailAlerts;
  document.getElementById('pref-wash-reminders').checked = state.settings.notifications.washReminders;
  document.getElementById('pref-email-wash-reminders').checked = state.settings.notifications.emailWashReminders;
  document.getElementById('pref-email-digest').checked = state.settings.notifications.emailDigest;
  await refreshTickTickStatus();
}

export async function refreshTickTickStatus() {
  if (!state.syncEnabled) return;
  try {
    const res = await fetch(`${BACKEND_URL}/api/ticktick/status`, { credentials: 'include' });
    const { connected } = await res.json();
    const statusText = document.getElementById('ticktick-status-text');
    const connectBtn = document.getElementById('ticktick-connect-btn');
    const disconnectBtn = document.getElementById('ticktick-disconnect-btn');
    const projectRow = document.getElementById('ticktick-project-row');
    const tagsRow = document.getElementById('ticktick-tags-row');
    const priorityRow = document.getElementById('ticktick-priority-row');
    state.ticktickIsConnected = connected;
    if (connected) {
      statusText.textContent = 'Connected';
      connectBtn.hidden = true;
      disconnectBtn.hidden = false;
      projectRow.hidden = false;
      tagsRow.hidden = false;
      priorityRow.hidden = false;
      await loadTickTickProjects();
    } else {
      statusText.textContent = 'Not connected';
      connectBtn.hidden = false;
      disconnectBtn.hidden = true;
      projectRow.hidden = true;
      tagsRow.hidden = true;
      priorityRow.hidden = true;
    }
    renderWashReminderCards();
  } catch {
    /* backend unreachable — leave as-is */
  }
}

export async function loadTickTickProjects() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/ticktick/projects`, { credentials: 'include' });
    if (!res.ok) return;
    const projects = await res.json();
    const sel = document.getElementById('ticktick-project-id');
    sel.innerHTML = '<option value="">Select a list…</option>';
    for (const p of projects) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === state.settings.notifications.ticktickProjectId) opt.selected = true;
      sel.appendChild(opt);
    }
  } catch {
    /* ignore */
  }
}

export function connectTickTick() {
  window.location.href = `${BACKEND_URL}/api/ticktick/auth`;
}

export async function disconnectTickTick() {
  if (!confirm('Disconnect TickTick?')) return;
  await fetch(`${BACKEND_URL}/api/ticktick/disconnect`, { method: 'DELETE', credentials: 'include' });
  await refreshTickTickStatus();
}

export function applyCarInfo() {
  const { model, year, colour } = state.settings.car;
  const m = model || 'Corolla ZR Hybrid';
  const y = year || '2025';
  const h1 = document.getElementById('header-h1');
  if (h1) h1.innerHTML = `${y} <em>${m}</em><br>care guide`;
  const footerCtx = document.getElementById('footer-context');
  if (footerCtx) footerCtx.textContent = `Kit & technique reference for the ${y} ${m}`;
  applyColourAccent(colour);
}

export function applyColourAccent(colourText) {
  const root = document.documentElement;
  if (!colourText) {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-dark');
    root.style.removeProperty('--accent-tint');
    return;
  }
  const t = colourText.toLowerCase();
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  const palettes = [
    {
      words: ['bronze', 'copper', 'amber', 'mango', 'spice', 'gold', 'caramel'],
      light: ['#8b5e1a', '#6b4712', 'rgba(139,94,26,0.10)'],
      darkMode: ['#d4983a', '#8b5e1a', 'rgba(212,152,58,0.15)'],
    },
    {
      words: ['red', 'crimson', 'scarlet', 'burgundy', 'ruby', 'burn', 'rose'],
      light: ['#a83030', '#7a2020', 'rgba(168,48,48,0.10)'],
      darkMode: ['#e06060', '#a83030', 'rgba(224,96,96,0.15)'],
    },
    {
      words: ['blue', 'mineral', 'navy', 'cobalt', 'sapphire', 'ocean', 'teal'],
      light: ['#1a5a8b', '#124070', 'rgba(26,90,139,0.10)'],
      darkMode: ['#4a90d9', '#1a5a8b', 'rgba(74,144,217,0.15)'],
    },
    {
      words: ['grey', 'gray', 'graphite', 'graphene', 'silver', 'slate', 'platinum', 'titanium', 'meteor'],
      light: ['#4a5460', '#323c48', 'rgba(74,84,96,0.10)'],
      darkMode: ['#8a9ab0', '#4a5460', 'rgba(138,154,176,0.15)'],
    },
    {
      words: ['black', 'obsidian', 'midnight', 'onyx', 'phantom', 'eclipse'],
      light: ['#3a3a50', '#252535', 'rgba(58,58,80,0.10)'],
      darkMode: ['#7070a0', '#3a3a50', 'rgba(112,112,160,0.15)'],
    },
  ];

  for (const p of palettes) {
    if (p.words.some((w) => t.includes(w))) {
      const [accent, accentDark, accentTint] = dark ? p.darkMode : p.light;
      root.style.setProperty('--accent', accent);
      root.style.setProperty('--accent-dark', accentDark);
      root.style.setProperty('--accent-tint', accentTint);
      return;
    }
  }
  root.style.removeProperty('--accent');
  root.style.removeProperty('--accent-dark');
  root.style.removeProperty('--accent-tint');
}

// Rebuild log step chips — delegates to the routine-based chip renderer
export function applyLogStepChips() {
  const sel = document.getElementById('log-type');
  renderStepChipsForRoutine(sel?.value ?? '');
}

// Save / load settings
export async function saveSettings(section) {
  if (section === 'prefs') {
    state.settings.prefs.showPrices = document.getElementById('pref-show-prices').checked;
    state.settings.prefs.showBadges = document.getElementById('pref-show-badges').checked;
    state.settings.prefs.showDesc = document.getElementById('pref-show-desc').checked;
    state.settings.prefs.showBuyButtons = document.getElementById('pref-show-buy-buttons').checked;
    state.settings.prefs.showSparklines = document.getElementById('pref-show-sparklines').checked;
  } else if (section === 'car') {
    state.settings.car.model = document.getElementById('car-model').value.trim();
    state.settings.car.year = document.getElementById('car-year').value.trim();
    state.settings.car.colour = document.getElementById('car-colour').value.trim();
    state.settings.car.displayName = document.getElementById('car-display-name').value.trim();
    state.settings.car.postcode = document.getElementById('car-postcode').value.trim();
    state.settings.car.currentOdometer = +document.getElementById('car-odometer').value || null;
  } else if (section === 'notifications') {
    state.settings.notifications.saleAlerts = document.getElementById('pref-sale-alerts')?.checked ?? true;
    state.settings.notifications.thresholdAlerts = document.getElementById('pref-threshold-alerts')?.checked ?? true;
    state.settings.notifications.ticktickAlerts = document.getElementById('pref-ticktick-alerts')?.checked ?? true;
    state.settings.notifications.ticktickProjectId = document.getElementById('ticktick-project-id')?.value || null;
    state.settings.notifications.ticktickTags = (document.getElementById('ticktick-tags')?.value ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    state.settings.notifications.ticktickPriority = Number(document.getElementById('ticktick-priority')?.value ?? 0);
    state.settings.notifications.emailAlerts = document.getElementById('pref-email-alerts')?.checked ?? false;
    state.settings.notifications.washReminders = document.getElementById('pref-wash-reminders')?.checked ?? true;
    state.settings.notifications.emailWashReminders =
      document.getElementById('pref-email-wash-reminders')?.checked ?? false;
    state.settings.notifications.emailDigest = document.getElementById('pref-email-digest')?.checked ?? false;
  } else if (section === 'schedules') {
    // settings.schedules already mutated in-place via updateScheduleField / addScheduleEntry / removeScheduleEntry
  }
  await storageSet(SETTINGS_KEY, state.settings);
  syncPush(SETTINGS_KEY, state.settings);
  renderWashReminderCards();
  applyPrefs();
  if (section === 'prefs') renderPricesTab();
  applyCarInfo();
  applyLogStepChips();
  // Show saved message(s)
  const msgIds = section === 'car' ? ['car-saved', 'sync-name-saved'] : [`${section}-saved`];
  msgIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('visible');
      setTimeout(() => el.classList.remove('visible'), 2200);
    }
  });
  if (section === 'car') renderAuthUI();
  if (section === 'car') loadWeather();
}

export async function loadSettings() {
  const saved = await storageGet(SETTINGS_KEY);
  if (saved) {
    // Merge carefully to preserve defaults for any missing keys
    if (saved.freq) state.settings.freq = { ...FREQ_DEFAULTS, ...saved.freq };
    if (saved.prefs) state.settings.prefs = { ...DEFAULT_PREFS, ...saved.prefs };
    if (saved.car)
      state.settings.car = { model: '', year: '', colour: '', displayName: '', postcode: '', ...saved.car };
    if (saved.notifications) state.settings.notifications = { ...DEFAULT_NOTIFICATIONS, ...saved.notifications };
    if (Array.isArray(saved.schedules)) state.settings.schedules = saved.schedules;
  }
  loadPrefsUI();
  loadCarUI();
  loadNotificationsUI();
  renderSchedulesUI();
  renderWashReminderCards();
  applyPrefs();
  applyCarInfo();
  applyLogStepChips();
}

// Reset helpers
export async function resetPrefs() {
  if (!confirm('Reset display preferences to defaults?')) return;
  state.settings.prefs = { ...DEFAULT_PREFS };
  loadPrefsUI();
  applyPrefs();
  renderPricesTab();
  await storageSet(SETTINGS_KEY, state.settings);
  syncPush(SETTINGS_KEY, state.settings);
  showSaved('prefs-saved');
}

export async function resetNotifications() {
  if (!confirm('Reset notification settings to defaults?')) return;
  state.settings.notifications = { ...DEFAULT_NOTIFICATIONS };
  loadNotificationsUI();
  await storageSet(SETTINGS_KEY, state.settings);
  syncPush(SETTINGS_KEY, state.settings);
  showSaved('notifications-saved');
}

// Data management
// ─── Backup export / import ──────────────────────
// Every synced store that's still written to. The legacy budget and category-override keys
// are deliberately left out. Photos live in R2 and aren't part of a backup; log entries keep
// their ids, so photos stay attached when restoring into the same account. Shared stores
// (SHARED_KEYS) are only exported and restored by the admin, since nobody else can change them.
const BACKUP_APP = 'Corolla ZR Detailing Guide';
const BACKUP_FORMAT = 2;
const BACKUP_KEYS = {
  [CHECKLIST_V3_KEY]: 'object',
  [LOG_KEY]: 'array',
  [SETTINGS_KEY]: 'object',
  [ALERTS_KEY]: 'object',
  [ROUTINES_KEY]: 'array',
  [MAINTENANCE_KEY]: 'array',
  [MAINTENANCE_LOG_KEY]: 'array',
  [INVENTORY_KEY]: 'object',
  [CATEGORIES_KEY]: 'array',
};

export async function exportData() {
  const data = {};
  for (const key of Object.keys(BACKUP_KEYS)) {
    if (SHARED_KEYS.includes(key) && !state.isAdmin) continue;
    const value = await storageGet(key);
    if (value != null) data[key] = value;
  }
  const backup = { app: BACKUP_APP, format: BACKUP_FORMAT, exported: new Date().toISOString(), data };
  const date = new Date().toISOString().split('T')[0];
  triggerDownload(JSON.stringify(backup, null, 2), `corolla-detailing-backup-${date}.json`, 'application/json');
}

// Returns { [storageKey]: value } from a backup file, or throws with a user-facing reason.
// Also accepts the original format (checklist + washLog + settings at the top level).
function parseBackup(json) {
  if (!json || typeof json !== 'object' || json.app !== BACKUP_APP) {
    throw new Error("this isn't a backup exported from this app");
  }
  const data =
    json.format === BACKUP_FORMAT
      ? json.data
      : { [CHECKLIST_V3_KEY]: json.checklist, [LOG_KEY]: json.washLog, [SETTINGS_KEY]: json.settings };
  const out = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value == null) continue;
    const expected = BACKUP_KEYS[key];
    if (!expected) continue; // unknown or retired store — ignore rather than restore
    if (SHARED_KEYS.includes(key) && !state.isAdmin) continue; // shared, and only the admin can change it
    const actual = Array.isArray(value) ? 'array' : typeof value;
    if (actual !== expected) throw new Error(`${key} should be an ${expected}, not ${actual}`);
    out[key] = value;
  }
  if (!Object.keys(out).length) throw new Error('it contains no data');
  return out;
}

export function importData() {
  const input = document.getElementById('backup-import-input');
  if (!input) return;
  input.value = '';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    let data;
    try {
      data = parseBackup(JSON.parse(await file.text()));
    } catch (e) {
      alert(`Couldn't restore that file: ${e instanceof SyntaxError ? 'it isn’t valid JSON' : e.message}.`);
      return;
    }
    const keys = Object.keys(data);
    const where = state.syncEnabled ? 'on every signed-in device' : 'in this browser';
    if (!confirm(`Restore ${keys.length} data store(s) from this backup? Your current data will be replaced ${where}.`))
      return;

    // Server first, checking every response: on reload the server copy overwrites local storage,
    // so a restore that only reached this browser would silently revert.
    if (state.syncEnabled) {
      const failed = [];
      for (const key of keys) {
        const res = await fetch(`${BACKEND_URL}/api/sync/${encodeURIComponent(key)}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data[key]),
          signal: AbortSignal.timeout(15000),
        }).catch(() => null);
        if (!res?.ok) failed.push(key);
      }
      if (failed.length) {
        alert(
          `Restore incomplete: ${failed.length} of ${keys.length} store(s) couldn't be saved to your account. Nothing was changed in this browser — try again.`,
        );
        return;
      }
    }
    for (const key of keys) await storageSet(key, data[key]);
    location.reload();
  };
  input.click();
}

export async function clearLog() {
  if (!confirm('Delete all wash log sessions? This cannot be undone.')) return;
  state.washLog = [];
  await saveLog();
  renderLog();
}

export async function resetRoutines() {
  if (!confirm('Reset all routines to defaults? Your customisations will be lost.')) return;
  state.routines = JSON.parse(JSON.stringify(DEFAULT_ROUTINES));
  await storageSet(ROUTINES_KEY, state.routines);
  syncPush(ROUTINES_KEY, state.routines);
  await loadRoutines();
}

// Clears the user's own data. Product categories are shared, so they're left alone.
export async function resetEverything() {
  if (
    !confirm(
      'This will clear ALL your data — checklist, wash log, routines, maintenance, inventory, price alerts and settings. Are you sure?',
    )
  )
    return;
  if (!confirm('Last chance — all your data will be deleted. Continue?')) return;
  // Push empty values to remote first so the reset propagates to all devices
  if (state.syncEnabled) {
    await Promise.allSettled([
      syncPush(CHECKLIST_V3_KEY, {}),
      syncPush(LOG_KEY, []),
      syncPush(BUDGET_KEY, {}),
      syncPush(SETTINGS_KEY, {}),
      syncPush(ALERTS_KEY, {}),
      syncPush(ROUTINES_KEY, []),
      syncPush(MAINTENANCE_KEY, []),
      syncPush(MAINTENANCE_LOG_KEY, []),
      syncPush(INVENTORY_KEY, {}),
      syncPush(CATEGORY_OVERRIDES_KEY, {}),
      syncPush(CUSTOM_CATEGORIES_KEY, []),
    ]);
    state.syncEnabled = false;
  }
  await storageSet(CHECKLIST_V3_KEY, {});
  await storageSet(LOG_KEY, []);
  await storageSet(BUDGET_KEY, {});
  await storageSet(SETTINGS_KEY, {});
  await storageSet(ALERTS_KEY, {});
  await storageSet(ROUTINES_KEY, null);
  await storageSet(MAINTENANCE_KEY, null);
  await storageSet(MAINTENANCE_LOG_KEY, null);
  await storageSet(INVENTORY_KEY, {});
  await storageSet(CATEGORY_OVERRIDES_KEY, {});
  await storageSet(CUSTOM_CATEGORIES_KEY, []);
  location.reload();
}

// Listeners and DOM defaults that ran at load time in the old single-file app.js.
export function setupSettings() {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyCarInfo());
}
