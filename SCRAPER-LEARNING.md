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

If prices are in the initial HTML (Repco and Supercheap are both server-rendered), use `domcontentloaded` and then let `waitForSelector` handle the wait for the specific price element. This is faster and more reliable. **Never use `networkidle` for either retailer** — it has caused repeated timeouts in production.

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

## Auto Barn blocks GitHub Actions IPs — use Render cron only

Both plain `fetch()` and Playwright return HTTP 403 from Auto Barn on GitHub Actions runners. This is an IP-level block, not a headers or user-agent issue. The `scrape-autobarn.yml` workflow has been removed.

Auto Barn is scraped exclusively via the Render backend's node-cron job at 05:00 UTC (within the robots.txt crawl window of 04:00–08:45 UTC). Do not attempt to re-add a GitHub Actions workflow for Auto Barn.

Render does **not** have Playwright/Chromium pre-installed. Chromium is installed via a `postinstall` script in `backend/package.json` (`npx playwright install chromium --with-deps`), which runs automatically on every Render deploy. Auto Barn uses plain `fetch()` (not Playwright) because it was already IP-blocked regardless of browser.

---

## Bowden's Own cannot be scraped from any cloud environment

Bowden's Own blocks all datacenter IPs at two levels:

- **GitHub Actions runner IPs** — Cloudflare serves a JS challenge ("Just a moment...") on every page load. Playwright sees this page instead of the product page regardless of stealth settings (`--disable-blink-features=AutomationControlled`, `navigator.webdriver` masking, etc.). The block is IP reputation, not fingerprint detection, so stealth improvements don't help.
- **Render IPs** — HTTP 403 on every request, including the product index page. This is a hard IP block, not a JS challenge.

Multi-size products (e.g. Snow Job) use the Maropost/Neto `/ajax/ajax_template` endpoint to load variant prices client-side. That endpoint also returns 403 from both GitHub Actions and Render IPs, even when session cookies are forwarded from a prior page request.

**Do not attempt to scrape bowdensown.com.au from any cloud environment.** All Bowden's products in the catalogue have Repco or Supercheap fallback URLs. The `seed.ts` `Item` type has no `bowdensHandle` field — do not add one.

---

## Proton Drive sync conflicts corrupt the git index

If Proton Drive syncs during a git operation it may create conflict files like `seed (# Name clash 2026-05-04 jt0gs7C #).ts` in the working tree. Git sees this as the original file being deleted. Fix: delete the conflict file, then re-stage the original.

Avoid committing while Proton Drive is syncing, or pause sync during active git work.

---

## Autopro uses identical SKUs to Auto Barn

Autopro (`autopro.com.au`) and Auto Barn (`autobarn.com.au`) run on the same platform and share the same product SKU codes. A SKU confirmed on one site works on the other with only a path prefix change:

- Auto Barn: `https://www.autobarn.com.au/ab/p/{SKU}`
- Autopro:   `https://www.autopro.com.au/ap/p/{SKU}`

Both also share the same robots.txt restrictions: 10s crawl delay, 04:00–08:45 UTC crawl window. The seed derives Autopro URLs directly from the `autobarnSku` field — no separate `autoproSku` field is needed.

---

## Use `createFetchScraper()` for plain-fetch retailers

Plain-fetch scrapers (no Playwright, prices in server-rendered HTML) share identical logic: `httpsGet`, first-`$XX.XX` price regex, `<s>/<del>` was-price regex, crawl window check, cache check, DB write. This is extracted into `createFetchScraper()` in `scrapers/fetch-scraper.ts`.

To add a new plain-fetch retailer:

```ts
// my-retailer.ts
import { createFetchScraper } from './fetch-scraper.js';

const { scrapeToArray, scrapeAll: scrapeMyRetailer } = createFetchScraper({
  retailer: 'my-retailer',  // must be in the schema enum
  rateLimitMs: 15_000,
  cacheHours: 6,
  crawlWindow: { startHour: 4, endHour: 8, endMinute: 45 },
  ignoreWindowEnvVar: 'MY_RETAILER_IGNORE_WINDOW',
});

export { scrapeToArray, scrapeMyRetailer };
```

Remember to add the new retailer value to the `retailer` enum in `schema.ts`, add seed URLs, and wire the scraper into `scrapers/index.ts` and `backend/src/index.ts`.
