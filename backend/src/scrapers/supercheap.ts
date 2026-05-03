import { eq, and, gt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, retailerUrls, priceHistory } from '../db/schema.js';
import { isOnSale } from '../lib/sale-detector.js';
import { createStealthContext } from '../lib/browser.js';
import type { PriceObservation } from '../routes/prices.js';

const CACHE_HOURS = 6;
const RATE_LIMIT_MS = 5_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// SFCC renders prices with a content attribute on [itemprop="price"] or .value[content]
async function fetchProductPrice(pageUrl: string): Promise<{ priceCents: number; compareAtCents: number | null } | null> {
  const { context, close } = await createStealthContext();
  const page = await context.newPage();
  try {
    const response = await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30_000 });

    // 410 Gone = product removed from SFCC catalogue
    if (response?.status() === 410) {
      console.warn(`  410 Gone — URL needs updating: ${pageUrl}`);
      return null;
    }

    await page.waitForSelector('[itemprop="price"], .value[content]', { timeout: 10_000 });

    const priceText = await page.evaluate(() => {
      const el = document.querySelector('[itemprop="price"]')
               ?? document.querySelector('.value[content]');
      return el?.getAttribute('content') ?? el?.textContent;
    });

    if (!priceText) return null;
    const priceCents = Math.round(parseFloat(priceText.replace(/[^0-9.]/g, '')) * 100);

    // SFCC renders strike-through list price when on sale
    const compareText = await page.evaluate(() => {
      const el = document.querySelector('.strike-through.list .value[content], .strike-through .value');
      return el?.getAttribute('content') ?? el?.textContent;
    });

    const rawCompare = compareText
      ? Math.round(parseFloat(compareText.replace(/[^0-9.]/g, '')) * 100)
      : null;
    const compareAtCents = rawCompare && rawCompare > priceCents ? rawCompare : null;

    return { priceCents, compareAtCents };
  } catch {
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
