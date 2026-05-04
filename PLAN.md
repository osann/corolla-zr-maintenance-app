# Plan: Price tracking — Bowden's Own scraper + frontend display

## Context

Task 1 from TASKS.md. The goal is a daily price scraper for Bowden's Own products that stores observations in a local SQLite database, exposes two API endpoints, and surfaces on-sale items in the frontend with a flame icon and a "Recent price drops" card in the spend tab.

**Scope for this milestone:**
- Retailer: Bowden's Own only (bowdensown.com.au — Shopify store)
- Frontend: flame icon next to on-sale items + "Recent price drops" card in the spend tab
- No email notifications yet (next milestone)
- No auth (single-user, local backend)
- Backend runs locally at `http://localhost:3000`

---

## Folder structure

Add a `backend/` directory alongside the existing frontend files:

```
backend/
├── src/
│   ├── index.ts              # Hono server entry + node-cron scheduler
│   ├── db/
│   │   ├── schema.ts         # Drizzle table definitions
│   │   ├── connection.ts     # DB connection singleton
│   │   └── seed.ts           # Seed all 26 products + Bowden's URL handles
│   ├── scrapers/
│   │   └── bowdens.ts        # Bowden's Own scraper
│   ├── routes/
│   │   ├── products.ts       # GET /api/products, GET /api/products/:id/prices
│   │   └── alerts.ts         # GET /api/alerts
│   └── lib/
│       └── sale-detector.ts  # Is-on-sale logic
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```

---

## Step 1 — Backend scaffold

### `backend/package.json`

Dependencies:
- `hono` + `@hono/node-server` — HTTP server
- `better-sqlite3` + `drizzle-orm` — database
- `drizzle-kit` — schema push / migrations (devDep)
- `node-cron` — daily scheduler
- `tsx` — TypeScript execution without compile step (devDep)
- `@types/better-sqlite3`, `@types/node-cron`, `typescript` (devDeps)

Scripts:
```json
{
  "dev": "tsx watch src/index.ts",
  "start": "tsx src/index.ts",
  "db:push": "drizzle-kit push",
  "db:studio": "drizzle-kit studio",
  "seed": "tsx src/db/seed.ts",
  "scrape": "tsx -e \"import('./src/scrapers/bowdens').then(m => m.scrapeAll())\""
}
```

### `backend/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist"
  }
}
```

### `backend/drizzle.config.ts`

```ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: './db.sqlite' }
});
```

---

## Step 2 — Database schema

### `backend/src/db/schema.ts`

Three tables:

```ts
import { integer, text, sqliteTable, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const products = sqliteTable('products', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  name:      text('name').notNull().unique(),
  slug:      text('slug').notNull().unique(),   // kebab-case identifier
  phase:     integer('phase').notNull(),         // 1–4
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const retailerUrls = sqliteTable('retailer_urls', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  retailer:  text('retailer', { enum: ['bowdens', 'supercheap', 'repco', 'autopro'] }).notNull(),
  url:       text('url').notNull()
}, (t) => [index('idx_product_retailer').on(t.productId, t.retailer)]);

export const priceHistory = sqliteTable('price_history', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  productId:  integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  retailer:   text('retailer', { enum: ['bowdens', 'supercheap', 'repco', 'autopro'] }).notNull(),
  priceCents: integer('price_cents').notNull(),  // $49.95 → 4995
  onSale:     integer('on_sale', { mode: 'boolean' }).notNull().default(false),
  observedAt: text('observed_at').notNull().default(sql`CURRENT_TIMESTAMP`)
}, (t) => [
  index('idx_price_product_time').on(t.productId, t.observedAt),
  index('idx_price_retailer_time').on(t.retailer, t.observedAt)
]);

export type Product     = typeof products.$inferSelect;
export type RetailerUrl = typeof retailerUrls.$inferSelect;
export type PriceRecord = typeof priceHistory.$inferSelect;
```

### `backend/src/db/connection.ts`

```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const sqlite = new Database('./db.sqlite');
sqlite.pragma('foreign_keys = ON');
export const db = drizzle(sqlite, { schema });
```

---

## Step 3 — Seed data

### `backend/src/db/seed.ts`

Seeds all 26 kit items into `products` and inserts one row per item into `retailer_urls` for Bowden's Own.

**Important:** Shopify handles need to be verified against the live bowdensown.com.au site before running seed. The handle is the last segment of the product URL (e.g. `/products/bead-machine` → handle is `bead-machine`). The URL stored is the full Shopify JSON endpoint: `https://bowdensown.com.au/products/{handle}.json`.

Products NOT on Bowden's Own direct (no Bowden's URL row created):
- Kärcher K2 Premium Pressure Washer (hardware retailer only)
- 303 Aerospace Protectant (BCF / Detailing Shed only)

Full product list to seed (name, slug, phase, bowdens-handle):

