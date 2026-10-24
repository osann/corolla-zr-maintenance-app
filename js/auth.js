// Sign-in and sync.
import { loadCategories } from './catalog.js';
import { loadChecklist } from './checklist.js';
import {
  ALERTS_KEY,
  AUTH_CACHE_KEY,
  BACKEND_URL,
  BUDGET_KEY,
  BUNDLE_COMPONENTS_CACHE_KEY,
  CATEGORIES_KEY,
  CATEGORY_OVERRIDES_KEY,
  CHECKLIST_V3_KEY,
  CUSTOM_CATEGORIES_KEY,
  INVENTORY_KEY,
  LAST_USER_KEY,
  LOG_KEY,
  MAINTENANCE_KEY,
  MAINTENANCE_LOG_KEY,
  ROUTINES_KEY,
  SETTINGS_KEY,
} from './config.js';
import { loadInventory } from './inventory.js';
import { loadLog, renderLogTypeSelect } from './log.js';
import { loadMaintenance } from './maintenance.js';
import { loadAlerts } from './prices.js';
import { loadRoutines } from './routines.js';
import { renderWashReminderCards } from './schedules.js';
import { loadSettings } from './settings.js';
import { state } from './state.js';
import { storageGet, storageSet, updateFooterSync } from './storage.js';
import { loadUsers } from './users.js';

export function renderAuthUI() {
  const loginForm = document.getElementById('auth-login-form');
  const logoutSec = document.getElementById('auth-logout-section');
  const statusText = document.getElementById('auth-status-text');
  const emailDisplay = document.getElementById('auth-email-display');
  const navBtn = document.getElementById('nav-auth-btn');
  if (!loginForm || !logoutSec) return;
  const logTab = document.querySelector('.tab[data-tab="log"]');
  const maintenanceTab = document.querySelector('.tab[data-tab="maintenance"]');
  const inventoryTab = document.querySelector('.tab[data-tab="inventory"]');
  const routineSubTabs = document.querySelector('.routine-sub-tabs');
  const vehicleSec = document.getElementById('settings-vehicle');
  const notifSec = document.getElementById('settings-notifications');
  const prefsSec = document.getElementById('settings-prefs');
  const dataSec = document.getElementById('settings-data');
  if (state.syncEnabled) {
    loginForm.style.display = 'none';
    logoutSec.style.display = '';
    if (statusText) statusText.textContent = 'Signed in — data syncs automatically';
    if (emailDisplay) emailDisplay.textContent = state.syncEmail ?? '';
    if (navBtn) {
      navBtn.textContent = state.settings.car.displayName || state.syncEmail || '●';
      navBtn.classList.add('syncing');
    }
    if (logTab) {
      const wasHidden = logTab.style.display === 'none';
      logTab.style.display = '';
      if (wasHidden) document.querySelector('.tab[data-tab="log"]')?.click();
    }
    if (maintenanceTab) maintenanceTab.style.display = '';
    if (inventoryTab) inventoryTab.style.display = '';
    if (routineSubTabs) routineSubTabs.style.display = '';
    if (vehicleSec) vehicleSec.style.display = '';
    if (notifSec) notifSec.style.display = '';
    if (prefsSec) prefsSec.style.display = '';
    if (dataSec) dataSec.style.display = '';
    document.querySelectorAll('.alert-btn').forEach((b) => (b.style.display = ''));
    const photoField = document.getElementById('log-photo-field');
    if (photoField) photoField.style.display = '';
  } else {
    loginForm.style.display = '';
    logoutSec.style.display = 'none';
    if (statusText) statusText.textContent = 'Not signed in — data is local only';
    if (navBtn) {
      navBtn.textContent = 'Sign in';
      navBtn.classList.remove('syncing');
    }
    if (logTab) {
      logTab.style.display = 'none';
      if (logTab.classList.contains('active')) document.querySelector('.tab[data-tab="routine"]')?.click();
    }
    if (maintenanceTab) {
      maintenanceTab.style.display = 'none';
      if (maintenanceTab.classList.contains('active')) document.querySelector('.tab[data-tab="routine"]')?.click();
    }
    if (inventoryTab) {
      inventoryTab.style.display = 'none';
      if (inventoryTab.classList.contains('active')) document.querySelector('.tab[data-tab="routine"]')?.click();
    }
    if (routineSubTabs) routineSubTabs.style.display = 'none';
    if (vehicleSec) vehicleSec.style.display = 'none';
    if (notifSec) notifSec.style.display = 'none';
    if (prefsSec) prefsSec.style.display = 'none';
    if (dataSec) dataSec.style.display = 'none';
    document.querySelectorAll('.alert-btn').forEach((b) => (b.style.display = 'none'));
    const photoFieldOff = document.getElementById('log-photo-field');
    if (photoFieldOff) photoFieldOff.style.display = 'none';
  }

  // Admin-only UI: the Products sub-tab, Settings → Categories and Settings → Users. Hiding it is
  // only cosmetic; the backend rejects these changes from anyone else.
  const showAdmin = state.syncEnabled && state.isAdmin;
  document.querySelectorAll('[data-admin-only]').forEach((el) => (el.hidden = !showAdmin));
  const productsSubTab = document.querySelector('.inv-sub-tab[data-inv-tab="products"]');
  if (!showAdmin && productsSubTab?.classList.contains('active')) {
    document.querySelector('.inv-sub-tab[data-inv-tab="stock"]')?.click();
  }
  updateFooterSync();
}

