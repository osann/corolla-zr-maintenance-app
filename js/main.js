// Entry point: exposes inline-handler functions on window, wires listeners, starts the app.
import { checkAuthAndSync, navAuthClick, renderAuthUI, requestMagicLink, signOut } from './auth.js';
import { changeProductCategory, loadCategories } from './catalog.js';
import {
  addCustomCategory,
  addCustomCategorySection,
  cancelCustomCategoryDelete,
  deleteCustomCategory,
  removeCustomCategorySection,
  saveCustomCategories,
  showCustomCategoryDeleteConfirm,
  updateCustomCategoryLabel,
  updateCustomCategorySection,
} from './categories.js';
import {
  clearChecklistAlert,
  loadChecklist,
  saveChecklistAlert,
  setupChecklist,
  toggleChecklistAlert,
} from './checklist.js';
import { AUTH_CACHE_KEY, BUNDLE_COMPONENTS_CACHE_KEY } from './config.js';
import {
  addProductToInventory,
  loadInventory,
  markItemEmpty,
  resetInventory,
  saveInvAdjust,
  saveInvEquipDate,
  toggleInvAddProductForm,
  toggleInvAdjustForm,
} from './inventory.js';
import { addLogEntry, cancelEditEntry, loadLog } from './log.js';
import {
  addMaintenanceItem,
  cancelMaintenanceDelete,
  cancelMaintenanceLogDelete,
  deleteMaintenanceItem,
  deleteMaintenanceLogEntry,
  downloadMaintenanceTemplate,
  exportMaintenanceCSV,
  hideMaintenanceCompleteForm,
  importMaintenanceCSV,
  loadMaintenance,
  resetMaintenance,
  saveMaintenance,
  saveMaintenanceComplete,
  showMaintenanceCompleteForm,
  showMaintenanceDeleteConfirm,
  showMaintenanceLogDeleteConfirm,
  updateMaintenanceItem,
} from './maintenance.js';
import { closeLightbox, lightboxNav, setupPhotoUploadUI } from './photos.js';
import {
  cancelAlertEdit,
  clearAlert,
  editAlertInSummary,
  loadAlerts,
  loadPriceData,
  saveAlert,
  saveAlertFromSummary,
  toggleAlertForm,
} from './prices.js';
import {
  addPackDraftRow,
  autoFillProductSlug,
  cancelDeleteProductConfirm,
  cancelPackEdit,
  cancelRemoveRetailerConfirm,
  cancelSlugRenameConfirm,
  cancelUnpackConfirm,
  closeRetailerEditor,
  confirmSlugRename,
  confirmUnpack,
  deleteProduct,
  hidePackProductDropdown,
  onPackComponentInput,
  openPackEditor,
  openPackProductDropdown,
  openRetailerEditor,
  removePackDraftRow,
  removeRetailer,
  requestSlugRename,
  saveNewProduct,
  savePackDraft,
  saveProductDefaults,
  saveProductName,
  saveRetailerUrl,
  showDeleteProductConfirm,
  showRemoveRetailerConfirm,
  toggleAddProductForm,
  togglePackForCard,
  toggleProductNameForm,
  toggleProductSlugForm,
  updatePackDraftField,
} from './products.js';
import {
  addRoutine,
  addRoutineAlert,
  addRoutineStep,
  addStepProduct,
  cancelRoutineDelete,
  deleteRoutine,
  downloadRoutineTemplate,
  exportRoutinesCSV,
  filterCatalogDropdown,
  hideCatalogDropdown,
  importRoutinesCSV,
  loadRoutines,
  moveRoutineStep,
  openCatalogDropdown,
  removeRoutineAlert,
  removeRoutineStep,
  removeStepProduct,
  saveRoutines,
  showRoutineDeleteConfirm,
  toggleRoutineType,
  updateRoutineAlert,
  updateRoutineMeta,
  updateRoutineStep,
  updateStepProduct,
} from './routines.js';
import {
  addScheduleEntry,
  goToRoutine,
  removeScheduleEntry,
  renderWashReminderCards,
  sendWashReminderToTickTick,
  updateScheduleField,
} from './schedules.js';
import {
  clearLog,
  connectTickTick,
  disconnectTickTick,
  exportData,
  importData,
  loadSettings,
  resetEverything,
  resetNotifications,
  resetPrefs,
  resetRoutines,
  saveSettings,
} from './settings.js';
import { state } from './state.js';
import { storageGet, updateFooterVersion } from './storage.js';
import { loadWeather } from './weather.js';
import { setupLog } from './log.js';
import { setupNav } from './nav.js';
import { setupSettings } from './settings.js';