| # | Name | Slug | Phase | Bowden's handle (verify) |
|---|------|------|-------|--------------------------|
| 1 | Nanolicious Wash Pack Ultimate | nanolicious-wash-pack-ultimate | 1 | nanolicious-wash-pack-ultimate |
| 2 | Wet Dreams Pack | wet-dreams-pack | 1 | wet-dreams-pack |
| 3 | 2 Bucket Wash Kit | 2-bucket-wash-kit | 1 | 2-bucket-wash-kit |
| 4 | Boss Gloss 770ml | boss-gloss-770ml | 1 | boss-gloss |
| 5 | Naked Glass 500ml | naked-glass-500ml | 1 | naked-glass |
| 6 | Inta-Mitt | inta-mitt | 1 | inta-mitt |
| 7 | Kärcher K2 Pressure Washer | karcher-k2 | 1 | *(skip — not on Bowden's)* |
| 8 | Snow Blow Cannon | snow-blow-cannon | 1 | snow-blow-cannon |
| 9 | Snow Job 500ml | snow-job-500ml | 1 | snow-job |
| 10 | Happy Ending Finishing Foam 500ml | happy-ending-500ml | 1 | happy-ending-finishing-foam |
| 11 | Wheely Clean V2 500ml | wheely-clean-v2-500ml | 2 | wheely-clean-v2 |
| 12 | The Little Stiffy | the-little-stiffy | 2 | the-little-stiffy |
| 13 | The Flat Head | the-flat-head | 2 | the-flat-head |
| 14 | Fabra Cadabra 500ml | fabra-cadabra-500ml | 2 | fabra-cadabra |
| 15 | BOLP Leather Care Pack | bolp-leather-care-pack | 2 | bolp-leather-care-pack |
| 16 | Fabratection | fabratection | 2 | fabratection |
| 17 | 303 Aerospace Protectant | 303-aerospace | 2 | *(skip — not on Bowden's)* |
| 18 | Pumpy Pump | pumpy-pump | 3 | pumpy-pump |
| 19 | Nanolicious Wash 5L | nanolicious-wash-5l | 3 | nanolicious-wash-5l |
| 20 | Microfibre Wash 1L | microfibre-wash-1l | 3 | microfibre-wash |
| 21 | Plush Brush | plush-brush | 4 | plush-brush |
| 22 | Flash Prep 500ml | flash-prep-500ml | 4 | flash-prep |
| 23 | Bead Machine 500ml | bead-machine-500ml | 4 | bead-machine |
| 24 | Big Softie Pair | big-softie-pair | 4 | big-softie |
| 25 | Snow Job 5L | snow-job-5l | 4 | snow-job-5l |
| 26 | Wheely Clean V2 5L | wheely-clean-v2-5l | 4 | wheely-clean-v2-5l |

Seed script logic:
1. `INSERT OR IGNORE` each product row (idempotent)
2. For each product with a Bowden's handle, `INSERT OR IGNORE` a `retailer_urls` row

---

## Step 4 — Bowden's Own scraper

### `backend/src/scrapers/bowdens.ts`

```ts
export async function scrapeAll(): Promise<void>
```

For each product that has a `bowdens` row in `retailer_urls`:

1. Fetch `https://bowdensown.com.au/products/{handle}.json` with headers:
   ```
   User-Agent: corolla-detailing-price-tracker/1.0 (personal project)
   Accept: application/json
   ```
2. Extract price from `product.variants[0].price` (string, e.g. `"49.95"`) → multiply by 100 → integer cents
3. Detect on-sale via `compare_at_price`: if `variants[0].compare_at_price` is non-null and greater than `price`, the item is on sale
4. Fallback sale detection: query the last 30 days of observations for that product/retailer; if current price is more than 15% below the rolling average, flag as on sale
5. Insert a row into `price_history`
6. Sleep 2 seconds between requests (polite rate limiting for Bowden's Own)
7. Wrap each product fetch in try/catch — a single failed product should not abort the whole run

**Rate limit:** 2s between requests. Bowden's is low-traffic; this is conservative enough to be polite without slowing the scrape.

**Caching:** Do not re-scrape if an observation for this product/retailer already exists within the last 6 hours (query `price_history` before fetching).

---

## Step 5 — Sale detection

### `backend/src/lib/sale-detector.ts`

```ts
export function isOnSale(
  priceCents: number,
  compareAtPriceCents: number | null,
  rollingAvgCents: number | null
): boolean
```

Logic:
1. If `compareAtPriceCents` is set and > `priceCents` → `true`
2. Else if `rollingAvgCents` is set and `priceCents < rollingAvgCents * 0.85` → `true`
3. Else → `false`

The 30-day rolling average is computed in the scraper before calling this function:
```sql
SELECT AVG(price_cents) FROM price_history
WHERE product_id = ? AND retailer = 'bowdens'
  AND observed_at >= datetime('now', '-30 days')
```

---

## Step 6 — API routes

### `GET /api/products`

Returns all products joined with their latest price observation (if any) per retailer:

```json
[
  {
    "id": 1,
    "name": "Bead Machine 500ml",
    "slug": "bead-machine-500ml",
    "phase": 4,
    "latestPrice": {
      "bowdens": { "priceCents": 4995, "onSale": false, "observedAt": "2026-05-02T09:00:00" }
    }
  }
]
```

SQL: for each product, use a subquery or window function to get the most recent `price_history` row per retailer.

### `GET /api/products/:id/prices`

Returns full price history for a single product (for future sparklines):

```json
[
  { "retailer": "bowdens", "priceCents": 4995, "onSale": false, "observedAt": "2026-05-02T09:00:00" },
  { "retailer": "bowdens", "priceCents": 5995, "onSale": false, "observedAt": "2026-04-25T09:00:00" }
]
```

### `GET /api/alerts`

Returns items currently on sale (latest observation has `on_sale = true`):

```json
[
  {
    "productId": 19,
    "name": "Nanolicious Wash 5L",
    "slug": "nanolicious-wash-5l",
    "phase": 3,
    "retailer": "bowdens",
    "priceCents": 4760,
    "observedAt": "2026-05-02T09:00:00"
  }
]
```

### CORS

Add `app.use('*', cors())` using Hono's built-in `hono/cors` middleware so the browser frontend can call `localhost:3000` when serving `index.html` from disk.

---

## Step 7 — Hono server + scheduler

### `backend/src/index.ts`

```ts
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import cron from 'node-cron';
import productsRouter from './routes/products';
import alertsRouter from './routes/alerts';
import { scrapeAll } from './scrapers/bowdens';

const app = new Hono();
app.use('*', cors());
app.get('/api/health', (c) => c.json({ status: 'ok' }));
app.route('/api', productsRouter);
app.route('/api', alertsRouter);

// Daily scrape at 9 AM
cron.schedule('0 9 * * *', () => {
  scrapeAll().catch(console.error);
});

serve({ fetch: app.fetch, port: 3000 });
```

---

## Step 8 — Frontend changes

**File:** `app.js` — two targeted additions, no structural changes.

### Addition 1: Fetch price data on load

Add a `loadPriceData()` function called at the end of `init()`. It fetches `http://localhost:3000/api/alerts`, stores the result in a module-level variable `let priceAlerts = []`, then calls `applyPriceAlerts()`. If the fetch fails (backend not running), it silently returns — the app works normally without prices.

```js
let priceAlerts = [];

async function loadPriceData() {
  try {
    const res = await fetch('http://localhost:3000/api/alerts');
    if (!res.ok) return;
    priceAlerts = await res.json();
    applyPriceAlerts();
  } catch {
    // backend not running — degrade gracefully
  }
}
```

### Addition 2: `applyPriceAlerts()`

Two DOM mutations:

**a) Flame icons on checklist items**

For each alert, find the matching `.item` by index using the product slug. Add a 🔥 icon inside `.item-price` if the item is on sale. Use a `data-sale` attribute on the icon to avoid duplicating on repeated calls.

The mapping between `priceAlerts[].slug` and `itemData[i].slug` requires the seed data slugs to match the `slug` values stored in the DB — they do, since both are derived from the same product name list.

**Note:** `itemData` doesn't currently store `slug`. Add a `data-slug` attribute to each `<label class="item">` in `index.html` (e.g. `data-slug="bead-machine-500ml"`) so the JS can look items up by slug rather than fragile index matching.

**b) "Recent price drops" card in the spend tab**

Inject a new `.sale-section` card at the top of `#spend` (before the existing `.spend-summary`), only when `priceAlerts.length > 0`. Pattern matches the existing `.sale-card` component already in the spend tab HTML. Remove it if `priceAlerts` is empty.

```html
<div class="sale-section" id="price-drops-section">
  <div class="sale-section-title">Price drops right now</div>
  <div class="sale-section-desc">Live prices from Bowden's Own.</div>
  <!-- one .sale-card per alert -->
</div>
```

---

## Step 9 — index.html change

Add `data-slug` attributes to all 26 `<label class="item">` elements so `applyPriceAlerts()` can match alerts to checklist items by slug. Example:

```html
<label class="item" data-price="50" data-slug="bead-machine-500ml">
```

The slugs must match exactly the values seeded into `products.slug` in the database.

---

## Running it locally

```bash
cd backend
npm install
npm run db:push      # creates db.sqlite with schema
npm run seed         # inserts 26 products + Bowden's URLs
npm run scrape       # run one scrape now (verify it works)
npm run dev          # start server on :3000 with file-watching
```

Then open `index.html` in a browser. The spend tab will show a "Price drops right now" card if any Bowden's Own products are currently on sale.

---

## Verification checklist

- [ ] `GET /api/health` returns `{ status: 'ok' }`
- [ ] `GET /api/products` returns all 26 products; 24 have a `latestPrice.bowdens` entry after first scrape
- [ ] `GET /api/alerts` returns an empty array when nothing is on sale; returns items when `on_sale = true`
- [ ] Scraper inserts rows into `price_history`; second run within 6h is skipped (cache check)
- [ ] Opening `index.html` with the backend running: on-sale items show 🔥 in the checklist; spend tab shows "Price drops" card
- [ ] Opening `index.html` without the backend running: app works normally, no errors in console
- [ ] `data-slug` attributes on all 26 checklist items match the DB slugs exactly

---

---

# Plan: Multi-retailer scrapers — Auto Barn, Repco, Supercheap Auto

## Context

Extends the Bowden's Own scraper milestone. Adds price tracking for three Australian auto parts retailers that stock Bowden's Own products. Each retailer has a different platform and bot-protection profile; their scrapers are separate files with a shared `RetailerScraper` interface.

**Retailers covered:**

| Retailer | Platform | Price in static HTML? | Needs Playwright? | Rate limit |
|---|---|---|---|---|
| Auto Barn | Custom headless (Contentful CDN) | Yes | No | 10 s (robots.txt) |
| Repco | SAP Hybris / Spartacus (Angular SPA) | No | Yes (or OCC API) | 5 s |
| Supercheap Auto | Salesforce Commerce Cloud (Demandware SPA) | No | Yes | 5 s |

> **Cloud IP risk:** Bowden's Own blocks all cloud/datacenter IPs at Cloudflare. The other three retailers do not appear to have the same blanket block, but Repco showed 403 on basic `fetch()` requests — Playwright with `--disable-blink-features=AutomationControlled` and navigator.webdriver suppressed should pass. If either Repco or Supercheap also blocks cloud IPs, the solution is to run scrapers locally (residential IP) on a schedule rather than on Render/GitHub Actions.

---

## Step 10 — Schema update

### Update `backend/src/db/schema.ts`

Add `'autobarn'` to the retailer enum in both `retailerUrls` and `priceHistory` tables:

```ts
retailer: text('retailer', {
  enum: ['bowdens', 'supercheap', 'repco', 'autopro', 'autobarn']
}).notNull(),
```

This is a breaking schema change — run `drizzle-kit push` after editing to apply the migration to `db.sqlite`.

---

## Step 11 — Seed Auto Barn product URLs

### Update `backend/src/db/seed.ts`

Auto Barn product pages follow the URL pattern:
`https://www.autobarn.com.au/ab/[Category-Hierarchy]/[Product-Name]/p/[SKU]`

SKUs are alphanumeric codes like `CC06486`. The brand category page to discover all stocked Bowden's products is:
`https://www.autobarn.com.au/ab/Autobarn-Category/Car-Care-Accessories/Bowden-s-Own/c/184` (verify this URL — the category ID may change).

Known product URLs to verify and seed (research against the live site before seeding):

| Product slug | Auto Barn SKU | Notes |
|---|---|---|
| `nanolicious-wash-5l` | CC06486 | 2L confirmed stocked — verify 5L exists |
| `wheely-clean-v2-500ml` | CC04777 | Confirmed stocked |
| `microfibre-wash-1l` | CC06814 | 5L confirmed — verify 1L exists |
| All others | Unknown | Manually browse the brand page to find SKUs |

Add Auto Barn rows to the seed loop alongside the existing `bowdens` rows:

```ts
if (item.autobarnSku) {
  const url = `https://www.autobarn.com.au/ab/Autobarn-Category/Car-Care-Accessories/Bowden-s-Own/${item.autobarnSku}/p/${item.autobarnSku}`;
  await db.insert(retailerUrls).values({ productId, retailer: 'autobarn', url }).onConflictDoNothing();
}
```

> **Note:** Auto Barn's full URL path (the category hierarchy segment) can vary per product. The safest seed URL is to use the short form `/ab/p/[SKU]` if it redirects correctly — verify in browser first. If the full path is required, each product needs its own URL string rather than being constructed from SKU alone.

---

## Step 12 — Auto Barn scraper

### `backend/src/scrapers/autobarn.ts`

**Platform:** Custom headless storefront backed by Contentful. Prices are server-rendered in the HTML response — no JavaScript execution required.

**Price extraction:**

The price appears as plain text in the HTML. Auto Barn does not use JSON-LD or `itemprop` microdata. Use a regex on the raw HTML to find the first `$XX.XX` pattern after the product title, or locate the price container using a CSS class selector. The confirmed structure from page inspection is a `<span>` or `<div>` containing the price as text (e.g., `$84.99`).

Recommended approach — regex on text content:
```ts
const priceMatch = html.match(/\$([0-9]+\.[0-9]{2})/);
```

If the page has multiple dollar amounts (Afterpay instalments appear as "4 payments of $X.XX"), match only the **first** occurrence, which is the product price. Afterpay text always appears after the main price.

**Sale / compare-at detection:**

Auto Barn renders a strike-through element when a product is on sale. During sales, the HTML contains a `<s>` or `<del>` tag with the original (higher) price, followed by the discounted price. Use the same `<s>/<del>` regex pattern as the Bowden's scraper:

```ts
const wasMatch = html.match(/<(?:s|del)[^>]*>\s*\$?\s*([0-9]+(?:\.[0-9]{1,2})?)\s*<\/(?:s|del)>/i);
```

Also check for a "MemberPrice" label in the HTML — Auto Barn uses this for loyalty pricing which is effectively a public sale price.

**robots.txt constraints (must honour):**

- Minimum 10-second delay between requests (`Crawl-delay: 10`)
- Crawl window: `04:00–08:45 UTC` only (= 2:00pm–6:45pm AEST). The scraper should check the current UTC hour before making requests and abort if outside the window.

```ts
const AUTOBARN_CRAWL_WINDOW = { startHour: 4, endHour: 8 }; // UTC

