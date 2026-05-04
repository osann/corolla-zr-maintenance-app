import { eq, and, gt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, retailerUrls, priceHistory } from '../db/schema.js';
import { isOnSale } from '../lib/sale-detector.js';
import { createStealthContext } from '../lib/browser.js';
import type { PriceObservation } from '../routes/prices.js';

const CACHE_HOURS = 6;
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
    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30_000 });

    // og:price:amount is server-rendered into <head> — reliable anchor that's always present
    await page.waitForSelector('meta[property="og:price:amount"]', { state: 'attached', timeout: 10_000 });

    const prices = await page.evaluate(() => {
      const regularEl = document.querySelector('meta[property="og:price:amount"]');
      const promoEl = document.querySelector('.promotion-price');

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

    // Member price is what we actually pay; regular retail becomes compareAt
    const priceCents = (promoCents && promoCents < regularCents) ? promoCents : regularCents;
    const compareAtCents = (promoCents && promoCents < regularCents) ? regularCents : null;

    return { priceCents, compareAtCents };
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
        gt(priceHistory.observedAt, sql`datetime('now', '-6 hours')`),
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

// Returns price observations without writing to the DB
export async function scrapeToArray(): Promise<PriceObservation[]> {
  const rows = await getRows();
  if (rows.length === 0) {
    console.log('Repco: no products configured — skipping');
    return [];
  }
  console.log(`Repco: scraping ${rows.length} products...`);

  const results: PriceObservation[] = [];

  for (const row of rows) {
    try {
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

      const onSale = isOnSale(result.priceCents, result.compareAtCents, null);

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
