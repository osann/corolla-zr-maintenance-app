import { eq, and, gt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, retailerUrls, priceHistory } from '../db/schema.js';
import { isOnSale } from '../lib/sale-detector.js';
import type { PriceObservation } from '../routes/prices.js';

const CACHE_HOURS = 6;
const RATE_LIMIT_MS = 10_000; // robots.txt Crawl-delay: 10

// Auto Barn's robots.txt restricts crawling to 04:00–08:45 UTC
const CRAWL_WINDOW = { startHour: 4, endHour: 8 }; // inclusive start, exclusive end at :45

const BROWSER_HEADERS = {
  'User-Agent': 'corolla-detailing-price-tracker/1.0 (personal project; contact: joh.10@pm.me)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
};

function isInCrawlWindow(): boolean {
  const now = new Date();
  const hour = now.getUTCHours();
  const minutes = now.getUTCMinutes();
  if (hour < CRAWL_WINDOW.startHour) return false;
  if (hour > CRAWL_WINDOW.endHour) return false;
  // 08:45 UTC is the end — hour 8 is ok up to :44
  if (hour === CRAWL_WINDOW.endHour && minutes >= 45) return false;
  return true;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchProductPrice(url: string): Promise<{ priceCents: number; compareAtCents: number | null } | null> {
  const res = await fetch(url, { headers: BROWSER_HEADERS });

  if (res.status === 404) {
    console.warn(`  404 — not found: ${url}`);
    return null;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }

  const html = await res.text();

  // First $XX.XX in the page is the product price.
  // Afterpay instalment text ("4 payments of $X.XX") appears after the main price.
  const priceMatch = html.match(/\$([0-9]+\.[0-9]{2})/);
  if (!priceMatch) {
    console.warn(`  No price found at ${url}`);
    return null;
  }
  const priceCents = Math.round(parseFloat(priceMatch[1]) * 100);

  // Strike-through was-price when on sale
  const wasMatch = html.match(/<(?:s|del)[^>]*>\s*\$?\s*([0-9]+(?:\.[0-9]{1,2})?)\s*<\/(?:s|del)>/i);
  const compareAtCents = wasMatch ? Math.round(parseFloat(wasMatch[1]) * 100) : null;

  return { priceCents, compareAtCents };
}

async function wasRecentlyScraped(productId: number): Promise<boolean> {
  const rows = await db
    .select({ id: priceHistory.id })
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.productId, productId),
        eq(priceHistory.retailer, 'autobarn'),
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
    .where(eq(retailerUrls.retailer, 'autobarn'));
}

// Returns price observations without writing to the DB — used by GitHub Actions run-and-push.ts
export async function scrapeToArray(): Promise<PriceObservation[]> {
  if (!isInCrawlWindow()) {
    console.log('Auto Barn: outside crawl window (04:00–08:45 UTC) — skipping');
    return [];
  }

  const rows = await getRows();
  console.log(`Auto Barn: scraping ${rows.length} products...`);

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
        retailer: 'autobarn',
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

// Writes results directly to the local DB — used by the in-process cron job
export async function scrapeAutobarn(): Promise<void> {
  if (!isInCrawlWindow()) {
    console.log('Auto Barn: outside crawl window (04:00–08:45 UTC) — skipping');
    return;
  }

  const rows = await getRows();
  console.log(`Auto Barn: scraping ${rows.length} products...`);

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
        retailer: 'autobarn',
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