function isInCrawlWindow(): boolean {
  const hour = new Date().getUTCHours();
  return hour >= AUTOBARN_CRAWL_WINDOW.startHour && hour < AUTOBARN_CRAWL_WINDOW.endHour;
}
```

**Full scraper shape:**

```ts
const RATE_LIMIT_MS = 10_000; // 10 s — robots.txt Crawl-delay

export async function scrapeAutobarn(): Promise<void> {
  if (!isInCrawlWindow()) {
    console.log('Auto Barn: outside crawl window (04:00–08:45 UTC) — skipping');
    return;
  }

  const rows = await db.select({ ... })
    .from(retailerUrls)
    .innerJoin(products, ...)
    .where(eq(retailerUrls.retailer, 'autobarn'));

  for (const row of rows) {
    // skip if scraped within 6h
    // fetch HTML with browser-like headers
    // extract price via regex
    // detect sale via <s>/<del> tag
    // insert into price_history
    await sleep(RATE_LIMIT_MS);
  }
}
```

**Bot protection:** None observed. Standard `fetch()` with a realistic `User-Agent` should work.

---

## Step 13 — Seed Repco product URLs

### Update `backend/src/db/seed.ts`

Repco product pages follow SAP Hybris URL pattern:
`https://www.repco.com.au/en/[category]/[product-name]/p/[A9XXXXXX]`

