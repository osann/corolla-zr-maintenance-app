import { eq, and, gt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, retailerUrls, priceHistory } from '../db/schema.js';
import { isOnSale } from '../lib/sale-detector.js';
import { createStealthContext } from '../lib/browser.js';
import type { PriceObservation } from '../routes/prices.js';

const CACHE_HOURS = 6;
const RATE_LIMIT_MS = 5_000;

// Repco product code is extracted from the URL path (last segment before /p/)
function productCodeFromUrl(url: string): string {
  // URL format: https://www.repco.com.au/en/car-care/car-cleaning/{code}/p/{code}
  const match = url.match(/\/p\/([^/?]+)/);
  return match?.[1] ?? '';
}

// Approach A: Repco's SAP Hybris OCC REST API (no Playwright needed if accessible)
async function fetchRepcoOCC(productCode: string): Promise<{ priceCents: number; compareAtCents: number | null } | null> {
  const url = `https://www.repco.com.au/repcocommercewebservices/v2/repco/products/${productCode}?fields=FULL`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'corolla-detailing-price-tracker/1.0 (personal project; contact: joh.10@pm.me)',
      'Accept': 'application/json',
      'Accept-Language': 'en-AU,en;q=0.9',
    },
  });

  if (!res.ok) return null;

  let data: Record<string, unknown>;
  try {
    data = await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }

  const price = (data.price as { value?: number } | undefined)?.value;
  if (typeof price !== 'number') return null;
  const priceCents = Math.round(price * 100);

  const basePrice = (data.basePrice as { value?: number } | undefined)?.value;
  const compareAtCents = typeof basePrice === 'number' && basePrice > price
    ? Math.round(basePrice * 100)
    : null;

  return { priceCents, compareAtCents };
}

// Approach B: Playwright page scrape fallback
async function fetchRepcoPlaywright(pageUrl: string): Promise<{ priceCents: number; compareAtCents: number | null } | null> {
  const { context, close } = await createStealthContext();
  const page = await context.newPage();
  try {
    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForSelector('cx-item-price, [itemprop="price"]', { timeout: 10_000 });

    const priceText = await page.evaluate(() => {
      const el = document.querySelector('[itemprop="price"]') ?? document.querySelector('.cx-item-price');
      return el?.getAttribute('content') ?? el?.textContent;
    });

    if (!priceText) return null;
    const priceCents = Math.round(parseFloat(priceText.replace(/[^0-9.]/g, '')) * 100);

    const compareText = await page.evaluate(() => {
      const el = document.querySelector('.cx-original-price .value, .price-original .value');
      return el?.getAttribute('content') ?? el?.textContent;
    });

    const compareAtCents = compareText
      ? Math.round(parseFloat(compareText.replace(/[^0-9.]/g, '')) * 100)
      : null;

    return { priceCents, compareAtCents: compareAtCents && compareAtCents > priceCents ? compareAtCents : null };
  } catch {
    return null;
  } finally {
    await close();
  }
}

async function fetchProductPrice(url: string): Promise<{ priceCents: number; compareAtCents: number | null } | null> {
  const productCode = productCodeFromUrl(url);

  if (productCode) {
    const occResult = await fetchRepcoOCC(productCode);
    if (occResult) return occResult;
    console.log('  OCC API failed — falling back to Playwright');
  }

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
