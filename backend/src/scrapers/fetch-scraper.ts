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
const BASE_HEADERS: Record<string, string> = {
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

interface GetOptions {
  cookies?: string;
  referer?: string;
}

interface GetResult {
  status: number;
  body: string;
  setCookies: string[];
}

const REQUEST_TIMEOUT_MS = 60_000;

// Uses Node's https module to avoid undici's internal body timeout (UND_ERR_BODY_TIMEOUT).
// Follows redirects manually — short /p/{SKU} URLs redirect to the full product path.
function httpsGet(url: string, opts: GetOptions = {}, maxRedirects = 5): Promise<GetResult> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { ...BASE_HEADERS };
    if (opts.cookies) headers['Cookie'] = opts.cookies;
    if (opts.referer) headers['Referer'] = opts.referer;

    const req = https.get(url, { headers, timeout: REQUEST_TIMEOUT_MS }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (maxRedirects === 0) { reject(new Error('Too many redirects')); return; }
        resolve(httpsGet(res.headers.location, opts, maxRedirects - 1));
        return;
      }
      const setCookies = (res.headers['set-cookie'] ?? []).map(c => c.split(';')[0]);
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString(), setCookies }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`)); });
  });
}

// Accumulates cookies from Set-Cookie headers into a single Cookie header string.
function mergeCookies(existing: string, setCookies: string[]): string {
  const jar = new Map<string, string>();
  for (const pair of existing.split('; ')) {
    const idx = pair.indexOf('=');
    if (idx > 0) jar.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
  for (const cookie of setCookies) {
    const idx = cookie.indexOf('=');
    if (idx > 0) jar.set(cookie.slice(0, idx), cookie.slice(idx + 1));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

// First $XX.XX in the page is the product price.
// Afterpay instalment text ("4 payments of $X.XX") appears after the main price.
// Strike-through <s>/<del> tag indicates a was-price when on sale.
// $0.00 is rejected — it indicates an out-of-stock or error page, not a real price.
function parsePriceHtml(html: string): { priceCents: number; compareAtCents: number | null } | null {
  const priceMatch = html.match(/\$([0-9]+\.[0-9]{2})/);
  if (!priceMatch) return null;
  const priceCents = Math.round(parseFloat(priceMatch[1]) * 100);
  if (priceCents === 0) return null;
  const wasMatch = html.match(/<(?:s|del)[^>]*>\s*\$?\s*([0-9]+(?:\.[0-9]{1,2})?)\s*<\/(?:s|del)>/i);
  const compareAtCents = wasMatch ? Math.round(parseFloat(wasMatch[1]) * 100) : null;
  return { priceCents, compareAtCents };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// +/- 25% jitter so sequential requests don't look machine-regular
function sleepJitter(ms: number) {
  const jitter = ms * 0.25 * (Math.random() * 2 - 1);
  return sleep(Math.max(1000, Math.round(ms + jitter)));
}

// Some Auto Barn / Autopro SKUs only respond to short /p/{SKU} URLs; others only to the full
// canonical path. When a full URL times out, extract the SKU and retry with the short form.
// Returns null if the stored URL is already in short form (no further fallback possible).
function shortUrlFallback(url: string): string | null {
  if (url.includes('/ab/p/') || url.includes('/ap/p/')) return null;
  const m = url.match(/\/p\/([^/?#]+)/);
  if (!m) return null;
  if (url.includes('autobarn.com.au')) return `https://www.autobarn.com.au/ab/p/${m[1]}`;
  if (url.includes('autopro.com.au')) return `https://www.autopro.com.au/ap/p/${m[1]}`;
  return null;
}

type FetchRetailer = 'autobarn' | 'autopro';

interface CrawlWindow {
  startHour: number; // UTC, inclusive
  endHour: number;   // UTC, inclusive up to endMinute
  endMinute: number; // UTC minute at which the window closes
}

export interface FetchScraperConfig {
  retailer: FetchRetailer;
  homepageUrl: string; // pre-fetched to obtain session cookies before the product loop
  rateLimitMs: number;
  cacheHours: number;
  crawlWindow: CrawlWindow;
  ignoreWindowEnvVar: string;
  // When true, products that fail plain-HTTP fetching are retried via Playwright.
  // Only suitable for environments where Playwright/Chromium is available (self-hosted runner).
  playwrightFallback?: boolean;
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
  const { retailer, homepageUrl, rateLimitMs, cacheHours, crawlWindow, ignoreWindowEnvVar, playwrightFallback } = config;

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

