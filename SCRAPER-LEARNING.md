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
- Member/promotional price: first `.promotion-price` that is NOT a descendant of `a.price-group` — only present on the main product when a member promotion applies. Carousel/related-product tiles use the same `.promotion-price` class but are wrapped in `a.price-group`; they must be excluded or the wrong product's price is returned.

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

## Auto Barn: cloud IPs blocked, scraped via self-hosted runner with Playwright fallback

Auto Barn (`autobarn.com.au`) returns HTTP 403 from GitHub Actions hosted runner IPs and Render's cloud IPs. It is scraped from `debian-server`, a home Debian Linux machine with a residential IP, via `scrape-autobarn.yml`.

Even with a residential IP, roughly half (~20/40) of Auto Barn product URLs consistently timeout on plain HTTP (60s, the other half succeed in <15s). The pattern is per-URL — the same products fail on every run regardless of session cookies, headers, or timing. These failures are handled by `playwrightFallback: true` in `autobarn.ts`: after the plain-HTTP loop, all failed products are retried in a single Playwright browser session using `createStealthContext()`.

**Self-hosted runner OS dependencies:** `npm ci` postinstall runs `npx playwright install chromium` which downloads the browser binary, but does NOT install the required system libraries. These must be installed once manually on `debian-server`:

```bash
sudo apt-get install -y libgbm1 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libxext6 libx11-xcb1 libpango-1.0-0 libasound2
```

Without these, Playwright will fail with: `error while loading shared libraries: libgbm.so.1: cannot open shared object file: No such file or directory`.

**Do not attempt to re-add Auto Barn scraping from any cloud environment.** The block is IP-level and is not affected by user-agent, headers, or request timing.

Autopro (`autopro.com.au`) shares the same SKU codes and platform but does NOT block Render IPs — Autopro is scraped via the Render cron at 05:00 UTC.

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

Key config fields:
- `homepageUrl` — pre-fetched before the product loop to obtain session cookies. Without these, Auto Barn drops connections after a few requests.
- `playwrightFallback` — when `true`, products that throw or return non-200 in the HTTP pass are collected into a `failed` array, then retried via `createStealthContext()` after the loop. Only suitable for environments where Playwright/Chromium system dependencies are installed (self-hosted runner, not Render).

To add a new plain-fetch retailer:

```ts
// my-retailer.ts
import { createFetchScraper } from './fetch-scraper.js';

const { scrapeToArray, scrapeAll: scrapeMyRetailer } = createFetchScraper({
  retailer: 'my-retailer',  // must be in the schema enum
  homepageUrl: 'https://www.my-retailer.com.au/',
  rateLimitMs: 15_000,
  cacheHours: 6,
  crawlWindow: { startHour: 4, endHour: 8, endMinute: 45 },
  ignoreWindowEnvVar: 'MY_RETAILER_IGNORE_WINDOW',
});

export { scrapeToArray, scrapeMyRetailer };
```

Remember to add the new retailer value to the `retailer` enum in `schema.ts`, add seed URLs, and wire the scraper into `scrapers/index.ts` and `backend/src/index.ts`.