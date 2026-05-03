import { Hono } from 'hono';
import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, priceHistory } from '../db/schema.js';

const router = new Hono();

// GET /products — all products with their latest price per retailer
router.get('/products', async (c) => {
  const allProducts = await db.select().from(products).orderBy(products.phase, products.id);

  // For each product, fetch the latest price_history row per retailer
  const result = await Promise.all(
    allProducts.map(async (p) => {
      const latestRows = await db
        .select()
        .from(priceHistory)
        .where(eq(priceHistory.productId, p.id))
        .orderBy(desc(priceHistory.observedAt))
        .limit(10); // enough to cover all retailers

      const latestPrice: Record<string, { priceCents: number; onSale: boolean; observedAt: string }> = {};
      for (const row of latestRows) {
        if (!latestPrice[row.retailer]) {
          latestPrice[row.retailer] = {
            priceCents: row.priceCents,
            onSale: row.onSale,
            observedAt: row.observedAt,
          };
        }
      }

      return { ...p, latestPrice };
    }),
  );

  return c.json(result);
});

// GET /products/:id/prices — full price history for sparklines
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
