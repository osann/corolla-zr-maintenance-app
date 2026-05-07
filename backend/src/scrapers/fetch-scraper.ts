// Shared factory for plain-fetch scrapers (Auto Barn, Autopro).
// Both sites share the same platform, URL structure, price HTML, and robots.txt constraints.
// Pass retailer-specific config; get back scrapeToArray + scrapeAll.

import https from 'node:https';
import { eq, and, gt, sql } from 'drizzle-orm';
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
// Follows redirects manually — short /p/{SKU} URLs redirect to the full product path.
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

// First $XX.XX in the page is the product price.
// Afterpay instalment text ("4 payments of $X.XX") appears after the main price.
// Strike-through <s>/<del> tag indicates a was-price when on sale.
function parsePriceHtml(html: string): { priceCents: number; compareAtCents: number | null } | null {
  const priceMatch = html.match(/\$([0-9]+\.[0-9]{2})/);
  if (!priceMatch) return null;
  const priceCents = Math.round(parseFloat(priceMatch[1]) * 100);
  const wasMatch = html.match(/<(?:s|del)[^>]*>\s*\$?\s*([0-9]+(?:\.[0-9]{1,2})?)\s*<\/(?:s|del)>/i);
  const compareAtCents = wasMatch ? Math.round(parseFloat(wasMatch[1]) * 100) : null;
  return { priceCents, compareAtCents };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type FetchRetailer = 'autobarn' | 'autopro';

interface CrawlWindow {
  startHour: number; // UTC, inclusive
  endHour: number;   // UTC, inclusive up to endMinute
  endMinute: number; // UTC minute at which the window closes
}

export interface FetchScraperConfig {
  retailer: FetchRetailer;
  rateLimitMs: number;
  cacheHours: number;
  crawlWindow: CrawlWindow;
  // Env var name to bypass the crawl window (e.g. AUTOBARN_IGNORE_WINDOW=1)
  ignoreWindowEnvVar: string;
}

function isInCrawlWindow(w: CrawlWindow): boolean {
  const now = new Date();
  const hour = now.getUTCHours();
  const min = now.getUTCMinutes();
  if (hour < w.startHour || hour > w.endHour) return false;
  if (hour === w.endHour && min >= w.endMinute) return false;
  return true;
}

export function createFetchScraper(config: FetchScraperConfig) {
  const { retailer, rateLimitMs, cacheHours, crawlWindow, ignoreWindowEnvVar } = config;

  function checkWindow(): boolean {
    if (process.env[ignoreWindowEnvVar] === '1') {
      console.log(`${retailer}: crawl window bypassed (${ignoreWindowEnvVar}=1)`);
      return true;
    }
    if (!isInCrawlWindow(crawlWindow)) {
      console.log(`${retailer}: outside crawl window (${crawlWindow.startHour}:00–${crawlWindow.endHour}:${String(crawlWindow.endMinute).padStart(2, '0')} UTC) — skipping`);
      console.log(`  (set ${ignoreWindowEnvVar}=1 to override)`);
      return false;
    }
    return true;
  }

  async function wasRecentlyScraped(productId: number): Promise<boolean> {
    const rows = await db
      .select({ id: priceHistory.id })
      .from(priceHistory)
      .where(and(
        eq(priceHistory.productId, productId),
        eq(priceHistory.retailer, retailer),
        gt(priceHistory.observedAt, sql`datetime('now', ${`-${cacheHours} hours`})`),
      ))
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
      .where(eq(retailerUrls.retailer, retailer));
  }

  // Returns observations without writing to DB — used by GitHub Actions run-and-push.ts
  async function scrapeToArray(): Promise<PriceObservation[]> {
    if (!checkWindow()) return [];

    const rows = await getRows();
    console.log(`${retailer}: scraping ${rows.length} products...`);

    const results: PriceObservation[] = [];

    for (const row of rows) {
      try {
        console.log(`  Fetching ${row.name}...`);
        const { status, body: html } = await httpsGet(row.url);

        if (status === 404) { console.warn(`  404 — not found: ${row.url}`); await sleep(rateLimitMs); continue; }
        if (status < 200 || status >= 300) throw new Error(`HTTP ${status} fetching ${row.url}`);

        const result = parsePriceHtml(html);
        if (!result) { console.warn(`  No price found at ${row.url}`); await sleep(rateLimitMs); continue; }

        results.push({ slug: row.slug, retailer, priceCents: result.priceCents, compareAtCents: result.compareAtCents });
        console.log(`  [ok] ${row.name} — $${(result.priceCents / 100).toFixed(2)}`);
      } catch (err) {
        console.error(`  [error] ${row.name}:`, err);
      }
      await sleep(rateLimitMs);
    }

    return results;
  }

  // Writes results directly to the local DB — used by the in-process Render cron job
  async function scrapeAll(): Promise<void> {
    if (!checkWindow()) return;

    const rows = await getRows();
    console.log(`${retailer}: scraping ${rows.length} products...`);

    for (const row of rows) {
      try {
        if (await wasRecentlyScraped(row.productId)) {
          console.log(`  [skip] ${row.name} — scraped within ${cacheHours}h`);
          continue;
        }

        console.log(`  Fetching ${row.name}...`);
        const { status, body: html } = await httpsGet(row.url);

        if (status === 404) { console.warn(`  404 — not found: ${row.url}`); await sleep(rateLimitMs); continue; }
        if (status < 200 || status >= 300) throw new Error(`HTTP ${status} fetching ${row.url}`);

        const result = parsePriceHtml(html);
        if (!result) { console.warn(`  No price found at ${row.url}`); await sleep(rateLimitMs); continue; }

        const onSale = isOnSale(result.priceCents, result.compareAtCents, null);
        await db.insert(priceHistory).values({ productId: row.productId, retailer, priceCents: result.priceCents, onSale });
        console.log(`  [ok] ${row.name} — $${(result.priceCents / 100).toFixed(2)}${onSale ? ' 🔥 ON SALE' : ''}`);
      } catch (err) {
        console.error(`  [error] ${row.name}:`, err);
      }
      await sleep(rateLimitMs);
    }
  }

  return { scrapeToArray, scrapeAll };
}