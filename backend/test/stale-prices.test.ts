import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/connection.js';
import { priceHistory, products, retailerUrls } from '../src/db/schema.js';
import { initDb } from '../src/db/init.js';
import { seed } from '../src/db/seed.js';
import { sendDirectEmail } from '../src/lib/email.js';
import { findStaleRetailers, runStalePriceCheck } from '../src/lib/notifications.js';

vi.mock('../src/lib/email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/email.js')>()),
  sendDirectEmail: vi.fn(async () => {}),
}));

// The frontend modules expect a browser: js/storage.js reads window when it's imported.
vi.stubGlobal('window', globalThis);
const { stalePriceWarning } = await import('../../js/prices.js');

// SQLite's CURRENT_TIMESTAMP format, which is what price_history.observed_at holds.
const timestampDaysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString().replace('T', ' ').slice(0, 19);

let productId: number;
const addPrice = (retailer: 'supercheap' | 'autobarn', daysAgo: number) =>
  db.insert(priceHistory).values({ productId, retailer, priceCents: 1999, observedAt: timestampDaysAgo(daysAgo) });

beforeAll(async () => {
  await initDb();
  await seed();
  [{ id: productId }] = await db.select({ id: products.id }).from(products).where(eq(products.isPack, false)).limit(1);
});

beforeEach(() => vi.mocked(sendDirectEmail).mockClear());

describe('stale-price check', () => {
  it('flags retailers whose URLs have never produced a price', async () => {
    expect(await findStaleRetailers()).toEqual([
      { retailer: 'autobarn', lastObservedAt: null },
      { retailer: 'supercheap', lastObservedAt: null },
    ]);
    await runStalePriceCheck();
    expect(vi.mocked(sendDirectEmail).mock.calls).toEqual([
      ['owner@example.com', '⚠️ Prices not updating: Auto Barn, Supercheap Auto', expect.stringContaining('never')],
    ]);
  });

  it('flags only the retailer that has stopped, and says where to look', async () => {
    await addPrice('supercheap', 0);
    await addPrice('autobarn', 5);
    expect((await findStaleRetailers()).map((s) => s.retailer)).toEqual(['autobarn']);
    await runStalePriceCheck();
    const [[to, subject, body]] = vi.mocked(sendDirectEmail).mock.calls;
    expect([to, subject]).toEqual(['owner@example.com', '⚠️ Prices not updating: Auto Barn']);
    expect(body).toContain(`No new Auto Barn prices since ${timestampDaysAgo(5).slice(0, 10)} (5 days).`);
    expect(body).toContain('debian-server');
  });

  it('sends nothing once every retailer is current', async () => {
    await addPrice('autobarn', 0);
    expect(await findStaleRetailers()).toEqual([]);
    await runStalePriceCheck();
    expect(sendDirectEmail).not.toHaveBeenCalled();
  });

  it('ignores a retailer with no product URLs', async () => {
    // With no prices but URLs left, Auto Barn would be flagged as never priced.
    await db.delete(priceHistory).where(eq(priceHistory.retailer, 'autobarn'));
    await db.delete(retailerUrls).where(eq(retailerUrls.retailer, 'autobarn'));
    expect(await findStaleRetailers()).toEqual([]);
  });
});

describe('stale-price warning on the Prices tab', () => {
  const now = Date.parse('2026-10-24T12:00:00Z');
  const product = {
    latestPrice: {
      supercheap: { priceCents: 1999, onSale: false, observedAt: '2026-10-21 12:30:00' },
      autobarn: { priceCents: 2199, onSale: false, observedAt: '2026-10-12 12:00:00' },
    },
    urls: { supercheap: 'https://example.com/s', autobarn: 'https://example.com/a' },
  };

  it('stays quiet while the price is under three days old', () => {
    expect(stalePriceWarning(product, 'supercheap', now)).toBe('');
  });

  it('says how long the price has gone without updating', () => {
    expect(stalePriceWarning(product, 'supercheap', now + 3_600_000)).toBe(
      'Supercheap Auto price not updated for 3 days (last updated 21 Oct 2026)',
    );
    expect(stalePriceWarning(product, 'autobarn', now)).toBe(
      'Auto Barn price not updated for 12 days (last updated 12 Oct 2026)',
    );
  });

  it('flags a URL that has never produced a price', () => {
    expect(stalePriceWarning({ latestPrice: {}, urls: { autobarn: 'https://example.com/a' } }, 'autobarn', now)).toBe(
      'No Auto Barn price recorded yet',
    );
    expect(stalePriceWarning({ latestPrice: {}, urls: {} }, 'autobarn', now)).toBe('');
  });
});
