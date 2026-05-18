# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

A personal detailing kit-and-technique guide for a 2025 Toyota Corolla Hatch Hybrid ZR (Australian market). Built around the Bowden's Own product ecosystem with a few non-Bowden additions (303 Aerospace Protectant, Kärcher pressure washer). All retailer references are Australian (Supercheap Auto, Repco, Auto Barn, Autopro) and pricing is in AUD.

The app has eight tabs:
- **checklist** — kit purchase tracker, customisable phases (add/rename/delete), product prices
- **guide** — per-product technique reference (mostly static)
- **routine** — fully customisable wash routines; three sub-tabs: "Routines" (read-only rendered view), "Schedules" (per-routine reminder interval config), and "Configure" (editor cards for name/subtext/type/steps/alerts, CSV import/export, drag reorder, log step chips)
- **log** — wash session log with streak counter, reminder cards, and weather hints; two sub-tabs: "History" (default) and "New Session"
- **spend** — spend tracker, budget bar, live sale alerts
- **prices** — read-only price sheet: all tracked products grouped by functional category, all retailers per product, with sparklines and sale badges
- **refs** — links to manufacturer pages and community resources
- **settings** — display preferences, notification config (TickTick + email), vehicle details (incl. postcode for weather). Wash frequency config has moved to Routines → Schedules; routine step chips are in Routines → Configure. When signed out: Vehicle details, Notifications, Display preferences, and Data management sections are hidden.

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
│   │   │   ├── schema.ts   # Drizzle schema (products, retailer_urls, price_history, users, sessions, magicTokens, userData)
│   │   │   ├── seed.ts     # Product catalogue + retailer URLs — edit this to add products
│   │   │   ├── init.ts     # Creates tables + runs seed
│   │   │   └── connection.ts
│   │   ├── routes/
│   │   │   ├── products.ts # GET /api/products — all products with latest prices per retailer
│   │   │   │               # GET /api/products/prices — bulk price history (all products, 90-day window)
│   │   │   │               # GET /api/products/:id/prices — single product price history
│   │   │   ├── prices.ts   # POST /api/prices — ingest scraper results
│   │   │   ├── alerts.ts   # GET /api/alerts, GET /api/prices/current, POST /api/notify/wash-reminder
│   │   │   ├── auth.ts     # Auth + sync: POST /api/auth/request|verify|logout, GET /api/auth/me, GET|POST /api/sync
│   │   │   └── weather.ts  # GET /api/weather?postcode= — Nominatim geocoding + Open-Meteo forecast, 3h cache
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
│   │       └── email.ts         # sendMagicLink(), sendTickTickTask(), sendDirectEmail(), sendDigestEmail(), getOwnerNotificationSettings(), getOwnerAlertThresholds() via Resend
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

The backend allows two origins: `https://osann.github.io` and `https://corolla.jhosan.top`. Both must be present in `backend/src/index.ts`. `credentials: true` is set so the session cookie can be sent cross-origin. If the custom domain changes, update the CORS allowlist first or live prices and sync will silently fail to load.

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

Seven tables in SQLite via Turso (`@libsql/client` + `drizzle-orm/libsql`). Locally falls back to `file:./db.sqlite` when `TURSO_URL` is not set:

