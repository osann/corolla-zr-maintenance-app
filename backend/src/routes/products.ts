import { Hono } from 'hono';
import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, priceHistory, retailerUrls } from '../db/schema.js';

const router = new Hono();

// GET /products — all products with their latest price per retailer
router.get('/products', async (c) => {
  const allProducts = await db.select().from(products).orderBy(products.phase, products.id);

  // Single query: latest price per (product_id, retailer) using a correlated subquery.
  // A fixed LIMIT can miss retailers whose last observation is older than N recent rows
  // from other retailers (e.g. autobarn scraped weekly vs supercheap scraped daily).
  const latestPriceRows = await db.all<{
    product_id: number;
    retailer: string;
    price_cents: number;
    on_sale: number;
    observed_at: string;
  }>(sql`
    SELECT ph.product_id, ph.retailer, ph.price_cents, ph.on_sale, ph.observed_at
    FROM price_history ph
    WHERE ph.observed_at = (
      SELECT MAX(ph2.observed_at)
      FROM price_history ph2
      WHERE ph2.product_id = ph.product_id AND ph2.retailer = ph.retailer
    )
  `);

  // Index by product_id → retailer
  const pricesByProduct = new Map<number, Record<string, { priceCents: number; onSale: boolean; observedAt: string }>>();
  for (const row of latestPriceRows) {
    if (!pricesByProduct.has(row.product_id)) pricesByProduct.set(row.product_id, {});
    pricesByProduct.get(row.product_id)![row.retailer] = {
      priceCents: row.price_cents,
      onSale: Boolean(row.on_sale),
      observedAt: row.observed_at,
    };
  }

  // Single query: all retailer URLs
  const allUrlRows = await db.select().from(retailerUrls);
  const urlsByProduct = new Map<number, Record<string, string>>();
  for (const row of allUrlRows) {
    if (!urlsByProduct.has(row.productId)) urlsByProduct.set(row.productId, {});
    urlsByProduct.get(row.productId)![row.retailer] = row.url;
  }

  const result = allProducts.map((p) => ({
    ...p,
    latestPrice: pricesByProduct.get(p.id) ?? {},
    urls: urlsByProduct.get(p.id) ?? {},
  }));

  return c.json(result);
});

// GET /products/prices — all price histories in one call, grouped by productId
// Must be registered before /:id/prices so "prices" isn't matched as an id.
router.get('/products/prices', async (c) => {
  const history = await db
    .select({
      productId: priceHistory.productId,
      retailer: priceHistory.retailer,
      priceCents: priceHistory.priceCents,
      onSale: priceHistory.onSale,
      observedAt: priceHistory.observedAt,
    })
    .from(priceHistory)
    .where(sql`${priceHistory.observedAt} >= datetime('now', '-90 days')`)
    .orderBy(desc(priceHistory.observedAt));

  const byProduct: Record<number, typeof history> = {};
  for (const row of history) {
    if (!byProduct[row.productId]) byProduct[row.productId] = [];
    byProduct[row.productId].push(row);
  }

  return c.json(byProduct);
});

// GET /products/:id/prices — full price history for a single product (kept for compatibility)
router.get('/products/:id/prices', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const history = await db
    .select({
      retailer: priceHistory.retailer,
      priceCents: priceHistory.priceCents,
      onSale: priceHistory.onSale,
      observedAt: priceHistory.observedAt,
    })
    .from(priceHistory)
    .where(eq(priceHistory.productId, id))
    .orderBy(desc(priceHistory.observedAt));

  return c.json(history);
});

export default router;
