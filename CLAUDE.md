# CLAUDE.md

Guidance for Claude Code when working in this repository. Why things are the way they are lives in [docs/decisions.md](docs/decisions.md); scraper lessons in [docs/scraper-learnings.md](docs/scraper-learnings.md), the backlog in [docs/tasks.md](docs/tasks.md) — read that before touching any scraper.

## What this app is

A personal detailing kit-and-technique guide for a 2025 Toyota Corolla Hatch Hybrid ZR (Australian market), built around the Bowden's Own range plus a few exceptions (303 Aerospace Protectant, Kärcher pressure washer). Prices are tracked at Australian retailers (Supercheap Auto and Auto Barn) in AUD. One user, one owner account.

Tabs (`index.html`):
- **log** — wash sessions, streaks, reminder cards, weather hints. Sub-tabs: History, New Session, Edit Session (only while editing).
- **routine** — customisable wash routines. Sub-tabs: Routines (read-only), Schedules (reminder intervals), Configure (editor cards, CSV import/export, drag reorder).
- **maintenance** — mechanical maintenance. Sub-tabs: Upcoming, Schedule, History, Configuration.
- **inventory** — Sub-tabs: Inventory (stock + depletion), Checklist (kit purchase phases), Prices (read-only price sheet + alerts), Products (product identity, retailer URLs, categories, packs — never shows prices).
- **guide** — per-product technique reference (mostly static HTML).
- **refs** — external links.
- **settings** — display prefs, vehicle details (postcode, odometer), notifications (TickTick + email), categories, data management. Most sections are hidden when signed out.

## Layout

```
index.html, styles.css, CNAME, js/     # frontend — the only files deployed to GitHub Pages (js/ = ES modules)
cloudflare/api-proxy-worker.js          # reference copy of the /api proxy Worker (NOT auto-deployed)
backend/src/
  index.ts            # Hono server + node-cron (07:00 wash reminder, 08:00 digest — UTC)
  db/                 # schema.ts, init.ts (tables + migration-safe ALTERs), seed.ts (catalogue), connection.ts
  routes/             # products, prices, alerts, auth (+ sync), admin (users + invites), weather, photos, ticktick
  scrapers/           # supercheap, autobarn, fetch-scraper (shared), entry points below
  lib/                # auth (sessions, admin), email (Resend + notification recipients), notifications (cron jobs), ticktick, r2, browser, sale-detector
backend/test/          # Vitest smoke tests (seed, price ingestion, product routes, access control, per-user notifications)
.github/workflows/
  ci.yml                         # typecheck, lint, format check, tests
  deploy.yml                     # Pages deploy; injects BACKEND_URL + build date into js/config.js, versions module URLs
  scrape.yml                     # daily Supercheap → run-and-push.ts
  scrape-supercheap-tuesday.yml  # Super Saver Tuesday sale window → run-and-push.ts
  scrape-autobarn.yml            # daily 05:00 UTC, self-hosted runner → run-autobarn.ts
```

## Commands (from `backend/`)

```bash
npm run dev          # tsx watch
npm run db:init      # create tables (idempotent)
npm run seed         # upsert catalogue + retailer URLs
npm run scrape       # Supercheap + Auto Barn → local DB (local only)
npm run scrape:push  # Supercheap → POST to backend (what GitHub Actions runs)

npm run typecheck    # tsc --noEmit
npm run lint         # ESLint over backend, frontend and the Worker (runs from the repo root)
npm run format       # Prettier (JS/TS/CSS only — HTML/Markdown/YAML/JSON are hand-formatted)
npm test             # Vitest, each file against a throwaway SQLite DB
```

Locally the DB falls back to `file:./db.sqlite` when `TURSO_URL` is unset. `ci.yml` runs typecheck, lint, format:check and tests on every push and PR — keep them green. All dev tooling lives in `backend/package.json`; there's no root package. Every scrape workflow runs `npm ci`, so **any dependency change must update `backend/package-lock.json`** or the scrapers break.

## Hosting

