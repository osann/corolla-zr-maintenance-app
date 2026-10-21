# Blocked retailers (removed 2026-10-21)

Repco, Autopro and Bowden's Own all block automated requests, so their scrapers, retailer URLs and price history were removed. This page keeps what's needed to bring one back if a block lifts.

- **Code as it last existed:** commit `e4f5670` (the last commit before removal).
- **Every retailer URL that was live in production:** [archive/blocked-retailer-urls.csv](archive/blocked-retailer-urls.csv), with columns `retailer, slug, name, url`. It has 56 Repco, 63 Autopro and 20 Bowden's rows. Some were added in the app and were never in `seed.ts`.
- **Price history:** deleted, not archived.

## Checking whether a block has lifted

Run these from a home connection. If a plain request succeeds, it's worth trying the real scraper.

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
curl -sI -A "$UA" https://www.repco.com.au/car-care-panel/car-care/car-wax-sealants/bowden-s-own-bead-machine-paint-sealant-500ml-bomachine/p/A5527501 | grep -i "^HTTP\|cf-mitigated"
curl -sL -o /dev/null -w "%{http_code}\n" -A "$UA" -c /tmp/cj -b /tmp/cj https://www.autopro.com.au/ap/p/CC06685
curl -sI -A "$UA" https://www.bowdensown.com.au/bead-machine | grep -i "^HTTP\|server"
```

What blocked looked like on 2026-10-21:
- **Repco:** 403 with `Cf-Mitigated: challenge`.
- **Autopro:** a 302 that sets `visid_incap_*` / `incap_ses_*` cookies, then a 403.
- **Bowden's:** 403 or a Cloudflare JS challenge from cloud IPs.

## Repco

- **Blocked since:** about 2026-08-16, the last successful scrape. It was disabled in automation on 2026-08-27.
- **Block:** Cloudflare bot management. Every product page returns 403 with `Cf-Mitigated: challenge`. That happens from GitHub Actions, from a plain curl, and from a home connection using the stealth Playwright context, so tweaking headers or the browser fingerprint won't help.
- **Approach that worked before:** Playwright with the stealth context (`backend/src/lib/browser.ts`), `waitUntil: 'domcontentloaded'` (never `networkidle`), and a 5 s rate limit. It ran on the GitHub Actions hosted runner from `run-and-push.ts`.
- **Selectors:** Repco runs server-rendered Hybris, so prices are in the initial HTML.
  - **Regular price:** `meta[property="og:price:amount"]` (`content="30.0"`). It's always present.
  - **Member/promo price:** the first `.promotion-price` that isn't inside `a.price-group` (those belong to related-product tiles).
  - **Price used:** the lower of the two. `compareAtCents` was null because member pricing is a permanent baseline rather than a sale; sales were detected from the rolling average.
  - **Never use `[itemprop="price"]`:** it only exists inside a JSON-LD `<script>`.
- **Repco's REST API:** member pricing needs auth, and it blocks cloud IPs. Not viable.
- **URLs:** full product URLs, which can't be built from a template. They were stored per product (`repcoUrl` in `seed.ts`).

## Autopro

- **Blocked since:** about 2026-09-25, the last successful scrape.
- **Block:** Imperva (Incapsula). A plain request gets a 302 that sets `incap` cookies, then a 403, including from a home connection. A real headless Chromium loaded 1 of 4 product pages and got 403 on the other three. `robots.txt` itself returns a bare "Loading" interstitial.
- **Approach that worked before:** a plain HTTPS fetch through `createFetchScraper()` in `backend/src/scrapers/fetch-scraper.ts`. That's the same factory and HTML parsing Auto Barn still uses, because the two sites share a platform. It ran in-process on Render via node-cron at 05:00 UTC and wrote straight to Turso.
- **Config:** `retailer: 'autopro'`, `homepageUrl: 'https://www.autopro.com.au/'`, `rateLimitMs: 15_000`, `cacheHours: 6`, crawl window 04:00–08:45 UTC (from `robots.txt`, Crawl-delay 10 s), and an `AUTOPRO_IGNORE_WINDOW` override.
- **URLs:** Autopro uses the same SKUs as Auto Barn. `seed.ts` derived `https://www.autopro.com.au/ap/p/{autobarnSku}` for every item with an `autobarnSku`. The other 13 URLs in the archive were added in the app.
- **To restore:**
  1. Recreate `scrapers/autopro.ts` with the config above.
  2. Re-add the SKU-derived URL in `seed()`.
  3. Re-add the `autopro.com.au` branch in `shortUrlAlternative()`.
  4. Put back `'autopro'` in the retailer lists (see below) and the 05:00 cron in `backend/src/index.ts`.
  5. Take `autopro` out of `RETIRED_RETAILERS` in `db/init.ts`.

## Bowden's Own

- **Status:** never successfully scraped.
- **Block:** GitHub Actions gets a Cloudflare JS challenge on page loads, and Render gets 403 on every request.
- **May 2026 experiment:** an OzBargain-RSS "sale detector" (`scrapers/export-prices.ts`) was tried and later deleted. It matched deal titles against product keywords and couldn't give actual prices.
- **URLs:** the 20 archived `bowdens` URLs are short product-page links like `https://www.bowdensown.com.au/bead-machine`. They were never scraped, but they did show up as Buy links.

## Restoring a retailer in general

1. Take it out of `RETIRED_RETAILERS` in `backend/src/db/init.ts`, or every boot will delete its rows again.
2. Add it back to:
   - `RETAILERS` in `backend/src/db/schema.ts`. That one list drives the Drizzle enum, the product/URL route checks, and which retailers `POST /api/prices` accepts.
   - `RETAILER_DISPLAY` in `backend/src/lib/email.ts`
   - `SCRAPED_RETAILERS` in `js/data.js`
   - `RETAILER_NAMES` in `js/data.js`
   - `RETAILER_ORDER` in `js/prices.js`
   - the add-product retailer `<select>` in `js/products.js`
3. Restore the scraper from `e4f5670` and wire it into a workflow or cron.
4. Re-import URLs from the CSV via the Products tab, or add them to `seed.ts`.

The database `CHECK` constraint on `retailer` still allows all five retailers, so none of this needs a table rebuild.