Repco SKUs use the format `A9XXXXXX` (e.g., `A9867756`). The most reliable way to find Bowden's Own SKUs on Repco is:
1. Browse `https://www.repco.com.au/search?q=bowdens+own` in a browser
2. Click each product to get its canonical URL and note the `A9` SKU from the URL
3. Add each confirmed URL to the seed data

Alternatively, Repco's SAP Hybris site exposes product data at:
`https://www.repco.com.au/repcocommercewebservices/v2/repco/products/search?query=bowdens+own&fields=FULL`
This OCC search endpoint may return product codes and names in JSON without authentication — verify in browser before relying on it.

Add Repco rows to the seed loop:
```ts
if (item.repcoProductCode) {
  const url = `https://www.repco.com.au/en/car-care/car-cleaning/${item.repcoProductCode}/p/${item.repcoProductCode}`;
  await db.insert(retailerUrls).values({ productId, retailer: 'repco', url }).onConflictDoNothing();
}
```

---

## Step 14 — Repco scraper

### `backend/src/scrapers/repco.ts`

**Platform:** SAP Hybris with Spartacus (Angular SPA). The page HTML does not contain product prices — all content is rendered client-side. Two approaches, in order of preference:

### Approach A — Hybris OCC REST API (try first)

SAP Hybris exposes an Open Commerce API (OCC) endpoint that returns full product data as JSON. For Repco, the endpoint is likely:

```
GET https://www.repco.com.au/repcocommercewebservices/v2/repco/products/{productCode}?fields=FULL
```

If accessible without authentication, this returns a JSON payload containing:
```json
{
  "price": { "value": 49.99, "formattedValue": "$49.99", "currencyIso": "AUD" },
  "basePrice": { "value": 59.99 },
  "discountedPrice": { "value": 49.99 }
}
```

Sale detection: if `discountedPrice.value < basePrice.value`, the product is on sale.

Test this endpoint manually in a browser before implementing — Hybris OCC sometimes requires an OAuth token (`client_credentials` grant with a public client). If a 401 is returned, fall back to Approach B.

**Implementation:**
```ts
async function fetchRepcoOCC(productCode: string) {
  const url = `https://www.repco.com.au/repcocommercewebservices/v2/repco/products/${productCode}?fields=FULL`;
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`Repco OCC ${res.status}`);
  const data = await res.json();
  const priceCents = Math.round(data.price.value * 100);
  const basePriceCents = data.basePrice ? Math.round(data.basePrice.value * 100) : null;
  return { priceCents, compareAtCents: basePriceCents };
}
```

### Approach B — Playwright page scrape (fallback)

If OCC requires auth, use Playwright to load the product page and extract the rendered price:

```ts
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
const context = await browser.newContext({ locale: 'en-AU' });
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
});
const page = await context.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

