# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

A personal detailing kit-and-technique guide for a 2025 Toyota Corolla Hatch Hybrid ZR (Australian market). Built around the Bowden's Own product ecosystem with a few non-Bowden additions (303 Aerospace Protectant, Kärcher pressure washer). All retailer references are Australian (Supercheap Auto, Repco, Auto Barn, Autopro) and pricing is in AUD.

The app has eight tabs:
- **checklist** — kit purchase tracker, customisable phases (add/rename/delete), product prices
- **guide** — per-product technique reference (mostly static)
- **routine** — wash routines and ongoing maintenance schedule
- **log** — wash session log with streak counter
- **spend** — spend tracker, budget bar, live sale alerts
- **prices** — read-only price sheet: all tracked products grouped by functional category, all retailers per product, with sparklines and sale badges
- **refs** — links to manufacturer pages and community resources
- **settings** — frequencies, routine steps, display preferences, notification config (TickTick)

## Current architecture

```
corolla-zr-maintenance-app/
├── index.html              # App shell — HTML structure only
├── app.js                  # All frontend JS (vanilla, no framework)
├── styles.css              # All CSS
├── backend/
│   ├── src/
│   │   ├── index.ts        # Hono server + node-cron: Autopro scrape (05:00 UTC), wash reminder (07:00 UTC)
│   │   ├── db/
│   │   │   ├── schema.ts   # Drizzle schema (products, retailer_urls, price_history, users, sessions, magicTokens, userData)
│   │   │   ├── seed.ts     # Product catalogue + retailer URLs — edit this to add products
│   │   │   ├── init.ts     # Creates tables + runs seed
│   │   │   └── connection.ts
│   │   ├── routes/
│   │   │   ├── products.ts # GET /api/products — all products with latest prices per retailer
│   │   │   ├── prices.ts   # POST /api/prices — ingest scraper results
│   │   │   ├── alerts.ts   # GET /api/alerts, GET /api/prices/current
│   │   │   └── auth.ts     # Auth + sync: POST /api/auth/request|verify|logout, GET /api/auth/me, GET|POST /api/sync
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
│   │       └── email.ts         # sendMagicLink(), sendTickTickTask(), getOwnerNotificationSettings() via Resend
│   └── package.json
└── .github/workflows/
    ├── deploy.yml                    # Deploys index.html/app.js/styles.css to GitHub Pages
    ├── scrape.yml                    # Daily: Supercheap + Repco (any time)
    ├── scrape-autobarn.yml           # Daily 05:00 UTC: Auto Barn via self-hosted runner (debian-server)
    └── scrape-supercheap-tuesday.yml # Tuesdays: Supercheap Super Saver sale scrape (5 PM + 11:59 PM AEST)
```

### Hosting

