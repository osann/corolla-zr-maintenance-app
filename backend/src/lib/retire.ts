// Products taken out of the catalogue for good. retireProducts() runs on every boot (index.ts): it
// deletes each one with its URLs, price history and pack rows, tombstones it so seed() can't bring
// it back, and takes it out of every account's data. A duplicate's references move to the product
// it duplicated instead. It repeats every boot, like the retired-retailer cleanup in init.ts, which
// also tidies up after a browser that still had an old copy open and saved it. To bring a product
// back, take it off this list.
import { eq, or } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, retailerUrls, priceHistory, packComponents, deletedProducts } from '../db/schema.js';
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

export async function retireProducts(): Promise<void> {
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
}