// Spartacus renders price in cx-price component; wait for it
await page.waitForSelector('cx-item-price, [itemprop="price"]', { timeout: 10000 });
const priceText = await page.evaluate(() => {
  const el = document.querySelector('[itemprop="price"]') ?? document.querySelector('.cx-item-price');
  return el?.getAttribute('content') ?? el?.textContent;
});
```

**Rate limit:** 5 seconds between requests.

**Bot protection:** Repco returned 403 on basic `fetch()`. Approach A (OCC API) may work without browser emulation since it's a JSON API with a different bot-protection profile. If both approaches return 403 from a cloud IP, this scraper must run on a local machine (residential IP) — document this as a known limitation.

---

## Step 15 — Seed Supercheap Auto product URLs

### Update `backend/src/db/seed.ts`

Supercheap Auto product pages follow Salesforce Commerce Cloud URL pattern:
`https://www.supercheapauto.com.au/p/[brand-product-name]/[SPO-SKU].html`

SPO SKUs (e.g., `SPO123456`) must be discovered by searching the site in a browser. The SFCC search endpoint returns product tiles with SKUs embedded in product card links.

To find Bowden's Own SKUs on Supercheap:
1. Search `https://www.supercheapauto.com.au/search?q=bowdens+own` in a browser
2. Hover each product to find the SPO SKU in the URL
3. Confirm the full product URL and add to seed data

Alternatively, the SFCC OCAPI product search endpoint may return JSON:
```
GET /on/demandware.store/Sites-supercheap-Site/en_AU/Search-Show?q=bowdens+own&format=ajax
```
This `format=ajax` variant is the pattern SAP/SFCC uses for partial-page AJAX responses. robots.txt blocks `/*format=ajax` for crawlers but you can still attempt it manually to check the response structure.

Add Supercheap rows to the seed loop:
```ts
if (item.supercheapSku) {
  const url = `https://www.supercheapauto.com.au/p/bowdens-own-${item.slug}/${item.supercheapSku}.html`;
  await db.insert(retailerUrls).values({ productId, retailer: 'supercheap', url }).onConflictDoNothing();
}
```

---

## Step 16 — Supercheap Auto scraper

### `backend/src/scrapers/supercheap.ts`

**Platform:** Salesforce Commerce Cloud (SFCC / Demandware). The page is a single-page application — the HTML shell contains no product data. Playwright is required.

**Price extraction:**

SFCC renders prices with a `content` attribute on the price element, which is reliable for extraction even without parsing display text:

```ts
await page.waitForSelector('[itemprop="price"], .value[content]', { timeout: 10000 });
const priceText = await page.evaluate(() => {
  const el = document.querySelector('[itemprop="price"]')
           ?? document.querySelector('.value[content]');
  return el?.getAttribute('content') ?? el?.textContent;
});
```

**Sale / compare-at detection:**

When an item is on sale, SFCC renders both a `listPrice` (original) and `salePrice` (current). The structure is typically:

```html
<span class="strike-through list">
  <span class="value" content="59.99">$59.99</span>
</span>
<span class="sales">
  <span class="value" content="49.99">$49.99</span>
