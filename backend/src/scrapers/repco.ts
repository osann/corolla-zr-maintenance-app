// NOT called from the automated GitHub Actions path (run-and-push.ts) as of 2026-08-27 — Repco
// rolled out a Cloudflare bot-management challenge on their product pages sometime around
// 2026-08-16 (last successful scrape that day). Every request now gets HTTP 403 with
// `Cf-Mitigated: challenge`, confirmed from both a plain curl and a residential IP with this
// file's own stealth context, so it isn't a fixable header/UA/fingerprint tweak. Left in place
// (not deleted) in case Repco's WAF config changes again — see run-and-push.ts for the decision
// to disable it and scrapers/index.ts (`npm run scrape`, local-only) which still calls it, useful
// for manually checking whether the block has lifted.

import { eq, and, gt, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, retailerUrls, priceHistory } from '../db/schema.js';
import { isOnSale } from '../lib/sale-detector.js';
import { createStealthContext } from '../lib/browser.js';
import type { PriceObservation } from '../routes/prices.js';
import type { ScrapeRow } from './fetch-backend-rows.js';

const CACHE_HOURS = 12;
const RATE_LIMIT_MS = 5_000;

// Repco's OCC REST API requires auth for member pricing and blocks cloud IPs.
// Skip it — Playwright against the real page is the only reliable approach.

// Playwright page scrape.
// Repco is server-rendered Hybris (not Spartacus/Angular) — prices are in the initial HTML.
//
// Regular price: <meta property="og:price:amount" content="30.0"> — always present,
//   more reliable than any visible price element.
// Member price: first .promotion-price on the page — present only when a promo applies.
//   [itemprop="price"] only appears inside a <script type="application/ld+json"> tag,
//   NOT as a visible DOM attribute, so never use it as a waitForSelector target.
async function fetchRepcoPlaywright(pageUrl: string): Promise<{ priceCents: number; compareAtCents: number | null } | null> {
  const { context, close } = await createStealthContext();
  const page = await context.newPage();
  try {
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // og:price:amount is server-rendered into <head> — reliable anchor that's always present
    await page.waitForSelector('meta[property="og:price:amount"]', { state: 'attached', timeout: 10_000 });

    const prices = await page.evaluate(() => {
      const regularEl = document.querySelector('meta[property="og:price:amount"]');

      // Exclude .promotion-price inside carousel/related-product tiles (a.price-group).
      // Those belong to other products, not the current PDP item.
      const promoEl = Array.from(document.querySelectorAll('.promotion-price'))
        .find(el => !el.closest('a.price-group')) ?? null;

      return {
        regularText: regularEl?.getAttribute('content') ?? null,
        promoText: promoEl?.textContent?.trim() ?? null,
      };
    });

    const parsePrice = (text: string | null) =>
      text ? Math.round(parseFloat(text.replace(/[^0-9.]/g, '')) * 100) : null;

    const regularCents = parsePrice(prices.regularText);
    if (!regularCents) {
      const title = await page.title();
      console.warn(`    No price found (page: "${title}")`);
      return null;
    }

    const promoCents = parsePrice(prices.promoText);

    // Use the lowest available price (member/promo if present, else regular).
    // compareAt is intentionally null — Repco's member discount is a permanent
    // baseline, not a sale. Sale detection relies on rolling average in isOnSale.
    const priceCents = (promoCents && promoCents < regularCents) ? promoCents : regularCents;

    return { priceCents, compareAtCents: null };
  } catch (err) {
    console.warn(`    Playwright error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  } finally {
    await close();
  }
}

async function fetchProductPrice(url: string): Promise<{ priceCents: number; compareAtCents: number | null } | null> {
  return fetchRepcoPlaywright(url);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function wasRecentlyScraped(productId: number): Promise<boolean> {
  const rows = await db
    .select({ id: priceHistory.id })
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.productId, productId),
        eq(priceHistory.retailer, 'repco'),
        gt(priceHistory.observedAt, sql`datetime('now', '-12 hours')`),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function getRows() {
  return db
    .select({
      productId: retailerUrls.productId,
      url: retailerUrls.url,
      slug: products.slug,
      name: products.name,
    })
    .from(retailerUrls)
    .innerJoin(products, eq(products.id, retailerUrls.productId))
    .where(eq(retailerUrls.retailer, 'repco'));
}

// Returns price observations without writing to the DB. externalRows, if given, is used
// instead of querying the local DB — see fetch-backend-rows.ts for why the GitHub Actions
// entry point (run-and-push.ts) passes the live backend's product list in here.
export async function scrapeToArray(externalRows?: ScrapeRow[]): Promise<PriceObservation[]> {
  const rows = externalRows ?? await getRows();
  if (rows.length === 0) {
    console.log('Repco: no products configured — skipping');
    return [];
  }
  console.log(`Repco: scraping ${rows.length} products...`);

  const results: PriceObservation[] = [];

  for (const row of rows) {
    try {
      if (await wasRecentlyScraped(row.productId)) {
        console.log(`  [skip] ${row.name} — scraped within ${CACHE_HOURS}h`);
        continue;
      }

      console.log(`  Fetching ${row.name}...`);
      const result = await fetchProductPrice(row.url);

      if (!result) {
        console.warn(`  [skip] ${row.name} — no price data`);
        await sleep(RATE_LIMIT_MS);
        continue;
      }

      results.push({
        slug: row.slug,
        retailer: 'repco',
        priceCents: result.priceCents,
        compareAtCents: result.compareAtCents,
      });

      const displayPrice = (result.priceCents / 100).toFixed(2);
      console.log(`  [ok] ${row.name} — $${displayPrice}`);

      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      console.error(`  [error] ${row.name}:`, err);
      await sleep(RATE_LIMIT_MS);
    }
  }

  return results;
}

// Writes results directly to the local DB
export async function scrapeRepco(): Promise<void> {
  const rows = await getRows();
  if (rows.length === 0) {
    console.log('Repco: no products configured — skipping');
    return;
  }
  console.log(`Repco: scraping ${rows.length} products...`);

  for (const row of rows) {
    try {
      if (await wasRecentlyScraped(row.productId)) {
        console.log(`  [skip] ${row.name} — scraped within ${CACHE_HOURS}h`);
        continue;
      }

      console.log(`  Fetching ${row.name}...`);
      const result = await fetchProductPrice(row.url);

      if (!result) {
        console.warn(`  [skip] ${row.name} — no price data`);
        await sleep(RATE_LIMIT_MS);
        continue;
      }

      const avgRows = await db
        .select({ avg: sql<number>`AVG(price_cents)` })
        .from(priceHistory)
        .where(and(
          eq(priceHistory.productId, row.productId),
          eq(priceHistory.retailer, 'repco'),
          gt(priceHistory.observedAt, sql`datetime('now', '-30 days')`),
        ));
      const rollingAvg = avgRows[0]?.avg ?? null;
      const onSale = isOnSale(result.priceCents, null, rollingAvg);

      await db.insert(priceHistory).values({
        productId: row.productId,
        retailer: 'repco',
        priceCents: result.priceCents,
        onSale,
      });

      const displayPrice = (result.priceCents / 100).toFixed(2);
      console.log(`  [ok] ${row.name} — $${displayPrice}${onSale ? ' 🔥 ON SALE' : ''}`);

      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      console.error(`  [error] ${row.name}:`, err);
      await sleep(RATE_LIMIT_MS);
    }
  }
}
