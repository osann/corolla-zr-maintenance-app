import { Hono } from 'hono';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, priceHistory, retailerUrls, packComponents } from '../db/schema.js';
import { sessionMiddleware, type AppEnv } from '../lib/auth.js';

const router = new Hono<AppEnv>();

// Shape returned to the frontend for each pack component — matches the client's existing
// BUNDLE_COMPONENTS contract so the frontend can treat it as a drop-in replacement.
type ComponentOut = { slug?: string; name: string; volumeMl?: number; equipment?: boolean; sectionPath?: [string, string] };

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

  // Single query: all pack components, ordered so componentsByProduct arrays come out in
  // the order they should render/deplete in (sortOrder mirrors the original array order).
  const slugById = new Map(allProducts.map((p) => [p.id, p.slug]));
  const allComponentRows = await db.select().from(packComponents).orderBy(packComponents.sortOrder);
  const componentsByProduct = new Map<number, ComponentOut[]>();
  for (const row of allComponentRows) {
    if (!componentsByProduct.has(row.packProductId)) componentsByProduct.set(row.packProductId, []);
    const component: ComponentOut = { name: row.name };
    if (row.componentProductId != null) {
      const slug = slugById.get(row.componentProductId);
      if (slug) component.slug = slug;
    }
    if (row.volumeMl != null) component.volumeMl = row.volumeMl;
    if (row.isEquipment) component.equipment = true;
    if (row.sectionCategory && row.sectionLabel) component.sectionPath = [row.sectionCategory, row.sectionLabel];
    componentsByProduct.get(row.packProductId)!.push(component);
  }

  const result = allProducts.map((p) => ({
    ...p,
    isPack: Boolean(p.isPack),
    components: p.isPack ? (componentsByProduct.get(p.id) ?? []) : [],
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

// PATCH /products/:id — rename a product's name and/or slug (session-protected)
router.patch('/products/:id', sessionMiddleware, async (c) => {
  const userId = c.var.userId;
  if (!userId) return c.json({ error: 'Unauthorised' }, 401);

  const id = parseInt(c.req.param('id') ?? '', 10);
  if (isNaN(id)) return c.json({ error: 'Invalid product id' }, 400);

  const body = await c.req.json<{ name?: string; slug?: string }>();
  const name = body.name?.trim();
  const slug = body.slug?.trim();
  if (!name && !slug) return c.json({ error: 'Name or slug required' }, 400);

  const prod = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
  if (!prod.length) return c.json({ error: 'Product not found' }, 404);

  const update: { name?: string; slug?: string } = {};

  if (name) {
    const existingName = await db.select({ id: products.id }).from(products).where(eq(products.name, name)).limit(1);
    if (existingName.length && existingName[0].id !== id) return c.json({ error: 'A product with that name already exists' }, 409);
    update.name = name;
  }

  if (slug) {
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return c.json({ error: 'Slug must contain only lowercase letters, numbers and hyphens' }, 400);
    }
    const existingSlug = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug)).limit(1);
    if (existingSlug.length && existingSlug[0].id !== id) return c.json({ error: 'A product with that slug already exists' }, 409);
    update.slug = slug;
  }

  await db.update(products).set(update).where(eq(products.id, id));
  const [updated] = await db.select({ id: products.id, name: products.name, slug: products.slug }).from(products).where(eq(products.id, id)).limit(1);
  return c.json({ ok: true, ...updated });
});

