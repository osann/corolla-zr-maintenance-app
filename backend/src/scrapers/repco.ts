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
// Repco shows a member/promotion price in .promotion-price alongside the regular price.
// The first .promotion-price on the page belongs to the main product; related-product
// carousels appear further down the DOM, so querySelector picks the right one.
async function fetchRepcoPlaywright(pageUrl: string): Promise<{ priceCents: number; compareAtCents: number | null } | null> {
  const { context, close } = await createStealthContext();
  const page = await context.newPage();
  try {
    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30_000 });

    // Wait for either member price or standard schema price — whichever appears first
    await page.waitForSelector('.promotion-price, [itemprop="price"]', { timeout: 15_000 });

    const prices = await page.evaluate(() => {
      // First .promotion-price is the main product member price (related-product
      // carousels appear later in the DOM)
      const promoEl = document.querySelector('.promotion-price');
      // First [itemprop="price"] is the main product regular price
      const regularEl = document.querySelector('[itemprop="price"]');

      return {
        promoText: promoEl?.textContent?.trim() ?? null,
        regularText: regularEl?.getAttribute('content') ?? regularEl?.textContent?.trim() ?? null,
      };
    });

    const parsePrice = (text: string | null) =>
      text ? Math.round(parseFloat(text.replace(/[^0-9.]/g, '')) * 100) : null;

    const promoCents = parsePrice(prices.promoText);
    const regularCents = parsePrice(prices.regularText);

    if (!promoCents && !regularCents) {
      // Log the page title so we can tell if we hit a block page or CAPTCHA
      const title = await page.title();
      console.warn(`    No price elements found (page title: "${title}")`);
      return null;
    }

    // Member price is the actual price we pay; regular becomes compareAt
    const priceCents = promoCents ?? regularCents!;
    const compareAtCents = promoCents && regularCents && regularCents > promoCents ? regularCents : null;

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
