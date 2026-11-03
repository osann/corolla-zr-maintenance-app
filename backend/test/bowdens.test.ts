import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPrice, parseProductPage, parseTemplatePrice, parseVariationSku } from '../src/scrapers/bowdens.js';

// Trimmed from real bowdensown.com.au pages (2026-11), keeping the markup the scraper reads.
const header = (sku: string) =>
  [
    ['type', 'aXRlbQ'],
    ['template', 'aGVhZGVy'],
    ['content_id', '106'],
    ['sku', sku],
    ['onreload', ''],
  ]
    .map(
      ([k, v], i) =>
        `<input type="hidden" id="_jstl__header_k${i}" value="${k}"/><input type="hidden" id="_jstl__header_v${i}" value="${v}"/>`,
    )
    .join('');
const size = (valueId: string, label: string, checked = false) =>
  `<label class="_itmspec_listitm btn swatch-radio btn-default" ref="1_${valueId}">
    <input class="_itmspec_radio" type="radio" name="_itmspec_radio1" value="${valueId}" ref="1_${valueId}"${checked ? ' checked' : ''}>
    <span class="value">${label}</span>`;
// Related-product tiles further down the page use itemprop="price" too, with the $ inside.
const tile = '<p class="price" itemprop="offers"><span itemprop="price">$16.99</span></p>';

const SNOW_JOB = `<div id="_jstl__header">${header('BOSNOWV21L')}
  <h1 itemprop="name">Snow Job 1L</h1>
  <div class="productprice productpricetext">
    $<span itemprop="price">33.99</span>
  </div></div>
  <input type="hidden" id="_itmspec_sku" value="BOSNOWV2">
  ${size('9', '1L', true)}${size('7', '2L')}${size('4', '5L')}${size('5', '20L')}
  ${tile}`;

const ALL_SORTS = `<h1 itemprop="name">All Sorts</h1>
  <div id="buy-child-list"><table class="table table-bordered"><thead><tr><th>Quantity</th></tr></thead><tbody>
  <tr><td><input type="hidden" id="skuBOASORT" name="skuBOASORT" value="BOASORT"></td>
    <td>All Sort - Single</td><td><div class="child-price">$8.99</div></td></tr>
  <tr><td><input type="hidden" id="skuBOASORTS__" name="skuBOASORTS__" value="BOASORTS__"></td>
    <td>All Sorts - Twin Pack (2 x All Sort)</td><td><div class="child-price">$14.99</div></td></tr>
  </tbody></table></div>${tile}`;

const BEAD_MACHINE = `<div class="productprice productpricetext">
    $<span itemprop="price">37.99</span>
  </div>${size('6', '500mL', true)}${tile}`;

describe('reading a product page', () => {
  it('reads the main price, not a related tile', () => {
    const page = parseProductPage(SNOW_JOB);
    expect(page.priceCents).toBe(3399);
    expect(page.parentSku).toBe('BOSNOWV2');
    expect(page.sizes.map((s) => `${s.label}${s.selected ? '*' : ''}`)).toEqual(['1L*', '2L', '5L', '20L']);
    expect(page.header).toEqual({
      type: 'aXRlbQ',
      template: 'aGVhZGVy',
      content_id: '106',
      sku: 'BOSNOWV21L',
      onreload: '',
    });
  });

  it('reads a buying-options table', () => {
    const page = parseProductPage(ALL_SORTS);
    expect(page.priceCents).toBeNull();
    expect(page.buyingOptions).toEqual([
      { sku: 'BOASORT', priceCents: 899 },
      { sku: 'BOASORTS__', priceCents: 1499 },
    ]);
  });

  it("reads Neto's AJAX replies", () => {
    expect(parseVariationSku('^NETO^SUCCESS^NSD1;#5|$11|ldselectors$1|y$3|sku$10|BOSNOWV25L$4|msg$0|')).toBe(
      'BOSNOWV25L',
    );
    const block = '<div class="productprice productpricetext">\n $<span itemprop="price">119.99</span>\n</div>';
    expect(parseTemplatePrice(`^NETO^SUCCESS^NSD1;#1|$7|content$${escape(block).length}|${escape(block)}`)).toBe(11999);
  });
});

describe('pricing a stored URL', () => {
  const pages: Record<string, string> = {
    'https://www.bowdensown.com.au/snow-job~3816': SNOW_JOB,
    'https://www.bowdensown.com.au/all-sorts': ALL_SORTS,
    'https://www.bowdensown.com.au/bead-machine': BEAD_MACHINE,
  };
  const calls: { url: string; init?: RequestInit }[] = [];
  const mockSite = () =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (pages[url]) return new Response(pages[url], { headers: { 'set-cookie': '_cfuvid=abc; path=/' } });
      if (url.endsWith('/ajax/variations')) return new Response('^NETO^SUCCESS^NSD1;#2|$3|sku$10|BOSNOWV25L$3|msg$0|');
      if (url.includes('/ajax/ajax_template')) {
        const block = escape('<div class="productprice productpricetext">$<span itemprop="price">119.99</span></div>');
        return new Response(`^NETO^SUCCESS^NSD1;#1|$7|content$${block.length}|${block}`);
      }
      return new Response('Not found', { status: 404 });
    });
  afterEach(() => {
    vi.restoreAllMocks();
    calls.length = 0;
  });

  it('prices the default size from the page alone', async () => {
    mockSite();
    expect(await fetchPrice('https://www.bowdensown.com.au/snow-job~3816#1L')).toBe(3399);
    expect(await fetchPrice('https://www.bowdensown.com.au/bead-machine')).toBe(3799);
    expect(calls).toHaveLength(2);
  });

  it('prices another size the way the size buttons do', async () => {
    mockSite();
    expect(await fetchPrice('https://www.bowdensown.com.au/snow-job~3816#5l')).toBe(11999);

    const variation = new URLSearchParams(String(calls[1].init?.body));
    expect(variation.get('sku')).toBe('BOSNOWV2');
    expect(variation.get('variations')).toBe('NSD1;#1|$1|1$1|4');
    expect(new Headers(calls[1].init?.headers).get('cookie')).toBe('_cfuvid=abc');

    const template = new URL(calls[2].url).searchParams;
    expect(template.get('template')).toBe('aGVhZGVy');
    // The page's own header fields, empty ones left out, with the 5L SKU.
    expect(template.get('fields')).toBe('NSD1;#2|$10|content_id$3|106$3|sku$10|BOSNOWV25L');
  });

  it('prices a buying option by its SKU', async () => {
    mockSite();
    expect(await fetchPrice('https://www.bowdensown.com.au/all-sorts#BOASORTS__')).toBe(1499);
  });

  it("misses a page with options when the URL doesn't name one, or names one it doesn't offer", async () => {
    mockSite();
    expect(await fetchPrice('https://www.bowdensown.com.au/snow-job~3816')).toBeNull();
    expect(await fetchPrice('https://www.bowdensown.com.au/all-sorts')).toBeNull();
    expect(await fetchPrice('https://www.bowdensown.com.au/snow-job~3816#3L')).toBeNull();
    expect(await fetchPrice('https://www.bowdensown.com.au/gone')).toBeNull();
  });
});
