import { Hono } from 'hono';
import { eq, desc, and, gt, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, priceHistory } from '../db/schema.js';

const router = new Hono();

// GET /alerts — products currently on sale (latest observation has on_sale = true)
router.get('/alerts', async (c) => {
  // Find products where the most recent observation (within last 48h) is on sale.
  // We use a subquery approach: get the max observedAt per product+retailer,
  // then join back to get the full row, then filter on_sale = true.
  const recentCutoff = sql`datetime('now', '-48 hours')`;

  // Get all recent on-sale rows
  const onSaleRows = await db
    .select({
      productId: priceHistory.productId,
      retailer: priceHistory.retailer,
      priceCents: priceHistory.priceCents,
      observedAt: priceHistory.observedAt,
      name: products.name,
      slug: products.slug,
      phase: products.phase,
    })
    .from(priceHistory)
    .innerJoin(products, eq(products.id, priceHistory.productId))
    .where(
      and(
        eq(priceHistory.onSale, true),
        gt(priceHistory.observedAt, recentCutoff),
      ),
    )
    .orderBy(desc(priceHistory.observedAt));

  // Deduplicate: keep only the most recent alert per product+retailer
  const seen = new Set<string>();
  const alerts = onSaleRows.filter((row) => {
    const key = `${row.productId}:${row.retailer}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return c.json(alerts);
});

export default router;
