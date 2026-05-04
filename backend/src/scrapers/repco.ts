import { eq, and, gt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, retailerUrls, priceHistory } from '../db/schema.js';
import { isOnSale } from '../lib/sale-detector.js';
import { createStealthContext } from '../lib/browser.js';
import type { PriceObservation } from '../routes/prices.js';

const CACHE_HOURS = 6;
const RATE_LIMIT_MS = 5_000;

// Repco product code is extracted from the URL path — /p/{code} at the end
function productCodeFromUrl(url: string): string {
  const match = url.match(/\/p\/([^/?]+)/);
  return match?.[1] ?? '';
}

// Approach A: Repco's SAP Hybris OCC REST API (no Playwright needed if accessible).
// The API returns `potentialPromotions` with the member/lowest price when applicable.
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

  const regularPrice = (data.price as { value?: number } | undefined)?.value;
  if (typeof regularPrice !== 'number') return null;

  // Member/promotion price surfaces in potentialPromotions[].promotionDiscount.value
  // or as a separate promotionPrice field — check both shapes
  const promotions = data.potentialPromotions as Array<{ promotionDiscount?: { value?: number } }> | undefined;
  const promotionDiscount = promotions?.[0]?.promotionDiscount?.value ?? 0;
  const memberPrice = (data.promotionPrice as { value?: number } | undefined)?.value;

  let priceCents: number;
  let compareAtCents: number | null = null;

  if (typeof memberPrice === 'number' && memberPrice < regularPrice) {
    priceCents = Math.round(memberPrice * 100);
    compareAtCents = Math.round(regularPrice * 100);
  } else if (promotionDiscount > 0) {
    priceCents = Math.round((regularPrice - promotionDiscount) * 100);
    compareAtCents = Math.round(regularPrice * 100);
  } else {
    priceCents = Math.round(regularPrice * 100);
  }

  return { priceCents, compareAtCents };
}

// Approach B: Playwright page scrape fallback.
// Repco shows a member/promotion price in .promotion-price alongside the regular price.
// Multiple products with prices appear on the page (related items below the fold) —
// scope selection to cx-product-intro which wraps only the main product's price block.
async function fetchRepcoPlaywright(pageUrl: string): Promise<{ priceCents: number; compareAtCents: number | null } | null> {
  const { context, close } = await createStealthContext();
  const page = await context.newPage();
  try {
    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    // Wait for either the member price or the standard itemprop price
    await page.waitForSelector('cx-product-intro .promotion-price, cx-product-intro [itemprop="price"]', { timeout: 10_000 });

    const prices = await page.evaluate(() => {
      // Scope to the main product intro to avoid related-product price elements
      const intro = document.querySelector('cx-product-intro') ?? document.body;

      // Member/promotion price is the lowest — use it when present
      const promoEl = intro.querySelector('.promotion-price');
      const promoText = promoEl?.textContent;

      // Regular (non-member) price — becomes compareAt when a promo price exists
      const regularEl = intro.querySelector('[itemprop="price"]');
      const regularText = regularEl?.getAttribute('content') ?? regularEl?.textContent;

      return { promoText: promoText ?? null, regularText: regularText ?? null };
    });

    const parsePrice = (text: string | null) =>
      text ? Math.round(parseFloat(text.replace(/[^0-9.]/g, '')) * 100) : null;

    const promoCents = parsePrice(prices.promoText);
    const regularCents = parsePrice(prices.regularText);

    if (!promoCents && !regularCents) return null;

    // Prefer the member price as the actual price; regular becomes compareAt
    const priceCents = promoCents ?? regularCents!;
    const compareAtCents = promoCents && regularCents && regularCents > promoCents ? regularCents : null;

    return { priceCents, compareAtCents };
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
