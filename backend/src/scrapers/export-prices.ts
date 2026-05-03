/**
 * Standalone price export script — runs in GitHub Actions (not Render).
 * Scrapes Bowden's Own product pages and writes prices.json to the repo root.
 * GitHub Actions IPs are not blocked by Cloudflare; Render datacenter IPs are.
 *
 * Usage: node --import tsx/esm src/scrapers/export-prices.ts
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RATE_LIMIT_MS = 3000;

// Keyed by product slug (must match data-slug attributes in index.html)
const PRODUCTS: { slug: string; handle: string }[] = [
  { slug: 'wet-dreams-pack',             handle: 'wet-dreams-pack' },
  { slug: '2-bucket-wash-kit',           handle: '2-bucket-wash-kit' },
  { slug: 'boss-gloss-770ml',            handle: 'boss-gloss' },
  { slug: 'naked-glass-500ml',           handle: 'naked-glass' },
  { slug: 'snow-blow-cannon',            handle: 'snow-blow-cannon' },
  { slug: 'snow-job-1l',                 handle: 'snow-job~3816' },
  { slug: 'happy-ending-500ml',          handle: 'happy-ending' },
  { slug: 'wheely-clean-v2-500ml',       handle: 'new-wheely-clean' },
  { slug: 'the-little-stiffy',          handle: 'the-little-stiffy' },
  { slug: 'the-flat-head',              handle: 'the-flat-head-brush' },
  { slug: 'fabra-cadabra-500ml',        handle: 'fabra-cadabra~3826' },
  { slug: 'bolp-leather-care-pack',     handle: 'leather-care-pack' },
  { slug: 'fabratection',               handle: 'fabratection' },
  { slug: 'pumpy-pump',                 handle: '5-litre-bottle-pump' },
  { slug: 'nanolicious-wash-5l',        handle: 'nanolicious-wash' },
  { slug: 'microfibre-wash-1l',         handle: 'microfibre-wash' },
  { slug: 'plush-brush',               handle: 'plush-brush' },
  { slug: 'flash-prep-500ml',          handle: 'flash-prep' },
  { slug: 'bead-machine-500ml',        handle: 'bead-machine' },
  { slug: 'big-softie-pair',           handle: 'big-softie' },
  { slug: 'snow-job-5l',              handle: 'snow-job-5l' },
  { slug: 'wheely-clean-v2-5l',       handle: 'new-wheely-clean' },
];

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
  return new Promise(r => setTimeout(r, ms));
}

async function fetchPrice(handle: string): Promise<{ priceCents: number; compareAtCents: number | null } | null> {
  const url = `https://www.bowdensown.com.au/${handle}`;
  const res = await fetch(url, { headers: BROWSER_HEADERS });

  if (res.status === 404) {
    console.warn(`  404 — ${url}`);
    return null;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} — ${url}`);
  }

  const html = await res.text();
  const priceMatch = html.match(/itemprop="price"[^>]*>\s*\$?\s*([0-9]+(?:\.[0-9]{1,2})?)/);
  if (!priceMatch) {
    console.warn(`  no price found — ${url}`);
    return null;
  }

  const priceCents = Math.round(parseFloat(priceMatch[1]) * 100);
  const wasMatch = html.match(/<(?:s|del)[^>]*>\s*\$?\s*([0-9]+(?:\.[0-9]{1,2})?)\s*<\/(?:s|del)>/i);
  const compareAtCents = wasMatch ? Math.round(parseFloat(wasMatch[1]) * 100) : null;
  return { priceCents, compareAtCents };
}

type PriceEntry = {
  priceCents: number;
  compareAtCents: number | null;
  onSale: boolean;
};

async function main() {
  const results: Record<string, PriceEntry> = {};
  let ok = 0;
  let failed = 0;

  for (const product of PRODUCTS) {
    try {
      console.log(`  Fetching ${product.slug}...`);
      const price = await fetchPrice(product.handle);
      if (price) {
        const onSale = price.compareAtCents !== null && price.compareAtCents > price.priceCents;
        results[product.slug] = { ...price, onSale };
        console.log(`  [ok] $${(price.priceCents / 100).toFixed(2)}${onSale ? ' 🔥' : ''}`);
        ok++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error(`  [error] ${product.slug}:`, err);
      failed++;
    }
    await sleep(RATE_LIMIT_MS);
  }

  const output = {
    scrapedAt: new Date().toISOString(),
    products: results,
  };

  // Write to repo root (two levels up from backend/src/scrapers/)
  const outPath = join(import.meta.dirname, '..', '..', '..', '..', 'prices.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`\nWrote prices.json — ${ok} ok, ${failed} failed`);
}

main().catch(err => { console.error(err); process.exit(1); });
