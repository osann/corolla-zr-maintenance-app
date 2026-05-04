# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

A personal detailing kit-and-technique guide for a 2025 Toyota Corolla Hatch Hybrid ZR (Australian market). Built around the Bowden's Own product ecosystem with a few non-Bowden additions (303 Aerospace Protectant, Kärcher pressure washer). All retailer references are Australian (Supercheap Auto, Repco, Auto Barn, Bowden's Own direct) and pricing is in AUD.

The app has seven tabs:
- **checklist** — kit purchase tracker, four phases, product prices
- **guide** — per-product technique reference (mostly static)
- **routine** — wash routines and ongoing maintenance schedule
- **log** — wash session log with streak counter
- **spend** — spend tracker, budget bar, live sale alerts
- **refs** — links to manufacturer pages and community resources
- **settings** — frequencies, routine steps, display preferences

## Current architecture

```
corolla-zr-maintenance-app/
├── index.html              # App shell — HTML structure only
├── app.js                  # All frontend JS (vanilla, no framework)
├── styles.css              # All CSS
├── backend/
│   ├── src/
│   │   ├── index.ts        # Hono server + node-cron for Bowden's scrape
│   │   ├── db/
│   │   │   ├── schema.ts   # Drizzle schema (products, retailer_urls, price_history)
│   │   │   ├── seed.ts     # Product catalogue + retailer URLs — edit this to add products
│   │   │   ├── init.ts     # Creates tables + runs seed
│   │   │   └── connection.ts
│   │   ├── routes/
│   │   │   ├── products.ts # GET /api/products — all products with latest prices per retailer
│   │   │   ├── prices.ts   # POST /api/prices — ingest scraper results
│   │   │   └── alerts.ts   # GET /api/alerts, GET /api/prices/current
│   │   ├── scrapers/
│   │   │   ├── bowdens.ts  # Shopify JSON-LD scraper (runs on Render via cron)
│   │   │   ├── supercheap.ts
│   │   │   ├── repco.ts
│   │   │   ├── autobarn.ts
│   │   │   ├── index.ts    # scrapeAllRetailers() — Render cron entry point
│   │   │   ├── run-and-push.ts  # GitHub Actions entry point: Supercheap + Repco → POST to backend
│   │   │   └── run-autobarn.ts  # GitHub Actions entry point: Auto Barn only
│   │   └── lib/
│   │       ├── browser.ts  # createStealthContext() — shared Playwright setup
│   │       └── sale-detector.ts
│   └── package.json
└── .github/workflows/
    ├── deploy.yml          # Deploys index.html/app.js/styles.css to GitHub Pages
    ├── scrape.yml          # Daily: Supercheap + Repco (any time)
    └── scrape-autobarn.yml # Daily at 05:00 UTC — within Auto Barn's robots.txt window
```

### Hosting

- **Frontend:** GitHub Pages. `deploy.yml` replaces the `__BACKEND_URL__` placeholder in `app.js` with the `BACKEND_URL` secret before deploying.
- **Backend:** Render. `npm start` runs the Hono server. Bowden's Own is scraped by an internal node-cron job (daily at 23:00 UTC) because Bowden's blocks cloud IPs that GitHub Actions runs on.

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