</span>
```

Extract the `.strike-through .value[content]` attribute for compare-at price.

**Full scraper shape:**

```ts
export async function scrapeSupercheap(): Promise<void> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({ locale: 'en-AU' });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await context.newPage();

  try {
    const rows = await db.select({ ... }).from(retailerUrls)
      .innerJoin(products, ...)
      .where(eq(retailerUrls.retailer, 'supercheap'));

    for (const row of rows) {
      // skip if scraped within 6h
      await page.goto(row.url, { waitUntil: 'networkidle', timeout: 30000 });
      // extract price and compare-at from DOM
      // insert into price_history
      await sleep(5000);
    }
  } finally {
    await browser.close();
  }
}
```

**Note on 410 Gone responses:** SFCC product URLs can expire or redirect when catalogue entries are updated. If `page.goto()` lands on a 410 page, log it as a warning and skip — the URL needs to be manually updated in the seed data.

**Bot protection:** No Cloudflare block observed. SFCC does not use IP-level datacenter blocking by default. Standard Playwright with webdriver suppressed should work from GitHub Actions.

---

## Step 17 — Shared Playwright browser management

### `backend/src/lib/browser.ts`

Repco and Supercheap both need Playwright. Rather than each scraper launching and closing its own browser, provide a shared helper that creates a stealth-configured context:

```ts
import { chromium, type BrowserContext } from 'playwright';

