# Scraper Learnings

Hard-won notes from building the price scrapers. Read this before touching any scraper code.

> **Active scrapers: Supercheap, Auto Barn and Bowden's Own** (Bowden's from the home runner, since 2026-11-03). Repco and Autopro were retired on 2026-10-21 because they block bots. Their sections below are kept as reference for if a block ever lifts; see [blocked-retailers.md](blocked-retailers.md) for the current state and restore steps.

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

## URL templates don't work — store full URLs for Auto Barn, Repco, and Supercheap

Initial assumption: URLs could be constructed from a product code template. All three are wrong.

- **Auto Barn:** Short `/ab/p/{SKU}` URLs exist but hang at the server level for roughly half of all products. Always store the full canonical URL (e.g. `/ab/Autobarn-Category/.../p/CC04058`). The `autobarnSku` field is only a fallback when no full URL is known (it also derived Autopro URLs while Autopro was scraped).
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
- In-process scrapes against a persistent DB (formerly Autopro on Render)

On GitHub Actions, de-duplication happens server-side in the `POST /api/prices` endpoint.

---

## Auto Barn: cloud IPs blocked, scraped via self-hosted runner (HTTP only)

Auto Barn (`autobarn.com.au`) returns HTTP 403 from GitHub Actions hosted runner IPs and Render's cloud IPs. It is scraped from `debian-server`, a home Debian Linux machine with a residential IP, via `scrape-autobarn.yml`.

Even with a residential IP, short-form URLs (`/ab/p/{SKU}`) hang on plain HTTP (60s timeout) for roughly half of all products. The products that succeed respond in <15s; the failures never respond regardless of timeout length. **The root cause is the short URL routing, not the products themselves** — the Auto Barn backend does not reliably serve `/ab/p/{SKU}` redirects for all SKUs. Switching to full canonical URLs (e.g. `/ab/Autobarn-Category/.../p/CC04058`) fixes the affected products.

