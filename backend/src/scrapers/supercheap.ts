import { eq, and, gt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, retailerUrls, priceHistory } from '../db/schema.js';
import { isOnSale } from '../lib/sale-detector.js';
import { createStealthContext } from '../lib/browser.js';
import type { PriceObservation } from '../routes/prices.js';

const CACHE_HOURS = 12;
const RATE_LIMIT_MS = 5_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Supercheap Auto uses SFCC (Salesforce Commerce Cloud).
// Prices are rendered into the DOM after page load — not in meta tags.
//
// Selectors from the site's own JS (pdpClubPrice, pdpRetailPrice, pdpSalePrice):
//   Club/member price:   #product-content > .product-price.has-club .text-club-price
//   Current sell price:  #product-content > .product-price .price-sales .promo-price
//   Standard retail:     #product-content > .product-price .price-standard .stroke-content
//
// We are a club member, so club price (when shown) is what we pay.
// compareAtCents = standard retail when it's higher than what we pay.
async function fetchProductPrice(pageUrl: string): Promise<{ priceCents: number; compareAtCents: number | null } | null> {
  const { context, close } = await createStealthContext();
  const page = await context.newPage();
  try {
    const response = await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30_000 });

    // 410 Gone = product removed from SFCC catalogue
    if (response?.status() === 410) {
      console.warn(`    410 Gone — URL needs updating: ${pageUrl}`);
      return null;
    }

    // Wait for the price wrapper — always present once the PDP loads
    await page.waitForSelector('#product-content .product-price', { timeout: 15_000 });

    const prices = await page.evaluate(() => {
      const parsePrice = (text: string | null | undefined) =>
        text ? Math.round(parseFloat(text.replace(/[^0-9.]/g, '')) * 100) : null;

      const clubEl = document.querySelector('#product-content > .product-price.has-club .text-club-price');
      const sellEl = document.querySelector('#product-content > .product-price .price-sales .promo-price');
      const retailEl = document.querySelector('#product-content > .product-price .price-standard .stroke-content');

      return {
        clubCents: parsePrice(clubEl?.textContent),
        sellCents: parsePrice(sellEl?.textContent),
        retailCents: parsePrice(retailEl?.textContent),
      };
    });

    const { clubCents, sellCents, retailCents } = prices;

    // Determine the price we actually pay
    const priceCents = clubCents ?? sellCents;
    if (!priceCents) {
      const title = await page.title();
      console.warn(`    No price found (page: "${title}")`);
      return null;
    }

    // Standard retail is the compareAt only when it's genuinely higher
    const compareAtCents = retailCents && retailCents > priceCents ? retailCents : null;

    return { priceCents, compareAtCents };
  } catch (err) {
    console.warn(`    Playwright error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  } finally {
    await close();
  }
}

async function wasRecentlyScraped(productId: number): Promise<boolean> {
  const rows = await db
    .select({ id: priceHistory.id })
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.productId, productId),
        eq(priceHistory.retailer, 'supercheap'),
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
    .where(eq(retailerUrls.retailer, 'supercheap'));
}

// Returns price observations without writing to the DB
export async function scrapeToArray(): Promise<PriceObservation[]> {
  const rows = await getRows();
  if (rows.length === 0) {
    console.log('Supercheap Auto: no products configured — skipping');
    return [];
  }
  console.log(`Supercheap Auto: scraping ${rows.length} products...`);

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
        retailer: 'supercheap',
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
export async function scrapeSupercheap(): Promise<void> {
  const rows = await getRows();
  if (rows.length === 0) {
    console.log('Supercheap Auto: no products configured — skipping');
    return;
  }
  console.log(`Supercheap Auto: scraping ${rows.length} products...`);

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
        retailer: 'supercheap',
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