- **`products`** — `id, name, slug, phase, created_at`. Phase 0 = tracked for pricing but not shown in the kit checklist.
- **`retailer_urls`** — `product_id, retailer, url`. One row per product per retailer. Full URLs stored directly (templates don't work for Supercheap or Repco).
- **`price_history`** — `product_id, retailer, price_cents, on_sale, observed_at`. Append-only log of every scrape result.
- **`users`** — `id, email, created_at`. One row per authenticated user.
- **`magic_tokens`** — `id, token_hash, user_id, expires_at, used_at, created_at`. Single-use 15-minute auth tokens for magic link sign-in.
- **`sessions`** — `id, session_id, user_id, expires_at, created_at`. 30-day session cookies.
- **`user_data`** — `id, user_id, key, value_json, updated_at`. Generic key-value JSON store per user. One row per user per key. Stores all synced app state: checklist, wash log, budget, settings (including notification config). Keys must be in `ALLOWED_KEYS` in `routes/auth.ts` to be accepted by `POST /api/sync/:key`.

**To add a product or retailer URL**, edit `backend/src/db/seed.ts`. The seed is idempotent — re-running it upserts without duplicating. Run `npm run seed` to apply locally, or let the next Render deploy pick it up.

## Scraper architecture

Three execution paths — read `SCRAPER-LEARNING.md` before modifying any scraper:

1. **GitHub Actions hosted runner** (`run-and-push.ts`): calls `scrapeToArray()` which returns observations without writing to DB, then POSTs them to `POST /api/prices` on the Render backend. The local DB is always fresh on each run so the 12-hour cache check never skips anything here. Handles Supercheap and Repco.

2. **Render cron** (`scrapers/autopro.ts`): calls `scrapeAutopro()` which writes directly to the production DB via Turso. Fires at 05:00 UTC within the robots.txt crawl window (04:00–08:45 UTC). The 12-hour cache check (`wasRecentlyScraped()`) is effective here.

3. **Self-hosted runner** (`run-autobarn.ts`): calls `scrapeToArray()` then POSTs to Render, same flow as path 1. Runs on `debian-server` (home machine, residential IP) to bypass Auto Barn's cloud IP block. Fires daily at 05:00 UTC via `scrape-autobarn.yml`. Uses `playwrightFallback: true` — products that timeout on plain HTTP (~half) are retried in a Playwright browser session after the HTTP loop completes.

Scraper order for GitHub Actions hosted runner: Supercheap → Repco (Repco is slower and more prone to rate-limiting).

**Auto Barn blocks all cloud IPs** — confirmed HTTP 403 from both GitHub Actions hosted runners and Render. It is scraped exclusively via the self-hosted runner on `debian-server`. Do not attempt to run the Auto Barn scraper from any cloud environment.

**Bowden's Own is not scraped.** Their site blocks all datacenter IPs — GitHub Actions gets a Cloudflare JS challenge on page loads; Render gets HTTP 403 on every request including the product pages themselves. All products that were previously tracked via Bowden's have Repco or Supercheap fallback URLs. Do not add a `bowdens` retailer entry to any product — it will never succeed from any cloud environment.

## Frontend architecture

`app.js` is vanilla JS, no framework. Key conventions:

- `storageGet(key)` / `storageSet(key, val)` — storage abstraction that tries `window.storage` (Claude artifact runtime) then falls back to `localStorage`. All persistence goes through these.
- `render*()` functions write to the DOM from state
- `apply*()` functions mutate the DOM based on current settings
- `init()` on load: `setupChecklist → loadChecklist → loadLog → loadBudget → loadRoutines → loadSettings → checkAuthAndSync → loadPriceData() + loadWeather()` (loadRoutines before loadSettings so renderWashReminderCards fires with routines already populated; price data and weather are non-blocking, called after sync so they use the post-sync postcode and settings)
- `itemData` array is rebuilt by `renderChecklist()` on every render — includes `slug`, `phase` (phase ID string), `price`, `el`, `input`
- `loadPriceData()` fetches `GET /api/products`, calls `applyLivePrices()` which updates `.item-price` text, adds 🔥 for on-sale items, updates `item.price` in memory, then calls `recompute()` so spend totals reflect live prices. Fails silently if backend is unreachable. Timeout is 40s (Render free tier cold start is ~30s).
- `loadPriceHistories()` is called from `loadPriceData()` after prices are applied. It fetches `GET /api/products/prices` (bulk, 90-day window) in a single call, populates `priceHistories` keyed by product ID, then calls `renderPriceList()` (spend tab) and `renderPricesTab()` (prices tab). The old per-product `GET /api/products/:id/prices` endpoint is kept but no longer called by the frontend.
- `renderPricesTab()` renders the **prices** tab. It iterates a hardcoded `PRICE_CATEGORIES` array (defined inside the function) that maps each functional category and sub-section to an ordered list of product slugs. It builds a `productBySlug` lookup from `liveProducts`, then for each slug renders a `.prices-product` block containing one `.prices-retailer-row` per retailer — each with price, 🔥 Sale badge, sparkline (or "No data yet." placeholder at the same fixed dimensions), and buy link. Each product name row also has a 🔔 bell button (`toggleAlertForm(slug)`) that opens an inline threshold form. At the end of `renderPricesTab()`, `renderAlertsPanel()` is called to refresh the active-alerts summary card at the top of the tab (`#prices-alerts-summary`). The panel is hidden when no alerts are configured. Categories and their sub-sections: Equipment (Microfibre / Wash Pads / Drying Towels / Other), Pressure Washer Equipment (Pressure Washers / Foam Cannons), Exterior Wash (Glass / Prep / Pre-Wash / Contact Wash), Exterior Protection (Sealant / Quick Detailer), Interior Clean (Leather / Fabric), Interior Protect (Leather / Fabric & Suede / Plastic, Vinyl & Rubber), Wheels (Equipment / Clean / Protect). A slug can appear in multiple categories. Products not in the mapping are silently omitted. Cards for categories where no product has a scraped price are not rendered.
- The `__BACKEND_URL__` guard uses `BACKEND_URL.startsWith('__')` — not strict equality. The `sed` substitution in `deploy.yml` replaces `__BACKEND_URL__` globally, which would corrupt a `=== '__BACKEND_URL__'` check into `=== '<real-url>'`. Never revert this to a string equality check.
- **Auth cache** (`corolla-auth-v1` in localStorage) — written after a successful `/api/auth/me` response so the signed-in UI state is restored immediately on reload without waiting for the network round-trip. Cleared on auth failure and on sign-out. Sign-out also clears all other local storage keys (`CHECKLIST_V3_KEY`, `LOG_KEY`, `BUDGET_KEY`, `SETTINGS_KEY`, `ALERTS_KEY`, `ROUTINES_KEY`) and reloads the page.
- **`renderAuthUI()`** — single function that reflects auth state across the entire UI. As well as the login/logout form swap it toggles visibility of: Wash Log tab, Spend tab, routine sub-tabs (Schedules/Configure), bell icons on the Prices tab, and the Vehicle details, Notifications, Display preferences, and Data management settings sections. When a tab is hidden while active it redirects to Wash Routines. `renderPricesTab()` also gates the bell button on `syncEnabled` so it is omitted from rendered HTML when signed out.
- **Post-sync reload order in `checkAuthAndSync()`**: `loadRoutines → loadChecklist → loadLog → loadBudget → loadSettings → loadAlerts → renderWashReminderCards()`. `ROUTINES_KEY` is included in the sync pull. `loadRoutines` runs first so `routines[]` is populated before `loadSettings` calls `renderWashReminderCards`.

### Storage keys

| Key | Shape | Owner |
|---|---|---|
| `corolla-checklist-v3` | `{ phases: [{id, tag, title, items: string[]}], nextId: number, checked: {[slug]: bool} }` | Checklist phases + checked state |
| `corolla-washlog-v1` | `Array<{id, date, type, steps[], notes}>` | Wash log |
| `corolla-budget-v1` | `{ target: number }` | Budget target |
| `corolla-settings-v1` | `{ freq, routines, prefs, car: {model, year, colour, rego, displayName, postcode}, notifications, schedules: [{routineId, intervalValue, intervalUnit}] }` | Settings |
| `corolla-price-alerts-v1` | `{ [slug]: { thresholdCents: number, channel: 'global' \| 'ticktick' \| 'email' } }` | Per-product price alert thresholds |
| `corolla-routines-v1` | `Array<{ id, name, subtext, types: string[], steps: [{product, action, enabled}], alerts: [{severity, label, text}] }>` | Fully customisable routine objects |

Bump the version suffix on breaking shape changes rather than writing migrations. The checklist key has gone through three versions: `corolla-detailing-app-v4` (positional `item-N` IDs) → `corolla-checklist-v2` (slug-keyed config) → `corolla-checklist-v3` (phases array with metadata). Each `loadChecklist()` migrates forward automatically on first load.

### Kit items and phases

The checklist is fully dynamic — no `<label class="item">` elements exist in HTML. `renderChecklist()` creates them from `checklistState.phases` and appends them into `#phases-container`. Each phase has an `id` (string, sequential from `nextId`), a `tag` (small label, e.g. "Phase 1 · foundation"), a `title` (h2 heading), and an `items` array of product slugs.

The full product catalog is the `CATALOG` constant in `app.js` — 46 products (25 default kit items across phases 1–4, plus 21 phase-0 extras available to add). `DEFAULT_PHASES` defines the original four-phase arrangement; it is only used when no saved state exists or as a migration source.

To add a new product to the catalog: add it to `CATALOG` in `app.js` AND to `seed.ts` in the backend (with retailer URLs). The user can then add it to any phase via the Edit UI.

### Routine system

The routine tab is fully dynamic — no static HTML tables. All routine data lives in `corolla-routines-v1`.

**Constants (`app.js`):**
- `ROUTINES_KEY` — storage key string `'corolla-routines-v1'`
- `PRODUCT_ACTIONS` — map of 34 catalog slugs → default action strings. Used to auto-fill the action field when the user types a known product name in the step editor.
- `DEFAULT_ROUTINES` — three routine objects (Exterior, Interior, Maintenance) matching the original static content. Used on first load and by `resetEverything()`.
- `ROUTINE_CSV_TEMPLATE` — a Claude prompt template string, downloadable as `routine-template.txt`, for generating routines via an AI assistant.

**State:** `let routines = []` — loaded from storage, falls back to deep copy of `DEFAULT_ROUTINES`.

**Key functions:**
- `loadRoutines()` — reads `corolla-routines-v1`, falls back to defaults, calls `buildCatalogDatalist()` + `renderRoutinesView()` + `renderRoutineConfigCards()` + `renderSchedulesUI()`
- `saveRoutines()` — writes to storage, calls `syncPush()`, re-renders both views, shows saved confirmation
- `renderRoutinesView()` — renders into `#routines-view`. One `.product-section` per routine (with `id="routine-view-{id}"`), only enabled steps, numbered rows, callout divs for alerts. Does **not** call `applySchedule()` — the routine view is fully static data.
- `renderRoutineConfigCards()` — renders into `#routine-config-cards`. One `.routine-config-card` per routine with name/subtext inputs, type checkboxes, step editor rows (product datalist + action + enable toggle + delete), alert editor rows (severity select + label + text + delete), delete routine button. Cards are `draggable=true` for reordering.
- `buildCatalogDatalist()` — populates `<datalist id="catalog-datalist">` from `CATALOG` names so the product input gets autocomplete
- `updateRoutineMeta(rIdx, field, val)` — updates name or subtext
- `toggleRoutineType(rIdx, type, checked)` — adds/removes type from `types[]`
- `updateRoutineStep(rIdx, sIdx, field, val)` — updates a step field; auto-fills action from `PRODUCT_ACTIONS` when product changes and action is empty
- `addRoutineStep(rIdx)` / `removeRoutineStep(rIdx, sIdx)` — add/remove steps
- `updateRoutineAlert(rIdx, aIdx, field, val)` — updates severity, label, or text
- `addRoutineAlert(rIdx)` / `removeRoutineAlert(rIdx, aIdx)` — add/remove alerts
- `addRoutine()` — appends blank routine object with generated ID
- `deleteRoutine(rIdx)` — removes routine after confirm

**Drag-to-reorder:** `routineDragSrc` (separate from `dragSrc` used by step-level drag) tracks the source card index. `dragstart`/`drop` events on each card call `routines.splice()` + `renderRoutineConfigCards()`. Cards show `.drag-over` outline and `.dragging` opacity during drag.

**CSV format:** flat rows with `row_type` in column 0. A `routine` row defines the routine metadata; following `step` and `alert` rows belong to the most recent `routine` row. 12 columns total: `row_type, routine_id, name, subtext, types, product, action, enabled, sched, severity, label, text`. Import appends to existing routines (never overwrites) and assigns new IDs.

**Shared helpers:**
- `escAttr(str)` — escapes `"`, `<`, `>`, `&` for safe embedding in HTML attribute values
- `triggerDownload(content, filename, mime)` — creates a `Blob`, object URL, clicks a hidden `<a>`, revokes URL

**`applySchedule()`** — retained in `app.js` for the future Schedule page. It reads `[data-sched]` attributes from the DOM and overwrites cell text with live frequency labels. It is no longer called from `renderRoutinesView()` — the Maintenance routine shows static step text, not dynamic frequency values.

**`settings.routines`** (in `corolla-settings-v1`) — the simple name+enabled arrays for log step chips. Untouched by the routines overhaul; still drives the chip editor in Routines → Configure and the log step checklist.

**`settings.schedules`** (in `corolla-settings-v1`) — array of `{ routineId, intervalValue, intervalUnit }` entries. Drives the reminder cards in the log tab and the 07:00 UTC wash reminder cron. Default: `[]`. Managed via Routines → Schedules sub-tab. `intervalUnit` is `'days' | 'weeks' | 'months' | 'years'`.

**Wash reminder functions:**
- `scheduleIntervalDays(schedule)` — converts `{ intervalValue, intervalUnit }` to a number of days
- `calcScheduleStreak(schedule, forecast)` — counts consecutive on-time completions for a schedule; returns 0 if currently overdue, unless `forecast[0].rain_chance >= 50` (raining today), in which case the streak is held. Both call sites pass `weatherCache`.
- `calcRoutineNextDue(schedule)` — maps routine types to relevant log entry types, finds the most recent matching log entry, returns next due Date
- `calcBestWashDay(dueDate, forecast)` — returns the `rainDay` name (e.g. `'Thursday'`) when rain is forecast and the due date is ≤ 2 days away; null otherwise
- `renderWashReminderCards()` — renders `.wash-reminder-card` elements into `#wash-reminder-cards` (above sub-tabs in log tab); called from `renderLog()`, `loadSettings()`, and `saveSettings()`
- `goToRoutine(routineId)` — clicks the Routines tab and scrolls to `#routine-view-{id}`
- `sendWashReminderToTickTick(routineId, routineName, btn)` — `POST /api/notify/wash-reminder`; shows "Sent ✓" / "Failed" on the button
- `renderSchedulesUI()` — renders schedule entry rows (routine dropdown, interval input, unit select, remove button) into `#schedule-list`
- `updateScheduleField(idx, field, val)` / `addScheduleEntry()` / `removeScheduleEntry(idx)` — mutate `settings.schedules` in-place and re-render

### CSS conventions

- All design tokens in `:root` CSS variables, with `prefers-color-scheme: dark` overrides
- Two fonts: **Fraunces** (serif, headings) and **Inter** (sans, body)
- Light theme: warm cream `#faf8f3`; dark theme: `#15171a`
- Accent: forest green `--accent` (`#2d7d5a`)
- Reuse existing tokens — don't introduce new colours or size scales
- `.section-head` / `.section-head--gap` — green uppercase subsection divider used in the Prices tab and Notifications settings. Previously named `.prices-section-head`; renamed global when reused in settings.

## Notifications

The app delivers notifications via two channels: TickTick (email-to-task) and direct email. Both use Resend. No OAuth or API tokens for TickTick — the user's personal `todo####@mail.ticktick.com` address is the only credential.

**Configuration:** stored in `settings.notifications` within `corolla-settings-v1` (synced via `userData`). Set in Settings → Notifications, which is split into TickTick and Email subsections. Fields:

| Field | Default | Meaning |
|---|---|---|
| `ticktickEmail` | `null` | User's TickTick inbox address (TickTick → Settings → Email) |
| `ticktickAlerts` | `true` | Send TickTick task for price alerts |
| `ticktickMetadata` | `'^Car #Corolla today'` | Suffix appended to all TickTick task subjects (project/tag/date/priority syntax) |
| `washReminders` | `true` | Send TickTick task when wash is overdue |
| `emailAlerts` | `false` | Send direct email for price alerts |
| `emailWashReminders` | `false` | Send direct email when wash is overdue |
| `emailDigest` | `false` | Send daily digest email (08:00 UTC) with sale items and threshold breaches |

**Per-product thresholds:** stored separately in `corolla-price-alerts-v1` (also synced). Shape: `{ [slug]: { thresholdCents, channel: 'global' | 'ticktick' | 'email' } }`. Managed via the 🔔 bell icon on each product card in the Prices tab. An "Active alerts" summary panel at the top of the Prices tab shows all configured thresholds with inline edit and remove.

**Four triggers:**

1. **On-sale price alert** (`routes/prices.ts`) — fires when `POST /api/prices` ingests an observation where `onSale=true` and the prior row for that product+retailer was not on sale (transition only — no repeat sends while a product stays on sale). Routed via `sendViaChannel('global', ...)`. Subject format:
   ```
   🔥 {Product name} on sale at {Retailer} — ${price} ^Car #Corolla today
   ```

2. **Threshold breach alert** (`routes/prices.ts`) — fires when the new price is at or below the user's configured threshold and the prior price was above it (transition only). Channel follows the per-product `channel` setting. Subject format:
   ```
   ⬇️ {Product name} below ${threshold} at {Retailer} — ${price} ^Car #Corolla today
   ```

3. **Wash reminder** (`index.ts` cron, 07:00 UTC daily) — reads the owner's `corolla-washlog-v1` and `corolla-settings-v1` from `userData`, calculates days since last wash vs `freq.fullWash` interval, sends if overdue. Sends TickTick if `washReminders && ticktickEmail`, sends email if `emailWashReminders`. Returns early if neither channel is active. TickTick subject:
   ```
   🚗 Corolla wash due ^Car #Corolla today !Medium
   ```

4. **Daily price digest** (`index.ts` cron, 08:00 UTC daily) — queries the latest price per product+retailer for on-sale items and threshold breaches. Sends nothing if both lists are empty. Email only (no TickTick). Gated on `emailDigest`. Subject format:
   ```
   🏷️ {N} price alerts — {day, date month}
   ```

**Key functions** (`backend/src/lib/email.ts`):
- `getOwnerNotificationSettings(ownerEmail)` — reads `corolla-settings-v1`, returns full `NotificationSettings` with safe defaults
- `getOwnerAlertThresholds(ownerEmail)` — reads `corolla-price-alerts-v1`, returns `Record<slug, AlertThreshold>`
- `sendTickTickTask(to, subject, body)` — plain-text email via Resend; no-op if `to` is falsy
- `sendDirectEmail(to, subject, bodyText)` — styled HTML email via Resend
- `sendDigestEmail(to, saleItems, thresholdItems)` — digest HTML email with section headers matching the app's green accent style; no-op if both lists empty
- `sendViaChannel(channel, notifSettings, ownerEmail, baseSubject, body)` — routes to TickTick (appends `ticktickMetadata` to subject) and/or email based on channel and toggle state

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