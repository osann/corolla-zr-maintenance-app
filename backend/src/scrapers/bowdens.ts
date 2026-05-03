import { eq, and, gt, avg } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, retailerUrls, priceHistory } from '../db/schema.js';
import { isOnSale } from '../lib/sale-detector.js';

const CACHE_HOURS = 6;
const RATE_LIMIT_MS = 3000;

// Bowden's Own blocks datacenter IPs with minimal headers. Use a realistic browser fingerprint.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// bowdensown.com.au is a custom platform. Prices live in schema.org itemprop markup:
//   <span itemprop="price">22.99</span>
// Compare-at (was) prices appear as strikethrough in <s> or <del> tags near the price block.
async function fetchProductPrice(url: string): Promise<{ priceCents: number; compareAtCents: number | null } | null> {
  const res = await fetch(url, { headers: BROWSER_HEADERS });

  if (res.status === 404) {
    console.warn(`  404 — product not found at ${url}`);
    return null;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }

  const html = await res.text();

  const priceMatch = html.match(/itemprop="price"[^>]*>\s*\$?\s*([0-9]+(?:\.[0-9]{1,2})?)/);
  if (!priceMatch) {
    console.warn(`  No itemprop="price" found at ${url}`);
    return null;
  }
  const priceCents = Math.round(parseFloat(priceMatch[1]) * 100);

  // Look for a strikethrough was-price near the price block (<s> or <del> tag with dollar amount)
  const wasMatch = html.match(/<(?:s|del)[^>]*>\s*\$?\s*([0-9]+(?:\.[0-9]{1,2})?)\s*<\/(?:s|del)>/i);
  const compareAtCents = wasMatch ? Math.round(parseFloat(wasMatch[1]) * 100) : null;

  return { priceCents, compareAtCents };
}

async function getRollingAvg(productId: number): Promise<number | null> {
  const result = await db
    .select({ avg: avg(priceHistory.priceCents) })
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.productId, productId),
        eq(priceHistory.retailer, 'bowdens'),
        gt(priceHistory.observedAt, sql`datetime('now', '-30 days')`),
      ),
    );
  const val = result[0]?.avg;
  return val !== null && val !== undefined ? Number(val) : null;
}

async function wasRecentlyScraped(productId: number): Promise<boolean> {
  const rows = await db
    .select({ id: priceHistory.id })
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.productId, productId),
        eq(priceHistory.retailer, 'bowdens'),
        gt(priceHistory.observedAt, sql`datetime('now', '-6 hours')`),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function scrapeAll(): Promise<void> {
  const rows = await db
    .select({
      productId: retailerUrls.productId,
      url: retailerUrls.url,
      slug: products.slug,
      name: products.name,
    })
    .from(retailerUrls)
    .innerJoin(products, eq(products.id, retailerUrls.productId))
    .where(eq(retailerUrls.retailer, 'bowdens'));

  console.log(`Scraping ${rows.length} Bowden's Own products...`);

  for (const row of rows) {
    try {
      if (await wasRecentlyScraped(row.productId)) {
        console.log(`  [skip] ${row.name} — scraped within ${CACHE_HOURS}h`);
        continue;
      }

      console.log(`  Fetching ${row.name}...`);
      const result = await fetchProductPrice(row.url);

      if (!result) {
        console.warn(`  [skip] ${row.name} — no price data returned`);
        continue;
      }

      const rollingAvg = await getRollingAvg(row.productId);
      const onSale = isOnSale(result.priceCents, result.compareAtCents, rollingAvg);

      await db.insert(priceHistory).values({
        productId: row.productId,
        retailer: 'bowdens',
        priceCents: result.priceCents,
        onSale,
      });

      const displayPrice = (result.priceCents / 100).toFixed(2);
      console.log(`  [ok] ${row.name} — $${displayPrice}${onSale ? ' 🔥 ON SALE' : ''}`);

      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      console.error(`  [error] ${row.name}:`, err);
    }
  }

  console.log('Scrape complete.');
}