export function navAuthClick() {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
  document.querySelector('.tab[data-tab="settings"]').classList.add('active');
  document.getElementById('settings').classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export async function requestMagicLink() {
  const input = document.getElementById('auth-email-input');
  const btn = document.getElementById('auth-send-btn');
  const msgEl = document.getElementById('auth-message');
  const email = input?.value?.trim();
  if (!email) return;
  if (!BACKEND_URL || BACKEND_URL.startsWith('__')) return;

  btn.disabled = true;
  if (msgEl) {
    msgEl.style.display = '';
    msgEl.textContent = 'Sending…';
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/request`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 429) {
      if (msgEl) msgEl.textContent = 'Please wait a minute before requesting another link.';
      btn.disabled = false;
    } else {
      // The server answers the same whether or not the address has an account (see /auth/request).
      const sent = 'If that email has an account, a sign-in link is on its way. It expires in 15 minutes.';
      if (msgEl) msgEl.textContent = sent;
      btn.style.display = 'none';
      let remaining = 120;
      const interval = setInterval(() => {
        remaining--;
        if (msgEl) msgEl.textContent = `${sent} Resend available in ${remaining}s.`;
        if (remaining <= 0) {
          clearInterval(interval);
          btn.style.display = '';
          btn.disabled = false;
          if (msgEl) msgEl.textContent = 'Check your email — or send another link.';
        }
      }, 1000);
    }
  } catch {
    if (msgEl) msgEl.textContent = 'Could not reach server. Try again.';
    btn.disabled = false;
  }
}

export async function signOut() {
  if (!BACKEND_URL || BACKEND_URL.startsWith('__')) return;
  try {
    await fetch(`${BACKEND_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      signal: AbortSignal.timeout(8000),
    });
  } catch {}
  state.syncEnabled = false;
  state.syncEmail = null;
  state.isAdmin = false;
  state.photosByEntryId = {};
  state.pendingPhotos = [];
  state.pendingEntryId = null;
  await clearLocalSyncedData();
  location.reload();
}

