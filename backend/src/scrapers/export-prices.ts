/**
 * OzBargain sale detector — runs in GitHub Actions.
 *
 * Bowden's Own blocks all cloud/datacenter IPs at the Cloudflare edge, making
 * direct scraping from Render or GitHub Actions impossible regardless of headers
 * or browser automation. OzBargain is publicly accessible and Bowden's Own
 * posts all their sales there — so it's a reliable "on sale" signal source.
 *
 * This script:
 *   1. Fetches the OzBargain RSS feed for Bowden's Own deals
 *   2. Checks for deals posted in the last 14 days
 *   3. Matches deal titles against our product list
 *   4. Writes prices.json (with onSale flags, no live prices since we can't scrape them)
 *
 * Usage: node --import tsx/esm src/scrapers/export-prices.ts
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OZBARGAIN_FEED = 'https://www.ozbargain.com.au/tag/bowdens-own/feed';
const DEAL_WINDOW_DAYS = 14;

// Product slugs and the keywords to match against OzBargain deal titles.
// A deal title like "Bowden's Own 20% Off Storewide" matches every product.
// A specific deal like "Bead Machine 500ml $29" matches only that product.
const PRODUCTS: { slug: string; keywords: string[] }[] = [
  { slug: 'wet-dreams-pack',         keywords: ['wet dreams'] },
  { slug: '2-bucket-wash-kit',       keywords: ['2 bucket', 'two bucket', 'wash kit'] },
  { slug: 'boss-gloss-770ml',        keywords: ['boss gloss'] },
  { slug: 'naked-glass-500ml',       keywords: ['naked glass'] },
  { slug: 'snow-blow-cannon',        keywords: ['snow blow', 'snow cannon'] },
  { slug: 'snow-job-1l',             keywords: ['snow job'] },
  { slug: 'happy-ending-500ml',      keywords: ['happy ending'] },
  { slug: 'wheely-clean-v2-500ml',   keywords: ['wheely clean', 'wheely-clean'] },
  { slug: 'the-little-stiffy',       keywords: ['little stiffy'] },
  { slug: 'the-flat-head',           keywords: ['flat head'] },
  { slug: 'fabra-cadabra-500ml',     keywords: ['fabra cadabra', 'fabra-cadabra'] },
  { slug: 'bolp-leather-care-pack',  keywords: ['leather care', 'bolp'] },
  { slug: 'fabratection',            keywords: ['fabratection'] },
  { slug: 'pumpy-pump',              keywords: ['pumpy pump', '5 litre pump', '5l pump'] },
  { slug: 'nanolicious-wash-5l',     keywords: ['nanolicious'] },
  { slug: 'microfibre-wash-1l',      keywords: ['microfibre wash', 'microfiber wash'] },
  { slug: 'plush-brush',             keywords: ['plush brush'] },
  { slug: 'flash-prep-500ml',        keywords: ['flash prep'] },
  { slug: 'bead-machine-500ml',      keywords: ['bead machine'] },
  { slug: 'big-softie-pair',         keywords: ['big softie'] },
  { slug: 'snow-job-5l',             keywords: ['snow job 5'] },
  { slug: 'wheely-clean-v2-5l',      keywords: ['wheely clean 5', 'wheely-clean 5'] },
];

// Keywords that indicate a storewide sale — all products get flagged
const STOREWIDE_KEYWORDS = ['storewide', 'sitewide', 'entire store', 'everything', '% off all', 'all products'];

type PriceEntry = {
  priceCents: number | null;
  compareAtCents: number | null;
  onSale: boolean;
  dealUrl: string | null;
  dealTitle: string | null;
};

async function fetchOzBargainDeals(): Promise<{ title: string; link: string; pubDate: string }[]> {
  const res = await fetch(OZBARGAIN_FEED, {
    headers: { 'User-Agent': 'corolla-detailing-price-tracker/1.0 (personal project; joh.10@pm.me)' },
  });
  if (!res.ok) throw new Error(`OzBargain RSS fetch failed: HTTP ${res.status}`);
  const xml = await res.text();

  const items: { title: string; link: string; pubDate: string }[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
                ?? block.match(/<title>(.*?)<\/title>/)?.[1]
                ?? '';
    const link = block.match(/<link>(.*?)<\/link>/)?.[1]
               ?? block.match(/<comments>(.*?)<\/comments>/)?.[1]
               ?? '';
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? '';
    if (title) items.push({ title, link, pubDate });
  }
  return items;
}

function isRecentDeal(pubDate: string, windowDays: number): boolean {
  if (!pubDate) return true; // assume recent if no date
  const date = new Date(pubDate);
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  return date >= cutoff;
}

async function main() {
  console.log('Fetching OzBargain deals for Bowden\'s Own...');

  let deals: { title: string; link: string; pubDate: string }[] = [];
  try {
    deals = await fetchOzBargainDeals();
    console.log(`  Found ${deals.length} deals in feed`);
  } catch (err) {
    console.error('  Failed to fetch OzBargain feed:', (err as Error).message);
    console.log('  Writing prices.json with no sale flags');
  }

  const recentDeals = deals.filter(d => isRecentDeal(d.pubDate, DEAL_WINDOW_DAYS));
  console.log(`  ${recentDeals.length} deals within the last ${DEAL_WINDOW_DAYS} days`);
  recentDeals.forEach(d => console.log(`    • ${d.title}`));

  // Check for storewide deals
  const storewideDeals = recentDeals.filter(d =>
    STOREWIDE_KEYWORDS.some(kw => d.title.toLowerCase().includes(kw))
  );
  const hasStorewideeSale = storewideDeals.length > 0;
  if (hasStorewideeSale) {
    console.log(`  Storewide sale detected: "${storewideDeals[0].title}"`);
  }

  const results: Record<string, PriceEntry> = {};

  for (const product of PRODUCTS) {
    let onSale = hasStorewideeSale;
    let dealUrl: string | null = null;
    let dealTitle: string | null = null;

    if (hasStorewideeSale) {
      dealUrl = storewideDeals[0].link;
      dealTitle = storewideDeals[0].title;
    } else {
      // Check for a product-specific deal
      const productDeal = recentDeals.find(d =>
        product.keywords.some(kw => d.title.toLowerCase().includes(kw.toLowerCase()))
      );
      if (productDeal) {
        onSale = true;
        dealUrl = productDeal.link;
        dealTitle = productDeal.title;
      }
    }

    results[product.slug] = {
      priceCents: null,    // not available — Bowden's blocks cloud IP scraping
      compareAtCents: null,
      onSale,
      dealUrl,
      dealTitle,
    };
  }

  const onSaleCount = Object.values(results).filter(r => r.onSale).length;
  console.log(`\n${onSaleCount}/${PRODUCTS.length} products flagged as on sale`);

  const output = {
    scrapedAt: new Date().toISOString(),
    source: 'ozbargain',
    note: 'Bowden\'s Own blocks cloud IP scraping. Sale detection via OzBargain deals feed.',
    products: results,
  };

  const outPath = join(import.meta.dirname, '..', '..', '..', '..', 'prices.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
  console.log('Wrote prices.json');
}

main().catch(err => { console.error(err); process.exit(1); });