  // Pre-fetches the homepage to obtain session cookies. Without these, Auto Barn
  // treats requests as sessionless bot traffic and drops connections after a few hits.
  async function fetchSessionCookies(): Promise<string> {
    try {
      console.log(`${retailer}: pre-fetching homepage for session cookies...`);
      const { setCookies } = await httpsGet(homepageUrl);
      const cookies = mergeCookies('', setCookies);
      console.log(`${retailer}: session established (${setCookies.length} cookies)`);
      return cookies;
    } catch (err) {
      console.warn(`${retailer}: homepage pre-fetch failed — continuing without session cookies:`, err);
      return '';
    }
  }

  type Row = Awaited<ReturnType<typeof getRows>>[number];

  // Playwright fallback for products that plain-fetch can't reach.
  // Launched once per scrape run, handles all failed products in one browser session.
  // Uses a short fixed delay (8s) between requests rather than the HTTP rate-limit delay —
  // failing products are blocked server-side, not rate-limited, so extra waiting doesn't help.
  async function playwrightScrape(failed: Row[]): Promise<PriceObservation[]> {
    console.log(`\n${retailer}: ${failed.length} products failed HTTP — retrying with Playwright...`);
    const { createStealthContext } = await import('../lib/browser.js');
    const { context, close } = await createStealthContext();
    const results: PriceObservation[] = [];

    try {
      // Visit homepage first to establish session cookies in the browser context
      const home = await context.newPage();
      await home.goto(homepageUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
      await home.close();

      for (const row of failed) {
        try {
          console.log(`  [playwright] Fetching ${row.name}...`);
          const page = await context.newPage();
          await page.goto(row.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
          const html = await page.content();
          await page.close();

          const result = parsePriceHtml(html);
          if (!result) { console.warn(`  [playwright] No price found: ${row.url}`); await sleep(8_000); continue; }

          results.push({ slug: row.slug, retailer, priceCents: result.priceCents, compareAtCents: result.compareAtCents });
          console.log(`  [playwright ok] ${row.name} — $${(result.priceCents / 100).toFixed(2)}`);
        } catch (err) {
          console.error(`  [playwright error] ${row.name}:`, (err as Error).message.split('\n')[0]);
        }
        await sleep(8_000);
      }
    } finally {
      await close();
    }

    return results;
  }

  // Returns observations without writing to DB — used by GitHub Actions run-and-push.ts
  async function scrapeToArray(): Promise<PriceObservation[]> {
    if (!checkWindow()) return [];

    const rows = await getRows();
    console.log(`${retailer}: scraping ${rows.length} products...`);

    let cookies = await fetchSessionCookies();
    await sleepJitter(rateLimitMs);

    const results: PriceObservation[] = [];
    const failed: Row[] = [];

    for (const row of rows) {
      try {
        console.log(`  Fetching ${row.name}...`);
        const opts: GetOptions = { cookies, referer: homepageUrl };
        const { status, body: html, setCookies } = await httpsGet(row.url, opts);
        cookies = mergeCookies(cookies, setCookies);

        if (status === 404) { console.warn(`  404 — not found: ${row.url}`); await sleepJitter(rateLimitMs); continue; }
        if (status < 200 || status >= 300) throw new Error(`HTTP ${status} fetching ${row.url}`);

        const result = parsePriceHtml(html);
        if (!result) { console.warn(`  No price found at ${row.url}`); await sleepJitter(rateLimitMs); continue; }

        results.push({ slug: row.slug, retailer, priceCents: result.priceCents, compareAtCents: result.compareAtCents });
        console.log(`  [ok] ${row.name} — $${(result.priceCents / 100).toFixed(2)}`);
      } catch (err) {
        const errMsg = (err as Error).message;
        const fallback = errMsg.includes('timed out') ? shortUrlFallback(row.url) : null;
        if (fallback) {
          console.log(`  [retry] ${row.name} — full URL timed out, trying short URL...`);
          try {
            const r2 = await httpsGet(fallback, { cookies, referer: homepageUrl });
            cookies = mergeCookies(cookies, r2.setCookies);
            if (r2.status >= 200 && r2.status < 300) {
              const result = parsePriceHtml(r2.body);
              if (result) {
                results.push({ slug: row.slug, retailer, priceCents: result.priceCents, compareAtCents: result.compareAtCents });
                console.log(`  [ok] ${row.name} — $${(result.priceCents / 100).toFixed(2)}`);
              } else {
                console.warn(`  No price found on short URL: ${fallback}`);
                if (playwrightFallback) failed.push(row);
              }
            } else {
              console.warn(`  ${r2.status} on short URL: ${fallback}`);
              if (playwrightFallback) failed.push(row);
            }
          } catch (err2) {
            console.error(`  [error] ${row.name} (short URL):`, (err2 as Error).message.split('\n')[0]);
            if (playwrightFallback) failed.push(row);
          }
          await sleepJitter(rateLimitMs);
          continue;
        }
        console.error(`  [error] ${row.name}:`, errMsg.split('\n')[0]);
        if (playwrightFallback) failed.push(row);
      }
      await sleepJitter(rateLimitMs);
    }

    if (failed.length > 0) {
      const playwrightResults = await playwrightScrape(failed);
      results.push(...playwrightResults);
    }

    return results;
  }

  // Writes results directly to the local DB — used by the in-process Render cron job
  async function scrapeAll(): Promise<void> {
    if (!checkWindow()) return;

    const rows = await getRows();
    console.log(`${retailer}: scraping ${rows.length} products...`);

    let cookies = await fetchSessionCookies();
    await sleepJitter(rateLimitMs);

    for (const row of rows) {
      try {
        if (await wasRecentlyScraped(row.productId)) {
          console.log(`  [skip] ${row.name} — scraped within ${cacheHours}h`);
          continue;
        }

        console.log(`  Fetching ${row.name}...`);
        const opts: GetOptions = { cookies, referer: homepageUrl };
        const { status, body: html, setCookies } = await httpsGet(row.url, opts);
        cookies = mergeCookies(cookies, setCookies);

        if (status === 404) { console.warn(`  404 — not found: ${row.url}`); await sleepJitter(rateLimitMs); continue; }
        if (status < 200 || status >= 300) throw new Error(`HTTP ${status} fetching ${row.url}`);

        const result = parsePriceHtml(html);
        if (!result) { console.warn(`  No price found at ${row.url}`); await sleepJitter(rateLimitMs); continue; }

        const onSale = isOnSale(result.priceCents, result.compareAtCents, null);
        await db.insert(priceHistory).values({ productId: row.productId, retailer, priceCents: result.priceCents, onSale });
        console.log(`  [ok] ${row.name} — $${(result.priceCents / 100).toFixed(2)}${onSale ? ' 🔥 ON SALE' : ''}`);
      } catch (err) {
        const errMsg = (err as Error).message;
        const fallback = errMsg.includes('timed out') ? shortUrlFallback(row.url) : null;
        if (fallback) {
          console.log(`  [retry] ${row.name} — full URL timed out, trying short URL...`);
          try {
            const r2 = await httpsGet(fallback, { cookies, referer: homepageUrl });
            cookies = mergeCookies(cookies, r2.setCookies);
            if (r2.status >= 200 && r2.status < 300) {
              const result = parsePriceHtml(r2.body);
              if (result) {
                const onSale = isOnSale(result.priceCents, result.compareAtCents, null);
                await db.insert(priceHistory).values({ productId: row.productId, retailer, priceCents: result.priceCents, onSale });
                console.log(`  [ok] ${row.name} — $${(result.priceCents / 100).toFixed(2)}${onSale ? ' 🔥 ON SALE' : ''}`);
              } else {
                console.warn(`  No price found on short URL: ${fallback}`);
              }
            } else {
              console.warn(`  ${r2.status} on short URL: ${fallback}`);
            }
          } catch (err2) {
            console.error(`  [error] ${row.name} (short URL):`, (err2 as Error).message.split('\n')[0]);
          }
          await sleepJitter(rateLimitMs);
          continue;
        }
        console.error(`  [error] ${row.name}:`, errMsg.split('\n')[0]);
      }
      await sleepJitter(rateLimitMs);
    }
  }

  return { scrapeToArray, scrapeAll };
}
