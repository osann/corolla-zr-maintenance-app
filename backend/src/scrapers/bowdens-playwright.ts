// Bowden's Own variant scraper — uses real browser interaction plus the Maropost/Neto
// ajax_template API.
//
// For products with size radio buttons, the page always server-renders the default
// (smallest) size. Switching sizes fires an XHR to /ajax/ajax_template with the target
// SKU; the response contains URL-encoded HTML with the correct variant price in the
// aGVhZGVy (base64 "header") section.
//
// This XHR endpoint can be blocked from GitHub Actions/cloud runner IPs when called
// directly, so the Actions path first visits the product page with Playwright and then
// retries the Neto request with browser session state.
//
// SKUs can be found by switching variants in DevTools → Network → XHR and reading the
// `sku` value in the `fields` query parameter of the ajax_template request.

import { and, eq, gt, avg, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { priceHistory, products } from '../db/schema.js';
import { createStealthContext } from '../lib/browser.js';
import { isOnSale } from '../lib/sale-detector.js';
import type { PriceObservation } from '../routes/prices.js';

const CACHE_HOURS = 6;
const RATE_LIMIT_MS = 3_000;

const PAGE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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

const NETO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/plain, */*; q=0.01',
  'Accept-Language': 'en-AU,en;q=0.9',
  'X-Requested-With': 'XMLHttpRequest',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

// child_templates value is constant — requests images, header (price), and addtocart sections
const CHILD_TEMPLATES = 'NSD1;#3|$8|aW1hZ2Vz$7|_images$8|aGVhZGVy$7|_header$12|YWRkdG9jYXJ0$10|_addtocart';

// Add entries here when a new multi-size Bowden's product needs tracking.
const BOWDENS_VARIANTS: { slug: string; sku: string; url: string; optionText: string }[] = [
  {
    slug: 'snow-job-5l',
    sku: 'BOSNOWV25L',
    url: 'https://www.bowdensown.com.au/snow-job~3816',
    optionText: '5L',
  },
];

export type VariantScrapeResult = {
  inserted: number;
  skipped: number;
  errors: number;
  details: {
    slug: string;
    sku: string;
    status: 'inserted' | 'skipped' | 'error';
    reason?: string;
    priceCents?: number;
    onSale?: boolean;
  }[];
};

type ScrapeVariantsOptions = {
  force?: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Builds the NSD1 fields parameter for the Maropost/Neto ajax_template endpoint.
// Format: NSD1;#<count>|$<keylen>|<key>$<valuelen>|<value>...
function buildNetoFields(sku: string): string {
  const items: [string, string][] = [
    ['preview', 'y'],
    ['sku', sku],
    ['content_id', '106'],
    ['onreload', ''],
  ];
  const parts = items.map(([k, v]) => `$${k.length}|${k}$${v.length}|${v}`).join('');
  return `NSD1;#${items.length}|${parts}`;
}

type VariantPriceResult = {
  priceCents: number;
  compareAtCents: number | null;
  source: 'browser' | 'neto';
};

function buildNetoUrl(sku: string): string {
  const url = new URL('https://www.bowdensown.com.au/ajax/ajax_template');
  url.searchParams.set('proc', 'load');
  url.searchParams.set('docid', '_jstl__buying_options');
  url.searchParams.set('template', 'YnV5aW5nX29wdGlvbnM');
  url.searchParams.set('type', 'aXRlbQ');
  url.searchParams.set('loaddata', 'y');
  url.searchParams.set('procdata', 'n');
  url.searchParams.set('fields', buildNetoFields(sku));
  url.searchParams.set('child_templates', CHILD_TEMPLATES);

  return url.toString();
}

function parseNetoBody(body: string, sku: string, source: VariantPriceResult['source']): VariantPriceResult | null {
  if (!body.startsWith('^NETO^SUCCESS')) {
    console.warn(`    Unexpected Neto response for SKU ${sku}: ${body.slice(0, 120)}`);
    return null;
  }

  // aGVhZGVy = base64("header") — contains product title and price HTML
  const headerMatch = body.match(/aGVhZGVy\$\d+\|([^$]*)/);
  if (!headerMatch) {
    console.warn(`    No header section in Neto response for SKU ${sku}`);
    return null;
  }

  const headerHtml = decodeURIComponent(headerMatch[1]);

  const priceMatch = headerHtml.match(/itemprop="price"[^>]*>\s*\$?\s*([0-9]+(?:\.[0-9]{1,2})?)/);
  if (!priceMatch) {
    console.warn(`    No itemprop="price" in header HTML for SKU ${sku}`);
    return null;
  }

  const priceCents = Math.round(parseFloat(priceMatch[1]) * 100);

  const wasMatch = headerHtml.match(/<(?:s|del)[^>]*>\s*\$?\s*([0-9]+(?:\.[0-9]{1,2})?)\s*<\/(?:s|del)>/i);
  const compareAtCents = wasMatch ? Math.round(parseFloat(wasMatch[1]) * 100) : null;

  return { priceCents, compareAtCents, source };
}

async function fetchVariantPrice(sku: string, pageUrl: string): Promise<VariantPriceResult | null> {
  // Visit the product page first to establish a session cookie — the Neto AJAX endpoint
  // returns 403 without it, even from IPs that can load the main pages fine.
  const pageRes = await fetch(pageUrl, { headers: PAGE_HEADERS });
  if (!pageRes.ok) {
    console.warn(`    HTTP ${pageRes.status} loading product page ${pageUrl}`);
    return null;
  }

  // Extract session cookies from the page response
  const rawCookies: string[] = typeof (pageRes.headers as any).getSetCookie === 'function'
    ? (pageRes.headers as any).getSetCookie()
    : (pageRes.headers.get('set-cookie') ?? '').split(/,(?=[^ ])/).filter(Boolean);
  const cookieHeader = rawCookies.map(c => c.split(';')[0].trim()).join('; ');

  const res = await fetch(buildNetoUrl(sku), {
    headers: {
      ...NETO_HEADERS,
      'Referer': pageUrl,
      ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
    },
  });

  if (!res.ok) {
    console.warn(`    HTTP ${res.status} from Neto API for SKU ${sku}`);
    return null;
  }

  return parseNetoBody(await res.text(), sku, 'neto');
}

async function fetchVariantPriceWithBrowser(
  pageUrl: string,
  sku: string,
  optionText: string,
): Promise<VariantPriceResult | null> {
  let close: (() => Promise<void>) | null = null;

  try {
    const browser = await createStealthContext();
    close = browser.close;
    const page = await browser.context.newPage();

    const response = await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    if (!response?.ok()) {
      console.warn(`    Browser page load returned HTTP ${response?.status() ?? 'unknown'} for ${pageUrl}`);
      return null;
    }

    const netoResponse = await browser.context.request.get(buildNetoUrl(sku), {
      headers: { ...NETO_HEADERS, Referer: pageUrl },
      timeout: 20_000,
    });
    if (netoResponse.ok()) {
      const result = parseNetoBody(await netoResponse.text(), sku, 'browser');
      if (result) return result;
    } else {
      console.warn(`    Browser Neto request returned HTTP ${netoResponse.status()} for SKU ${sku}`);
    }

    await page
      .locator('label, button, a, [role="button"], .btn')
      .filter({ hasText: new RegExp(`^\\s*${optionText}\\s*$`) })
      .first()
      .click({ timeout: 15_000 });

    await page.waitForFunction(
      (label) => document.body.textContent?.includes(`Snow Job ${label}`),
      optionText,
      { timeout: 20_000 },
    ).catch(() => undefined);

    const raw = await page.evaluate(() => ({
      title: document.querySelector('h1')?.textContent?.trim() ?? null,
      priceText: document.querySelector('[itemprop="price"]')?.textContent?.trim() ?? null,
      bodyText: document.body.textContent ?? '',
      wasText: document.querySelector('s, del')?.textContent?.trim() ?? null,
    }));

    if (raw.title && !raw.title.toLowerCase().includes(optionText.toLowerCase())) {
      console.warn(`    Browser did not switch to ${optionText}; title is "${raw.title}"`);
      return null;
    }

    const priceText = raw.priceText
      ?? raw.bodyText.match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/)?.[0]
      ?? null;
    const priceCents = parsePriceCents(priceText);
    if (priceCents === null) {
      console.warn(`    Browser found no price for ${pageUrl}`);
      return null;
    }

    const compareAtCents = parsePriceCents(raw.wasText);
    return {
      priceCents,
      compareAtCents: compareAtCents && compareAtCents > priceCents ? compareAtCents : null,
      source: 'browser',
    };
  } catch (err) {
    console.warn(`    Browser scrape failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  } finally {
    await close?.();
  }
}

function parsePriceCents(text: string | null): number | null {
  if (!text) return null;
  const match = text.match(/([0-9]+(?:\.[0-9]{1,2})?)/);
  return match ? Math.round(parseFloat(match[1]) * 100) : null;
}

async function getProductId(slug: string): Promise<number | null> {
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, slug))
    .limit(1);

  return rows[0]?.id ?? null;
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

export async function scrapeVariantsToArray(): Promise<PriceObservation[]> {
  console.log(`Bowden's Own (variants): scraping ${BOWDENS_VARIANTS.length} products via browser/Neto fallback...`);
  const results: PriceObservation[] = [];

  for (const { slug, sku, url, optionText } of BOWDENS_VARIANTS) {
    console.log(`  Fetching ${slug} (SKU: ${sku})...`);
    try {
      const result = await fetchVariantPriceWithBrowser(url, sku, optionText) ?? await fetchVariantPrice(sku, url);
      if (result) {
        const displayPrice = (result.priceCents / 100).toFixed(2);
        console.log(`  [ok] ${slug} — $${displayPrice} via ${result.source}`);
        results.push({ slug, retailer: 'bowdens', priceCents: result.priceCents, compareAtCents: result.compareAtCents });
      } else {
        console.warn(`  [skip] ${slug} — no price data`);
      }
    } catch (err) {
      console.error(`  [error] ${slug}:`, err);
    }
    await sleep(RATE_LIMIT_MS);
  }

  return results;
}

export async function scrapeVariants(options: ScrapeVariantsOptions = {}): Promise<VariantScrapeResult> {
  console.log(`Bowden's Own (variants): scraping ${BOWDENS_VARIANTS.length} products via browser/Neto fallback...`);
  const summary: VariantScrapeResult = { inserted: 0, skipped: 0, errors: 0, details: [] };

  for (const { slug, sku, url } of BOWDENS_VARIANTS) {
    console.log(`  Fetching ${slug} (SKU: ${sku})...`);

    try {
      const productId = await getProductId(slug);
      if (productId === null) {
        console.warn(`  [skip] ${slug} — product not found in DB`);
        summary.skipped++;
        summary.details.push({ slug, sku, status: 'skipped', reason: 'product not found in DB' });
        continue;
      }

      if (!options.force && await wasRecentlyScraped(productId)) {
        console.log(`  [skip] ${slug} — scraped within ${CACHE_HOURS}h`);
        summary.skipped++;
        summary.details.push({ slug, sku, status: 'skipped', reason: `scraped within ${CACHE_HOURS}h` });
        continue;
      }

      const result = await fetchVariantPrice(sku, url);
      if (!result) {
        console.warn(`  [skip] ${slug} — no price data`);
        summary.skipped++;
        summary.details.push({ slug, sku, status: 'skipped', reason: 'no price data' });
        continue;
      }

      const rollingAvg = await getRollingAvg(productId);
      const onSale = isOnSale(result.priceCents, result.compareAtCents, rollingAvg);

      await db.insert(priceHistory).values({
        productId,
        retailer: 'bowdens',
        priceCents: result.priceCents,
        onSale,
      });

      const displayPrice = (result.priceCents / 100).toFixed(2);
      console.log(`  [ok] ${slug} — $${displayPrice} via ${result.source}${onSale ? ' ON SALE' : ''}`);
      summary.inserted++;
      summary.details.push({
        slug,
        sku,
        status: 'inserted',
        priceCents: result.priceCents,
        onSale,
      });
    } catch (err) {
      console.error(`  [error] ${slug}:`, err);
      summary.errors++;
      summary.details.push({
        slug,
        sku,
        status: 'error',
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    await sleep(RATE_LIMIT_MS);
  }

  return summary;
}