- **Frontend:** GitHub Pages at `https://corolla.jhosan.top`. `deploy.yml` copies only `index.html`, `styles.css`, `CNAME` and `js/` into `_site/` — add any new top-level frontend file to that list or it won't ship. It then stamps every module import with `?v=<sha>` so a deploy is atomic for cached browsers; keep imports in the form `from './name.js'` so that `sed` matches them.
- **API proxy:** a Cloudflare Worker routed at `corolla.jhosan.top/api/*` forwards to Render, making the session cookie first-party. The deployed Worker is a plain dashboard-created Worker; editing `cloudflare/api-proxy-worker.js` does **not** redeploy it — re-paste into the dashboard. **Never** use Cloudflare's "Import a repository" flow for it (see decisions). Health check: `curl -s https://corolla.jhosan.top/api/health` should return Render's JSON with an `X-Render-Origin-Server: Render` header.
- **Backend:** Render free tier, `npm start` (init → seed → server). A cron-job.org monitor pings `/api/health` every 10 min so node-cron keeps firing; if reminders or the digest stop, check that first.
- **Database:** Turso (libSQL). Render needs `TURSO_URL` + `TURSO_TOKEN` or price history is wiped on restart.
- **Self-hosted runner:** `debian-server` (home machine, user `jhadmin`) runs the Auto Barn scrape from a residential IP. Playwright system libs must be installed there once (see docs/scraper-learnings.md).

### CORS

`backend/src/index.ts` allows `https://osann.github.io` and `https://corolla.jhosan.top`, `credentials: true`, methods `GET POST DELETE PUT PATCH OPTIONS`. **Adding a new HTTP verb means adding it here** — a missing verb fails only that request type, silently. Change the allowlist before changing the domain.

### Environment variables

Render: `TURSO_URL`, `TURSO_TOKEN`, `SCRAPE_SECRET`, `RESEND_API_KEY`, `RESEND_FROM` (verified Resend domain), `OWNER_EMAIL` (required — the admin account; without it nobody is admin and nobody new can be invited; no fallback), `APP_URL`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` (no trailing slash), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `TICKTICK_CLIENT_ID`, `TICKTICK_CLIENT_SECRET`, `BACKEND_PUBLIC_URL` (Render URL, builds the OAuth redirect URI).

GitHub secrets: `BACKEND_URL` (= `https://corolla.jhosan.top`, i.e. through the proxy), `SCRAPE_SECRET` (must match Render).

## Database

Drizzle + `@libsql/client`. Tables (`backend/src/db/schema.ts`):

- `products` — `id, name (unique), slug (unique), phase, is_pack, default_volume_ml, default_usage_per_wash_ml, created_at`. Phase 0 = priced but not in the default checklist. The two `default_*` columns are nullable overrides of the frontend's `INVENTORY_DEFAULTS`.
- `retailer_urls` — one row per product per retailer, full URL.
- `price_history` — append-only `product_id, retailer, price_cents, on_sale, observed_at`.
- `pack_components` — components of a pack product. `component_product_id` null = free-text component placed by `section_category`/`section_label`. Packs can't contain packs.
- `deleted_products` — tombstones by slug so `seed()` never resurrects a product deleted in the UI. `POST /api/products` clears a matching tombstone.
- `users` (`joined_at` is set on first sign-in; null means invited but not yet signed in), `magic_tokens` (single-use; 15 min for a sign-in link, 7 days for an invite), `sessions` (30-day), `photos`.
- `user_data` — per-user key/value JSON for all synced app state. A key must be in `ALLOWED_KEYS` (`routes/auth.ts`) to sync. `ticktick-oauth-v1` is deliberately **not** in it — tokens never reach the client.
- `shared_data` — key/value JSON every account shares and only the admin can change; the keys are listed in `SHARED_KEYS` (`routes/auth.ts`, mirrored in `js/config.js`). Currently only `corolla-categories-v1`. These keys sync through the same endpoints: `GET /api/sync` merges them over the user's rows, and `POST /api/sync/:key` returns 403 to anyone but the admin. `initDb()` moved the owner's categories here once.

