# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

A personal detailing kit-and-technique guide for a 2025 Toyota Corolla Hatch Hybrid ZR (Australian market). Built around the Bowden's Own product ecosystem with a few non-Bowden additions (303 Aerospace Protectant, Kärcher pressure washer). All retailer references are Australian (Supercheap Auto, Repco, Auto Barn, Autopro) and pricing is in AUD.

The app has seven tabs:
- **log** — wash session log with streak counter, reminder cards, and weather hints; three sub-tabs: "History" (default), "New Session", and "Edit Session" (hidden unless editing a past entry)
- **routine** — fully customisable wash routines; three sub-tabs: "Routines" (read-only rendered view), "Schedules" (per-routine reminder interval config), and "Configure" (editor cards for name/subtext/type/steps/alerts, CSV import/export, drag reorder, log step chips)
- **maintenance** — mechanical maintenance tracker; four sub-tabs: "Upcoming" (overdue/due-soon/never-done cards with inline Mark Complete), "Schedule" (full read-only table), "History" (completion log with inline delete), and "Configuration" (editable item cards, CSV import/export, drag reorder)
- **inventory** — product stock and spend tracker; three sub-tabs: "Inventory" (stock levels with progress bars, depletion forecast, drag-to-reorder categories, direct "+ Add product"), "Checklist" (kit purchase tracker, customisable phases, product prices), "Prices" (price sheet with sparklines, sale badges, price alert thresholds, and full product lifecycle — add/rename/delete products, add/remove retailers, per-product category reassignment). The standalone Summary sub-tab was removed; its budget UI (`BUDGET_KEY`/`loadBudget()`/`saveBudget()`) is dead code still present in `app.js` with no corresponding DOM element.
- **guide** — per-product technique reference (mostly static)
- **refs** — links to manufacturer pages and community resources
- **settings** — display preferences, notification config (TickTick + email), vehicle details (incl. postcode for weather and current odometer). Wash frequency config has moved to Routines → Schedules; routine step chips are in Routines → Configure. Data management includes targeted resets for routines and maintenance. When signed out: Vehicle details, Notifications, Display preferences, and Data management sections are hidden.

## Current architecture

```
corolla-zr-maintenance-app/
├── index.html              # App shell — HTML structure only
├── app.js                  # All frontend JS (vanilla, no framework)
├── styles.css              # All CSS
├── backend/
│   ├── src/
│   │   ├── index.ts        # Hono server + node-cron: Autopro scrape (05:00 UTC), wash reminder (07:00 UTC), price digest (08:00 UTC)
│   │   ├── db/
│   │   │   ├── schema.ts   # Drizzle schema (products, retailer_urls, price_history, users, sessions, magicTokens, userData, photos)
│   │   │   ├── seed.ts     # Product catalogue + retailer URLs — edit this to add products
│   │   │   ├── init.ts     # Creates tables + runs seed
│   │   │   └── connection.ts
│   │   ├── routes/
│   │   │   ├── products.ts  # GET /api/products — all products with latest prices per retailer
│   │   │   │                # GET /api/products/prices — bulk price history (all products, 90-day window)
│   │   │   │                # GET /api/products/:id/prices — single product price history
│   │   │   │                # POST /api/products, PATCH /api/products/:id (rename), DELETE /api/products/:id
│   │   │   │                # PUT /api/products/:id/url, DELETE /api/products/:id/url/:retailer — all session-protected
│   │   │   ├── prices.ts    # POST /api/prices — ingest scraper results
│   │   │   ├── alerts.ts    # GET /api/alerts, GET /api/prices/current, POST /api/notify/wash-reminder
│   │   │   ├── auth.ts      # Auth + sync: POST /api/auth/request|verify|logout, GET /api/auth/me, GET|POST /api/sync
│   │   │   ├── weather.ts   # GET /api/weather?postcode= — Nominatim geocoding + Open-Meteo forecast, 3h cache
│   │   │   ├── photos.ts    # POST /photos/upload, GET /photos, DELETE /photos/:id (session-protected; R2 storage via sharp)
│   │   │   └── ticktick.ts  # GET /api/ticktick/auth|callback|status|projects, DELETE /api/ticktick/disconnect
│   │   ├── scrapers/
│   │   │   ├── fetch-scraper.ts # createFetchScraper() factory — shared plain-fetch logic for Auto Barn + Autopro
│   │   │   ├── autobarn.ts      # thin wrapper — self-hosted runner only (residential IP), HTTP-only (~16–18/40)
│   │   │   ├── autopro.ts       # thin wrapper — scraped via Render cron at 05:00 UTC
│   │   │   ├── supercheap.ts
│   │   │   ├── repco.ts
│   │   │   ├── index.ts         # scrapeAllRetailers() — unused in production (kept for local use)
│   │   │   ├── run-and-push.ts  # GitHub Actions entry point: Supercheap + Repco → POST to backend
│   │   │   └── run-autobarn.ts  # Self-hosted runner entry point: Auto Barn → POST to backend
│   │   └── lib/
│   │       ├── browser.ts       # createStealthContext() — shared Playwright setup
│   │       ├── sale-detector.ts
│   │       ├── auth.ts          # generateToken, hashToken, sessionMiddleware
│   │       ├── email.ts         # sendMagicLink(), sendDirectEmail(), sendDigestEmail(), getOwnerNotificationSettings(), getOwnerAlertThresholds() via Resend
│   │       ├── ticktick.ts      # TickTick REST API client: createTickTickTask(), getValidToken(), storeOAuthTokens(), fetchTickTickProjects(), isTickTickConnected(), disconnectTickTick()
│   │       └── r2.ts            # S3Client for Cloudflare R2; uploadToR2, deleteFromR2, getPublicUrl
│   └── package.json
└── .github/workflows/
    ├── deploy.yml                    # Deploys index.html/app.js/styles.css to GitHub Pages
    ├── scrape.yml                    # Daily: Supercheap + Repco (any time)
    ├── scrape-autobarn.yml           # Daily 05:00 UTC: Auto Barn via self-hosted runner (debian-server)
    └── scrape-supercheap-tuesday.yml # Tuesdays: Supercheap Super Saver sale scrape (5 PM + 11:59 PM AEST)
```

### Hosting

