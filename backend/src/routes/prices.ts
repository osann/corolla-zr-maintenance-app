import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, priceHistory } from '../db/schema.js';
import { isOnSale } from '../lib/sale-detector.js';

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
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);

    if (productRows.length === 0) {
      skipped++;
      continue;
    }

    const productId = productRows[0].id;
    const onSale = isOnSale(priceCents, compareAtCents, null);

    await db.insert(priceHistory).values({
      productId,
      retailer: retailer as 'bowdens' | 'supercheap' | 'repco' | 'autopro' | 'autobarn',
      priceCents,
      onSale,
    });

    inserted++;
  }

  return c.json({ inserted, skipped });
});

export default router;
