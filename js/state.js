// Shared mutable app state. ES module bindings are read-only to importers, so everything that
// gets reassigned lives on this one object (read and write as `state.x`).
import { DEFAULT_NOTIFICATIONS, DEFAULT_PHASES, DEFAULT_PREFS, DEFAULT_ROUTINES, FREQ_DEFAULTS } from './data.js';

export const state = {
  // Auth / sync
  syncEnabled: false,
  syncEmail: null,
  isAdmin: false, // from /api/auth/me; only the admin can change the product catalogue and categories
  adminUsers: [], // GET /api/admin/users, for Settings → Users (admin only)
  ticktickIsConnected: false,
  lastSyncedAt: null,

  // Settings and alerts
  settings: {
    freq: { ...FREQ_DEFAULTS },
    prefs: { ...DEFAULT_PREFS },
    car: { model: '', year: '', colour: '', rego: '', displayName: '' },
    notifications: { ...DEFAULT_NOTIFICATIONS },
    schedules: [],
  },
  priceAlerts: {},
  weatherCache: null,

  // Routines
  routines: JSON.parse(JSON.stringify(DEFAULT_ROUTINES)),
  routineDragSrc: null,
  _catalogDropdownInput: null,

  // Maintenance
  maintenanceItems: [],
  maintenanceLog: [],
  maintenanceDragSrc: null,

  // Checklist and inventory
  checklistState: { phases: DEFAULT_PHASES.map((p) => ({ ...p, items: [...p.items] })), nextId: 5, checked: {} },
  itemData: [], // rebuilt by renderChecklist()
  inventoryState: {}, // { [slug]: { purchaseDate, volumeMl, usagePerWashMl, remainingMl, manualOverride } }
  invCatDragSrc: null,
  allCategories: [],
  bundleComponents: {},

  // Prices and products
  liveProducts: [],
  slugToBest: {},
  priceHistories: {}, // productId → [{ retailer, priceCents, onSale, observedAt }, ...]
  // Guards against an older loadPriceData() response landing after a newer one (e.g. deleting
  // several products in quick succession) and clobbering liveProducts with stale data.
  priceDataRequestSeq: 0,
  packDrafts: {}, // productId → in-progress array of component drafts, while editing
  activePackEditorId: null, // productId currently open in #pack-editor-modal, or null
  activeRetailerEditorId: null, // productId currently open in #retailer-editor-modal, or null
  _packDropdownInput: null,

  // Wash log and photos
  washLog: [],
  openMenuId: null,
  editingEntryId: null,
  pendingEntryId: null,
  pendingPhotos: [],
  photosByEntryId: {},
  lightboxEntryId: null,
  lightboxIndex: 0,
};