// PUT /products/:id/pack — replace a product's whole pack-component list atomically and mark
// it as a pack (session-protected). Deletes the existing component rows and re-inserts the
// given list in order, rather than diffing — packs are small (a handful of rows) and the
// frontend always sends the full current list, so this is simpler and can't drift out of sync.
router.put('/products/:id/pack', sessionMiddleware, async (c) => {
  const userId = c.var.userId;
  if (!userId) return c.json({ error: 'Unauthorised' }, 401);

  const id = parseInt(c.req.param('id') ?? '', 10);
  if (isNaN(id)) return c.json({ error: 'Invalid product id' }, 400);

  const prod = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
  if (!prod.length) return c.json({ error: 'Product not found' }, 404);

  const body = await c.req.json<{
    components?: Array<{ componentProductId?: number; name?: string; volumeMl?: number; equipment?: boolean; sectionCategory?: string; sectionLabel?: string }>;
  }>();
  const components = body.components;
  if (!Array.isArray(components) || components.length === 0) {
    return c.json({ error: 'A pack needs at least one component' }, 400);
  }

  for (const comp of components) {
    if (!comp.name || typeof comp.name !== 'string' || !comp.name.trim()) {
      return c.json({ error: 'Every component needs a name' }, 400);
    }
    if (comp.componentProductId != null) {
      if (comp.componentProductId === id) return c.json({ error: 'A pack cannot reference itself as a component' }, 400);
      const compProd = await db.select({ id: products.id, isPack: products.isPack }).from(products).where(eq(products.id, comp.componentProductId)).limit(1);
      if (!compProd.length) return c.json({ error: 'Component product not found' }, 400);
      if (compProd[0].isPack) return c.json({ error: 'A pack cannot be used as a component of another pack' }, 400);
    }
  }

  await db.delete(packComponents).where(eq(packComponents.packProductId, id));
  let sortOrder = 0;
  for (const comp of components) {
    await db.insert(packComponents).values({
      packProductId: id,
      componentProductId: comp.componentProductId ?? null,
      name: comp.name!.trim(),
      volumeMl: comp.volumeMl ?? null,
      isEquipment: comp.equipment ?? false,
      sectionCategory: comp.sectionCategory ?? null,
      sectionLabel: comp.sectionLabel ?? null,
      sortOrder: sortOrder++,
    });
  }
  await db.update(products).set({ isPack: true }).where(eq(products.id, id));

  return c.json({ ok: true, isPack: true, components });
});

// DELETE /products/:id/pack — unmark a product as a pack and discard its component list
// (session-protected)
router.delete('/products/:id/pack', sessionMiddleware, async (c) => {
  const userId = c.var.userId;
  if (!userId) return c.json({ error: 'Unauthorised' }, 401);

  const id = parseInt(c.req.param('id') ?? '', 10);
  if (isNaN(id)) return c.json({ error: 'Invalid product id' }, 400);

  await db.delete(packComponents).where(eq(packComponents.packProductId, id));
  await db.update(products).set({ isPack: false }).where(eq(products.id, id));

  return c.json({ ok: true });
});

// DELETE /products/:id/url/:retailer — stop tracking one retailer for a product,
// removing its URL and price history so it no longer appears at all (session-protected)
router.delete('/products/:id/url/:retailer', sessionMiddleware, async (c) => {
  const userId = c.var.userId;
  if (!userId) return c.json({ error: 'Unauthorised' }, 401);

  const id = parseInt(c.req.param('id') ?? '', 10);
  if (isNaN(id)) return c.json({ error: 'Invalid product id' }, 400);

  const SCRAPED_RETAILERS = ['supercheap', 'repco', 'autobarn', 'autopro'] as const;
  const retailer = c.req.param('retailer');
  if (!SCRAPED_RETAILERS.includes(retailer as typeof SCRAPED_RETAILERS[number])) {
    return c.json({ error: 'Invalid retailer' }, 400);
  }
  const typedRetailer = retailer as typeof SCRAPED_RETAILERS[number];

  await db.delete(priceHistory).where(and(eq(priceHistory.productId, id), eq(priceHistory.retailer, typedRetailer)));
  await db.delete(retailerUrls).where(and(eq(retailerUrls.productId, id), eq(retailerUrls.retailer, typedRetailer)));

  return c.json({ ok: true });
});

// DELETE /products/:id — remove a product entirely, including all retailer URLs, price
// history, its own pack-component definition (if it is a pack), and its entry in any other
// pack's component list (session-protected). Does not touch the frontend's static CATALOG,
// checklist phases, routines, or category assignments — those are keyed by slug and
// independent of backend price tracking.
router.delete('/products/:id', sessionMiddleware, async (c) => {
  const userId = c.var.userId;
  if (!userId) return c.json({ error: 'Unauthorised' }, 401);

  const id = parseInt(c.req.param('id') ?? '', 10);
  if (isNaN(id)) return c.json({ error: 'Invalid product id' }, 400);

  const prod = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
  if (!prod.length) return c.json({ error: 'Product not found' }, 404);

  await db.delete(packComponents).where(eq(packComponents.packProductId, id));
  await db.delete(packComponents).where(eq(packComponents.componentProductId, id));
  await db.delete(priceHistory).where(eq(priceHistory.productId, id));
  await db.delete(retailerUrls).where(eq(retailerUrls.productId, id));
  await db.delete(products).where(eq(products.id, id));

  return c.json({ ok: true });
});

export default router;
