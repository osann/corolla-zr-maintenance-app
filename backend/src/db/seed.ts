import { eq } from 'drizzle-orm';
import { db } from './connection.js';
import { products, retailerUrls } from './schema.js';

// All 26 kit items.
// bowdensHandle:    URL slug on bowdensown.com.au/products/{handle}
// autobarnSku:      SKU code on autobarn.com.au (e.g. CC04777)
// repcoProductCode: Hybris product code on repco.com.au (e.g. A9867756)
// supercheapSku:    SFCC SKU on supercheapauto.com.au (e.g. SPO123456)
//
// null = not stocked at that retailer (or SKU not yet researched)
const KIT_ITEMS: {
  name: string;
  slug: string;
  phase: number;
  bowdensHandle: string | null;
  autobarnSku: string | null;
  repcoProductCode: string | null;
  supercheapSku: string | null;
}[] = [
  // Phase 1 — Core wash setup
  { name: 'Nanolicious Wash Pack Ultimate', slug: 'nanolicious-wash-pack-ultimate', phase: 1, bowdensHandle: null,                         autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
  { name: 'Wet Dreams Pack',                slug: 'wet-dreams-pack',                phase: 1, bowdensHandle: 'wet-dreams-pack',             autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
  { name: '2 Bucket Wash Kit',              slug: '2-bucket-wash-kit',              phase: 1, bowdensHandle: '2-bucket-wash-kit',           autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
  { name: 'Boss Gloss 770ml',               slug: 'boss-gloss-770ml',               phase: 1, bowdensHandle: 'boss-gloss',                  autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
  { name: 'Naked Glass 500ml',              slug: 'naked-glass-500ml',              phase: 1, bowdensHandle: 'naked-glass',                 autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
  { name: 'Inta-Mitt',                      slug: 'inta-mitt',                      phase: 1, bowdensHandle: null,                         autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
  { name: 'Kärcher K2 Pressure Washer',     slug: 'karcher-k2',                     phase: 1, bowdensHandle: null,                         autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
  { name: 'Snow Blow Cannon',               slug: 'snow-blow-cannon',               phase: 1, bowdensHandle: 'snow-blow-cannon',            autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
  { name: 'Snow Job 1L',                    slug: 'snow-job-1l',                    phase: 1, bowdensHandle: 'snow-job~3816',               autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
  { name: 'Happy Ending Finishing Foam 500ml', slug: 'happy-ending-500ml',          phase: 1, bowdensHandle: 'happy-ending',               autobarnSku: null,      repcoProductCode: null, supercheapSku: null },

  // Phase 2 — Complete exterior + interior
  { name: 'Wheely Clean V2 500ml',          slug: 'wheely-clean-v2-500ml',          phase: 2, bowdensHandle: 'new-wheely-clean',           autobarnSku: 'CC04777', repcoProductCode: null, supercheapSku: null },
  { name: 'The Little Stiffy',              slug: 'the-little-stiffy',              phase: 2, bowdensHandle: 'the-little-stiffy',          autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
  { name: 'The Flat Head',                  slug: 'the-flat-head',                  phase: 2, bowdensHandle: 'the-flat-head-brush',        autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
  { name: 'Fabra Cadabra 500ml',            slug: 'fabra-cadabra-500ml',            phase: 2, bowdensHandle: 'fabra-cadabra~3826',         autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
  { name: 'BOLP Leather Care Pack',         slug: 'bolp-leather-care-pack',         phase: 2, bowdensHandle: 'leather-care-pack',          autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
  { name: 'Fabratection',                   slug: 'fabratection',                   phase: 2, bowdensHandle: 'fabratection',               autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
  { name: '303 Aerospace Protectant',       slug: '303-aerospace',                  phase: 2, bowdensHandle: null,                         autobarnSku: null,      repcoProductCode: null, supercheapSku: null },

  // Phase 3 — Daily-use bulk
  { name: 'Pumpy Pump',                     slug: 'pumpy-pump',                     phase: 3, bowdensHandle: '5-litre-bottle-pump',         autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
  // CC06486 is confirmed for Nanolicious Wash 2L — verify if 5L is a separate SKU
  { name: 'Nanolicious Wash 5L',            slug: 'nanolicious-wash-5l',            phase: 3, bowdensHandle: 'nanolicious-wash',            autobarnSku: 'CC06486', repcoProductCode: null, supercheapSku: null },
  // CC06814 is confirmed for Microfibre Wash 5L — verify if 1L is a separate SKU
  { name: 'Microfibre Wash 1L',             slug: 'microfibre-wash-1l',             phase: 3, bowdensHandle: 'microfibre-wash',             autobarnSku: null,      repcoProductCode: null, supercheapSku: null },

  // Phase 4 — Long-term preservation
  { name: 'Plush Brush',                    slug: 'plush-brush',                    phase: 4, bowdensHandle: 'plush-brush',                 autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
  { name: 'Flash Prep 500ml',               slug: 'flash-prep-500ml',               phase: 4, bowdensHandle: 'flash-prep',                  autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
  { name: 'Bead Machine 500ml',             slug: 'bead-machine-500ml',             phase: 4, bowdensHandle: 'bead-machine',                autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
  { name: 'Big Softie Pair',                slug: 'big-softie-pair',                phase: 4, bowdensHandle: 'big-softie',                  autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
  { name: 'Snow Job 5L',                    slug: 'snow-job-5l',                    phase: 4, bowdensHandle: 'snow-job-5l',                 autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
  { name: 'Wheely Clean V2 5L',             slug: 'wheely-clean-v2-5l',             phase: 4, bowdensHandle: 'new-wheely-clean',            autobarnSku: null,      repcoProductCode: null, supercheapSku: null },
];

export async function seed() {
  console.log('Seeding products...');
  let inserted = 0;
  let skipped = 0;

  for (const item of KIT_ITEMS) {
    // Insert product (idempotent)
    const [row] = await db
      .insert(products)
      .values({ name: item.name, slug: item.slug, phase: item.phase })
      .onConflictDoNothing()
      .returning({ id: products.id });

    // Fetch the id whether or not we just inserted
    let productId: number;
    if (row) {
      productId = row.id;
      inserted++;
    } else {
      const [existing] = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.slug, item.slug))
        .limit(1);
      if (!existing) throw new Error(`Product not found after insert: ${item.slug}`);
      productId = existing.id;
      skipped++;
    }

    // Bowden's Own URL
    if (item.bowdensHandle) {
      const url = `https://www.bowdensown.com.au/products/${item.bowdensHandle}`;
      await db.insert(retailerUrls).values({ productId, retailer: 'bowdens', url }).onConflictDoNothing();
    }

    // Auto Barn URL — short form /ab/p/{SKU} (redirects to full path)
    if (item.autobarnSku) {
      const url = `https://www.autobarn.com.au/ab/p/${item.autobarnSku}`;
      await db.insert(retailerUrls).values({ productId, retailer: 'autobarn', url }).onConflictDoNothing();
    }

    // Repco URL
    if (item.repcoProductCode) {
      const url = `https://www.repco.com.au/en/car-care/car-cleaning/${item.repcoProductCode}/p/${item.repcoProductCode}`;
      await db.insert(retailerUrls).values({ productId, retailer: 'repco', url }).onConflictDoNothing();
    }

    // Supercheap Auto URL
    if (item.supercheapSku) {
      const url = `https://www.supercheapauto.com.au/p/bowdens-own-${item.slug}/${item.supercheapSku}.html`;
      await db.insert(retailerUrls).values({ productId, retailer: 'supercheap', url }).onConflictDoNothing();
    }
  }

  const bowdensCount = KIT_ITEMS.filter(i => i.bowdensHandle).length;
  const autobarnCount = KIT_ITEMS.filter(i => i.autobarnSku).length;
  const repcoCount = KIT_ITEMS.filter(i => i.repcoProductCode).length;
  const supercheapCount = KIT_ITEMS.filter(i => i.supercheapSku).length;

  console.log(`Done. ${inserted} products inserted, ${skipped} already existed.`);
  console.log(`Retailer URLs: ${bowdensCount} Bowden's, ${autobarnCount} Auto Barn, ${repcoCount} Repco, ${supercheapCount} Supercheap`);
}

// Allow running directly: npm run seed
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seed().catch((err) => { console.error(err); process.exit(1); });
}
