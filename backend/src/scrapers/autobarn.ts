import https from 'node:https';
import { eq, and, gt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, retailerUrls, priceHistory } from '../db/schema.js';
import { isOnSale } from '../lib/sale-detector.js';
import type { PriceObservation } from '../routes/prices.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const FETCH_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
};

// Uses Node's https module to avoid undici's internal body timeout (UND_ERR_BODY_TIMEOUT).
// Follows redirects manually — Auto Barn's /ab/p/{SKU} URLs redirect to the full product path.
function httpsGet(url: string, maxRedirects = 5): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: FETCH_HEADERS, timeout: 60_000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (maxRedirects === 0) { reject(new Error('Too many redirects')); return; }
        resolve(httpsGet(res.headers.location, maxRedirects - 1));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out after 60s')); });
  });
}

const CACHE_HOURS = 6;
const RATE_LIMIT_MS = 15_000; // robots.txt Crawl-delay: 10, using 15s to reduce rate-limit risk

// Auto Barn's robots.txt restricts crawling to 04:00–08:45 UTC
const CRAWL_WINDOW = { startHour: 4, endHour: 8 }; // inclusive start, exclusive end at :45

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
  const { status, body: html } = await httpsGet(url);

  if (status === 404) {
    console.warn(`  404 — not found: ${url}`);
    return null;
  }
  if (status < 200 || status >= 300) {
    throw new Error(`HTTP ${status} fetching ${url}`);
  }

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
  const ignoreWindow = process.env.AUTOBARN_IGNORE_WINDOW === '1';
  if (!ignoreWindow && !isInCrawlWindow()) {
    console.log('Auto Barn: outside crawl window (04:00–08:45 UTC) — skipping');
    console.log('  (set AUTOBARN_IGNORE_WINDOW=1 to override)');
    return [];
  }
  if (ignoreWindow) console.log('Auto Barn: crawl window check bypassed (AUTOBARN_IGNORE_WINDOW=1)');

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
  const ignoreWindow = process.env.AUTOBARN_IGNORE_WINDOW === '1';
  if (!ignoreWindow && !isInCrawlWindow()) {
    console.log('Auto Barn: outside crawl window (04:00–08:45 UTC) — skipping');
    return;
  }
  if (ignoreWindow) console.log('Auto Barn: crawl window check bypassed (AUTOBARN_IGNORE_WINDOW=1)');

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
