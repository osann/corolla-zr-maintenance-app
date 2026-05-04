import { eq } from 'drizzle-orm';
import { db } from './connection.js';
import { products, retailerUrls } from './schema.js';

// bowdensHandle: URL slug on bowdensown.com.au/products/{handle}
// autobarnSku:   SKU code on autobarn.com.au (e.g. CC04777)
// repcoUrl:      Full product URL on repco.com.au (path varies per product, can't be templated)
// supercheapSku: SFCC SKU on supercheapauto.com.au (e.g. SPO123456)
//
// null = not stocked at that retailer (or URL not yet researched)
// phase 0 = tracked for pricing but not part of the kit checklist

type Item = {
  name: string;
  slug: string;
  phase: number;
  bowdensHandle: string | null;
  autobarnSku: string | null;
  repcoUrl: string | null;
  supercheapSku: string | null;
};

const KIT_ITEMS: Item[] = [
  // Phase 1 — Core wash setup
  { name: 'Nanolicious Wash Pack Ultimate',    slug: 'nanolicious-wash-pack-ultimate', phase: 1, bowdensHandle: null,                autobarnSku: null,      repcoUrl: null, supercheapSku: null },
  { name: 'Wet Dreams Pack',                   slug: 'wet-dreams-pack',                phase: 1, bowdensHandle: 'wet-dreams-pack',   autobarnSku: null,      repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care/car-wax-sealants/bowden-s-own-wet-dreams-pack-bodreamsp/p/A5531425', supercheapSku: null },
  { name: '2 Bucket Wash Kit',                 slug: '2-bucket-wash-kit',              phase: 1, bowdensHandle: '2-bucket-wash-kit',  autobarnSku: null,      repcoUrl: null, supercheapSku: null },
  { name: 'Boss Gloss 770ml',                  slug: 'boss-gloss-770ml',               phase: 1, bowdensHandle: 'boss-gloss',         autobarnSku: null,      repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care/car-wax-sealants/bowden-s-own-boss-gloss-detailing-spray-770ml-boboss/p/A9708063', supercheapSku: null },
  { name: 'Naked Glass 500ml',                 slug: 'naked-glass-500ml',              phase: 1, bowdensHandle: 'naked-glass',        autobarnSku: null,      repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care/windscreen-glass-cleaner/bowden-s-own-naked-glass-cleaner-500ml-bong/p/A9708062', supercheapSku: null },
  { name: 'Inta-Mitt',                         slug: 'inta-mitt',                      phase: 1, bowdensHandle: null,                autobarnSku: null,      repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care-accessories/glass-windscreen-accessories/bowden-s-own-the-inta-mitt-glass-cleaning-mitt-bointa/p/A5570049', supercheapSku: null },
  { name: 'Kärcher K2 Pressure Washer',        slug: 'karcher-k2',                     phase: 1, bowdensHandle: null,                autobarnSku: null,      repcoUrl: null, supercheapSku: null },
  { name: 'Snow Blow Cannon',                  slug: 'snow-blow-cannon',               phase: 1, bowdensHandle: 'snow-blow-cannon',  autobarnSku: null,      repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care-accessories/foam-cannons/bowden-s-own-snow-blow-foam-cannon-bocannon/p/A9815923', supercheapSku: null },
  { name: 'Snow Job 1L',                       slug: 'snow-job-1l',                    phase: 1, bowdensHandle: 'snow-job~3816',      autobarnSku: null,      repcoUrl: null, supercheapSku: null },
  { name: 'Happy Ending Finishing Foam 500ml', slug: 'happy-ending-500ml',             phase: 1, bowdensHandle: 'happy-ending',       autobarnSku: null,      repcoUrl: null, supercheapSku: null },

  // Phase 2 — Complete exterior + interior
  { name: 'Wheely Clean V2 500ml',             slug: 'wheely-clean-v2-500ml',          phase: 2, bowdensHandle: 'new-wheely-clean',  autobarnSku: 'CC04777', repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care/wheel-cleaner/bowden-s-own-wheely-clean-wheel-cleaner-500ml-bowhc2/p/A9708046', supercheapSku: null },
  { name: 'The Little Stiffy',                 slug: 'the-little-stiffy',              phase: 2, bowdensHandle: 'the-little-stiffy', autobarnSku: null,      repcoUrl: null, supercheapSku: null },
  { name: 'The Flat Head',                     slug: 'the-flat-head',                  phase: 2, bowdensHandle: 'the-flat-head-brush', autobarnSku: null,    repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care-accessories/car-cleaning-brushes/bowden-s-own-flat-head-wheel-cleaning-brush-bofhead/p/A5497585', supercheapSku: null },
  { name: 'Fabra Cadabra 500ml',               slug: 'fabra-cadabra-500ml',            phase: 2, bowdensHandle: 'fabra-cadabra~3826', autobarnSku: null,     repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care/car-interior-cleaning/bowden-s-own-fabra-cadabra-v2-fabric-cleaner-500ml-bofab2/p/A5641961', supercheapSku: null },
  { name: 'BOLP Leather Care Pack',            slug: 'bolp-leather-care-pack',         phase: 2, bowdensHandle: 'leather-care-pack', autobarnSku: null,      repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care/leather-cleaner/bowden-s-own-leather-clean-protect-pack-bolp/p/A5388050', supercheapSku: null },
  { name: 'Fabratection',                      slug: 'fabratection',                   phase: 2, bowdensHandle: 'fabratection',      autobarnSku: null,      repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care/car-interior-cleaning/bowden-s-own-fabratection-fabric-protectant-500ml-boftect/p/A5430071', supercheapSku: null },
  { name: '303 Aerospace Protectant',          slug: '303-aerospace',                  phase: 2, bowdensHandle: null,                autobarnSku: null,      repcoUrl: null, supercheapSku: null },

  // Phase 3 — Daily-use bulk
  { name: 'Pumpy Pump',                        slug: 'pumpy-pump',                     phase: 3, bowdensHandle: '5-litre-bottle-pump', autobarnSku: null,    repcoUrl: 'https://www.repco.com.au/tools-equipment/garage-cleaning/general-cleaning/bowden-s-own-pumpy-pump-5-litre-bottle-bopump5l/p/A5388067', supercheapSku: null },
  // CC06486 is confirmed for Nanolicious Wash 2L — verify if 5L is a separate SKU
  { name: 'Nanolicious Wash 5L',               slug: 'nanolicious-wash-5l',            phase: 3, bowdensHandle: 'nanolicious-wash',   autobarnSku: 'CC06486', repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care/car-washes/bowden-s-own-nanolicious-car-wash-5l-bonano5l/p/A5388059', supercheapSku: null },
  // CC06814 is confirmed for Microfibre Wash 5L — verify if 1L is a separate SKU
  { name: 'Microfibre Wash 1L',                slug: 'microfibre-wash-1l',             phase: 3, bowdensHandle: 'microfibre-wash',    autobarnSku: null,      repcoUrl: null, supercheapSku: null },

  // Phase 4 — Long-term preservation
  { name: 'Plush Brush',                       slug: 'plush-brush',                    phase: 4, bowdensHandle: 'plush-brush',        autobarnSku: null,      repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care-accessories/car-cleaning-brushes/bowden-s-own-plush-detailing-brush-bopb/p/A5430043', supercheapSku: null },
  { name: 'Flash Prep 500ml',                  slug: 'flash-prep-500ml',               phase: 4, bowdensHandle: 'flash-prep',         autobarnSku: null,      repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care/car-wax-sealants/bowden-s-own-flash-prep-surface-spray-500ml-bofprep/p/A5516653', supercheapSku: null },
  { name: 'Bead Machine 500ml',                slug: 'bead-machine-500ml',             phase: 4, bowdensHandle: 'bead-machine',       autobarnSku: null,      repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care/car-wax-sealants/bowden-s-own-bead-machine-paint-sealant-500ml-bomachine/p/A5527501', supercheapSku: null },
  { name: 'Big Softie Pair',                   slug: 'big-softie-pair',                phase: 4, bowdensHandle: 'big-softie',         autobarnSku: null,      repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care-accessories/microfibre-and-polishing-cloths/bowden-s-own-big-softie-blue-microfibre-cloth-bobcp/p/A9815910', supercheapSku: null },
  { name: 'Snow Job 5L',                       slug: 'snow-job-5l',                    phase: 4, bowdensHandle: 'snow-job-5l',        autobarnSku: null,      repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care/car-washes/bowden-s-own-snow-job-pre-wash-snow-foam-concentrate-v2-5l-bosnowv25l/p/A5640384', supercheapSku: null },
  { name: 'Wheely Clean V2 5L',                slug: 'wheely-clean-v2-5l',             phase: 4, bowdensHandle: 'new-wheely-clean',   autobarnSku: null,      repcoUrl: null, supercheapSku: null },
];

// Phase 0 — tracked for price alerts but not part of the kit checklist.
// These are Bowden's Own products available at Repco that may be alternatives
// to kit items or candidates for future addition.
const EXTRA_ITEMS: Item[] = [
  { name: 'Shagtastic Wash Pad',               slug: 'shagtastic-wash-pad',            phase: 0, bowdensHandle: null, autobarnSku: null, repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care-accessories/car-wash-sponge-mitts/bowden-s-own-shagtastic-car-wash-pad-boshag/p/A5388070', supercheapSku: null },
  { name: 'Happy Ending Cannon Bottle',         slug: 'happy-ending-cannon-bottle',     phase: 0, bowdensHandle: null, autobarnSku: null, repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care-accessories/foam-cannons/bowden-s-own-happy-ending-cannon-bottle-bohcb/p/A5497904', supercheapSku: null },
  { name: 'The Chubby Wheel Brush V2',         slug: 'the-chubby-wheel-brush-v2',      phase: 0, bowdensHandle: null, autobarnSku: null, repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care-accessories/car-cleaning-brushes/bowden-s-own-the-chubby-wheel-brush-v2-bochubby2/p/A5744203', supercheapSku: null },
  { name: 'Naked Inta-Mitt Glass Cleaning Pack', slug: 'naked-inta-mitt-pack',         phase: 0, bowdensHandle: null, autobarnSku: null, repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care/windscreen-glass-cleaner/bowden-s-own-naked-inta-mitt-glass-cleaning-pack-bonip/p/A5570048', supercheapSku: null },
  { name: 'Twisted Pro Sucker Drying Towel',   slug: 'twisted-pro-sucker',             phase: 0, bowdensHandle: null, autobarnSku: null, repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care-accessories/chamois-drying-towels/bowden-s-own-twisted-pro-sucker-drying-towel-botps/p/A5696154', supercheapSku: null },
  { name: 'Leather Love V2 500ml',             slug: 'leather-love-v2-500ml',          phase: 0, bowdensHandle: null, autobarnSku: null, repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care/leather-cleaner/bowden-s-own-leather-love-leather-cleaner-v2-500ml-boll2/p/A5639700', supercheapSku: null },
  { name: 'The Square Bear Interior Applicator', slug: 'the-square-bear',              phase: 0, bowdensHandle: null, autobarnSku: null, repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care-accessories/applicators/bowden-s-own-the-square-bear-interior-applicator-bosbear/p/A9815919', supercheapSku: null },
  { name: 'The Big Green Sucker Drying Towel', slug: 'the-big-green-sucker',           phase: 0, bowdensHandle: null, autobarnSku: null, repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care-accessories/chamois-drying-towels/bowden-s-own-the-big-green-sucker-drying-towel-bosucker/p/A9815921', supercheapSku: null },
  { name: 'Leather Guard 500ml',               slug: 'leather-guard-500ml',            phase: 0, bowdensHandle: null, autobarnSku: null, repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care/leather-cleaner/bowden-s-own-leather-guard-interior-leather-protectant-500ml-bolg/p/A9708053', supercheapSku: null },
  { name: 'Plush Daddy Interior Microfibre',   slug: 'plush-daddy',                    phase: 0, bowdensHandle: null, autobarnSku: null, repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care-accessories/microfibre-and-polishing-cloths/bowden-s-own-plush-daddy-interior-microfibre-cloth-bodaddy/p/A9815913', supercheapSku: null },
  { name: 'Wet Dreams Sealant 770ml',          slug: 'wet-dreams-770ml',               phase: 0, bowdensHandle: null, autobarnSku: null, repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care/car-wax-sealants/bowden-s-own-wet-dreams-sealant-770ml-bodreams2/p/A5781787', supercheapSku: null },
  { name: 'Happy Ending Foam 1L',              slug: 'happy-ending-1l',                phase: 0, bowdensHandle: null, autobarnSku: null, repcoUrl: 'https://www.repco.com.au/car-care-panel/car-care/car-washes/bowden-s-own-happy-ending-snow-foam-after-wash-sealant-1l-bohappy/p/A5465060', supercheapSku: null },
];

const ALL_ITEMS = [...KIT_ITEMS, ...EXTRA_ITEMS];

export async function seed() {
  console.log('Seeding products...');
  let inserted = 0;
  let skipped = 0;

  for (const item of ALL_ITEMS) {
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

    // Repco URL — full URL stored directly (path varies per product, can't be templated)
    if (item.repcoUrl) {
      await db.insert(retailerUrls).values({ productId, retailer: 'repco', url: item.repcoUrl }).onConflictDoNothing();
    }

    // Supercheap Auto URL
    if (item.supercheapSku) {
      const url = `https://www.supercheapauto.com.au/p/bowdens-own-${item.slug}/${item.supercheapSku}.html`;
      await db.insert(retailerUrls).values({ productId, retailer: 'supercheap', url }).onConflictDoNothing();
    }
  }

  const bowdensCount = ALL_ITEMS.filter(i => i.bowdensHandle).length;
  const autobarnCount = ALL_ITEMS.filter(i => i.autobarnSku).length;
  const repcoCount = ALL_ITEMS.filter(i => i.repcoUrl).length;
  const supercheapCount = ALL_ITEMS.filter(i => i.supercheapSku).length;

  console.log(`Done. ${inserted} products inserted, ${skipped} already existed.`);
  console.log(`Retailer URLs: ${bowdensCount} Bowden's, ${autobarnCount} Auto Barn, ${repcoCount} Repco, ${supercheapCount} Supercheap`);
}

// Allow running directly: npm run seed
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seed().catch((err) => { console.error(err); process.exit(1); });
}