- **Frontend:** GitHub Pages, served via CNAME at `https://corolla.jhosan.top`. `deploy.yml` replaces the `__BACKEND_URL__` placeholder in `app.js` with the `BACKEND_URL` secret before deploying.
- **Backend:** Render. `npm start` runs the Hono server. Two node-cron jobs fire daily: 05:00 UTC (Autopro scrape, within robots.txt crawl window) and 07:00 UTC (wash reminder — checks owner's wash log and sends a TickTick task if overdue). Auto Barn blocks Render's cloud IPs but is scraped via a self-hosted GitHub Actions runner on a home Linux machine (residential IP). Repco and Supercheap use Playwright which is not reliably available at Render runtime — those are handled entirely by GitHub Actions. Bowden's Own is not scraped — Cloudflare JS challenge on GitHub Actions, hard 403 on Render.
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
- `init()` on load: `setupChecklist → loadChecklist → loadLog → loadBudget → loadSettings → loadPriceData()` (non-blocking)
- `itemData` array is rebuilt by `renderChecklist()` on every render — includes `slug`, `phase` (phase ID string), `price`, `el`, `input`
- `loadPriceData()` fetches `GET /api/products`, calls `applyLivePrices()` which updates `.item-price` text, adds 🔥 for on-sale items, updates `item.price` in memory, then calls `recompute()` so spend totals reflect live prices. Fails silently if backend is unreachable. Timeout is 40s (Render free tier cold start is ~30s).
- `loadPriceHistories()` is called from `loadPriceData()` after prices are applied. It fetches `GET /api/products/:id/prices` for every product with a scraped price, populates `priceHistories`, then calls `renderPriceList()` (spend tab) and `renderPricesTab()` (prices tab).
- `renderPricesTab()` renders the **prices** tab. It iterates a hardcoded `PRICE_CATEGORIES` array (defined inside the function) that maps each functional category and sub-section to an ordered list of product slugs. It builds a `productBySlug` lookup from `liveProducts`, then for each slug renders a `.prices-product` block containing one `.prices-retailer-row` per retailer — each with price, 🔥 Sale badge, sparkline (or "No data yet." placeholder at the same fixed dimensions), and buy link. Categories and their sub-sections: Equipment (Microfibre / Wash Pads / Drying Towels / Other), Pressure Washer Equipment (Pressure Washers / Foam Cannons), Exterior Wash (Glass / Prep / Pre-Wash / Contact Wash), Exterior Protection (Sealant / Quick Detailer), Interior Clean (Leather / Fabric), Interior Protect (Leather / Fabric & Suede / Plastic, Vinyl & Rubber), Wheels (Equipment / Clean / Protect). A slug can appear in multiple categories. Products not in the mapping are silently omitted. Cards for categories where no product has a scraped price are not rendered.
- The `__BACKEND_URL__` guard uses `BACKEND_URL.startsWith('__')` — not strict equality. The `sed` substitution in `deploy.yml` replaces `__BACKEND_URL__` globally, which would corrupt a `=== '__BACKEND_URL__'` check into `=== '<real-url>'`. Never revert this to a string equality check.

### Storage keys

| Key | Shape | Owner |
|---|---|---|
| `corolla-checklist-v3` | `{ phases: [{id, tag, title, items: string[]}], nextId: number, checked: {[slug]: bool} }` | Checklist phases + checked state |
| `corolla-washlog-v1` | `Array<{id, date, type, steps[], notes}>` | Wash log |
| `corolla-budget-v1` | `{ target: number }` | Budget target |
| `corolla-settings-v1` | `{ freq, routines, prefs, car, notifications }` | Settings |

Bump the version suffix on breaking shape changes rather than writing migrations. The checklist key has gone through three versions: `corolla-detailing-app-v4` (positional `item-N` IDs) → `corolla-checklist-v2` (slug-keyed config) → `corolla-checklist-v3` (phases array with metadata). Each `loadChecklist()` migrates forward automatically on first load.

### Kit items and phases

The checklist is fully dynamic — no `<label class="item">` elements exist in HTML. `renderChecklist()` creates them from `checklistState.phases` and appends them into `#phases-container`. Each phase has an `id` (string, sequential from `nextId`), a `tag` (small label, e.g. "Phase 1 · foundation"), a `title` (h2 heading), and an `items` array of product slugs.

The full product catalog is the `CATALOG` constant in `app.js` — 46 products (25 default kit items across phases 1–4, plus 21 phase-0 extras available to add). `DEFAULT_PHASES` defines the original four-phase arrangement; it is only used when no saved state exists or as a migration source.

To add a new product to the catalog: add it to `CATALOG` in `app.js` AND to `seed.ts` in the backend (with retailer URLs). The user can then add it to any phase via the Edit UI.

### CSS conventions

- All design tokens in `:root` CSS variables, with `prefers-color-scheme: dark` overrides
- Two fonts: **Fraunces** (serif, headings) and **Inter** (sans, body)
- Light theme: warm cream `#faf8f3`; dark theme: `#15171a`
- Accent: forest green `--accent` (`#2d7d5a`)
- Reuse existing tokens — don't introduce new colours or size scales

## Notifications (TickTick integration)

The app sends tasks to TickTick via email-to-task (`todo####@mail.ticktick.com` accepts from any sender). Delivery uses the existing Resend setup. No OAuth or API tokens — the destination address is the only credential.

**Configuration:** stored in `settings.notifications` within `corolla-settings-v1` (synced via `userData`). Set in Settings → Notifications. Fields:
- `ticktickEmail` — the user's personal TickTick inbox address (TickTick → Settings → Email)
- `priceAlerts` — boolean, default true
- `washReminders` — boolean, default true

**Two triggers:**

1. **Price alert** (`routes/prices.ts`) — fires when `POST /api/prices` ingests an observation where `onSale=true` and the prior row for that product+retailer was not on sale (dedup: no repeat sends while a product stays on sale). Notification config is fetched once per request before the observation loop via `getOwnerNotificationSettings()`. Subject format:
   ```
   🔥 {Product name} on sale at {Retailer} — ${price} ^Car #Corolla today
   ```

2. **Wash reminder** (`index.ts` cron, 07:00 UTC daily) — reads the owner's `corolla-washlog-v1` and `corolla-settings-v1` from `userData`, calculates days since last wash vs `freq.fullWash` interval, sends if overdue. Returns early (no DB queries) if `ticktickEmail` is unset or `washReminders` is false. Subject format:
   ```
   🚗 Corolla wash due ^Car #Corolla today !Medium
   ```

**Key functions** (`backend/src/lib/email.ts`):
- `getOwnerNotificationSettings(ownerEmail)` — looks up owner's `corolla-settings-v1` from `userData`, returns `{ ticktickEmail, priceAlerts, washReminders }` with safe defaults if missing
- `sendTickTickTask(to, subject, body)` — sends plain-text email via Resend; no-op if `to` is falsy

**To force a test price alert:** `POST /api/prices` with a real product slug, `priceCents` below the rolling average (or `compareAtCents` higher than `priceCents`), and a prior off-sale row in the DB. **To force a test wash reminder:** temporarily change the cron to `* * * * *`, deploy, wait 60s, revert.

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