export async function createStealthContext(): Promise<{ context: BrowserContext; close: () => Promise<void> }> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run'],
  });
  const context = await browser.newContext({
    locale: 'en-AU',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  return { context, close: () => browser.close() };
}
```

Both `repco.ts` and `supercheap.ts` import `createStealthContext` instead of calling `chromium.launch()` directly.

---

## Step 18 — Orchestrator update

### Update `backend/src/scrapers/index.ts` (or `backend/src/scrape.ts`)

The main scrape runner imports all four scrapers and runs them sequentially. Sequential (not parallel) execution is important — parallel scraping would exceed per-retailer rate limits and increase the risk of triggering bot detection.

```ts
import { scrapeAll as scrapeBowdens } from './bowdens.js';
import { scrapeAutobarn } from './autobarn.js';
import { scrapeRepco } from './repco.js';
import { scrapeSupercheap } from './supercheap.js';

export async function scrapeAllRetailers(): Promise<void> {
  console.log('=== Bowden\'s Own ===');
  await scrapeBowdens();

  console.log('=== Auto Barn ===');
  await scrapeAutobarn();   // skips automatically if outside crawl window

  console.log('=== Repco ===');
  await scrapeRepco();

  console.log('=== Supercheap Auto ===');
  await scrapeSupercheap();
}
```

Update `backend/src/index.ts` to call `scrapeAllRetailers()` from the cron job instead of `scrapeAll()`.

Update the npm `scrape` script in `package.json`:
```json
"scrape": "node --import tsx/esm src/scrapers/index.ts"
```

---

## Step 19 — Package.json update

Add `playwright` to dependencies (needed for Repco and Supercheap):

```bash
cd backend
npm install playwright
```

If the scraper runs in GitHub Actions, add a Playwright install step to the workflow:
```yaml
- name: Install Playwright browsers
  working-directory: backend
  run: npx playwright install chromium --with-deps
```

Note: if cloud IP blocking proves to be a problem for Repco or Supercheap (as it was for Bowden's Own), Playwright will not help — the block is at the network layer, not browser detection. In that case, scrapers for blocked retailers should be extracted into a separate script run on a local machine on a cron, pushing results to the backend via a `POST /api/prices` endpoint secured with a shared secret.

---

## Verification checklist (multi-retailer)

- [ ] Schema migration applied — `autobarn` accepted as retailer value without constraint error
- [ ] Auto Barn: scraper returns HTTP 200, price extracted correctly, skips outside crawl window
- [ ] Auto Barn: 10-second delay observed between requests (check log timestamps)
- [ ] Repco OCC: `GET /repcocommercewebservices/v2/repco/products/{SKU}?fields=FULL` returns JSON with price (test manually in browser first)
- [ ] Repco: price extracted and inserted into `price_history` with `retailer = 'repco'`
- [ ] Supercheap: Playwright loads the product page, waits for the price element to render, extracts price
- [ ] Supercheap: 410 Gone pages logged as warnings and skipped without aborting the run
- [ ] `GET /api/products` response includes `latestPrice.autobarn`, `latestPrice.repco`, `latestPrice.supercheap` entries after first multi-retailer scrape
- [ ] `GET /api/alerts` surfaces on-sale items from any retailer, not just Bowden's
- [ ] Frontend spend tab shows flame icon and sale card for items on sale at any retailer (alert card should name the retailer)

---

---

# Plan: Render deployment

## Context

The backend runs as a persistent web service on Render at:
`https://corolla-zr-maintenance-app.onrender.com`

The frontend is a static site on GitHub Pages. It calls the Render backend for price and alert data. The GitHub Actions scrape job triggers the Render backend on a daily cron.

**Known constraints:**
- Render free tier has **ephemeral disk** — `db.sqlite` is wiped on every deploy and whenever the service is restarted. Price history does not survive. This is acceptable for early development; the schema and seed data are recreated on startup, so the service is always functional, just without historical data.
- Render free tier **spins down after 15 minutes of inactivity**. The first request after idle takes ~30 seconds (cold start). The GitHub Actions scrape job hitting `POST /api/scrape` every morning wakes the service.
- Playwright (used by the Repco and Supercheap scrapers) **cannot run on Render's free tier** — insufficient memory and no display server. These scrapers must run in GitHub Actions and push results to Render via the `POST /api/prices` endpoint (Step 22).
- `node:sqlite` requires **Node.js 22+**. Render defaults to Node 18 unless explicitly configured.

---

## Step 20 — Node version pinning

### `backend/package.json`

Add an `engines` field so Render selects the correct Node version:

```json
"engines": {
  "node": ">=22"
}
```

### `backend/.node-version`

Also add a `.node-version` file in the `backend/` directory as a belt-and-braces fallback:

```
22
```

Render reads `engines.node` from `package.json` and `.node-version` (in that priority order). Either one is sufficient; both ensures compatibility with other deployment targets too.

---

## Step 21 — CORS configuration

### Update `backend/src/index.ts`

The Hono CORS middleware must allow requests from the GitHub Pages origin. The default `cors()` call allows all origins (`*`), which works but is broader than necessary. Tighten to explicit origins:

```ts
import { cors } from 'hono/cors';

app.use('*', cors({
  origin: [
    'https://osann.github.io',          // GitHub Pages root
    'https://osann.github.io/corolla-zr-maintenance-app', // repo subdirectory (if applicable)
    'http://localhost:5173',            // local dev (Vite, if added later)
    /^file:\/\//,                       // file:// protocol for opening index.html from disk
  ],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
}));
```

`file://` origins are rejected by CORS in all browsers regardless of what the server sends — browsers do not include an `Origin` header for file:// requests, so the server never needs to explicitly allow them. The `file://` entry above is illustrative but has no effect; remove it to avoid confusion. The app works from disk because CORS is only enforced on cross-origin requests from browsers.

**Practical config:**

```ts
app.use('*', cors({
  origin: ['https://osann.github.io'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
}));
```

If a custom domain is added later (e.g., `corolla.jhosan.top`), add it to the `origin` array.

---

## Step 22 — POST /api/prices endpoint

Because Playwright scrapers (Repco, Supercheap) cannot run on Render, the GitHub Actions scrape job runs them directly and pushes results to Render. This requires a new endpoint.

### `backend/src/routes/prices.ts`

```ts
import { Hono } from 'hono';
import { db } from '../db/connection.js';
import { priceHistory, products, retailerUrls } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { isOnSale } from '../lib/sale-detector.js';

const router = new Hono();

// POST /api/prices
// Accepts an array of price observations from the external scrape job.
// Secured with a shared secret in the Authorization header.
//
// Body: [{ slug, retailer, priceCents, compareAtCents }]
router.post('/prices', async (c) => {
  const secret = process.env.SCRAPE_SECRET;
  if (secret) {
    const auth = c.req.header('Authorization');
    if (auth !== `Bearer ${secret}`) return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json() as {
    slug: string;
    retailer: string;
    priceCents: number;
    compareAtCents: number | null;
  }[];

  let inserted = 0;
  for (const obs of body) {
    const [product] = await db.select({ id: products.id })
      .from(products)
      .where(eq(products.slug, obs.slug))
      .limit(1);
    if (!product) continue;

    const onSale = isOnSale(obs.priceCents, obs.compareAtCents, null);
    await db.insert(priceHistory).values({
      productId: product.id,
      retailer: obs.retailer as 'bowdens' | 'supercheap' | 'repco' | 'autobarn' | 'autopro',
      priceCents: obs.priceCents,
      onSale,
    });
    inserted++;
  }

  return c.json({ inserted });
});

export default router;
```

Register in `index.ts`:
```ts
import pricesRouter from './routes/prices.js';
app.route('/api', pricesRouter);
```

### Environment variable: `SCRAPE_SECRET`

Set in Render's environment variable dashboard. The GitHub Actions scrape workflow reads it from a GitHub secret and passes it as the `Authorization: Bearer <secret>` header.

Generate a random secret:
```bash
openssl rand -hex 32
```

Store the same value in:
- Render: **Environment → `SCRAPE_SECRET`**
- GitHub: **Settings → Secrets → `SCRAPE_SECRET`**

---

## Step 23 — Render service setup

### Service configuration

In the Render dashboard at `https://dashboard.render.com`:

1. **New → Web Service**
2. Connect the `osann/corolla-zr-maintenance-app` GitHub repository
3. Set **Root Directory**: `backend`
4. Set **Build Command**: `npm install`
5. Set **Start Command**: `node --import tsx/esm src/index.ts`
6. Set **Instance Type**: Free
7. Set **Region**: Singapore (closest to Australia)

### Environment variables

Set these in **Environment → Environment Variables**:

| Key | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `SCRAPE_SECRET` | `<generated secret>` | Must match GitHub secret of same name |
| `PORT` | *(leave unset)* | Render injects this automatically |

### Auto-deploy

Enable **Auto-Deploy** on push to `main`. Every push to the `backend/` directory on `main` redeploys the service. Note: redeploy wipes `db.sqlite` — price history is lost but the service is immediately functional again (seed runs on startup).

### Health check

Set the health check path to `/api/health` in Render's service settings. This endpoint must return HTTP 200. Render uses it to determine when the deployment is live.

---

## Step 24 — GitHub Actions: scrape workflow

### `.github/workflows/scrape.yml`

The scrape workflow runs daily at 9 AM AEST (23:00 UTC previous day), installs Playwright for the SPA scrapers, runs the scraper scripts directly in the Actions runner, then pushes results to Render.

```yaml
name: Daily price scrape

on:
  schedule:
    - cron: '0 23 * * *'   # 9 AM AEST (UTC+10)
  workflow_dispatch:

permissions:
  contents: read

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install backend dependencies
        working-directory: backend
        run: npm ci

      - name: Install Playwright browsers
        working-directory: backend
        run: npx playwright install chromium --with-deps

      - name: Run scrapers and push to Render
        working-directory: backend
        env:
          BACKEND_URL: ${{ secrets.BACKEND_URL }}
          SCRAPE_SECRET: ${{ secrets.SCRAPE_SECRET }}
        run: node --import tsx/esm src/scrapers/run-and-push.ts
```

### `backend/src/scrapers/run-and-push.ts`

This script runs all scrapers and pushes results to Render instead of writing to a local DB. It is the GitHub Actions entry point — distinct from the in-process scraper used when the backend is running locally.

```ts
// Runs all scrapers, collects results, POSTs them to the Render backend.
// Runs in GitHub Actions where Playwright is available and cloud IPs are
// not yet known to be blocked by Repco or Supercheap.

import { scrapeToArray as scrapeAutobarn } from './autobarn.js';
import { scrapeToArray as scrapeRepco } from './repco.js';
import { scrapeToArray as scrapeSupercheap } from './supercheap.js';

const BACKEND_URL = process.env.BACKEND_URL ?? 'https://corolla-zr-maintenance-app.onrender.com';
const SCRAPE_SECRET = process.env.SCRAPE_SECRET ?? '';

async function main() {
  const results = [
    ...await scrapeAutobarn(),
    ...await scrapeRepco(),
    ...await scrapeSupercheap(),
  ];

  console.log(`Collected ${results.length} price observations. Pushing to ${BACKEND_URL}...`);

  const res = await fetch(`${BACKEND_URL}/api/prices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SCRAPE_SECRET}`,
    },
    body: JSON.stringify(results),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /api/prices failed: HTTP ${res.status} — ${text}`);
  }

  const { inserted } = await res.json();
  console.log(`Done. ${inserted} observations stored.`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

Each scraper (`autobarn.ts`, `repco.ts`, `supercheap.ts`) needs to export **two** functions:
- `scrapeAll()` — writes directly to the local DB (used when the server runs locally with `npm run scrape`)
- `scrapeToArray()` — returns an array of `{ slug, retailer, priceCents, compareAtCents }` without touching the DB (used by `run-and-push.ts` in GitHub Actions)

The price-recording logic in `scrapeAll()` calls `scrapeToArray()` internally and then writes to the DB, so there is no duplication.

### GitHub secrets required

Set these at `https://github.com/osann/corolla-zr-maintenance-app/settings/secrets/actions`:

| Secret | Value |
|---|---|
| `BACKEND_URL` | `https://corolla-zr-maintenance-app.onrender.com` |
| `SCRAPE_SECRET` | Same value set in Render's `SCRAPE_SECRET` env var |

---

## Step 25 — Frontend: point to Render

### `app.js`

The frontend needs to know the Render URL to call `/api/products` and `/api/alerts`. Use the same `__BACKEND_URL__` placeholder approach injected by the deploy workflow:

```js
const BACKEND_URL = '__BACKEND_URL__';
```

### `.github/workflows/deploy.yml`

The GitHub Pages deploy workflow injects the Render URL before uploading:

```yaml
- name: Inject backend URL
  run: sed -i "s|__BACKEND_URL__|${{ secrets.BACKEND_URL }}|g" app.js
```

`BACKEND_URL` is already a GitHub secret from Step 24 — no additional secret needed.

---

## Step 26 — Handling Render cold starts

The free tier spins down after 15 minutes idle. On cold start, the first request takes ~30 seconds. The frontend `loadPriceData()` fetch will either:
- **Succeed slowly** — user sees price data after a delay (acceptable)
- **Time out** — if the browser's fetch times out before Render wakes up

Add an explicit timeout to the frontend fetch so it fails fast rather than hanging:

```js
async function loadPriceData() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout
    const [alertsRes, productsRes] = await Promise.all([
      fetch(`${BACKEND_URL}/api/alerts`, { signal: controller.signal }),
      fetch(`${BACKEND_URL}/api/products`, { signal: controller.signal }),
    ]);
    clearTimeout(timeout);
    // ... rest of function
  } catch {
    // backend cold-starting or unavailable — app still works without prices
  }
}
```

8 seconds is generous for a warm backend, and fails fast enough that the user isn't waiting on a cold start indefinitely.

To minimise cold starts, the GitHub Actions scrape job (which runs at 9 AM AEST daily) doubles as a daily wake-up ping. If the app sees significant daily use, consider adding a separate 14-minute ping cron to keep the service warm — though for a single-user personal tool this is probably not worth the effort.

---

## Render deployment checklist

- [ ] `backend/package.json` has `"engines": { "node": ">=22" }`
- [ ] `backend/.node-version` contains `22`
- [ ] Render Web Service created, root directory set to `backend`
- [ ] Build command: `npm install` — Start command: `node --import tsx/esm src/index.ts`
- [ ] Region set to Singapore
- [ ] `NODE_ENV=production` set in Render environment variables
- [ ] `SCRAPE_SECRET` set in Render environment variables (same value as GitHub secret)
- [ ] Health check path set to `/api/health` in Render service settings
- [ ] `GET https://corolla-zr-maintenance-app.onrender.com/api/health` returns `{ "status": "ok" }`
- [ ] `GET https://corolla-zr-maintenance-app.onrender.com/api/products` returns product list
- [ ] GitHub secrets `BACKEND_URL` and `SCRAPE_SECRET` set
- [ ] GitHub Pages deploy workflow injects `BACKEND_URL` into `app.js`
- [ ] Frontend loads price data from Render after GitHub Pages deploy
- [ ] Scrape workflow runs manually (`workflow_dispatch`) and pushes prices — `POST /api/prices` returns `{ inserted: N }` with N > 0
- [ ] Price data appears in frontend spend tab after successful scrape
