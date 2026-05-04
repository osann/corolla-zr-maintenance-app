# Scraper Learnings

Hard-won notes from building the Playwright-based price scrapers. Read this before touching any scraper code.

---

## tsx compiles helper functions inside `page.evaluate()`

**Problem:** Any named function defined inside a `page.evaluate()` callback gets compiled by tsx with a `__name()` helper call that doesn't exist in the browser context, causing `ReferenceError: __name is not defined` for every product.

**Fix:** Keep `evaluate()` callbacks to plain DOM reads only. Move all logic (parsing, math, branching) to Node.js after the evaluate returns.

```ts
// ❌ Breaks — tsx injects __name(parsePrice, "parsePrice")
const result = await page.evaluate(() => {
  const parsePrice = (text) => Math.round(parseFloat(text) * 100);
  return parsePrice(document.querySelector('.price')?.textContent);
});

// ✅ Works — evaluate is pure DOM reads, parsing happens in Node.js
const raw = await page.evaluate(() => ({
  priceText: document.querySelector('.price')?.textContent?.trim() ?? null,
}));
const priceCents = raw.priceText
  ? Math.round(parseFloat(raw.priceText.replace(/[^0-9.]/g, '')) * 100)
  : null;
```

---

## `[itemprop="price"]` only exists in JSON-LD script tags

Both Repco and Supercheap embed `[itemprop="price"]` inside `<script type="application/ld+json">` blocks, not as a real DOM attribute. Using it as a `waitForSelector` target causes a 15-second timeout per product because Playwright is looking for a visible attribute that will never appear.

**Never use `[itemprop="price"]` as a wait target or querySelector on these sites.**

---

## `waitForSelector` needs `state: 'attached'` for meta tags

Meta tags aren't rendered visually so Playwright's default `state: 'visible'` will never fire. Use `state: 'attached'` when waiting for `<meta>` elements.

```ts
await page.waitForSelector('meta[property="og:price:amount"]', {
  state: 'attached',
  timeout: 10_000,
});
```

---

## `networkidle` vs `domcontentloaded`

`waitUntil: 'networkidle'` waits for no network activity for 500ms. Pages with persistent analytics, chat widgets, or polling will never reach idle and will timeout at 30 seconds.

If prices are in the initial HTML (both Repco and Supercheap are server-rendered), use `domcontentloaded` and then let `waitForSelector` handle the wait for the specific price element. This is faster and more reliable.

```ts
// ❌ Times out on pages with background analytics/tracking
await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });

// ✅ Fires as soon as HTML is parsed, waitForSelector does the rest
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
await page.waitForSelector('#product-content .product-price', { timeout: 15_000 });
```

---

## Repco: server-rendered Hybris, not Angular/Spartacus

Repco's PDP is rendered server-side using Hybris with jQuery. The Spartacus/Angular component selectors (e.g. `cx-product-intro`, `cx-price`) do not exist on the page.

**Reliable selectors:**
- Regular price: `meta[property="og:price:amount"]` content attribute — always present in `<head>`, server-rendered.
- Member/promotional price: first `.promotion-price` on the page — only present when a member promotion applies.

**OCC REST API is not usable:** Repco's backend API blocks cloud IPs and requires authentication to return member pricing. Playwright against the real page is the only reliable approach.

**Member pricing logic:**
```ts
const priceCents = (promoCents && promoCents < regularCents) ? promoCents : regularCents;
const compareAtCents = (promoCents && promoCents < regularCents) ? regularCents : null;
```

---

## Supercheap Auto: SFCC, prices from the site's own JS

Supercheap uses Salesforce Commerce Cloud (SFCC). The actual PDP selectors are defined in the page's own JavaScript — copy them exactly rather than guessing from HTML inspection.

```
pdpClubPrice  = "#product-content > .product-price.has-club .text-club-price"
pdpRetailPrice = "#product-content > .product-price .price-sales .promo-price"
pdpSalePrice   = "#product-content > .product-price.contain-promo .price-sales .promo-price"
pdpPricingWrapper = "#product-content > .product-price"
```

The wait anchor is `#product-content .product-price` — always present once the PDP loads. Club price (`has-club` class on the wrapper) is only present when a member pricing promotion is active.

---

## URL templates don't work for either retailer

Initial assumption: URLs could be constructed from a product code template. Both are wrong.

- **Repco:** Paths include full category slugs that vary per product. Store full URLs.
- **Supercheap:** URL slugs use `bowdens-own-bowdens-own-{name}` or `bowdens-own-{name}` patterns that don't map cleanly to product names, and SPO-prefixed bundle SKUs use a different pattern entirely. Store full URLs.

---

## ESM direct-run guard

Use `fileURLToPath(import.meta.url)` rather than string matching on the filename. The `endsWith('index.ts')` pattern matches the server entry point (`src/index.ts`) as well as `scrapers/index.ts`, causing the scraper to fire on server startup before seeding completes.

```ts
import { fileURLToPath } from 'node:url';

// ❌ Matches any file ending in index.ts
if (process.argv[1].endsWith('index.ts')) { ... }

// ✅ Only matches this exact file
if (process.argv[1] === fileURLToPath(import.meta.url)) { ... }
```

---

## 12-hour cache check doesn't help on GitHub Actions

`wasRecentlyScraped()` queries `priceHistory` for observations in the last N hours. On GitHub Actions, the local SQLite DB is initialised fresh on every run (via the `init-db` step), so the table is always empty and the check never skips anything.

The cache skip only works for:
- Local runs against a persistent local DB
- The Render backend's internal cron (`scrapeRepco`/`scrapeSupercheap`)

On GitHub Actions, de-duplication happens server-side in the `POST /api/prices` endpoint.

---

## Auto Barn crawl window

Auto Barn's `robots.txt` restricts crawlers to **04:00–08:45 UTC**. The main scrape workflow runs at different times — Auto Barn must run in its own workflow (`scrape-autobarn.yml`) scheduled at `0 5 * * *` (05:00 UTC = 15:00 AEST).

---

## Proton Drive sync conflicts corrupt the git index

If Proton Drive syncs during a git operation it may create conflict files like `seed (# Name clash 2026-05-04 jt0gs7C #).ts` in the working tree. Git sees this as the original file being deleted. Fix: delete the conflict file, then re-stage the original.

Avoid committing while Proton Drive is syncing, or pause sync during active git work.