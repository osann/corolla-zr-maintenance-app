// Bowden's Own variant scraper — uses the Maropost/Neto ajax_template API directly.
//
// For products with size radio buttons, the page always server-renders the default
// (smallest) size. Switching sizes fires an XHR to /ajax/ajax_template with the target
// SKU; the response contains URL-encoded HTML with the correct variant price in the
// aGVhZGVy (base64 "header") section.
//
// This XHR endpoint can still be blocked from GitHub Actions/cloud runner IPs, so the
// scheduled path runs from the Render/local Bowden's scraper and writes directly to DB.
//
// SKUs can be found by switching variants in DevTools → Network → XHR and reading the
// `sku` value in the `fields` query parameter of the ajax_template request.

import { and, eq, gt, avg, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { priceHistory, products } from '../db/schema.js';
import { isOnSale } from '../lib/sale-detector.js';
import type { PriceObservation } from '../routes/prices.js';

const CACHE_HOURS = 6;
const RATE_LIMIT_MS = 3_000;

const NETO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/plain, */*; q=0.01',
  'Accept-Language': 'en-AU,en;q=0.9',
  'Referer': 'https://www.bowdensown.com.au/',
  'X-Requested-With': 'XMLHttpRequest',
};

// child_templates value is constant — requests images, header (price), and addtocart sections
const CHILD_TEMPLATES = 'NSD1;#3|$8|aW1hZ2Vz$7|_images$8|aGVhZGVy$7|_header$12|YWRkdG9jYXJ0$10|_addtocart';

// Add entries here when a new multi-size Bowden's product needs tracking.
const BOWDENS_VARIANTS: { slug: string; sku: string }[] = [
  { slug: 'snow-job-5l', sku: 'BOSNOWV25L' },
];

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

async function fetchVariantPrice(sku: string): Promise<{ priceCents: number; compareAtCents: number | null } | null> {
  const url = new URL('https://www.bowdensown.com.au/ajax/ajax_template');
  url.searchParams.set('proc', 'load');
  url.searchParams.set('docid', '_jstl__buying_options');
  url.searchParams.set('template', 'YnV5aW5nX29wdGlvbnM');
  url.searchParams.set('type', 'aXRlbQ');
  url.searchParams.set('loaddata', 'y');
  url.searchParams.set('procdata', 'n');
  url.searchParams.set('fields', buildNetoFields(sku));
  url.searchParams.set('child_templates', CHILD_TEMPLATES);

  const res = await fetch(url.toString(), { headers: NETO_HEADERS });

  if (!res.ok) {
    console.warn(`    HTTP ${res.status} from Neto API for SKU ${sku}`);
    return null;
  }

  const body = await res.text();

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

  return { priceCents, compareAtCents };
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
  console.log(`Bowden's Own (variants): scraping ${BOWDENS_VARIANTS.length} products via Neto API...`);
  const results: PriceObservation[] = [];

  for (const { slug, sku } of BOWDENS_VARIANTS) {
    console.log(`  Fetching ${slug} (SKU: ${sku})...`);
    try {
      const result = await fetchVariantPrice(sku);
      if (result) {
        const displayPrice = (result.priceCents / 100).toFixed(2);
        console.log(`  [ok] ${slug} — $${displayPrice}`);
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

export async function scrapeVariants(): Promise<void> {
  console.log(`Bowden's Own (variants): scraping ${BOWDENS_VARIANTS.length} products via Neto API...`);

  for (const { slug, sku } of BOWDENS_VARIANTS) {
    console.log(`  Fetching ${slug} (SKU: ${sku})...`);

    try {
      const productId = await getProductId(slug);
      if (productId === null) {
        console.warn(`  [skip] ${slug} — product not found in DB`);
        continue;
      }

      if (await wasRecentlyScraped(productId)) {
        console.log(`  [skip] ${slug} — scraped within ${CACHE_HOURS}h`);
        continue;
      }

      const result = await fetchVariantPrice(sku);
      if (!result) {
        console.warn(`  [skip] ${slug} — no price data`);
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
      console.log(`  [ok] ${slug} — $${displayPrice}${onSale ? ' ON SALE' : ''}`);
    } catch (err) {
      console.error(`  [error] ${slug}:`, err);
    }

    await sleep(RATE_LIMIT_MS);
  }
}
