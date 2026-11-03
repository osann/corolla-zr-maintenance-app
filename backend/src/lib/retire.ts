// Catalogue data taken out for good, cleaned up by initDb() on every boot, before seed() runs. It
// repeats every boot, like the retired-retailer cleanup in init.ts, which also tidies up after a
// browser that still had an old copy open and saved it.
//
// RETIRED_PRODUCTS are deleted with their URLs, price history and pack rows, tombstoned so seed()
// can't bring them back, and taken out of every account's data. A duplicate's references move to
// the product it duplicated instead. To bring a product back, take it off the list.
//
// RETIRED_URLS are retailer URLs that are gone or point at the wrong product. Each is removed with
// its retailer's price history for that product, which is wrong or dead too. They're matched
// exactly, so a corrected URL saved later (in seed.ts or the Products tab) is left alone.
import { and, eq, or } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, retailerUrls, priceHistory, packComponents, deletedProducts, type Retailer } from '../db/schema.js';
import { removeProductFromUserData } from './rename.js';

interface RetiredProduct {
  slug: string;
  names: string[]; // names routine steps may use for it, besides its name in the products table
  duplicateOf?: string; // slug of the product it duplicated
}

export const RETIRED_PRODUCTS: RetiredProduct[] = [
  // Its only URL, Supercheap 700985, is The Chubby Wheel Brush V2, and Bowden's has no Little Chubby.
  { slug: 'little-chubby-v2', names: ['Little Chubby Brush V2'], duplicateOf: 'the-chubby-wheel-brush' },
  // Dropped from the kit (2026-11). It wasn't a Bowden's product, and no tracked retailer sold it.
  { slug: '303-aerospace', names: ['303 Aerospace Protectant', '303 Aerospace Protectant 473ml'] },
];

export const RETIRED_URLS: { slug: string; retailer: Retailer; url: string }[] = [
  // 410 Gone since 2026-10-28: Supercheap only sells the 125ml now.
  {
    slug: 'flash-prep-500ml',
    retailer: 'supercheap',
    url: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-flash-prep-spray-500ml/599354.html',
  },
  // The 1L listing, so every Auto Barn price recorded for the 500ml was the 1L's. seed.ts has the
  // 500ml's own listing.
  {
    slug: 'wipe-out-500ml',
    retailer: 'autobarn',
    url: 'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Wipe-Out-Windscreen-Washer-Additive-1L/p/CC07340',
  },
  // Supercheap's 770ml (one of its own sizes), not the 500ml.
  {
    slug: 'tyre-sheen-500ml',
    retailer: 'supercheap',
    url: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-tyre-sheen-770ml/588685.html',
  },
];

export async function retireCatalogueData(): Promise<void> {
  for (const { slug, names, duplicateOf } of RETIRED_PRODUCTS) {
    const [product] = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.slug, slug));
    if (product) {
      await db
        .delete(packComponents)
        .where(or(eq(packComponents.packProductId, product.id), eq(packComponents.componentProductId, product.id)));
      await db.delete(priceHistory).where(eq(priceHistory.productId, product.id));
      await db.delete(retailerUrls).where(eq(retailerUrls.productId, product.id));
      await db.insert(deletedProducts).values({ slug, name: product.name }).onConflictDoNothing();
      await db.delete(products).where(eq(products.id, product.id));
      console.log(`Retired product ${slug}.`);
    }

    const [replacement] = duplicateOf
      ? await db
          .select({ slug: products.slug, name: products.name })
          .from(products)
          .where(eq(products.slug, duplicateOf))
      : [];
    await removeProductFromUserData(
      slug,
      product ? [...new Set([...names, product.name])] : names,
      replacement ?? null,
    );
  }

  for (const { slug, retailer, url } of RETIRED_URLS) {
    const [row] = await db
      .select({ productId: retailerUrls.productId })
      .from(retailerUrls)
      .innerJoin(products, eq(products.id, retailerUrls.productId))
      .where(and(eq(products.slug, slug), eq(retailerUrls.retailer, retailer), eq(retailerUrls.url, url)));
    if (!row) continue;
    const ofThisRetailer = (table: typeof priceHistory | typeof retailerUrls) =>
      and(eq(table.productId, row.productId), eq(table.retailer, retailer));
    await db.delete(priceHistory).where(ofThisRetailer(priceHistory));
    await db.delete(retailerUrls).where(ofThisRetailer(retailerUrls));
    console.log(`Removed the retired ${retailer} URL for ${slug}.`);
  }
}