Rules:
- **Catalogue writes are admin-only.** The admin is whoever signs in as `OWNER_EMAIL` (`isAdminEmail()` in `lib/auth.ts`; it isn't stored in the DB). Any route that changes products, retailer URLs or packs goes behind `sessionMiddleware, requireAdmin`. `sessionMiddleware` alone only identifies the caller; it never rejects anyone.
- **Deletes are explicit.** `foreign_keys` is never enabled on libSQL, so `ON DELETE CASCADE` isn't relied on: handlers delete `pack_components` → `price_history` → `retailer_urls` → `products` themselves. Do the same in any new delete path.
- **`seed()` must stay crash-proof.** It looks up by slug, then by name, then inserts, and skips tombstoned slugs. Startup runs it on every Render boot.
- To add a catalogue product: add it to `CATALOG` in `js/data.js` **and** `seed.ts`. Products can also be added at runtime from the Products tab (backend-only, no `CATALOG` entry) — all frontend lookups go through `getAllProductSlugs()` / `resolveProductName()` / `resolveCatalogEntry()` so both kinds work.
- Deleting a built-in product removes backend price tracking only; it stays in the static `CATALOG`, default phases, and routines.

## Scrapers

| Retailer | Where it runs | Entry point | Notes |
|---|---|---|---|
| Supercheap | GitHub Actions (hosted) | `run-and-push.ts` | Playwright. Daily + Tuesday sale window. |
| Auto Barn | Self-hosted runner | `run-autobarn.ts` | Blocks all cloud IPs. Pushes in batches of 10. Don't re-enable `playwrightFallback`. If its runs show "cancelled", the runner on `debian-server` is offline (GitHub cancels jobs no runner picks up within 24 h). |

- **Repco, Autopro and Bowden's Own are retired**: they're bot-blocked, and their code, URLs and price history were removed on 2026-10-21. [docs/blocked-retailers.md](docs/blocked-retailers.md) has the selectors, how to check whether a block has lifted, an archive of every URL, and restore steps. `initDb()` deletes any rows for `RETIRED_RETAILERS` on every boot, and `POST /api/prices` skips them. Don't add URLs for them.
- The accepted retailers live in one list, `RETAILERS` in `backend/src/db/schema.ts`. The frontend mirrors it in `SCRAPED_RETAILERS`/`RETAILER_NAMES` (`js/data.js`).
- The ephemeral runners (Actions + self-hosted) have no Turso credentials. They get the product/URL list from the live API via `fetchRowsFromBackend()` and POST results to `POST /api/prices` (Bearer `SCRAPE_SECRET`). Their local SQLite is schema-only, so the workflows run `db/init.ts` and **no seed**.
- Ingestion matches observations to products by **slug**.
- Playwright: no named functions inside `page.evaluate()`; use `waitUntil: 'domcontentloaded'`; never select `[itemprop="price"]`. More in docs/scraper-learnings.md.

## Frontend (`js/`)

Vanilla JS as native ES modules: no framework, no bundler, no build step. `index.html` loads `js/main.js` with `<script type="module">`. Because of that, the page must be served over HTTP; opening it as `file://` won't work.

Modules:
- **Leaf modules** (`config.js`, `data.js`, `state.js`) import nothing from feature modules.
  - `config.js` holds the backend URL, build date and storage keys.
  - `data.js` holds `CATALOG`, defaults, templates, `INV_CATEGORIES`, `SLUG_FAMILIES` and so on.
  - `state.js` holds all mutable shared state.
- **Shared modules:** `storage.js`, `util.js`, `catalog.js` (product lookups and the category model).
- **One module per feature:** `checklist`, `inventory`, `prices`, `products`, `categories` (Settings editor), `log`, `photos`, `routines`, `schedules`, `weather`, `maintenance`, `settings`, `auth`, `nav`.
- **Entry point:** `main.js`.

Rules:
- **Shared state lives on `state` (`js/state.js`)**, accessed as `state.routines`, `state.settings` and so on. Importers can't reassign an imported binding, so any module-level variable that gets reassigned belongs on `state`. Constants stay as plain exports.
- **Nothing runs at import time** except constant initialisers that read only `config`/`data`/`state`. DOM wiring goes in a `setup*()` function called from `main.js` before `init()`. Feature modules import each other in cycles, which is only safe because of this rule.
- **Inline handlers need `window`.** Rendered HTML uses `onclick="fn(...)"`, which resolves against `window`, not module scope. Any function called from an `on*=` attribute (in `index.html` or a template string) must be added to the `Object.assign(window, { … })` list in `main.js`. A missing entry fails silently until the button is clicked; ESLint can't catch it.

Conventions:
- All persistence via `storageGet(key)` / `storageSet(key, val)`; signed-in writes also `syncPush(key, val)`.
- `render*()` writes DOM from state; `apply*()` adjusts DOM for settings.
- `__BACKEND_URL__` / `__BUILD_DATE__` are replaced by `sed` in `deploy.yml`. Guard with `BACKEND_URL.startsWith('__')` — **never** `=== '__BACKEND_URL__'`, because the global `sed` would rewrite the comparison too.
- Confirmations are inline confirm rows, not `confirm()`. Exceptions: Settings reset buttons and deleting a non-empty category section.
- The app must work without the backend: live prices, sync, photos and weather enhance, never gate.

Load order:
- `init()`: `setupChecklist → loadChecklist → loadCategories → (hydrate bundleComponents from cache) → loadInventory → loadLog → loadRoutines → loadMaintenance → loadSettings → loadAlerts → checkAuthAndSync → loadPriceData + loadWeather` (the last two non-blocking).
- `checkAuthAndSync()` after pulling remote data: `loadRoutines → loadMaintenance → loadChecklist → loadCategories → loadInventory → loadLog → loadSettings → loadAlerts → renderWashReminderCards`. Routines must load before settings (reminder cards need `routines[]`).
- On a failed `/api/auth/me`, reset `syncEnabled = false`, `syncEmail = null` **and** `isAdmin = false` before `renderAuthUI()`; any new early return must do the same, or the UI shows signed-in (or admin) controls that 401.
- `renderInventory()` runs before `liveProducts` arrives, so `loadPriceData()` re-runs `rebuildBundleComponents()`, `renderInventory()` and `renderProductsPage()` once it lands, then `loadPriceHistories()` → `renderPricesTab()`. `priceDataRequestSeq` discards out-of-order responses.

Auth:
- `renderAuthUI()` is the single place that shows/hides signed-in UI.
- `corolla-auth-v1` caches auth (`{ email, isAdmin }`) for an instant signed-in render on reload.
- `state.isAdmin` comes from `/api/auth/me`. `syncPush()` silently skips `SHARED_KEYS` unless it's true, so a regular user's local edits to shared data never reach the server.
- `signOut()` clears every synced key plus the auth and pack caches, then reloads.

### Storage keys

| Key | Shape |
|---|---|
| `corolla-checklist-v3` | `{ phases: [{id, tag, title, items: slug[]}], nextId, checked: {[slug]: bool} }` |
| `corolla-washlog-v1` | `[{id, date, type, steps[], notes}]` — `type` is a routine id (legacy entries: `full`/`quick`/`interior`/`both`) |
| `corolla-settings-v1` | `{ freq, prefs, car: {model, year, colour, rego, displayName, postcode, currentOdometer}, notifications, schedules: [{routineId, intervalValue, intervalUnit}] }` |
| `corolla-price-alerts-v1` | `{ [slug]: { thresholdCents, channel: 'global'\|'ticktick'\|'email' } }` |
| `corolla-routines-v1` | `[{ id, name, subtext, types[], steps: [{name, action, enabled?, products: [{name, ml}]}], alerts: [{severity, label, text}] }]` |
| `corolla-maintenance-v1` | `[{ id, name, notes, intervalType: 'time'\|'odometer', intervalValue, intervalUnit, intervalKm, lastCompletedDate, lastCompletedOdometer, enabled }]` |
| `corolla-maintenance-log-v1` | `[{ id, itemId, itemName, date, odometer }]`, newest first |
| `corolla-inventory-v1` | `{ [slug \| 'packSlug:componentName']: {purchaseDate, volumeMl, remainingMl, manualOverride}, _order: categoryLabel[] }` |
| `corolla-categories-v1` | `[{ label, sections: [{ label, slugs[] }] }]` — shared by all accounts, admin-edited (`shared_data`) |
| `corolla-pack-components-v1` | cache of `bundleComponents` for offline pack expansion |
| `corolla-budget-v1`, `corolla-category-overrides-v1`, `corolla-custom-categories-v1` | legacy — read once for migration or only cleared; never written |

Bump the version suffix on breaking shape changes; `load*()` functions migrate forward from older keys.

**Adding a new synced store** means first deciding whether it's personal or shared. A shared store goes in `SHARED_KEYS` (backend `routes/auth.ts` and `js/config.js`), not `ALLOWED_KEYS`, and stays out of `resetEverything()`. Then update all of these:
- `ALLOWED_KEYS` in `backend/src/routes/auth.ts` (personal stores);
- the pull list in `checkAuthAndSync()`;
- the clear lists in `signOut()` and `resetEverything()`;
- `BACKUP_KEYS` in `js/settings.js`. That's the Settings → Data management export/import, which restores to the server before touching local storage, because on reload the server copy wins. `settings.freq` has no UI any more but `calcNextDue('beadMachine')` still reads it (with defaults) for the heat banner.

### Categories

`allCategories` (from `corolla-categories-v1`) is the single editable grouping used by Prices, Products, Inventory, the Checklist picker and the routine step picker. It's shared by every account and only the admin edits it (see `shared_data`); signed-out guests use a local seed. A product's category is whichever section's `slugs` contains it. First load seeds from `INV_CATEGORIES` and migrates the two legacy keys; nothing else reads `INV_CATEGORIES`. Helpers: `getCategoryAssignment()`, `changeProductCategory()`, `groupSlugsByCategory()`, `_buildCatalogGroups()` (collapses size variants via `SLUG_FAMILIES` for routine steps, which reference products by name).

**Prices, Inventory and Products each render a trailing "Other" card** for uncategorised products. Don't remove it from any of the three — without it those products are tracked but invisible (this has regressed twice).

### Routines and reminders

- `routines[]` is the source of truth; `saveRoutines()` re-renders the view, config cards, log routine select and schedules.
- Log step chips come from the selected routine's steps (`renderStepChipsForRoutine`).
- `entryMatchesSchedule(entry, schedule)` matches by routine id, or by legacy type against the routine's `types`. The backend mirrors this in `routineMatchesLog()` (`lib/notifications.ts`); keep them in sync.
- Streaks hold when it's raining today; reminder cards show the best dry day when rain is forecast within 2 days of the due date.
- CSV format (routines): `row_type` first; `routine` rows followed by their `step`/`alert` rows. Import appends with fresh ids.

### Maintenance

Time- or odometer-based items. `lastCompleted*` is derived from the log: deleting a history entry recalculates it from the remaining entries. Due-soon = 14 days or 2,000 km. `settings.car.currentOdometer` is raised (never lowered) from Vehicle details, the New Session form, and Mark Complete.

### Inventory and packs

- Stock is keyed by slug, or `packSlug:componentName` for free-text pack components.
- `decrementInventoryForSession()` walks a saved log entry's steps → routine step `products[{name, ml}]` → `resolveInventoryKey()` (direct slug → pack expansion → `SLUG_FAMILIES` sibling). `EQUIPMENT_SLUGS` never deplete.
- Volume defaults: product's backend `defaultVolumeMl`/`defaultUsagePerWashMl`, else `INVENTORY_DEFAULTS`. "Sessions remaining" prefers actual routine usage (`getRoutineUsageMl`).
- `bundleComponents` is rebuilt from `GET /api/products` (`isPack`, `components`).

### Products sub-tab

`renderProductsPage()`. Product CRUD functions call both `renderPricesTab()` and `renderProductsPage()`. Retailer URLs and pack contents are edited in modals (`#retailer-editor-modal`, `#pack-editor-modal`); the pack editor keeps unsaved edits in `packDrafts` until "Save pack".

Renames reach every account. `PATCH /products/:id` rewrites each user's stored data itself (`backend/src/lib/rename.ts`): a slug change updates the checklist, inventory, price alerts and the shared categories, and a name change updates routine steps. The admin's browser then repeats the same rewrite locally so the screen updates without a reload; keep the two in sync. Slug rename (`confirmSlugRename` → `renameProductSlugEverywhere`) rewrites categories, checklist phases + checked map, inventory keys and alert keys, then refetches products. It writes the checklist with a raw `storageSet`/`syncPush`, **not** `saveChecklist()` — that would rebuild `checked` from the stale `itemData` snapshot and undo the rename.

### Photos

`POST/GET/DELETE /api/photos`, stored in Cloudflare R2 (public bucket, `R2_PUBLIC_URL/photos/{userId}/{logEntryId}/{uuid}.jpg`), with sharp 400px thumbnails and EXIF stripped. The ✕ remove button only renders on the entry being edited. After saving an edit, photos are re-fetched to catch uploads that finished after the click.

## Accounts

Invite-only. The admin is whoever signs in as `OWNER_EMAIL`; everyone else is a regular user with their own data.
- `POST /api/auth/request` only sends a link to an existing account, plus the admin (whose row is created on first sign-in). Any other address gets the same silent `{ ok: true }`, so it can't be used to find out who has an account.
- `POST /api/admin/invites { email }` creates a pending user (`joined_at` null) and emails a 7-day magic-link token. The response also carries the link, plus `emailed: false` if Resend rejected the email, so the admin can share it another way. Posting again resends, and the new link replaces the old one. Accepting is an ordinary `?token=` sign-in, and the first sign-in sets `joined_at`.
- `DELETE /api/admin/users/:id` removes a user and everything they own (R2 photos, then `photos`, `user_data`, `sessions`, `magic_tokens`, `users`). The admin can't be removed.
- Everything in `routes/admin.ts` sits behind one `router.use('/admin/*', sessionMiddleware, requireAdmin)`, so new admin routes are guarded automatically.

## Notifications

Channels are TickTick (OAuth, per user; tokens in that user's `user_data` under `ticktick-oauth-v1`, auto-refreshed) and email (Resend). The TickTick callback lands on Render directly, without the session cookie, so it only accepts a `state` that `/ticktick/auth` issued in the last 10 minutes (held in memory). The state also records which user started the flow, and the tokens are stored for that user. Settings live in `settings.notifications`, and per-product thresholds in `corolla-price-alerts-v1`.

Triggers:
1. **Sale alert:** the product transitions to on-sale during `POST /api/prices`.
2. **Threshold alert:** the price crosses at or below the product's threshold during `POST /api/prices`.
3. **Wash reminder:** 07:00 UTC cron, per `settings.schedules`.
4. **Daily digest:** 08:00 UTC cron, email only, sent only when there's something to report.

All of them go to each user separately, using that user's own settings, thresholds and TickTick connection. `getNotificationRecipients()` (`lib/email.ts`) returns every user who has signed in at least once (`joined_at` set); pending invites get nothing. The two cron jobs live in `lib/notifications.ts` (`runWashReminders`, `runDailyDigest`). They catch errors per user, and `index.ts` adds a `.catch` because an unhandled rejection would crash Node.

Testing:
- **Price alert:** POST a below-average or compare-at price for a product whose previous row wasn't on sale.
- **Cron:** temporarily set the schedule to `* * * * *`, deploy, wait a minute, revert.

## Weather

The frontend calls `GET /api/weather?postcode=`. The backend geocodes with Nominatim (AU postcode), fetches a 7-day forecast from Open-Meteo, and caches it for 3 hours. It drives the rain-delay card, the Bead Machine heat banner (≥35 °C and due within 14 days), streak holds and best-wash-day. BOM can't be used (see decisions).

## CSS

- Tokens live on `:root` with `prefers-color-scheme: dark` overrides. Reuse existing tokens; don't add new colours or size scales.
- Fonts: Fraunces (headings), Inter (body). Accent is forest green `#2d7d5a`.
- `[hidden] { display: none !important; }` at the top of `styles.css` is load-bearing: it stops `display: flex` rules from overriding `hidden`.

## Things to preserve

1. **Aesthetic restraint.** Quiet, minimalist; prose over dashboards and gauges.
2. **Australian-specific.** Retailers, prices and sale timing are AU; don't generalise.
3. **Bowden's-first.** Non-Bowden products are exceptions.
4. **Graceful degradation.** The app works without the backend.
5. **Phases are user-defined.** The defaults are an acquisition plan (essentials → complete kit → bulk → long-term). Don't assume a count or ids.
