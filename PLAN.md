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