- **Frontend:** GitHub Pages, served via CNAME at `https://corolla.jhosan.top`. `deploy.yml` replaces the `__BACKEND_URL__` placeholder in `app.js` with the `BACKEND_URL` secret before deploying.
- **Backend:** Render. `npm start` runs the Hono server. Three node-cron jobs fire daily: 05:00 UTC (Autopro scrape, within robots.txt crawl window), 07:00 UTC (wash reminder — checks owner's wash log and sends via TickTick and/or email if overdue), 08:00 UTC (price digest — emails a summary of on-sale items and threshold breaches if the user has opted in). Auto Barn blocks Render's cloud IPs but is scraped via a self-hosted GitHub Actions runner on a home Linux machine (residential IP). Repco and Supercheap use Playwright which is not reliably available at Render runtime — those are handled entirely by GitHub Actions. Bowden's Own is not scraped — Cloudflare JS challenge on GitHub Actions, hard 403 on Render.
- **Self-hosted runner:** `debian-server` — a home Debian Linux machine running the GitHub Actions self-hosted runner under `jhadmin`. Its residential IP bypasses Auto Barn's cloud IP block. ~40–60% of Auto Barn product URLs hang server-side regardless of client method — Playwright was tried and also times out on those URLs. HTTP-only scraping gets ~16–18/40 products; the rest are covered by Autopro. Required system libraries for Playwright (used by Supercheap/Repco locally) must be installed once: `sudo apt-get install -y libgbm1 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxext6 libx11-xcb1 libpango-1.0-0 libasound2`.
- **Keep-alive:** Render free tier spins down after 15 minutes idle, which prevents node-cron from firing. A cron-job.org monitor pings `GET /api/health` every 10 minutes to keep the service awake. If the pinger ever lapses, recreate it at cron-job.org — no code changes needed.
- **Database:** Turso (cloud libSQL). Falls back to `file:./db.sqlite` locally when `TURSO_URL` is unset. Render requires `TURSO_URL` and `TURSO_TOKEN` env vars — without them price history is ephemeral (wiped on restart).

### CORS

The backend allows two origins: `https://osann.github.io` and `https://corolla.jhosan.top`. Both must be present in `backend/src/index.ts`. `credentials: true` is set so the session cookie can be sent cross-origin. `allowMethods` is `['GET', 'POST', 'DELETE', 'PUT', 'PATCH', 'OPTIONS']` — `PATCH` was added for product rename; forgetting it here silently breaks that one request type (browser preflight fails) while everything else keeps working, which makes it an easy miss when adding a new mutating verb. If the custom domain changes, update the CORS allowlist first or live prices and sync will silently fail to load.

### Environment variables (Render)

| Var | Purpose |
|---|---|
| `TURSO_URL` | `libsql://corolla-detailing-osann.aws-ap-northeast-1.turso.io` |
| `TURSO_TOKEN` | Auth token from Turso dashboard |
| `SCRAPE_SECRET` | Shared secret for `POST /api/prices` from GitHub Actions |
| `RESEND_API_KEY` | Resend API key for magic link emails |
| `RESEND_FROM` | `Corolla Detailing <sync@corolla.jhosan.top>` (must be a verified Resend domain) |
| `OWNER_EMAIL` | `joh.10@pm.me` — only this address gets a real email; others silently accepted |
| `APP_URL` | `https://corolla.jhosan.top` — base URL embedded in magic link |
| `R2_ACCOUNT_ID` | Cloudflare account ID for R2 |
| `R2_BUCKET_NAME` | R2 bucket name |
| `R2_PUBLIC_URL` | `https://jhosan.top` (no trailing slash) — base URL for public R2 object access |
| `R2_ACCESS_KEY_ID` | R2 API token key ID |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `TICKTICK_CLIENT_ID` | TickTick OAuth app client ID (developer.ticktick.com) |
| `TICKTICK_CLIENT_SECRET` | TickTick OAuth app client secret |
| `BACKEND_PUBLIC_URL` | Render service URL (no trailing slash) — used to build the OAuth redirect URI |

### GitHub secrets

| Secret | Purpose |
|---|---|
| `BACKEND_URL` | Injected into `app.js` at deploy time — Render service URL |
| `SCRAPE_SECRET` | Must match Render `SCRAPE_SECRET` env var |

## Backend commands

Run from the `backend/` directory:

```bash
npm run dev          # tsx watch — hot reload for development
npm run db:init      # Create tables (idempotent)
npm run seed         # Populate products and retailer URLs
npm run scrape       # Run all scrapers locally, write to local DB
npm run scrape:push  # GitHub Actions path: scrape Supercheap + Repco, POST to Render
```

## Database schema

Eight tables in SQLite via Turso (`@libsql/client` + `drizzle-orm/libsql`). Locally falls back to `file:./db.sqlite` when `TURSO_URL` is not set:

- **`products`** — `id, name, slug, phase, created_at`. Phase 0 = tracked for pricing but not shown in the kit checklist.
- **`retailer_urls`** — `product_id, retailer, url`. One row per product per retailer. Full URLs stored directly (templates don't work for Supercheap or Repco).
- **`price_history`** — `product_id, retailer, price_cents, on_sale, observed_at`. Append-only log of every scrape result.
- **`users`** — `id, email, created_at`. One row per authenticated user.
- **`magic_tokens`** — `id, token_hash, user_id, expires_at, used_at, created_at`. Single-use 15-minute auth tokens for magic link sign-in.
- **`sessions`** — `id, session_id, user_id, expires_at, created_at`. 30-day session cookies.
- **`user_data`** — `id, user_id, key, value_json, updated_at`. Generic key-value JSON store per user. One row per user per key. Stores all synced app state: checklist, wash log, budget, settings (including notification config). Keys must be in `ALLOWED_KEYS` in `routes/auth.ts` to be accepted by `POST /api/sync/:key`.
- **`photos`** — `id, user_id, log_entry_id (INTEGER — not a FK; wash log lives in user_data JSON), r2_key, thumb_key, mime_type, size_bytes, created_at`. Indexed on `(user_id, log_entry_id)`.

**To add a product or retailer URL**, edit `backend/src/db/seed.ts`. The seed is idempotent — re-running it upserts without duplicating. Run `npm run seed` to apply locally, or let the next Render deploy pick it up.

**Product lifecycle from the Prices tab:** `PATCH /api/products/:id` renames a product (rejects duplicate names); `DELETE /api/products/:id/url/:retailer` stops tracking one retailer (deletes its `retailer_urls` row and all matching `price_history`); `DELETE /api/products/:id` removes the product entirely. All three are session-protected. The schema declares `ON DELETE CASCADE` on `retailer_urls.product_id` and `price_history.product_id`, but the delete handlers don't rely on it — libSQL/Turso's `foreign_keys` pragma is never explicitly enabled, so cascade enforcement isn't guaranteed. Each handler deletes `price_history` then `retailer_urls` rows explicitly before deleting the `products` row. Deleting a built-in catalog product only removes its backend price tracking — it stays in the frontend's static `CATALOG`, checklist phases, routines, and category assignments (all slug-keyed, independent of the backend), and will reappear on the next deploy since `seed.ts` re-upserts the full catalog on every Render startup.

## Scraper architecture

Three execution paths — read `SCRAPER-LEARNING.md` before modifying any scraper:

1. **GitHub Actions hosted runner** (`run-and-push.ts`): calls `scrapeToArray()` which returns observations without writing to DB, then POSTs them to `POST /api/prices` on the Render backend. The local DB is always fresh on each run so the 12-hour cache check never skips anything here. Handles Supercheap and Repco.

2. **Render cron** (`scrapers/autopro.ts`): calls `scrapeAutopro()` which writes directly to the production DB via Turso. Fires at 05:00 UTC within the robots.txt crawl window (04:00–08:45 UTC). The 12-hour cache check (`wasRecentlyScraped()`) is effective here.

3. **Self-hosted runner** (`run-autobarn.ts`): calls `scrapeToArray(onProduct)` then pushes to Render in batches of 10 as they're scraped (not one bulk POST at the end — a mid-run crash on the self-hosted runner only loses the current partial batch, not the whole day's data). Runs on `debian-server` (home machine, residential IP) to bypass Auto Barn's cloud IP block. Fires daily at 05:00 UTC via `scrape-autobarn.yml`. `playwrightFallback` is disabled on `autobarn.ts` — it was tried and confirmed not to help (see `SCRAPER-LEARNING.md`); do not re-enable it.

Scraper order for GitHub Actions hosted runner: Supercheap → Repco (Repco is slower and more prone to rate-limiting).

**Auto Barn blocks all cloud IPs** — confirmed HTTP 403 from both GitHub Actions hosted runners and Render. It is scraped exclusively via the self-hosted runner on `debian-server`. Do not attempt to run the Auto Barn scraper from any cloud environment.

**Bowden's Own is not scraped.** Their site blocks all datacenter IPs — GitHub Actions gets a Cloudflare JS challenge on page loads; Render gets HTTP 403 on every request including the product pages themselves. All products that were previously tracked via Bowden's have Repco or Supercheap fallback URLs. Do not add a `bowdens` retailer entry to any product — it will never succeed from any cloud environment.

## Frontend architecture

`app.js` is vanilla JS, no framework. Key conventions:

- `storageGet(key)` / `storageSet(key, val)` — storage abstraction that tries `window.storage` (Claude artifact runtime) then falls back to `localStorage`. All persistence goes through these.
- `render*()` functions write to the DOM from state
- `apply*()` functions mutate the DOM based on current settings
- `init()` on load: `setupChecklist → loadChecklist → loadLog → loadBudget → loadRoutines → loadMaintenance → loadSettings → checkAuthAndSync → loadPriceData() + loadWeather()` (loadRoutines before loadSettings so renderWashReminderCards fires with routines already populated; price data and weather are non-blocking, called after sync so they use the post-sync postcode and settings)
- `itemData` array is rebuilt by `renderChecklist()` on every render — includes `slug`, `phase` (phase ID string), `price`, `el`, `input`
- `loadPriceData()` fetches `GET /api/products`, calls `applyLivePrices()` which updates `.item-price` text, adds 🔥 for on-sale items, updates `item.price` in memory, then calls `recompute()` so spend totals reflect live prices. Fails silently if backend is unreachable. Timeout is 40s (Render free tier cold start is ~30s).
- `loadPriceHistories()` is called from `loadPriceData()` after prices are applied. It fetches `GET /api/products/prices` (bulk, 90-day window) in a single call, populates `priceHistories` keyed by product ID, then calls `renderPricesTab()` (Inventory → Prices sub-tab). The old per-product `GET /api/products/:id/prices` endpoint is kept but no longer called by the frontend. `loadPriceData()` itself also calls `renderInventory()` right after `liveProducts` is populated — the Inventory tab renders once early during `init()` before this fetch resolves, so without this second call its add-product picker and "Other" card would never pick up backend-only products.
- `renderPricesTab()` renders the **Inventory → Prices** sub-tab. It builds a `productBySlug` lookup from `liveProducts` and iterates `allCategories` (see Category system) so cards always reflect the live, editable structure — a category card is skipped only if none of its products render anything. Each product renders as a `.prices-product` block: name (with an inline rename ✎ control and a per-product category `<select>`, both signed-in only), then one `.prices-retailer-row` per retailer with price, 🔥 Sale badge, sparkline (or "No data yet." placeholder at fixed dimensions), and either a Buy link plus edit (✎) / remove (✕) controls or a "+ URL" button. A product with no scraped price yet still renders — via the internal `renderProducts(slugs, allowPending)` helper's `allowPending` flag, now passed `true` everywhere — showing a "No price data yet" placeholder instead of being hidden, so a newly-added product gives immediate feedback rather than silently vanishing. Each product ends with a "Delete product" link behind an inline confirm row. Products not in any category land in a trailing "Other" card (see Category system). Each product name row also has a 🔔 bell button (`toggleAlertForm(slug)`) that opens an inline threshold form. At the end of `renderPricesTab()`, `renderAlertsPanel()` refreshes the active-alerts summary card at the top of the sub-tab (`#prices-alerts-summary`), hidden when no alerts are configured.
- **Product lifecycle (Prices tab, signed-in only):** "+ Add product" (`saveNewProduct()`) creates a backend-only product via `POST /api/products`; rename (`toggleProductNameForm()` / `saveProductName()`) calls `PATCH /api/products/:id` and also rewrites any routine step referencing the product's old name (routines match products by name, not slug — see Routine system); "+ Retailer" / edit-URL (`saveAddRetailerUrl()` / `saveRetailerUrl()`) call `PUT /api/products/:id/url`; remove-retailer (`removeRetailer()`, behind an inline confirm) calls `DELETE /api/products/:id/url/:retailer`; "Delete product" (`deleteProduct()`, behind an inline confirm) calls `DELETE /api/products/:id`. All mutate `liveProducts` in place on success rather than re-fetching.
- The `__BACKEND_URL__` guard uses `BACKEND_URL.startsWith('__')` — not strict equality. The `sed` substitution in `deploy.yml` replaces `__BACKEND_URL__` globally, which would corrupt a `=== '__BACKEND_URL__'` check into `=== '<real-url>'`. Never revert this to a string equality check.
- **Auth cache** (`corolla-auth-v1` in localStorage) — written after a successful `/api/auth/me` response so the signed-in UI state is restored immediately on reload without waiting for the network round-trip. Cleared on auth failure and on sign-out. Sign-out also clears `CHECKLIST_V3_KEY`, `LOG_KEY`, `BUDGET_KEY`, `SETTINGS_KEY`, `ALERTS_KEY`, `ROUTINES_KEY`, `MAINTENANCE_KEY`, `INVENTORY_KEY`, `CATEGORY_OVERRIDES_KEY`, `CUSTOM_CATEGORIES_KEY`, `CATEGORIES_KEY`, and reloads the page. `MAINTENANCE_LOG_KEY` is not in this list — a pre-existing gap, not something changed this session.
- **`renderAuthUI()`** — single function that reflects auth state across the entire UI. As well as the login/logout form swap it toggles visibility of: Wash Log tab, Maintenance tab, Inventory tab, routine sub-tabs (Schedules/Configure), bell icons on the Prices tab, and the Vehicle details, Notifications, Display preferences, Categories, and Data management settings sections. When a tab is hidden while active it redirects to Wash Routines. `renderPricesTab()` also gates the bell button, rename control, and category `<select>` on `syncEnabled` so they're omitted from rendered HTML when signed out.
- **Post-sync reload order in `checkAuthAndSync()`**: `loadRoutines → loadMaintenance → loadChecklist → loadLog → loadBudget → loadSettings → loadAlerts → renderWashReminderCards()`. After `renderAuthUI()`, `renderLogTypeSelect()` is also called so the New Session form reflects the synced routines immediately. `ROUTINES_KEY`, `MAINTENANCE_KEY`, and `MAINTENANCE_LOG_KEY` are all included in the sync pull. `loadRoutines` runs first so `routines[]` is populated before `loadSettings` calls `renderWashReminderCards`.

### Storage keys

| Key | Shape | Owner |
|---|---|---|
| `corolla-checklist-v3` | `{ phases: [{id, tag, title, items: string[]}], nextId: number, checked: {[slug]: bool} }` | Checklist phases + checked state |
| `corolla-washlog-v1` | `Array<{id, date, type, steps[], notes}>` | Wash log |
| `corolla-budget-v1` | `{ target: number }` | Budget target |
| `corolla-settings-v1` | `{ freq, routines, prefs, car: {model, year, colour, rego, displayName, postcode, currentOdometer}, notifications, schedules: [{routineId, intervalValue, intervalUnit}] }` | Settings |
| `corolla-price-alerts-v1` | `{ [slug]: { thresholdCents: number, channel: 'global' \| 'ticktick' \| 'email' } }` | Per-product price alert thresholds |
| `corolla-routines-v1` | `Array<{ id, name, subtext, types: string[], steps: [{product, action, enabled}], alerts: [{severity, label, text}] }>` | Fully customisable routine objects |
| `corolla-maintenance-v1` | `Array<{ id, name, notes, intervalType, intervalValue, intervalUnit, intervalKm, lastCompletedDate, lastCompletedOdometer, enabled }>` | Maintenance item definitions |
| `corolla-maintenance-log-v1` | `Array<{ id, itemId, itemName, date, odometer }>` | Maintenance completion history (newest-first) |
| `corolla-inventory-v1` | `{ [slug\|compositeKey]: {purchaseDate, volumeMl, remainingMl, manualOverride}, _order: string[] }` | Stock levels + category sort order |
| `corolla-categories-v1` | `Array<{ label, sections: Array<{ label, slugs: string[] }> }>` | The editable category/section structure — see Category system below |
| `corolla-category-overrides-v1`, `corolla-custom-categories-v1` | (legacy shapes, see Category system) | No longer written to — read once by `loadCategories()`'s migration path, then dead |

Bump the version suffix on breaking shape changes rather than writing migrations. The checklist key has gone through three versions: `corolla-detailing-app-v4` (positional `item-N` IDs) → `corolla-checklist-v2` (slug-keyed config) → `corolla-checklist-v3` (phases array with metadata). Each `loadChecklist()` migrates forward automatically on first load.

`entry.type` in `corolla-washlog-v1` stores the routine ID for entries created after the routine-driven form was introduced. Older entries used legacy string values `'full' | 'quick' | 'interior' | 'both'`. `typeLabel(type)` resolves via `routines.find(r => r.id === type)?.name` first, falling back to a legacy map. `entryMatchesSchedule(entry, schedule)` handles both cases (see Routine system below).

### Kit items and phases

The checklist is fully dynamic — no `<label class="item">` elements exist in HTML. `renderChecklist()` creates them from `checklistState.phases` and appends them into `#phases-container`. Each phase has an `id` (string, sequential from `nextId`), a `tag` (small label, e.g. "Phase 1 · foundation"), a `title` (h2 heading), and an `items` array of product slugs.

The full product catalog is the `CATALOG` constant in `app.js` — 46 products (25 default kit items across phases 1–4, plus 21 phase-0 extras available to add). `DEFAULT_PHASES` defines the original four-phase arrangement; it is only used when no saved state exists or as a migration source.

To add a new product to the catalog: add it to `CATALOG` in `app.js` AND to `seed.ts` in the backend (with retailer URLs). The user can then add it to any phase via the Edit UI.

Each phase's "add a product" `<select>` (`updatePhaseEditDropdown()`) is grouped into `<optgroup>`s via `groupSlugsByCategory()` (see Category system below), and its option list is `getAllProductSlugs()` — the union of `CATALOG` and `liveProducts`, so products added via the Prices tab's "+ Add product" form (backend-only, no `CATALOG` entry) are selectable too. `renderChecklist()` resolves each phase item through `resolveCatalogEntry(slug)` rather than a raw `CATALOG.find()`, falling back to a minimal `{slug, name, desc:'', price:0}` built from `liveProducts` when the slug isn't in `CATALOG`.

### Category system

Products are grouped into categories/sections everywhere they're listed — the Prices tab, the Inventory stock view, the Checklist "add product" dropdown, and the Routines step-editor product picker. All four consumers share one editable data model; there is no hardcoded/overridable split anymore.

**Storage:** `corolla-categories-v1` (`CATEGORIES_KEY`). Shape: `Array<{ label, sections: Array<{ label, slugs: string[] }> }>`. A product's category is simply whichever section's `slugs` array contains its slug — moving a product between categories/sections is just removing it from one array and pushing it into another. Built-in and user-added categories are indistinguishable once loaded; both can be renamed, gain/lose sections, or be deleted entirely from Settings → Categories.

**Seeding/migration:** `loadCategories()` reads `CATEGORIES_KEY`; if empty (first load on a given account/browser since this system shipped), it seeds from the hardcoded `INV_CATEGORIES` constant (7 built-in categories × sections — Equipment, Pressure Washer Equipment, Exterior Wash, Exterior Protection, Interior Clean, Interior Protect, Wheels) and folds in any pre-existing data from the two keys it superseded: `corolla-custom-categories-v1` (user-added categories, sections with no slugs of their own) and `corolla-category-overrides-v1` (`{ [slug]: {category, section} | null }`, the old per-product reassignment layer). Migration is idempotent — it only runs while `CATEGORIES_KEY` is empty — and writes the result back so it only happens once. `INV_CATEGORIES` itself is never iterated anywhere else; every other consumer reads `allCategories`.

**Key functions (`app.js`):**
- `allCategories` — the live, editable array; module-level state populated by `loadCategories()`.
- `loadCategories()` / `saveCategories()` — load-with-migration, and persist-with-sync-and-rerender (`renderInventory()` + `renderPricesTab()`).
- `getCategoryAssignment()` — returns `{ [slug]: {category, section} }` for every categorised slug; used to pre-select the Prices tab's per-product category `<select>`.
- `changeProductCategory(slug, value)` — the Prices tab dropdown's `onchange` handler. Removes the slug from wherever it currently sits across all of `allCategories`, then (if a value was chosen) pushes it into the target section. `value=""` leaves it uncategorised ("Other").
- `groupSlugsByCategory(slugs, nameForSlug)` — generic grouping shared by the Checklist and Routines pickers. Returns `[{ label, entries: [{slug, name}] }]` plus a trailing "Other" bucket for anything not in any section.
- `getAllProductSlugs()` — union of the static `CATALOG` and `liveProducts` (backend-only products added via the Prices tab's "+ Add product" form).
- `resolveProductName(slug)` / `resolveCatalogEntry(slug)` — `CATALOG`-first, `liveProducts`-fallback name/entry lookups, so backend-only products can be picked in the Checklist and Routines pickers and still render as Inventory cards despite having no `CATALOG` entry.
- `_buildCatalogGroups()` — the Routines step-editor's dropdown grouping. Wraps `groupSlugsByCategory()` then collapses size/SKU variants to one canonical family name via `SLUG_FAMILIES`/`FAMILY_NAMES` (routine steps reference products by name, not slug, so e.g. "Wet Dreams 770ml" and "Wet Dreams 5L" both collapse to "Wet Dreams").

**Settings → Categories:** one card per category, built-in or custom alike. Renaming a category/section is safe — since slugs live directly on the section object being edited, a rename can't orphan a product's assignment. Deleting a non-empty section shows a native `confirm()` warning naming the affected product count (the one spot in this whole flow still using a browser dialog rather than an inline confirm row, chosen deliberately given how easy the ✕ is to fat-finger next to a populated section). Deleting a whole category uses the usual inline confirm row pattern instead. Product-to-section assignment itself is *not* edited here — that's still done per-product from the Prices tab dropdown.

**"Other" bucket:** both `renderPricesTab()` and `renderInventory()` render a trailing "Other" card for anything not currently in any category/section — a product just added, one explicitly uncategorised via the dropdown, or one whose category/section was renamed/deleted in Settings. Without this fallback such products are still fully tracked (price data or stock) but silently invisible — this was a real regression fixed mid-development, twice, so don't remove either "Other" block without re-adding equivalent coverage.

### Routine system

The routine tab is fully dynamic — no static HTML tables. All routine data lives in `corolla-routines-v1`.

**Constants (`app.js`):**
- `ROUTINES_KEY` — storage key string `'corolla-routines-v1'`
- `PRODUCT_ACTIONS` — map of 34 catalog slugs → default action strings. Used to auto-fill the action field when the user types a known product name in the step editor.
- `DEFAULT_ROUTINES` — three routine objects (Exterior, Interior, Maintenance) matching the original static content. Used on first load and by `resetEverything()`.
- `ROUTINE_CSV_TEMPLATE` — a Claude prompt template string, downloadable as `routine-template.txt`, for generating routines via an AI assistant.

**State:** `let routines = []` — loaded from storage, falls back to deep copy of `DEFAULT_ROUTINES`.

**Key functions:**
- `loadRoutines()` — reads `corolla-routines-v1`, falls back to defaults, calls `buildCatalogDatalist()` + `renderRoutinesView()` + `renderRoutineConfigCards()` + `renderSchedulesUI()` + `renderLogTypeSelect()`
- `saveRoutines()` — writes to storage, calls `syncPush()`, re-renders both views, shows saved confirmation, calls `renderLogTypeSelect()` + `renderSchedulesUI()` so new/renamed routines appear immediately in the log form and schedules config
- `renderRoutinesView()` — renders into `#routines-view`. One `.product-section` per routine (with `id="routine-view-{id}"`), only enabled steps, numbered rows, callout divs for alerts. Does **not** call `applySchedule()` — the routine view is fully static data.
- `renderRoutineConfigCards()` — renders into `#routine-config-cards`. One `.routine-config-card` per routine with name/subtext inputs, type checkboxes, step editor rows (product datalist + action + enable toggle + delete), alert editor rows (severity select + label + text + delete), delete routine button. Cards are `draggable=true` for reordering.
- `buildCatalogDatalist()` — populates `<datalist id="catalog-datalist">` from `CATALOG` names; kept for legacy consumers but no input actually uses `list=` any more
- **Step product picker:** each step's product input is backed by a custom categorised dropdown, not the datalist. `openCatalogDropdown(event, rIdx, sIdx, pIdx)` builds it from `_buildCatalogGroups()` (see Category system) on focus; `filterCatalogDropdown(event)` filters the open dropdown as the user types; `hideCatalogDropdown()` closes it on blur (150ms delay so a click on an item registers first). `_catalogDropdownInput` (module-level) tracks which input is currently driving the dropdown.
- `updateRoutineMeta(rIdx, field, val)` — updates name or subtext
- `toggleRoutineType(rIdx, type, checked)` — adds/removes type from `types[]`
- `updateRoutineStep(rIdx, sIdx, field, val)` — updates a step field; auto-fills action from `PRODUCT_ACTIONS` when product changes and action is empty
- `addRoutineStep(rIdx)` / `removeRoutineStep(rIdx, sIdx)` — add/remove steps
- `updateRoutineAlert(rIdx, aIdx, field, val)` — updates severity, label, or text
- `addRoutineAlert(rIdx)` / `removeRoutineAlert(rIdx, aIdx)` — add/remove alerts
- `addRoutine()` — appends blank routine object with generated ID
- `deleteRoutine(rIdx)` — does not call `confirm()`. Shows an in-card confirm row (`#routine-confirm-{rIdx}`) via `showRoutineDeleteConfirm(rIdx)` / `cancelRoutineDelete(rIdx)`. After deletion calls `renderLogTypeSelect()` + `renderSchedulesUI()`.
- `renderLogTypeSelect()` — populates `#log-type` from `routines[]`. Called from `loadRoutines()`, `saveRoutines()`, `deleteRoutine()`, and `checkAuthAndSync()` (immediately after `renderAuthUI()`).
- `renderStepChipsForRoutine(routineId)` — renders step chips into `#steps-checklist` for the given routine. Called on dropdown change, `resetLogForm()`, and `startEditEntry()`.

**Drag-to-reorder:** `routineDragSrc` (separate from `dragSrc` used by step-level drag) tracks the source card index. `dragstart`/`drop` events on each card call `routines.splice()` + `renderRoutineConfigCards()`. Cards show `.drag-over` outline and `.dragging` opacity during drag.

**CSV format:** flat rows with `row_type` in column 0. A `routine` row defines the routine metadata; following `step` and `alert` rows belong to the most recent `routine` row. 12 columns total: `row_type, routine_id, name, subtext, types, product, action, enabled, sched, severity, label, text`. Import appends to existing routines (never overwrites) and assigns new IDs.

**Shared helpers:**
- `escAttr(str)` — escapes `"`, `<`, `>`, `&` for safe embedding in HTML attribute values
- `triggerDownload(content, filename, mime)` — creates a `Blob`, object URL, clicks a hidden `<a>`, revokes URL

**`applySchedule()`** — retained in `app.js` but no longer called anywhere. It reads `[data-sched]` attributes from the DOM and overwrites cell text with live frequency labels. The Maintenance routine shows static step text; the dedicated Maintenance tab handles all scheduling.

**`settings.routines`** (in `corolla-settings-v1`) — the simple name+enabled arrays for log step chips. Drives the chip editor UI in Routines → Configure. However, `#steps-checklist` in the wash log form is **not** populated from this directly — `applyLogStepChips()` delegates to `renderStepChipsForRoutine()`, which reads the selected routine's `steps[].name` from `routines[]`. The two systems share configuration (same step names), but the actual chip rendering is routine-driven.

**`settings.schedules`** (in `corolla-settings-v1`) — array of `{ routineId, intervalValue, intervalUnit }` entries. Drives the reminder cards in the log tab and the 07:00 UTC wash reminder cron. Default: `[]`. Managed via Routines → Schedules sub-tab. `intervalUnit` is `'days' | 'weeks' | 'months' | 'years'`.

**`entryMatchesSchedule(entry, schedule)`** — shared helper used by both `calcScheduleStreak` and `calcRoutineNextDue`. Returns true if `entry.type === schedule.routineId` (new entries storing a routine ID) OR if the entry's legacy type string matches the routine's declared `types` array. The same logic is applied on the backend in `routineMatchesLog()`.

**Wash reminder functions:**
- `scheduleIntervalDays(schedule)` — converts `{ intervalValue, intervalUnit }` to a number of days
- `calcScheduleStreak(schedule, forecast)` — counts consecutive on-time completions for a schedule; returns 0 if currently overdue, unless `forecast[0].rain_chance >= 50` (raining today), in which case the streak is held. Both call sites pass `weatherCache`.
- `calcRoutineNextDue(schedule)` — uses `entryMatchesSchedule` to find the most recent matching log entry, returns next due Date
- `calcBestWashDay(dueDate, forecast)` — returns the `rainDay` name (e.g. `'Thursday'`) when rain is forecast and the due date is ≤ 2 days away; null otherwise
- `renderWashReminderCards()` — renders `.wash-reminder-card` elements into `#wash-reminder-cards` (above sub-tabs in log tab); called from `renderLog()`, `loadSettings()`, and `saveSettings()`
- `goToRoutine(routineId)` — clicks the Routines tab and scrolls to `#routine-view-{id}`
- `sendWashReminderToTickTick(routineId, routineName, btn)` — `POST /api/notify/wash-reminder`; shows "Sent ✓" / "Failed" on the button
- `renderSchedulesUI()` — renders schedule entry rows (routine dropdown, interval input, unit select, remove button) into `#schedule-list`
- `updateScheduleField(idx, field, val)` / `addScheduleEntry()` / `removeScheduleEntry(idx)` — mutate `settings.schedules` in-place and re-render

### Maintenance system

All maintenance data lives in `corolla-maintenance-v1` (items) and `corolla-maintenance-log-v1` (completion history).

**Constants (`app.js`):**
- `MAINTENANCE_KEY` / `MAINTENANCE_LOG_KEY` — storage key strings
- `DEFAULT_MAINTENANCE_ITEMS` — 7 default items (tyre pressure, oil level, washer fluid, cabin filter, logbook service, tyre rotation, brake fluid)
- `MAINTENANCE_CSV_TEMPLATE` — Claude prompt template for generating AU ZR Hybrid maintenance schedules, downloadable from Configuration tab

**State:** `let maintenanceItems = []` / `let maintenanceLog = []` — loaded from storage, fall back to defaults / empty array.

**Item shape:** `{ id, name, notes, intervalType: 'time'|'odometer', intervalValue, intervalUnit: 'days'|'weeks'|'months'|'years', intervalKm, lastCompletedDate, lastCompletedOdometer, enabled }`. `lastCompletedDate` and `lastCompletedOdometer` are derived from the most-recent matching entry in `maintenanceLog` — when a history entry is deleted, these fields are recalculated from remaining log entries for that item.

**Key functions:**
- `loadMaintenance()` — reads both keys, falls back to defaults, renders all four sub-panels
- `saveMaintenance()` — writes items, syncs, re-renders all four sub-panels, shows saved confirmation
- `saveMaintenanceLog()` — writes log, syncs, re-renders history only
- `saveMaintenanceComplete(itemId)` — reads inline form (date + odometer), updates item's last-completed fields, updates `settings.car.currentOdometer` if odometer is higher, pushes a new entry to `maintenanceLog`, calls both save functions
- `deleteMaintenanceLogEntry(entryId)` — removes entry, recalculates `lastCompletedDate`/`lastCompletedOdometer` on the affected item from remaining log entries (or nulls both if none remain), saves both stores
- `maintenanceNextDue(item)` → `{ dueDate, dueKm, status: 'overdue'|'due-soon'|'ok'|'never-done' }`. Time items: `dueDate = lastCompletedDate + interval`; due-soon = within 14 days. Odometer items: compares `dueKm` to `settings.car.currentOdometer`; due-soon = within 2,000 km. Items with no last-completed → `'never-done'`.
- `maintenanceDueLabel(item)` — human string: "Overdue — was due 3 days ago", "Due in 5 days (15 May 2026)", "Due at 35,000 km (2,400 km away)", "Not yet recorded"
- `maintenanceIntervalLabel(item)` — "Every 1 month" or "Every 10,000 km"
- `maintenanceItemIsUrgent(item)` — true if status is overdue/due-soon/never-done (used to filter Upcoming tab)
- `renderMaintenanceUpcoming()` / `renderMaintenanceSchedule()` / `renderMaintenanceHistory()` / `renderMaintenanceConfigCards()` — render into their respective `#maintenance-sub-*` panels
- `showMaintenanceCompleteForm(itemId)` / `hideMaintenanceCompleteForm(itemId)` — toggle inline complete form via `hidden` attribute
- `showMaintenanceLogDeleteConfirm(entryId)` / `cancelMaintenanceLogDelete(entryId)` — toggle inline history delete confirm
- `addMaintenanceItem()` / `deleteMaintenanceItem(idx)` / `updateMaintenanceItem(idx, field, val)` — mutate `maintenanceItems`; `updateMaintenanceItem` also toggles `hidden` on `#maint-time-fields-{idx}` / `#maint-odo-fields-{idx}` when field is `'intervalType'`
- `exportMaintenanceCSV()` / `importMaintenanceCSV()` / `parseMaintenanceCSV(text)` / `downloadMaintenanceTemplate()` — CSV and template helpers mirroring routines pattern
- `resetMaintenance()` — resets items to defaults and clears log; called from Settings → Data management

**Drag-to-reorder:** `maintenanceDragSrc` tracks source card index; same pattern as routines.

**Odometer field:** `settings.car.currentOdometer` (number | null) is updated from three places: Vehicle Details settings, the odometer field on the wash log New Session form (only if the entered value is greater than the current reading), and the Maintenance Mark Complete form. All three call `saveSettings()` or the equivalent save function after updating.

### Inventory system

All inventory data lives in `corolla-inventory-v1`. The Inventory tab has three sub-tabs: **Inventory** (stock levels), **Checklist** (kit purchase tracker), **Prices** (price sheet + alerts + product lifecycle — see Category system and the Prices tab bullets above). The standalone Summary sub-tab was removed (see the tab list at the top of this file); a Spend tab never existed as a top-level tab and no replacement was built.

**Constants (`app.js`):**
- `INVENTORY_KEY` — storage key string `'corolla-inventory-v1'`
- `INV_CATEGORIES` — the hardcoded seed for the category system (see Category system above). Not read by `renderInventory()` directly — `allCategories` is.
- `BUNDLE_COMPONENTS` — map of bundle slugs → component arrays `[{ name, ml?, equipment?, sectionPath? }]`. Bundles are expanded to individual components in both inventory and depletion. `sectionPath: [categoryLabel, sectionLabel]` places inline (slug-less) components by label against `allCategories` — renaming that category/section in Settings will orphan the reference, a narrow cosmetic edge case.
- `SLUG_FAMILIES` — map of slug → family string for size-variant fallback. E.g. `'wheely-clean-v2-500ml'` and `'wheely-clean-v2-5l'` both map to `'wheely-clean-v2'` so a routine step for the 500ml size can deplete a 5L bottle if that's what the user owns.
- `EQUIPMENT_SLUGS` — Set of slugs that are equipment (not consumables); excluded from depletion.
- `INVENTORY_DEFAULTS` — default `volumeMl` values per slug, seeded from Bowden's product pages.

**State:** `let inventoryState = {}` — loaded from `INVENTORY_KEY`. Keys are either catalog slugs or composite keys `'{bundleSlug}:{componentName}'`. Each entry: `{ purchaseDate, volumeMl, remainingMl, manualOverride }`. `_order` is a special key holding the user's custom category sort order (string array of category labels, matched against `allCategories`).

**Key functions:**
- `loadInventory()` — reads `INVENTORY_KEY`, merges with defaults, calls `renderInventory()`
- `saveInventory()` — writes `inventoryState`, calls `syncPush(INVENTORY_KEY, inventoryState)`, calls `renderInventory()`
- `initInventoryStock(slug)` — called when a kit item is checked in the Checklist, or a product is added directly via the Inventory tab's own picker. Initialises the inventory entry (or bundle component entries) with `volumeMl` from defaults and `remainingMl = volumeMl`. No-op if already initialised.
- `resolveInventoryKey(slug)` — resolves a catalog slug to the `inventoryState` key that has a `remainingMl` value, checking: (1) the slug directly, (2) its bundle component expansion, (3) SLUG_FAMILIES siblings. Returns null if no matching owned item is found.
- `decrementInventoryForSession(entry)` — called after saving a new wash log entry. Walks `entry.steps[]` → finds the matching routine step by `step.name` → iterates `step.products[].{name, ml}` → resolves inventory key via `resolveInventoryKey()` → decrements `remainingMl`. Skips equipment slugs. Saves and re-renders if any change occurred.
- `getInvCategoryOrder()` — returns ordered category labels: starts from `inventoryState._order` (user's saved order), adds any new `allCategories` labels at the end, removes any that no longer exist there.
- `renderInventory()` — renders into `#inventory-list`. Iterates categories in `getInvCategoryOrder()` order, mapped against `allCategories`. Each category is a draggable `.inv-category` with a header (`⠿` handle + label) and sections; each section renders `.inv-card` items in a `.inv-grid`. Cards show product name, progress bar (colour-coded: green ≥50%, amber 20–50%, red <20%), remaining/total ml, sessions remaining estimate, and a volume adjustment control. A trailing, non-draggable "Other" card covers any owned item (or bundle sub-component) not currently in any category/section — see Category system. Ends with `invAddProductFormHtml()`. Empty-state links point to the Checklist sub-tab.
- `invAddProductFormHtml()` — "+ Add product" control at the bottom of the Inventory sub-tab: a `groupSlugsByCategory()`-grouped `<select>` (option list from `getAllProductSlugs()`, so backend-only products are included) plus an "Add" button. Only lists slugs not already owned.
- `addProductToInventory()` — the "Add" button's handler; reads the slug from `#inv-add-product-select` (no argument passed). Sets `checklistState.checked[slug] = true`, calls `initInventoryStock()`, saves both `CHECKLIST_V3_KEY` and `INVENTORY_KEY`, re-renders — marks a product owned without needing to visit the Checklist sub-tab at all.
- `saveInvAdjust(key, value)` — updates `remainingMl` from user's manual volume input, sets `manualOverride: true`, saves.
- `getRoutineUsageMl(slug)` — sums `ml` across all enabled steps in all routines that reference the given product name, giving a per-wash usage estimate.

**Drag-to-reorder categories:** `invCatDragSrc` (module-level, null by default) tracks the source category index. `dragstart`/`dragover`/`dragleave`/`dragend`/`drop` events are attached after each `renderInventory()` call. On drop, `inventoryState._order` is updated and `saveInventory()` + `renderInventory()` are called. The trailing "Other" card has no `data-cat-idx` and is excluded from this wiring — it always renders last.

**Sub-tab navigation:** `.inv-sub-tab[data-inv-tab]` buttons show/hide `.inv-sub-panel` divs with matching `id="inv-sub-{tab}"`. Panel IDs: `inv-sub-stock` (Inventory), `inv-sub-checklist` (Checklist), `inv-sub-prices` (Prices). The navigator is wired in `init()` via `document.querySelectorAll('.inv-sub-tab')`.

**Load-order gotcha:** `renderInventory()` runs once early in `init()`/`checkAuthAndSync()`, before the `GET /api/products` fetch that populates `liveProducts` resolves. `loadPriceData()` calls `renderInventory()` again right after `liveProducts` is set, specifically so the add-product picker and "Other" card pick up backend-only products on first load rather than only after some unrelated re-render happens to fire.

### Log tab

The log tab has three sub-tabs: **History** (default), **New Session**, and **Edit Session**. Edit Session is hidden unless a past entry is being edited; it reuses the `#log-sub-new` panel via `data-log-tab="new"`.

**Log form — routine-driven:**
- The **Routine** dropdown (`#log-type`) is populated from `routines[]` by `renderLogTypeSelect()`. Each option value is the routine's `id`.
- **Step chips** in `#steps-checklist` are rendered from the selected routine's enabled steps when the dropdown changes (`renderStepChipsForRoutine(routineId)`).
- The **Notes** field is labelled **Status**.
- Badge colour in `renderLog()` is derived from the matched routine's `types` array; falls back to legacy string matching for old entries.

**Ellipsis menu and in-card actions:**
- Each log card has an ellipsis menu (···) with Edit and Delete actions.
- Deleting shows an in-card confirm row (`.log-confirm-row`) — no browser `confirm()`.
- Clicking Edit calls `startEditEntry(id)`, which pre-fills the New Session form, shows the Edit Session sub-tab, and re-renders the log so the ✕ photo remove button only appears on the card being edited.
- `cancelEditEntry()` and `resetLogForm()` restore the form to new-session state and re-render the log to hide the remove button.

**Module-level state vars (log/photo):**
- `editingEntryId` — ID of the entry currently being edited, or null
- `pendingEntryId` — set to the existing entry ID when editing, or `Date.now()` on first photo upload of a new session
- `pendingPhotos[]` — temp photo state during the form session
- `photosByEntryId {}` — loaded from server, keyed by log entry ID
- `lightboxEntryId`, `lightboxIndex` — track which photo the lightbox is showing

### Photo log

Photos are attached to log entries and stored in Cloudflare R2.

**Backend (`routes/photos.ts`):**
- `POST /photos/upload` — session-protected. Accepts a file upload, generates a sharp thumbnail at 400px width (EXIF stripped), uploads original + thumbnail to R2, inserts a `photos` row, returns `{ id, thumbUrl, originalUrl }`.
- `GET /photos?logEntryIds=...` — returns `Record<logEntryId, Photo[]>` for the given entry IDs.
- `DELETE /photos/:id` — deletes R2 keys + DB row (session-protected).

**R2 (`lib/r2.ts`):**
- `r2Client` — `S3Client` configured for Cloudflare R2.
- `uploadToR2(key, buf, contentType)` — uploads with `Cache-Control: public, max-age=31536000, immutable`.
- `deleteFromR2(key)` — deletes a single R2 object.
- `getPublicUrl(key)` — returns `${R2_PUBLIC_URL}/${key}`.
- Public URL pattern: `https://jhosan.top/photos/{userId}/{logEntryId}/{uuid}.jpg`. R2 bucket is public.

**Frontend photo functions:**
- `loadPhotoData(entryIds)` — `GET /api/photos`, merges result into `photosByEntryId` via `Object.assign`.
- `uploadPendingPhoto(file)` — shows a local `createObjectURL` preview immediately with a spinner overlay (`uploading: true` flag in the pending item); replaces with server URL on success, removes on failure. Revokes the object URL either way.
- `renderPhotoPreviews()` — renders upload previews into `#log-photo-preview`. Uploading items show a spinner and no remove button; finished items show ✕ with a 180ms scale-fade animation before deletion.
- `deletePhoto(photoId, entryId)` — `DELETE /api/photos/:id`; updates `photosByEntryId` and `pendingPhotos`.
- Photos are displayed in log cards as a **horizontal snap-scroll carousel** (`.log-carousel` / `.log-carousel-item`). Clicking a thumbnail opens a full-screen lightbox.
- `openLightbox(entryId, index)` — preloads all originals for the entry via `new Image()` to avoid per-arrow-click R2 fetches.
- `closeLightbox()`, `lightboxNav(dir)`, `updateLightbox()` — lightbox controls. Support Esc, ← →, click-outside-to-close. Exposed on `window.*` since called from inline HTML `onclick`.
- Photo ✕ remove button is only rendered when `editingEntryId === entry.id`. Entering/exiting edit mode calls `renderLog()` to show/hide it.
- After saving an edit, `photosByEntryId[savedEntryId] = [...pendingPhotos]` gives immediate display, then `loadPhotoData([savedEntryId]).then(() => renderLog())` re-fetches to catch photos whose upload finished after the save click.

### CSS conventions

- All design tokens in `:root` CSS variables, with `prefers-color-scheme: dark` overrides
- Two fonts: **Fraunces** (serif, headings) and **Inter** (sans, body)
- Light theme: warm cream `#faf8f3`; dark theme: `#15171a`
- Accent: forest green `--accent` (`#2d7d5a`)
- Reuse existing tokens — don't introduce new colours or size scales
- `.section-head` / `.section-head--gap` — green uppercase subsection divider used in the Prices tab and Notifications settings. Previously named `.prices-section-head`; renamed global when reused in settings.
- `[hidden] { display: none !important; }` — at the very top of `styles.css`. Critical: prevents `display: flex` on `.log-confirm-row` and `#lightbox` from overriding the HTML `hidden` attribute.
- `.log-carousel` / `.log-carousel-item` — horizontal flex scroll strip with snap; used for photos in log cards.
- `#lightbox` — full-screen overlay (`position: fixed; inset: 0; z-index: 9999`).
- `.log-photo-spinner::after` — `@keyframes photo-spin` for upload in-progress indicator.
- `.log-carousel-item.removing` / `.log-photo-item.removing` — `@keyframes photo-remove` (180ms scale-fade) triggered before server delete call.

## Notifications

The app delivers notifications via two channels: TickTick REST API and direct email. TickTick uses OAuth 2.0 (access token ~5–6 months; refresh token non-expiring). Token stored server-side in `userData` under `ticktick-oauth-v1` (NOT in `ALLOWED_KEYS` — never synced to client).

**TickTick setup:** register an app at developer.ticktick.com; set redirect URI to `${BACKEND_PUBLIC_URL}/api/ticktick/callback`. Add `TICKTICK_CLIENT_ID`, `TICKTICK_CLIENT_SECRET`, and `BACKEND_PUBLIC_URL` to Render env vars. User clicks **Connect** in Settings → Notifications → TickTick; OAuth flow stores tokens; project selector appears.

**Configuration:** stored in `settings.notifications` within `corolla-settings-v1` (synced via `userData`). Set in Settings → Notifications, split into TickTick and Email subsections. Fields:

| Field | Default | Meaning |
|---|---|---|
| `ticktickAlerts` | `true` | Send TickTick task for price alerts |
| `ticktickProjectId` | `null` | ID of the TickTick list to assign tasks to |
| `ticktickTags` | `[]` | Tags added to every TickTick task |
| `washReminders` | `true` | Send TickTick task when wash is overdue |
| `emailAlerts` | `false` | Send direct email for price alerts |
| `emailWashReminders` | `false` | Send direct email when wash is overdue |
| `emailDigest` | `false` | Send daily digest email (08:00 UTC) with sale items and threshold breaches |

`ticktickConnected` is a derived field (not stored) — computed by `getOwnerNotificationSettings` via `isTickTickConnected()` and returned in `NotificationSettings`.

**Per-product thresholds:** stored separately in `corolla-price-alerts-v1` (also synced). Shape: `{ [slug]: { thresholdCents, channel: 'global' | 'ticktick' | 'email' } }`. Managed via the 🔔 bell icon on each product card in the Prices tab. An "Active alerts" summary panel at the top of the Prices tab shows all configured thresholds with inline edit and remove.

**Four triggers:**

1. **On-sale price alert** (`routes/prices.ts`) — fires when `POST /api/prices` ingests an observation where `onSale=true` and the prior row for that product+retailer was not on sale (transition only). Routed via `sendViaChannel('global', ...)`. TickTick task title:
   ```
   🔥 {Product name} on sale at {Retailer} — ${price}
   ```

2. **Threshold breach alert** (`routes/prices.ts`) — fires when the new price is at or below the user's configured threshold and the prior price was above it (transition only). Channel follows the per-product `channel` setting. TickTick task title:
   ```
   ⬇️ {Product name} below ${threshold} at {Retailer} — ${price}
   ```

3. **Wash reminder** (`index.ts` cron, 07:00 UTC daily) — reads the owner's `corolla-washlog-v1` and `corolla-settings-v1` from `userData`, calculates days since last wash vs schedule interval, sends if overdue. Sends TickTick if `washReminders && ticktickConnected`, sends email if `emailWashReminders`. Returns early if neither channel is active. TickTick task title:
   ```
   🚗 {Routine name} due
   ```

4. **Daily price digest** (`index.ts` cron, 08:00 UTC daily) — queries the latest price per product+retailer for on-sale items and threshold breaches. Sends nothing if both lists are empty. Email only (no TickTick). Gated on `emailDigest`. Subject:
   ```
   🏷️ {N} price alerts — {day, date month}
   ```

**Key functions:**

`backend/src/lib/ticktick.ts`:
- `createTickTickTask(ownerEmail, { title, content, projectId, tags, priority })` — creates a task via TickTick REST API; auto-refreshes token if within 24h of expiry
- `getValidToken(ownerEmail)` — returns a fresh access token, refreshing if needed; throws if not connected
- `storeOAuthTokens(ownerEmail, accessToken, refreshToken, expiresIn)` — writes initial tokens after OAuth callback
- `fetchTickTickProjects(ownerEmail)` — returns `[{ id, name }]` for the project selector
- `isTickTickConnected(ownerEmail)` — checks if a stored token exists in `userData`
- `disconnectTickTick(ownerEmail)` — deletes stored tokens from `userData`

`backend/src/routes/ticktick.ts`:
- `GET /api/ticktick/auth` (session-protected) — redirects to TickTick OAuth
- `GET /api/ticktick/callback` — exchanges code for tokens, redirects to app with `?ticktick=connected`
- `GET /api/ticktick/status` — `{ connected: bool }`, no auth required
- `GET /api/ticktick/projects` (session-protected) — list of TickTick projects for the selector
- `DELETE /api/ticktick/disconnect` (session-protected) — removes stored tokens

`backend/src/lib/email.ts`:
- `getOwnerNotificationSettings(ownerEmail)` — reads `corolla-settings-v1` + calls `isTickTickConnected`, returns full `NotificationSettings`
- `getOwnerAlertThresholds(ownerEmail)` — reads `corolla-price-alerts-v1`, returns `Record<slug, AlertThreshold>`
- `sendDirectEmail(to, subject, bodyText)` — styled HTML email via Resend
- `sendDigestEmail(to, saleItems, thresholdItems)` — digest HTML email; no-op if both lists empty
- `sendViaChannel(channel, notifSettings, ownerEmail, baseSubject, body)` — (in `prices.ts`) routes to TickTick and/or email based on channel and toggle state

`app.js`:
- `ticktickIsConnected` — module-level bool; set by `refreshTickTickStatus()` after fetching `GET /api/ticktick/status`
- `refreshTickTickStatus()` — updates connect/disconnect UI, shows/hides project + tags rows, loads project list, then re-renders wash reminder cards
- `loadTickTickProjects()` — fetches project list, populates `#ticktick-project-id` select, restores saved selection
- `connectTickTick()` — redirects to `${BACKEND_URL}/api/ticktick/auth`
- `disconnectTickTick()` — `DELETE /api/ticktick/disconnect`, then refreshes status

**To force a test price alert:** `POST /api/prices` with a real product slug, `priceCents` below the rolling average (or `compareAtCents` higher than `priceCents`), and a prior off-sale row in the DB. **To force a test wash reminder or digest:** temporarily change the respective cron to `* * * * *`, deploy, wait 60s, revert.

## Weather (client-side, via backend proxy)

Weather-aware hints appear in the **log tab** below the streak bar when a postcode is set in Settings → Vehicle details.

**Two cards:**
1. **Rain delay** — shown when tomorrow's precipitation probability ≥ 50%. Suggests the first dry day. Uses `forecast[1].rain_chance`.
2. **Bead Machine heat banner** — shown when any day in the next 7 has `temp_max ≥ 35°C` AND `isBeadMachineDueSoon()` returns true (due within 14 days, or never logged). Text: "Hot weather ahead — Bead Machine due?"

**Data flow:**
- Frontend calls `GET /api/weather?postcode={postcode}` on the Render backend (fires once in `init()` after sync, and again when car settings are saved).
- Backend (`routes/weather.ts`): geocodes postcode via Nominatim (`nominatim.openstreetmap.org/search?postalcode=&countrycodes=au`), fetches 7-day forecast from Open-Meteo (`api.open-meteo.com/v1/forecast`), returns `[{ date, rain_chance, temp_max }]`. Results cached in memory for 3 hours per postcode.
- Frontend `evalWeatherTriggers(forecast)` evaluates both triggers and `renderWeatherCards(triggers)` updates the DOM. `weatherCache` stores the last successful forecast; `renderLog()` re-evaluates from cache on every log render (no extra fetch). `weatherCache` is passed to `calcBestWashDay()` (rain within 2 days of due → reminder card shows best wash day instead of due date) and to `calcScheduleStreak()` (raining today → streak held even when overdue).

**Why proxied:** BOM (`api.weather.bom.gov.au`) blocks browser CORS requests and Render's datacenter IPs. Open-Meteo geocoding doesn't support Australian postcode lookups. Nominatim + Open-Meteo via Render is the working stack.

**Key functions** (`app.js`):
- `calcNextDue(freqKey)` — computes next due Date from last log entry + `FREQ_DAYS` lookup
- `fetchBomForecast(postcode)` — despite the name, now calls `/api/weather` on the backend (name kept to avoid churn)
- `evalWeatherTriggers(forecast)` → `{ rainTomorrow, rainDay, heatWave, heatDay }`
- `isBeadMachineDueSoon()` — searches log steps for "Bead Machine", returns true if due ≤ 14 days or never logged
- `loadWeather()` — orchestrator; hides section silently if no postcode or API unreachable

## Things to preserve

1. **Aesthetic restraint.** Minimalist Fraunces serif headings. No dashboard gauges, no charts where prose works. One person, quiet interface.
2. **Australian-specific advice.** All retailers, prices, and sale timing are AU-specific. Don't generalise.
3. **Bowden's-first framing.** The technique guide is opinionated around the Bowden's range. Non-Bowden products are exceptions, not equals.
4. **Graceful degradation.** The app works offline/standalone without a backend — live prices enhance but don't gate any functionality.
5. **Phase intent.** The default four phases represent an acquisition plan (1 = essentials, 2 = complete kit, 3 = bulk consumables, 4 = long-term protection). Phases are now user-customisable — don't assume a fixed number or fixed IDs.

## Scraper notes

See `SCRAPER-LEARNING.md` for detailed hard-won lessons. Key points:

- Never define named functions inside `page.evaluate()` — tsx compiles them with `__name()` helpers that don't exist in the browser context. Keep evaluate callbacks to plain DOM reads only.
- `[itemprop="price"]` on Repco and Supercheap only exists in JSON-LD `<script>` tags, not as real DOM attributes. Never use it as a selector.
- Use `waitUntil: 'domcontentloaded'` not `'networkidle'` for **all** Playwright scrapers (Repco and Supercheap) — analytics and chat widgets prevent networkidle from ever firing, causing 30s timeouts per product.
- Repco: `meta[property="og:price:amount"]` for regular price, `.promotion-price` for member price.
- Supercheap: selectors from the site's own JS — `#product-content > .product-price .price-sales .promo-price` for sell price, `.product-price.has-club .text-club-price` for club price.