// Functions called from inline on*= handlers (in index.html and in rendered HTML strings).
Object.assign(window, {
  addCustomCategory,
  addCustomCategorySection,
  addLogEntry,
  addMaintenanceItem,
  addPackDraftRow,
  addProductToInventory,
  addRoutine,
  addRoutineAlert,
  addRoutineStep,
  addScheduleEntry,
  addStepProduct,
  autoFillProductSlug,
  cancelAlertEdit,
  cancelCustomCategoryDelete,
  cancelDeleteProductConfirm,
  cancelEditEntry,
  cancelMaintenanceDelete,
  cancelMaintenanceLogDelete,
  cancelPackEdit,
  cancelRemoveRetailerConfirm,
  cancelRoutineDelete,
  cancelSlugRenameConfirm,
  cancelUnpackConfirm,
  changeProductCategory,
  clearAlert,
  clearChecklistAlert,
  clearLog,
  closeLightbox,
  closeRetailerEditor,
  confirmSlugRename,
  confirmUnpack,
  connectTickTick,
  deleteCustomCategory,
  deleteMaintenanceItem,
  deleteMaintenanceLogEntry,
  deleteProduct,
  deleteRoutine,
  disconnectTickTick,
  downloadMaintenanceTemplate,
  downloadRoutineTemplate,
  editAlertInSummary,
  exportData,
  importData,
  exportMaintenanceCSV,
  exportRoutinesCSV,
  filterCatalogDropdown,
  goToRoutine,
  hideCatalogDropdown,
  hideMaintenanceCompleteForm,
  hidePackProductDropdown,
  importMaintenanceCSV,
  importRoutinesCSV,
  lightboxNav,
  markItemEmpty,
  moveRoutineStep,
  navAuthClick,
  onPackComponentInput,
  openCatalogDropdown,
  openPackEditor,
  openPackProductDropdown,
  openRetailerEditor,
  removeCustomCategorySection,
  removePackDraftRow,
  removeRetailer,
  removeRoutineAlert,
  removeRoutineStep,
  removeScheduleEntry,
  removeStepProduct,
  renderWashReminderCards,
  requestMagicLink,
  requestSlugRename,
  resetEverything,
  resetInventory,
  resetMaintenance,
  resetNotifications,
  resetPrefs,
  resetRoutines,
  saveAlert,
  saveAlertFromSummary,
  saveChecklistAlert,
  saveCustomCategories,
  saveInvAdjust,
  saveInvEquipDate,
  saveMaintenance,
  saveMaintenanceComplete,
  saveNewProduct,
  savePackDraft,
  saveProductDefaults,
  saveProductName,
  saveRetailerUrl,
  saveRoutines,
  saveSettings,
  sendWashReminderToTickTick,
  showCustomCategoryDeleteConfirm,
  showDeleteProductConfirm,
  showMaintenanceCompleteForm,
  showMaintenanceDeleteConfirm,
  showMaintenanceLogDeleteConfirm,
  showRemoveRetailerConfirm,
  showRoutineDeleteConfirm,
  signOut,
  toggleAddProductForm,
  toggleAlertForm,
  toggleChecklistAlert,
  toggleInvAddProductForm,
  toggleInvAdjustForm,
  togglePackForCard,
  toggleProductNameForm,
  toggleProductSlugForm,
  toggleRoutineType,
  updateCustomCategoryLabel,
  updateCustomCategorySection,
  updateMaintenanceItem,
  updatePackDraftField,
  updateRoutineAlert,
  updateRoutineMeta,
  updateRoutineStep,
  updateScheduleField,
  updateStepProduct,
});

export async function init() {
  const ttParam = new URLSearchParams(location.search).get('ticktick');
  if (ttParam === 'connected' || ttParam === 'error') {
    history.replaceState({}, '', location.pathname);
    if (ttParam === 'connected') document.querySelector('.tab[data-tab="settings"]')?.click();
  }

  setupChecklist();
  setupPhotoUploadUI();
  document.addEventListener('keydown', (e) => {
    const lb = document.getElementById('lightbox');
    if (lb && !lb.hidden) {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') lightboxNav(-1);
      else if (e.key === 'ArrowRight') lightboxNav(1);
      return;
    }
    const pe = document.getElementById('pack-editor-modal');
    if (pe && !pe.hidden && e.key === 'Escape') {
      cancelPackEdit();
      return;
    }
    const re = document.getElementById('retailer-editor-modal');
    if (re && !re.hidden && e.key === 'Escape') closeRetailerEditor();
  });
  await loadChecklist();
  await loadCategories();
  // Hydrate pack data from the last successful GET /api/products before loadInventory()
  // renders — otherwise a checklist check-off during a brief backend outage would silently
  // fail to expand a pack's components, since packs are no longer a hardcoded constant.
  state.bundleComponents = (await storageGet(BUNDLE_COMPONENTS_CACHE_KEY)) ?? {};
  await loadInventory();
  await loadLog();
  await loadRoutines();
  await loadMaintenance();
  await loadSettings();
  await loadAlerts();
  // Restore cached auth state immediately so the nav/settings UI shows
  // signed-in without waiting for the /api/auth/me round-trip.
  const cachedAuth = await storageGet(AUTH_CACHE_KEY);
  if (cachedAuth?.email) {
    state.syncEnabled = true;
    state.syncEmail = cachedAuth.email;
    renderAuthUI();
  }
  await checkAuthAndSync();
  updateFooterVersion();
  loadPriceData();
  loadWeather();
}

setupLog();
setupNav();
setupSettings();
init();