Full canonical URLs are now stored in `seed.ts` via the `autobarnUrl` field. The `autobarnSku` field is only a fallback (and derived Autopro's `/ap/p/{SKU}` URLs while Autopro was scraped). When adding a new Auto Barn product, always store the full canonical URL from the product page — not the short `/ab/p/{SKU}` form.

**Playwright fallback was tried and does not work:** the same short-URL requests that hang on plain HTTP also timeout in a Playwright browser session. Three runs of Playwright confirmed zero valid price captures. `playwrightFallback` is disabled on `autobarn.ts`. Do not re-enable it.

The OS dependencies for Playwright are installed on `debian-server` (required by the existing `browser.ts` infrastructure used by Supercheap/Repco scrapers):

```bash
sudo apt-get install -y libgbm1 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libxext6 libx11-xcb1 libpango-1.0-0 libasound2
```

Autopro (same platform, same SKUs) used to cover the gaps; it was retired on 2026-10-21 when it started blocking bots (see [blocked-retailers.md](blocked-retailers.md)).

**Do not attempt to re-add Auto Barn scraping from any cloud environment.** The block is IP-level and is not affected by user-agent, headers, or request timing.

Autopro (`autopro.com.au`) shares the same SKU codes and platform. It was scraped via a Render cron at 05:00 UTC until it put Imperva bot protection in front of the site (about 2026-09-25); it's now retired.

---

## `httpsGet`'s redirect handling must share one deadline across hops, not reset per hop

**Problem:** `httpsGet()` in `fetch-scraper.ts` follows redirects via a recursive call: `resolve(httpsGet(res.headers.location, opts, maxRedirects - 1))`. Each recursive call used to get its own fresh `REQUEST_TIMEOUT_MS` (60s) timer. A product whose URL redirects once before hanging therefore cost up to 2× the configured timeout — observed in production as Auto Barn misses taking ~120–130s instead of ~60s (`fetchBest`'s `Promise.any` race only saves time if *both* legs individually respect the 60s cap; one redirecting leg silently doubled it). Over a ~51-product run with roughly half missing, this materially lengthened the job and widened the window for the self-hosted runner to get killed mid-run (e.g. by a host-side SIGHUP).

**Fix:** Compute the deadline once (`Date.now() + REQUEST_TIMEOUT_MS`) on the outermost call and thread it through every recursive redirect call as a `deadline` param; each hop uses `deadline - Date.now()` as its remaining budget and bails immediately if that's `<= 0`. Also switched from the socket-idle `timeout` option to an `AbortController` tied to a real `setTimeout`, since idle-based timeouts can be reset by a connection that trickles occasional bytes without ever completing — a wall-clock abort can't be dodged that way.

```ts
// ❌ Each redirect hop gets its own full timeout budget
function httpsGet(url, opts, maxRedirects = 5) {
  const req = https.get(url, { headers, timeout: REQUEST_TIMEOUT_MS }, (res) => {
    if (isRedirect(res)) return resolve(httpsGet(res.headers.location, opts, maxRedirects - 1));
    ...
  });
}

// ✅ Deadline is computed once and shared across every hop
function httpsGet(url, opts, maxRedirects = 5, deadline = Date.now() + REQUEST_TIMEOUT_MS) {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) return reject(new Error('timed out'));
  const controller = new AbortController();
  setTimeout(() => controller.abort(), remainingMs);
  const req = https.get(url, { headers, signal: controller.signal }, (res) => {
    if (isRedirect(res)) return resolve(httpsGet(res.headers.location, opts, maxRedirects - 1, deadline));
    ...
  });
}
```

---

## A long-running self-hosted scrape must push results incrementally, not once at the end

**Problem:** `run-autobarn.ts` used to accumulate all ~51 observations in memory across the entire run and do a single `POST /api/prices` at the very end. The self-hosted runner lives on a home machine (`debian-server`) whose uptime and network are less reliable than a GitHub-hosted runner — it has been observed to die mid-run (SIGHUP, exit 129) after only a handful of products. Because the push only happened at the end, a mid-run death discarded every product scraped that day, including ones that had already succeeded.

**Fix:** `scrapeToArray()` in `fetch-scraper.ts` now accepts an optional `onProduct` callback invoked after each successful fetch. `scrapeAndPushInBatches()` (`push-in-batches.ts`, used by `run-autobarn.ts` and `run-bowdens.ts`) uses it to buffer results and push a batch of 10 to `/api/prices` as it goes, flushing the remainder at the end, or when the scraper throws. A failed batch push is left in the buffer (not cleared) so it merges with the next batch and gets retried, rather than being silently dropped. This bounds data loss from a mid-run crash to at most one partial batch instead of the whole run.

---

## Bowden's Own cannot be scraped from any cloud environment

Bowden's Own blocks all datacenter IPs at two levels:

- **GitHub Actions runner IPs** — Cloudflare serves a JS challenge ("Just a moment...") on every page load. Playwright sees this page instead of the product page regardless of stealth settings (`--disable-blink-features=AutomationControlled`, `navigator.webdriver` masking, etc.). The block is IP reputation, not fingerprint detection, so stealth improvements don't help.
- **Render IPs** — HTTP 403 on every request, including the product index page. This is a hard IP block, not a JS challenge.

Multi-size products (e.g. Snow Job) use the Maropost/Neto `/ajax/ajax_template` endpoint to load variant prices client-side. That endpoint also returns 403 from both GitHub Actions and Render IPs, even when session cookies are forwarded from a prior page request.

**Do not attempt to scrape bowdensown.com.au from any cloud environment.**

## Bowden's Own from home: three page layouts, and sizes via the site's own AJAX

From a home connection a plain request with a browser user agent gets 200 and server-rendered HTML, `/ajax/` included, so `scrapers/bowdens.ts` is a plain fetch on the self-hosted runner. It's a Neto (Maropost) store, and its product pages come in three layouts:
- **One price:** `$<span itemprop="price">37.99</span>` inside `.productprice`. The dollar sign is outside the span, so `createFetchScraper()`'s first-`$` regex skips it and reads a related-product tile instead (a $16.99 Big Softie on the Bead Machine page). Always read `.productprice [itemprop="price"]`.
- **Size buttons** (`_itmspec_radio` inputs, one `checked`): the page shows only the checked size's price. Neto has no per-size URL; `?sku=…` and friends are ignored.
- **A "Buying Options" table** (`#buy-child-list`): one row per option, each with its own SKU and `.child-price`. There's no main price on these pages, e.g. `/all-sorts` (single and twin pack) and `/snow-blow-cannon` (one row per pressure-washer adapter).

**Other sizes:** clicking a size button makes two requests, and the scraper replays them. Neto serialises their objects with its own NSD1 encoding (`create_netosd_data` in its storefront `main.js`), e.g. `{1: '4'}` is `NSD1;#1|$1|1$1|4`. No CSRF token was needed.
1. `POST /ajax/variations` with `proc=change_variation`, `specid`, the parent `sku` (`#_itmspec_sku`) and `variations={specid: valueId}`. The reply holds the size's SKU, e.g. `BOSNOWV25L`.
2. `GET /ajax/ajax_template?proc=load&docid=_jstl__header&type=…&template=…&fields=…`. The `type`, `template` and the other `fields` are the page's hidden `_jstl__header_k*`/`_v*` inputs, with `sku` replaced. The reply is the price block, `escape()`d.

**Stored URLs** therefore name the option after `#`: a size label (`/boss-gloss#5L`, case and spaces ignored) or a buying-option SKU (`/all-sorts#BOASORTS__`). Name the size even when it's the default. A page with options but no `#option`, or one the page doesn't offer, is a miss, so it shows as a ⚠ in the Products tab rather than as another size's price.

**Finding URLs:** Bowden's search (`?rf=kw`) is disallowed by `robots.txt`. The category pages (`/products/exterior`, `/products/interior`, `/products/microfibre`, `/products/value-packs`, `/products/car-cleaning-kits`, `/detailing-tools`) and `sitemap_1.xml.gz` list the products, though the sitemap lacks some, under `/products/…/` paths. Use the page's `<link rel="canonical">`. Bowden's doesn't sell Supercheap's exclusive 770ml sizes or the 5L Wet Dreams and Happy Ending.

**No was-price yet:** nothing was on sale to check the markup against (2026-11), so sales rely on the rolling average in `POST /api/prices`.

---

## Finding a retailer URL for a product

Supercheap's and Auto Barn's search pages are server-rendered and work from a home connection (Auto Barn blocks cloud IPs here too). For Bowden's Own, see its section above.

- Supercheap: `https://www.supercheapauto.com.au/search?q=bowdens+wheely+clean`. Result links are `/p/{slug}/{id}.html`.
- Auto Barn: `https://autobarn.com.au/ab/search/?text=bowdens+wheely+clean`. Results are full canonical `/ab/…/p/{SKU}` links. Strip the `?queryID=…&indexUsed=…` tracking parameters before saving one.

Before adding a URL:
- **Confirm it's the same product and size.** The URL slug can mislead: Supercheap's `little-chubby-brush-v2/700985` page is titled "The Chubby Wheel Brush V2", and it was the same brush as The Chubby. Compare the page title, the size and the pack contents, and on Auto Barn take the URL from `<link rel="canonical">`. Supercheap sells 770ml sizes nobody else does; one was attached to a 500ml product until 2026-11.
- **Run it through the real scraper.** Call `scrapeToArray()` from `scrapers/supercheap.ts` with an external row, from `scrapers/autobarn.ts` with `AUTOBARN_IGNORE_WINDOW=1`, or `fetchPrice()` from `scrapers/bowdens.ts`, and check the price it reads against the other retailers'.
- **Save it against the right retailer.** The product routes reject a URL from another retailer's site.

---

## Proton Drive sync conflicts corrupt the git index

If Proton Drive syncs during a git operation it may create conflict files like `seed (# Name clash 2026-05-04 jt0gs7C #).ts` in the working tree. Git sees this as the original file being deleted. Fix: delete the conflict file, then re-stage the original.

Avoid committing while Proton Drive is syncing, or pause sync during active git work.

---

## Autopro uses identical SKUs to Auto Barn

Autopro (`autopro.com.au`) and Auto Barn (`autobarn.com.au`) run on the same platform and share the same product SKU codes. A SKU confirmed on one site works on the other with only a path prefix change:

- Auto Barn: `https://www.autobarn.com.au/ab/p/{SKU}`
- Autopro:   `https://www.autopro.com.au/ap/p/{SKU}`

Both also share the same robots.txt restrictions: 10s crawl delay, 04:00–08:45 UTC crawl window. The seed derived Autopro URLs directly from the `autobarnSku` field, so no separate `autoproSku` field was needed.

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