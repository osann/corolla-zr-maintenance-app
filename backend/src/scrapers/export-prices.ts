/**
 * Standalone price export script — runs in GitHub Actions.
 * Uses Playwright (real Chromium) to bypass Cloudflare TLS fingerprinting.
 * Node's fetch() is blocked by Cloudflare regardless of headers; a real
 * browser passes the TLS handshake check transparently.
 *
 * Usage: node --import tsx/esm src/scrapers/export-prices.ts
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const RATE_LIMIT_MS = 2000;
const BASE_URL = 'https://www.bowdensown.com.au';

// Keyed by product slug (must match data-slug attributes in index.html)
const PRODUCTS: { slug: string; handle: string }[] = [
  { slug: 'wet-dreams-pack',         handle: 'wet-dreams-pack' },
  { slug: '2-bucket-wash-kit',       handle: '2-bucket-wash-kit' },
  { slug: 'boss-gloss-770ml',        handle: 'boss-gloss' },
  { slug: 'naked-glass-500ml',       handle: 'naked-glass' },
  { slug: 'snow-blow-cannon',        handle: 'snow-blow-cannon' },
  { slug: 'snow-job-1l',             handle: 'snow-job~3816' },
  { slug: 'happy-ending-500ml',      handle: 'happy-ending' },
  { slug: 'wheely-clean-v2-500ml',   handle: 'new-wheely-clean' },
  { slug: 'the-little-stiffy',       handle: 'the-little-stiffy' },
  { slug: 'the-flat-head',           handle: 'the-flat-head-brush' },
  { slug: 'fabra-cadabra-500ml',     handle: 'fabra-cadabra~3826' },
  { slug: 'bolp-leather-care-pack',  handle: 'leather-care-pack' },
  { slug: 'fabratection',            handle: 'fabratection' },
  { slug: 'pumpy-pump',              handle: '5-litre-bottle-pump' },
  { slug: 'nanolicious-wash-5l',     handle: 'nanolicious-wash' },
  { slug: 'microfibre-wash-1l',      handle: 'microfibre-wash' },
  { slug: 'plush-brush',             handle: 'plush-brush' },
  { slug: 'flash-prep-500ml',        handle: 'flash-prep' },
  { slug: 'bead-machine-500ml',      handle: 'bead-machine' },
  { slug: 'big-softie-pair',         handle: 'big-softie' },
  { slug: 'snow-job-5l',             handle: 'snow-job-5l' },
  { slug: 'wheely-clean-v2-5l',      handle: 'new-wheely-clean' },
];

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

type PriceEntry = {
  priceCents: number;
  compareAtCents: number | null;
  onSale: boolean;
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'en-AU',
    extraHTTPHeaders: { 'Accept-Language': 'en-AU,en;q=0.9' },
  });
  const page = await context.newPage();

  const results: Record<string, PriceEntry> = {};
  let ok = 0;
  let failed = 0;

  for (const product of PRODUCTS) {
    const url = `${BASE_URL}/${product.handle}`;
    try {
      console.log(`  Fetching ${product.slug}...`);
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

      if (!response) {
        console.warn(`  [skip] no response — ${url}`);
        failed++;
        continue;
      }
      if (response.status() === 404) {
        console.warn(`  [skip] 404 — ${url}`);
        failed++;
        continue;
      }
      if (!response.ok()) {
        console.warn(`  [skip] HTTP ${response.status()} — ${url}`);
        failed++;
        continue;
      }

      // Extract price from itemprop="price" — works for both attribute and text content forms
      const priceText = await page.evaluate(() => {
        const el = document.querySelector('[itemprop="price"]');
        if (!el) return null;
        // Try content attribute first (meta tag form), then text content
        return el.getAttribute('content') ?? el.textContent;
      });

      if (!priceText) {
        console.warn(`  [skip] no price found — ${url}`);
        failed++;
        continue;
      }

      const priceNum = parseFloat(priceText.replace(/[^0-9.]/g, ''));
      if (isNaN(priceNum)) {
        console.warn(`  [skip] unparseable price "${priceText}" — ${url}`);
        failed++;
        continue;
      }
      const priceCents = Math.round(priceNum * 100);

      // Look for a strikethrough was-price (<s> or <del> with a dollar amount)
      const compareAtText = await page.evaluate(() => {
        const el = document.querySelector('s, del');
        return el?.textContent ?? null;
      });
      const compareAtNum = compareAtText ? parseFloat(compareAtText.replace(/[^0-9.]/g, '')) : NaN;
      const compareAtCents = !isNaN(compareAtNum) && compareAtNum > 0 ? Math.round(compareAtNum * 100) : null;

      const onSale = compareAtCents !== null && compareAtCents > priceCents;
      results[product.slug] = { priceCents, compareAtCents, onSale };

      console.log(`  [ok] $${(priceCents / 100).toFixed(2)}${onSale ? ' 🔥' : ''}`);
      ok++;
    } catch (err) {
      console.error(`  [error] ${product.slug}:`, (err as Error).message);
      failed++;
    }

    await sleep(RATE_LIMIT_MS);
  }

  await browser.close();

  const output = {
    scrapedAt: new Date().toISOString(),
    products: results,
  };

  // Write to repo root (four levels up from backend/src/scrapers/)
  const outPath = join(import.meta.dirname, '..', '..', '..', '..', 'prices.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`\nWrote prices.json — ${ok} ok, ${failed} failed`);
}

main().catch(err => { console.error(err); process.exit(1); });
