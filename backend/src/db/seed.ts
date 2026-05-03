import { eq } from 'drizzle-orm';
import { db } from './connection.js';
import { products, retailerUrls } from './schema.js';

// All 26 kit items. Bowden's handle is the URL slug on bowdensown.com.au/products/{handle}
// Handles marked null are not sold on Bowden's Own direct.
const KIT_ITEMS: {
  name: string;
  slug: string;
  phase: number;
  bowdensHandle: string | null;
}[] = [
  // Phase 1 — Core wash setup
  // Note: nanolicious-wash-pack-ultimate is a bundle, not a standalone product on bowdensown.com.au
  { name: 'Nanolicious Wash Pack Ultimate', slug: 'nanolicious-wash-pack-ultimate', phase: 1, bowdensHandle: null },
  { name: 'Wet Dreams Pack',                slug: 'wet-dreams-pack',                phase: 1, bowdensHandle: 'wet-dreams-pack' },
  { name: '2 Bucket Wash Kit',              slug: '2-bucket-wash-kit',              phase: 1, bowdensHandle: '2-bucket-wash-kit' },
  { name: 'Boss Gloss 770ml',               slug: 'boss-gloss-770ml',               phase: 1, bowdensHandle: 'boss-gloss' },
  { name: 'Naked Glass 500ml',              slug: 'naked-glass-500ml',              phase: 1, bowdensHandle: 'naked-glass' },
  { name: 'Inta-Mitt',                      slug: 'inta-mitt',                      phase: 1, bowdensHandle: null },
  { name: 'Kärcher K2 Pressure Washer',     slug: 'karcher-k2',                     phase: 1, bowdensHandle: null },
  { name: 'Snow Blow Cannon',               slug: 'snow-blow-cannon',               phase: 1, bowdensHandle: 'snow-blow-cannon' },
  { name: 'Snow Job 1L',                    slug: 'snow-job-1l',                    phase: 1, bowdensHandle: 'snow-job~3816' },
  { name: 'Happy Ending Finishing Foam 500ml', slug: 'happy-ending-500ml',          phase: 1, bowdensHandle: 'happy-ending' },

  // Phase 2 — Complete exterior + interior
  { name: 'Wheely Clean V2 500ml',          slug: 'wheely-clean-v2-500ml',          phase: 2, bowdensHandle: 'new-wheely-clean' },
  { name: 'The Little Stiffy',              slug: 'the-little-stiffy',              phase: 2, bowdensHandle: 'the-little-stiffy' },
  { name: 'The Flat Head',                  slug: 'the-flat-head',                  phase: 2, bowdensHandle: 'the-flat-head-brush' },
  { name: 'Fabra Cadabra 500ml',            slug: 'fabra-cadabra-500ml',            phase: 2, bowdensHandle: 'fabra-cadabra~3826' },
  { name: 'BOLP Leather Care Pack',         slug: 'bolp-leather-care-pack',         phase: 2, bowdensHandle: 'leather-care-pack' },
  { name: 'Fabratection',                   slug: 'fabratection',                   phase: 2, bowdensHandle: 'fabratection' },
  { name: '303 Aerospace Protectant',       slug: '303-aerospace',                  phase: 2, bowdensHandle: null },

  // Phase 3 — Daily-use bulk
  { name: 'Pumpy Pump',                     slug: 'pumpy-pump',                     phase: 3, bowdensHandle: '5-litre-bottle-pump' },
  { name: 'Nanolicious Wash 5L',            slug: 'nanolicious-wash-5l',            phase: 3, bowdensHandle: 'nanolicious-wash' },
  { name: 'Microfibre Wash 1L',             slug: 'microfibre-wash-1l',             phase: 3, bowdensHandle: 'microfibre-wash' },

  // Phase 4 — Long-term preservation
  { name: 'Plush Brush',                    slug: 'plush-brush',                    phase: 4, bowdensHandle: 'plush-brush' },
  { name: 'Flash Prep 500ml',               slug: 'flash-prep-500ml',               phase: 4, bowdensHandle: 'flash-prep' },
  { name: 'Bead Machine 500ml',             slug: 'bead-machine-500ml',             phase: 4, bowdensHandle: 'bead-machine' },
  { name: 'Big Softie Pair',                slug: 'big-softie-pair',                phase: 4, bowdensHandle: 'big-softie' },
  { name: 'Snow Job 5L',                    slug: 'snow-job-5l',                    phase: 4, bowdensHandle: 'snow-job-5l' },
  { name: 'Wheely Clean V2 5L',             slug: 'wheely-clean-v2-5l',             phase: 4, bowdensHandle: 'new-wheely-clean' },
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

    // Insert Bowden's URL (idempotent via unique index)
    if (item.bowdensHandle) {
      const url = `https://www.bowdensown.com.au/${item.bowdensHandle}`;
      await db
        .insert(retailerUrls)
        .values({ productId, retailer: 'bowdens', url })
        .onConflictDoNothing();
    }
  }

  console.log(`Done. ${inserted} products inserted, ${skipped} already existed.`);
  console.log(`${KIT_ITEMS.filter(i => i.bowdensHandle).length} products have a Bowden's URL.`);
}

// Allow running directly: npm run seed
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seed().catch((err) => { console.error(err); process.exit(1); });
}
