// Local storage abstraction and sync push.
import { BACKEND_URL, BUILD_DATE, SHARED_KEYS } from './config.js';
import { state } from './state.js';

export const hasStorage = typeof window.storage !== 'undefined';

export async function storageGet(key) {
  if (hasStorage) {
    try {
      const r = await window.storage.get(key);
      return r && r.value ? JSON.parse(r.value) : null;
    } catch (e) {
      return null;
    }
  } else {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch (e) {
      return null;
    }
  }
}

export async function storageSet(key, val) {
  if (hasStorage) {
    try {
      await window.storage.set(key, JSON.stringify(val));
    } catch (e) {}
  } else {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
  }
}

export async function syncPush(key, value) {
  if (!state.syncEnabled || !BACKEND_URL || BACKEND_URL.startsWith('__')) return;
  // Shared stores belong to the admin; anyone else's copy is local only (the server would 403).
  if (SHARED_KEYS.includes(key) && !state.isAdmin) return;
  try {
    await fetch(`${BACKEND_URL}/api/sync/${encodeURIComponent(key)}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
      signal: AbortSignal.timeout(8000),
    });
    state.lastSyncedAt = new Date();
    updateFooterSync();
  } catch {}
}

export function updateFooterVersion() {
  const el = document.getElementById('footer-version');
  if (!el) return;
  el.textContent = BUILD_DATE.startsWith('__') ? '' : `Updated ${BUILD_DATE}`;
}

export function updateFooterSync() {
  const el = document.getElementById('footer-sync');
  if (!el) return;
  if (state.syncEnabled && state.lastSyncedAt) {
    const t = state.lastSyncedAt.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });
    el.textContent = `Synced · ${t}`;
  } else if (state.syncEnabled) {
    el.textContent = 'Synced';
  } else {
    el.textContent = 'Local only — sign in to sync across devices';
  }
}
