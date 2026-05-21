import { Hono } from 'hono';
import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, priceHistory, retailerUrls } from '../db/schema.js';
import { sessionMiddleware, type AppEnv } from '../lib/auth.js';

const router = new Hono<AppEnv>();

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

// POST /products — create a new product (session-protected)
router.post('/products', sessionMiddleware, async (c) => {
  const userId = c.var.userId;
  if (!userId) return c.json({ error: 'Unauthorised' }, 401);

  const body = await c.req.json<{ name?: string; slug?: string; retailer?: string; url?: string }>();
  const { name, slug, retailer, url } = body;

  if (!name || typeof name !== 'string' || !name.trim()) return c.json({ error: 'Name required' }, 400);
  if (!slug || typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
    return c.json({ error: 'Slug must contain only lowercase letters, numbers and hyphens' }, 400);
  }

  const SCRAPED_RETAILERS = ['supercheap', 'repco', 'autobarn', 'autopro'] as const;
  if (retailer && !SCRAPED_RETAILERS.includes(retailer as typeof SCRAPED_RETAILERS[number])) {
    return c.json({ error: 'Invalid retailer' }, 400);
  }
  if (retailer && (!url || !url.startsWith('http'))) {
    return c.json({ error: 'URL required when retailer is specified' }, 400);
  }

  const existing = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug)).limit(1);
  if (existing.length) return c.json({ error: 'A product with that slug already exists' }, 409);

  await db.insert(products).values({ name: name.trim(), slug, phase: 0 });
  const [newProduct] = await db.select().from(products).where(eq(products.slug, slug)).limit(1);

  if (retailer && url) {
    await db.insert(retailerUrls).values({
      productId: newProduct.id,
      retailer: retailer as typeof SCRAPED_RETAILERS[number],
      url,
    });
  }

  return c.json({ id: newProduct.id, name: newProduct.name, slug: newProduct.slug, phase: newProduct.phase });
});

// PUT /products/:id/url — upsert a retailer URL (session-protected)
router.put('/products/:id/url', sessionMiddleware, async (c) => {
  const userId = c.var.userId;
  if (!userId) return c.json({ error: 'Unauthorised' }, 401);

  const id = parseInt(c.req.param('id') ?? '', 10);
  if (isNaN(id)) return c.json({ error: 'Invalid product id' }, 400);

  const SCRAPED_RETAILERS = ['supercheap', 'repco', 'autobarn', 'autopro'] as const;
  const body = await c.req.json<{ retailer?: string; url?: string }>();
  const { retailer, url } = body;

  if (!retailer || !SCRAPED_RETAILERS.includes(retailer as typeof SCRAPED_RETAILERS[number])) {
    return c.json({ error: 'Invalid retailer' }, 400);
  }
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return c.json({ error: 'Valid URL required' }, 400);
  }

  const prod = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
  if (!prod.length) return c.json({ error: 'Product not found' }, 404);

  await db.insert(retailerUrls)
    .values({ productId: id, retailer: retailer as typeof SCRAPED_RETAILERS[number], url })
    .onConflictDoUpdate({
      target: [retailerUrls.productId, retailerUrls.retailer],
      set: { url },
    });

  return c.json({ ok: true });
});

export default router;
