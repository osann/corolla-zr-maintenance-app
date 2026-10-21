// Tab and sub-tab navigation.
import { ROUTINES_KEY } from './config.js';
import { DEFAULT_ROUTINES } from './data.js';
import { renderLog, resetLogForm } from './log.js';
import { renderPhotoPreviews } from './photos.js';
import { state } from './state.js';
import { storageGet } from './storage.js';

// Listeners and DOM defaults that ran at load time in the old single-file app.js.
export function setupNav() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  document.querySelectorAll('.inv-sub-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.inv-sub-tab').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.inv-sub-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('inv-sub-' + btn.dataset.invTab).classList.add('active');
    });
  });

  document.querySelectorAll('.log-sub-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      // Navigating away from the edit form cancels the edit
      if (
        state.editingEntryId !== null &&
        (btn.dataset.logTab === 'history' || (btn.dataset.logTab === 'new' && btn.id !== 'log-edit-tab'))
      ) {
        state.editingEntryId = null;
        state.pendingEntryId = null;
        state.pendingPhotos = [];
        renderPhotoPreviews();
        resetLogForm();
        renderLog();
      }
      document.querySelectorAll('.log-sub-tab').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.log-sub-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('log-sub-' + btn.dataset.logTab).classList.add('active');
    });
  });

  document.querySelectorAll('.routine-sub-tab').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const leavingConfigure = document.getElementById('routine-sub-configure')?.classList.contains('active');
      if (leavingConfigure && btn.dataset.routineTab !== 'configure') {
        const saved = await storageGet(ROUTINES_KEY);
        state.routines =
          saved && Array.isArray(saved) && saved.length ? saved : JSON.parse(JSON.stringify(DEFAULT_ROUTINES));
        state.routines = state.routines.map((r) => ({
          ...r,
          steps: (r.steps || []).map((s) => {
            if ('product' in s && !('name' in s))
              return { name: '', action: s.action || '', products: s.product ? [{ name: s.product, ml: null }] : [] };
            if (!('products' in s)) s.products = [];
            return s;
          }),
        }));
      }
      document.querySelectorAll('.routine-sub-tab').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.routine-sub-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('routine-sub-' + btn.dataset.routineTab).classList.add('active');
    });
  });

  document.querySelectorAll('.maintenance-sub-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.maintenance-sub-tab').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.maintenance-sub-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('maintenance-sub-' + btn.dataset.maintenanceTab).classList.add('active');
    });
  });

  document.querySelectorAll('.toc-list a').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(link.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}
