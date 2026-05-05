// Playwright-based Bowden's Own scraper for products that require size variant selection.
// Used when a product page shows multiple sizes via radio buttons and the server always
// renders the default (smallest) size — plain fetch can't get other variant prices.
//
// Runs on GitHub Actions, not Render (Render free tier can't run Playwright).
// Bowden's may block GitHub Actions IPs; if so, these runs will fail with a non-200
// response or a navigation timeout rather than silently storing a wrong price.

import { createStealthContext } from '../lib/browser.js';
import type { PriceObservation } from '../routes/prices.js';

const RATE_LIMIT_MS = 5_000;

// Each entry maps a product slug to the page URL and the size label to click.
// Add entries here when a new multi-size Bowden's product needs tracking.
const BOWDENS_VARIANTS: { slug: string; url: string; targetSize: string }[] = [
  { slug: 'snow-job-5l', url: 'https://www.bowdensown.com.au/snow-job~3816', targetSize: '5L' },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrapeVariant(
  slug: string,
  url: string,
  targetSize: string,
): Promise<PriceObservation | null> {
  const { context, close } = await createStealthContext();
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const pageTitle = await page.title();
    const pageUrl = page.url();
    console.log(`    Loaded: "${pageTitle}" @ ${pageUrl}`);

    // Wait for the size selector to be present
    await page.waitForSelector('._itmspec_listitm', { state: 'attached', timeout: 10_000 });

    // Click the label whose text matches the target size
    const sizeLabel = page.locator('._itmspec_listitm').filter({
      has: page.locator('span.value', { hasText: new RegExp(`^${targetSize}$`) }),
    });
    await sizeLabel.click();

    // Wait for the price element to reflect the new variant.
    // The nloader system fetches price data asynchronously after the click.
    await page.waitForTimeout(3_000);

    const priceText = await page.locator('.productprice.productpricetext').textContent();
    if (!priceText) {
      console.warn(`    No price text found for ${slug} (${targetSize})`);
      return null;
    }

    const priceCents = Math.round(parseFloat(priceText.replace(/[^0-9.]/g, '')) * 100);
    if (!priceCents || priceCents <= 0) {
      console.warn(`    Could not parse price from "${priceText.trim()}" for ${slug} (${targetSize})`);
      return null;
    }

    // Look for a strikethrough was-price (sale indicator)
    const wasText = await page.locator('.productprice s, .productprice del').first().textContent().catch(() => null);
    const compareAtCents = wasText
      ? Math.round(parseFloat(wasText.replace(/[^0-9.]/g, '')) * 100) || null
      : null;

    return { slug, retailer: 'bowdens', priceCents, compareAtCents };
  } catch (err) {
    console.warn(`    Playwright error for ${slug} (${targetSize}): ${err instanceof Error ? err.message : String(err)}`);
    return null;
  } finally {
    await close();
  }
}

export async function scrapeVariantsToArray(): Promise<PriceObservation[]> {
  console.log(`Bowden's Own (variants): scraping ${BOWDENS_VARIANTS.length} products...`);
  const results: PriceObservation[] = [];

  for (const { slug, url, targetSize } of BOWDENS_VARIANTS) {
    console.log(`  Fetching ${slug} (${targetSize})...`);
    const result = await scrapeVariant(slug, url, targetSize);

    if (result) {
      const displayPrice = (result.priceCents / 100).toFixed(2);
      console.log(`  [ok] ${slug} (${targetSize}) — $${displayPrice}`);
      results.push(result);
    } else {
      console.warn(`  [skip] ${slug} (${targetSize}) — no price data`);
    }

    await sleep(RATE_LIMIT_MS);
  }

  return results;
}