Three tables in SQLite (`backend/db.sqlite` locally, Render's persistent disk in production):

- **`products`** — `id, name, slug, phase, created_at`. Phase 0 = tracked for pricing but not shown in the kit checklist.
- **`retailer_urls`** — `product_id, retailer, url`. One row per product per retailer. Full URLs stored directly (templates don't work for Supercheap or Repco).
- **`price_history`** — `product_id, retailer, price_cents, on_sale, observed_at`. Append-only log of every scrape result.

**To add a product or retailer URL**, edit `backend/src/db/seed.ts`. The seed is idempotent — re-running it upserts without duplicating. Run `npm run seed` to apply locally, or let the next Render deploy pick it up.

## Scraper architecture

Two execution paths — read `SCRAPER-LEARNING.md` before modifying any scraper:

1. **GitHub Actions** (`run-and-push.ts`, `run-autobarn.ts`): calls `scrapeToArray()` which returns observations without writing to DB, then POSTs them to `POST /api/prices` on the Render backend. The local DB is always fresh on each run so the 12-hour cache check never skips anything here.

2. **Render cron** (`scrapers/index.ts`): calls `scrapeRepco()`, `scrapeSupercheap()`, `scrapeBowdens()`, etc. which write directly to the production DB. The 12-hour cache check (`wasRecentlyScraped()`) is effective here.

Scraper order in both paths: Supercheap → Repco (Repco is slower and more prone to rate-limiting).

Auto Barn has its own workflow (`scrape-autobarn.yml`) at 05:00 UTC because its `robots.txt` restricts crawlers to 04:00–08:45 UTC.

## Frontend architecture

`app.js` is vanilla JS, no framework. Key conventions:

- `storageGet(key)` / `storageSet(key, val)` — storage abstraction that tries `window.storage` (Claude artifact runtime) then falls back to `localStorage`. All persistence goes through these.
- `render*()` functions write to the DOM from state
- `apply*()` functions mutate the DOM based on current settings
- `init()` on load: `loadChecklist → loadLog → loadBudget → loadSettings → loadPriceData()` (non-blocking)
- `itemData` array is built at startup from `.item` DOM elements — includes `slug` for matching against live price data
- `loadPriceData()` fetches `GET /api/products`, calls `applyLivePrices()` which updates `.item-price` text, adds 🔥 for on-sale items, updates `item.price` in memory, then calls `recompute()` so spend totals reflect live prices. Fails silently if backend is unreachable.

### Storage keys

| Key | Shape | Owner |
|---|---|---|
| `corolla-detailing-app-v4` | `{ "item-0": true, ... }` | Checklist state |
| `corolla-washlog-v1` | `Array<{id, date, type, steps[], notes}>` | Wash log |
| `corolla-budget-v1` | `{ target: number }` | Budget target |
| `corolla-settings-v1` | `{ freq, routines, prefs, car }` | Settings |

Bump the version suffix on breaking shape changes rather than writing migrations.

### Kit items

Each `<label class="item">` has `data-price` (integer AUD), `data-slug` (matches `products.slug` in the DB), and a wrapping `.phase` with `data-phase` (1–4). Items are identified by index (`item-0`, `item-1`…) — append new items to the end of a phase section to avoid renumbering existing saved state.

### CSS conventions

- All design tokens in `:root` CSS variables, with `prefers-color-scheme: dark` overrides
- Two fonts: **Fraunces** (serif, headings) and **Inter** (sans, body)
- Light theme: warm cream `#faf8f3`; dark theme: `#15171a`
- Accent: forest green `--accent` (`#2d7d5a`)
- Reuse existing tokens — don't introduce new colours or size scales

## Things to preserve

1. **Aesthetic restraint.** Minimalist Fraunces serif headings. No dashboard gauges, no charts where prose works. One person, quiet interface.
2. **Australian-specific advice.** All retailers, prices, and sale timing are AU-specific. Don't generalise.
3. **Bowden's-first framing.** The technique guide is opinionated around the Bowden's range. Non-Bowden products are exceptions, not equals.
4. **Graceful degradation.** The app works offline/standalone without a backend — live prices enhance but don't gate any functionality.
5. **Phase ordering.** Phases are an acquisition plan (1 = essentials, 2 = complete kit, 3 = bulk consumables, 4 = long-term protection), not categories. Don't reorder.

## Scraper notes

See `SCRAPER-LEARNING.md` for detailed hard-won lessons. Key points:

- Never define named functions inside `page.evaluate()` — tsx compiles them with `__name()` helpers that don't exist in the browser context. Keep evaluate callbacks to plain DOM reads only.
- `[itemprop="price"]` on Repco and Supercheap only exists in JSON-LD `<script>` tags, not as real DOM attributes. Never use it as a selector.
- Use `waitUntil: 'domcontentloaded'` not `'networkidle'` for SFCC/Supercheap pages — some never reach idle due to analytics.
- Repco: `meta[property="og:price:amount"]` for regular price, `.promotion-price` for member price.
- Supercheap: selectors from the site's own JS — `#product-content > .product-price .price-sales .promo-price` for sell price, `.product-price.has-club .text-club-price` for club price.