// Empties this browser's copy of every synced store, plus the auth, pack and last-user caches.
// The server copy is untouched. Used on sign-out, and when a different account signs in here.
export async function clearLocalSyncedData() {
  await Promise.all([
    storageSet(CHECKLIST_V3_KEY, {}),
    storageSet(LOG_KEY, []),
    storageSet(BUDGET_KEY, {}),
    storageSet(SETTINGS_KEY, {}),
    storageSet(ALERTS_KEY, {}),
    storageSet(ROUTINES_KEY, null),
    storageSet(MAINTENANCE_KEY, null),
    storageSet(MAINTENANCE_LOG_KEY, null),
    storageSet(INVENTORY_KEY, {}),
    storageSet(CATEGORY_OVERRIDES_KEY, {}),
    storageSet(CUSTOM_CATEGORIES_KEY, []),
    storageSet(CATEGORIES_KEY, []),
    storageSet(BUNDLE_COMPONENTS_CACHE_KEY, {}),
    storageSet(AUTH_CACHE_KEY, null),
    storageSet(LAST_USER_KEY, null),
  ]);
}

export async function checkAuthAndSync() {
  if (!BACKEND_URL || BACKEND_URL.startsWith('__')) {
    renderAuthUI();
    return;
  }

  // Handle magic link token in URL
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    // Clean the URL immediately — don't leave the token in browser history
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState(null, '', cleanUrl);
    try {
      await fetch(`${BACKEND_URL}/api/auth/verify`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {}
  }

  // Check for existing session
  try {
    const meRes = await fetch(`${BACKEND_URL}/api/auth/me`, {
      credentials: 'include',
      signal: AbortSignal.timeout(8000),
    });
    if (!meRes.ok) {
      state.syncEnabled = false;
      state.syncEmail = null;
      state.isAdmin = false;
      await storageSet(AUTH_CACHE_KEY, null);
      renderAuthUI();
      return;
    }
    const me = await meRes.json();
    if (!me.authenticated) {
      state.syncEnabled = false;
      state.syncEmail = null;
      state.isAdmin = false;
      await storageSet(AUTH_CACHE_KEY, null);
      renderAuthUI();
      return;
    }

    // This browser last held a different account's data (say A's session expired on a shared
    // device, then B signed in). Clear it first: B's account has nothing yet for some stores, so
    // A's local copies would otherwise show under B and be pushed into B's account on B's first
    // save. The reload then comes back through here as B, with a clean slate.
    const lastUser = await storageGet(LAST_USER_KEY);
    if (lastUser && lastUser !== me.email) {
      await clearLocalSyncedData();
      await storageSet(LAST_USER_KEY, me.email);
      location.reload();
      return;
    }
    await storageSet(LAST_USER_KEY, me.email);

    state.syncEnabled = true;
    state.syncEmail = me.email;
    state.isAdmin = !!me.isAdmin;
    await storageSet(AUTH_CACHE_KEY, { email: me.email, isAdmin: state.isAdmin });
    renderAuthUI();
    renderLogTypeSelect();
    if (state.isAdmin) loadUsers();

    // Pull remote data and overwrite local state
    const syncRes = await fetch(`${BACKEND_URL}/api/sync`, {
      credentials: 'include',
      signal: AbortSignal.timeout(8000),
    });
    if (!syncRes.ok) return;
    const remote = await syncRes.json();

    const keys = [
      CHECKLIST_V3_KEY,
      LOG_KEY,
      BUDGET_KEY,
      SETTINGS_KEY,
      ALERTS_KEY,
      ROUTINES_KEY,
      MAINTENANCE_KEY,
      MAINTENANCE_LOG_KEY,
      INVENTORY_KEY,
      CATEGORY_OVERRIDES_KEY,
      CUSTOM_CATEGORIES_KEY,
      CATEGORIES_KEY,
    ];
    for (const key of keys) {
      if (remote[key] !== undefined) await storageSet(key, remote[key]);
    }

    // Re-run loaders so UI reflects remote data.
    // loadRoutines must run before loadLog/loadSettings since
    // renderWashReminderCards (called by both) depends on routines[].
    await loadRoutines();
    await loadMaintenance();
    await loadChecklist();
    await loadCategories();
    await loadInventory();
    await loadLog();
    await loadSettings();
    await loadAlerts();
    renderWashReminderCards(); // loadLog fires before loadSettings, so re-render once both are done
    renderAuthUI();
  } catch {
    renderAuthUI();
  }
}
