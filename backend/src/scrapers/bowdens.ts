// Bowden's Own (bowdensown.com.au). It blocks cloud IPs but answers a home connection, so it runs
// on the self-hosted runner next to Auto Barn (run-bowdens.ts). It's a Neto (Maropost) store with
// server-rendered prices. robots.txt asks for a 1 s crawl delay and sets no crawl window.
//
// A stored URL is the product page, plus `#option` when the page sells more than one thing:
// - a size from the page's size buttons, e.g. /boss-gloss#5L. The page itself shows only its
//   default size's price, so another size is read the way those buttons do it: /ajax/variations
//   gives the size's SKU, then /ajax/ajax_template renders that SKU's price block.
// - a SKU from the page's "Buying Options" table, e.g. /all-sorts#BOASORTS__.
// Name the size even when it's the default, so a change of default can't quietly switch which
// size is priced. A page with options and no `#option`, or an option it doesn't offer, is a miss.
//
// No was-price is read: none was on the site to check the markup against (2026-11). Sales still
// show up through POST /api/prices, which flags a price well below the 30-day average.
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, retailerUrls, priceHistory } from '../db/schema.js';
import { isOnSale } from '../lib/sale-detector.js';
import type { PriceObservation } from '../routes/prices.js';
import type { ScrapeRow } from './fetch-backend-rows.js';

const SITE = 'https://www.bowdensown.com.au';
const RATE_LIMIT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 30_000;
// This many blocked responses in a row means the site has started blocking us. Stop, and fail the
// run, rather than carry on and record nothing.
const MAX_BLOCKED_IN_A_ROW = 5;
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-AU,en;q=0.9',
};

const toCents = (text: string) => Math.round(parseFloat(text.replace(/,/g, '')) * 100);
const sameOption = (a: string, b: string) =>
  a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase();

// Neto's request encoding (create_netosd_data in its storefront script), e.g. {1: '4'} is
// NSD1;#1|$1|1$1|4
function netoData(value: unknown): string {
  const encode = (v: unknown): string => {
    if (v && typeof v === 'object') {
      const entries = Object.entries(v);
      return `#${entries.length}|${entries.map(([k, x]) => encode(k) + encode(x)).join('')}`;
    }
    const s = escape(String(v));
    return `$${s.length}|${s}`;
  };
  return `NSD1;${encode(value)}`;
}

export interface ProductPage {
  priceCents: number | null; // the default option's price, or the only one
  parentSku: string | null;
  sizes: { specId: string; valueId: string; label: string; selected: boolean }[];
  buyingOptions: { sku: string; priceCents: number }[];
  // The hidden fields /ajax/ajax_template needs to render the page's price block for another SKU.
  header: Record<string, string>;
}

export function parseProductPage(html: string): ProductPage {
  const price = html.match(/class="productprice productpricetext">\s*\$?\s*<span itemprop="price">\s*\$?([0-9,.]+)/);

  const sizes = [
    ...html.matchAll(
      /name="_itmspec_radio(\d+)" value="(\d+)" ref="[^"]*"( checked)?[^>]*>\s*<span class="value">([^<]*)<\/span>/g,
    ),
  ].map(([, specId, valueId, checked, label]) => ({ specId, valueId, label: label.trim(), selected: !!checked }));

  const buyingOptions: ProductPage['buyingOptions'] = [];
  const tableStart = html.indexOf('id="buy-child-list"');
  if (tableStart >= 0) {
    const table = html.slice(tableStart, html.indexOf('</table>', tableStart));
    for (const row of table.split('<tr>')) {
      const sku = row.match(/name="sku[^"]*" value="([^"]*)"/)?.[1];
      const rowPrice = row.match(/class="child-price">\s*\$([0-9,.]+)/)?.[1];
      if (sku && rowPrice) buyingOptions.push({ sku, priceCents: toCents(rowPrice) });
    }
  }

  const header: Record<string, string> = {};
  for (const [, key, value] of html.matchAll(
    /id="_jstl__header_k\d+" value="([^"]*)"\/?>\s*<input type="hidden" id="_jstl__header_v\d+" value="([^"]*)"/g,
  )) {
    header[key] = value;
  }

  return {
    priceCents: price ? toCents(price[1]) : null,
    parentSku: html.match(/id="_itmspec_sku" value="([^"]*)"/)?.[1] ?? null,
    sizes,
    buyingOptions,
    header,
  };
}

// The SKU in an /ajax/variations reply: ...$3|sku$10|BOSNOWV25L... (length-prefixed, escape()d).
export function parseVariationSku(reply: string): string | null {
  const m = reply.match(/\$3\|sku\$(\d+)\|/);
  if (!m || m.index === undefined) return null;
  const start = m.index + m[0].length;
  return unescape(reply.slice(start, start + Number(m[1]))) || null;
}

// The price in an /ajax/ajax_template reply, whose HTML is escape()d.
export function parseTemplatePrice(reply: string): number | null {
  const price = unescape(reply).match(
    /class="productprice productpricetext">\s*\$?\s*<span itemprop="price">\s*\$?([0-9,.]+)/,
  );
  return price ? toCents(price[1]) : null;
}

