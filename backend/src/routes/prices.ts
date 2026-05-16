import { Hono } from 'hono';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, priceHistory } from '../db/schema.js';
import { isOnSale } from '../lib/sale-detector.js';
import { sendTickTickTask } from '../lib/email.js';

const router = new Hono();

export interface PriceObservation {
  slug: string;
  retailer: string;
  priceCents: number;
  compareAtCents: number | null;
}

// POST /api/prices — ingest scraper results from GitHub Actions
// Requires: Authorization: Bearer <SCRAPE_SECRET>
router.post('/prices', async (c) => {
  const secret = process.env.SCRAPE_SECRET;
  if (secret) {
    const auth = c.req.header('Authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  }

  let body: PriceObservation[];
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  if (!Array.isArray(body) || body.length === 0) {
    return c.json({ error: 'Expected non-empty array of observations' }, 400);
  }

  let inserted = 0;
  let skipped = 0;

  for (const obs of body) {
    const { slug, retailer, priceCents, compareAtCents } = obs;

    if (!slug || !retailer || typeof priceCents !== 'number') {
      skipped++;
      continue;
    }

    const productRows = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);

    if (productRows.length === 0) {
      skipped++;
      continue;
    }

    const productId = productRows[0].id;

    const avgRows = await db
      .select({ avg: sql<number>`AVG(price_cents)` })
      .from(priceHistory)
      .where(and(
        eq(priceHistory.productId, productId),
        eq(priceHistory.retailer, retailer as 'bowdens' | 'supercheap' | 'repco' | 'autopro' | 'autobarn'),
        gt(priceHistory.observedAt, sql`datetime('now', '-30 days')`),
      ));
    const rollingAvg = avgRows[0]?.avg ?? null;

    const onSale = isOnSale(priceCents, compareAtCents, rollingAvg);

    await db.insert(priceHistory).values({
      productId,
      retailer: retailer as 'bowdens' | 'supercheap' | 'repco' | 'autopro' | 'autobarn',
      priceCents,
      onSale,
    });

    if (onSale) {
      const recent = await db
        .select({ onSale: priceHistory.onSale, priceCents: priceHistory.priceCents })
        .from(priceHistory)
        .where(and(
          eq(priceHistory.productId, productId),
          eq(priceHistory.retailer, retailer as 'bowdens' | 'supercheap' | 'repco' | 'autopro' | 'autobarn'),
        ))
        .orderBy(desc(priceHistory.observedAt))
        .limit(2);

      const previouslyOnSale = recent[1]?.onSale ?? false;

      if (!previouslyOnSale) {
        const productName  = productRows[0].name;
        const currentPrice = `$${(priceCents / 100).toFixed(2)}`;
        const prevCents    = recent[1]?.priceCents;
        const prevLine     = prevCents ? `Previous price: $${(prevCents / 100).toFixed(2)}\n` : '';
        const retailerName = retailer.charAt(0).toUpperCase() + retailer.slice(1);

        sendTickTickTask(
          `🔥 ${productName} on sale at ${retailerName} — ${currentPrice}`,
          `Current price: ${currentPrice}\n${prevLine}`,
        ).catch(console.error);
      }
    }

    inserted++;
  }

  return c.json({ inserted, skipped });
});

export default router;