class BlockedError extends Error {}

async function request(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (res.status === 403 || res.status === 429 || res.status === 503) {
    throw new BlockedError(`HTTP ${res.status}`);
  }
  return res;
}

// The price for one stored URL, or null if the page doesn't offer it.
export async function fetchPrice(storedUrl: string): Promise<number | null> {
  const url = new URL(storedUrl);
  const option = decodeURIComponent(url.hash.slice(1));
  url.hash = '';
  const pageUrl = url.toString();

  const res = await request(pageUrl, { headers: HEADERS });
  if (!res.ok) {
    console.warn(`    HTTP ${res.status}: ${pageUrl}`);
    return null;
  }
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const page = parseProductPage(await res.text());

  if (!option) {
    if (page.sizes.length > 1 || page.buyingOptions.length > 0) {
      console.warn(`    The page sells several options; add #option to the URL: ${pageUrl}`);
      return null;
    }
    return page.priceCents ?? page.buyingOptions[0]?.priceCents ?? null;
  }

  const listed = page.buyingOptions.find((o) => sameOption(o.sku, option));
  if (listed) return listed.priceCents;

  const size = page.sizes.find((s) => sameOption(s.label, option));
  if (!size) {
    const offered = [...page.sizes.map((s) => s.label), ...page.buyingOptions.map((o) => o.sku)];
    console.warn(`    No option "${option}" on the page (it offers: ${offered.join(', ') || 'none'})`);
    return null;
  }
  if (size.selected) return page.priceCents;

  // Another size: ask for its SKU, then for its price block, as the size buttons do.
  const ajaxHeaders = { ...HEADERS, 'X-Requested-With': 'XMLHttpRequest', Referer: pageUrl, Cookie: cookie };
  const variation = await request(`${SITE}/ajax/variations`, {
    method: 'POST',
    headers: { ...ajaxHeaders, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams({
      proc: 'change_variation',
      specid: size.specId,
      sku: page.parentSku ?? '',
      loadselector: 'n',
      variations: netoData({ [size.specId]: size.valueId }),
      show_nostock: 'n',
    }),
  });
  const sku = parseVariationSku(await variation.text());
  if (!sku) {
    console.warn(`    Couldn't find the SKU for ${option}`);
    return null;
  }

  const { type, template, ...fields } = page.header;
  const params = new URLSearchParams({
    proc: 'load',
    docid: '_jstl__header',
    type: type ?? '',
    template: template ?? '',
    fields: netoData({ ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== '')), sku }),
  });
  const rendered = await request(`${SITE}/ajax/ajax_template?${params}`, { headers: ajaxHeaders });
  return parseTemplatePrice(await rendered.text());
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Scrapes the given rows (from the live backend, see fetch-backend-rows.ts) or, locally, the local
// DB's Bowden's URLs. Same shape as createFetchScraper()'s, so run-bowdens.ts can push in batches.
export async function scrapeToArray(
  onProduct?: (obs: PriceObservation) => void | Promise<void>,
  externalRows?: ScrapeRow[],
): Promise<PriceObservation[]> {
  const rows = externalRows ?? (await getRows());
  console.log(`bowdens: scraping ${rows.length} products...`);

  const results: PriceObservation[] = [];
  let blockedInARow = 0;
  for (const row of rows) {
    console.log(`  Fetching ${row.name}...`);
    try {
      const priceCents = await fetchPrice(row.url);
      blockedInARow = 0;
      if (priceCents) {
        const obs: PriceObservation = { slug: row.slug, retailer: 'bowdens', priceCents, compareAtCents: null };
        results.push(obs);
        if (onProduct) await onProduct(obs);
        console.log(`  [ok] ${row.name} — $${(priceCents / 100).toFixed(2)}`);
      } else {
        console.warn(`  [miss] ${row.name}`);
      }
    } catch (err) {
      console.warn(`  [miss] ${row.name}: ${(err as Error).message}`);
      if (err instanceof BlockedError && ++blockedInARow >= MAX_BLOCKED_IN_A_ROW) {
        throw new Error(`Bowden's Own blocked ${MAX_BLOCKED_IN_A_ROW} requests in a row (${err.message})`, {
          cause: err,
        });
      }
    }
    await sleep(RATE_LIMIT_MS);
  }
  return results;
}

async function getRows(): Promise<ScrapeRow[]> {
  return db
    .select({ productId: retailerUrls.productId, url: retailerUrls.url, slug: products.slug, name: products.name })
    .from(retailerUrls)
    .innerJoin(products, eq(products.id, retailerUrls.productId))
    .where(eq(retailerUrls.retailer, 'bowdens'));
}

// Writes results straight to the local DB (npm run scrape).
export async function scrapeBowdens(): Promise<void> {
  const rows = await getRows();
  for (const obs of await scrapeToArray(undefined, rows)) {
    const productId = rows.find((r) => r.slug === obs.slug)!.productId;
    const onSale = isOnSale(obs.priceCents, obs.compareAtCents, null);
    await db.insert(priceHistory).values({ productId, retailer: 'bowdens', priceCents: obs.priceCents, onSale });
  }
}
