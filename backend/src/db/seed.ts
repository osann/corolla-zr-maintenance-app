import { eq } from 'drizzle-orm';
import { db } from './connection.js';
import { products, retailerUrls, packComponents, deletedProducts } from './schema.js';

// autobarnSku:    SKU code on autobarn.com.au — fallback short URL (/ab/p/{sku}) when no autobarnUrl
// autobarnUrl:    Full canonical Auto Barn URL — used in preference to the short /ab/p/{sku} form.
//                 Short URLs hang at the server level for ~half of products; full URLs are reliable.
//                 Strip ?queryID=...&indexUsed=... tracking params before storing.
// supercheapUrl:  Full product URL on supercheapauto.com.au (slug varies, can't be templated)
//
// Only Supercheap and Auto Barn are scraped. Repco, Autopro and Bowden's Own block bots and
// were retired; their URLs are archived in docs/archive/blocked-retailer-urls.csv.
//
// null = not stocked at that retailer (or URL not yet researched)
// phase 0 = tracked for pricing but not part of the kit checklist

type Item = {
  name: string;
  slug: string;
  phase: number;
  autobarnSku: string | null;
  autobarnUrl?: string; // full canonical URL; preferred over short /ab/p/{sku} for autobarn
  supercheapUrl: string | null;
};

const KIT_ITEMS: Item[] = [
  // Phase 1 — Core wash setup
  {
    name: 'Nanolicious Wash Pack Ultimate',
    slug: 'nanolicious-wash-pack-ultimate',
    phase: 1,
    autobarnSku: 'CC06713',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Nanolicious-Wash-Pack-Ultimate/p/CC06713',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-nanolicious-shag-pack/SPO6388657.html',
  },
  {
    name: 'Wet Dreams Pack',
    slug: 'wet-dreams-pack',
    phase: 1,
    autobarnSku: 'CC07521',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Wet-Dreams-Pack/p/CC07521',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-wet-dreams-pack/SPO8290954.html',
  },
  {
    name: '2 Bucket Wash Kit',
    slug: '2-bucket-wash-kit',
    phase: 1,
    autobarnSku: 'CC06722',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-2-Bucket-Wash-Kit/p/CC06722',
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-2-bucket-pack-bobwash-bobrinse2x-bogbt-boblid/SPO6388639.html',
  },
  {
    name: 'Boss Gloss 770ml',
    slug: 'boss-gloss-770ml',
    phase: 1,
    autobarnSku: 'CC06384',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Boss-Gloss-Slick-Detailing-Spray-770ml/p/CC06384',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-boss-gloss-770ml/526272.html',
  },
  {
    name: 'Naked Glass 500ml',
    slug: 'naked-glass-500ml',
    phase: 1,
    autobarnSku: 'CC04058',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Naked-Glass-Spray-Solution-500ml/p/CC04058',
    supercheapUrl: null,
  },
  {
    name: 'Inta-Mitt',
    slug: 'inta-mitt',
    phase: 1,
    autobarnSku: 'CC08069',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-The-Inta-Mitt/p/CC08069',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-the-inta-mitt/608451.html',
  },
  {
    name: 'Kärcher K2 Pressure Washer',
    slug: 'karcher-k2',
    phase: 1,
    autobarnSku: null,
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/karcher-k%C3%A4rcher-k2-premium-pressure-washer---1750-psi/704265.html',
  },
  {
    name: 'Snow Blow Cannon',
    slug: 'snow-blow-cannon',
    phase: 1,
    autobarnSku: 'CC06484',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Snow-Blow-Cannon-Pre-wash-System-Pressure-Washer/p/CC06484',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-snow-blow-cannon-kit/531515.html',
  },
  // Supercheap stocks "Snow Job V2" without a size qualifier — assumed 1L (standard retail size)
  {
    name: 'Snow Job 1L',
    slug: 'snow-job-1l',
    phase: 1,
    autobarnSku: '141807',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Snow-Job-1L/p/141807',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-snow-job-v2/SPO9481182.html',
  },
  // Supercheap only stocks Happy Ending in 1L — tracked separately as happy-ending-1l

  // Phase 2 — Complete exterior + interior
  // Supercheap only stocks Wheely Clean in 770ml — tracked separately as wheely-clean-770ml
  {
    name: 'Wheely Clean V2 500ml',
    slug: 'wheely-clean-v2-500ml',
    phase: 2,
    autobarnSku: 'CC04777',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Wheely-Clean-Wheel-Spray-Solution-500ml/p/CC04777',
    supercheapUrl: null,
  },
  {
    name: 'The Little Stiffy',
    slug: 'the-little-stiffy',
    phase: 2,
    autobarnSku: '298647',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Car-Care-%26-Accessories/Cleaning-Aids-%26-Applicators/Brushes/Bowden%27s-Own-The-Little-Stiffy-Tyre-Underbody-Brush/p/298647',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-little-stiffy-brush/695480.html',
  },
  {
    name: 'The Flat Head',
    slug: 'the-flat-head',
    phase: 2,
    autobarnSku: 'CC07664',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Flat-Head-Wheel-Brush-AKA-Flatty/p/CC07664',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-the-flat-head-brush/615655.html',
  },
  {
    name: 'Fabra Cadabra 500ml',
    slug: 'fabra-cadabra-500ml',
    phase: 2,
    autobarnSku: '157495',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Fabra-Cadabra-500ml/p/157495',
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-fabra-cadabra-fabric-cleaner-500ml/345712.html',
  },
  {
    name: 'BOLP Leather Care Pack',
    slug: 'bolp-leather-care-pack',
    phase: 2,
    autobarnSku: 'CC02275',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Leather-Care-Pack/p/CC02275',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-leather-pack/SPO3537750.html',
  },
  {
    name: 'Fabratection',
    slug: 'fabratection',
    phase: 2,
    autobarnSku: 'CC07353',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Pro-grade-Super-Hydrophobic-Fabric-Protectant-500ml/p/CC07353',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-fabratection-500ml/SPO7089159.html',
  },
  {
    name: '303 Aerospace Protectant',
    slug: '303-aerospace',
    phase: 2,
    autobarnSku: null,
    supercheapUrl: null,
  },

  // Phase 3 — Daily-use bulk
  {
    name: 'Pumpy Pump',
    slug: 'pumpy-pump',
    phase: 3,
    autobarnSku: 'CC06740',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Pumpy-Pump-5-Litre-Bottle/p/CC06740',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-pumpy-pump---5-litre-bottle/SPO6388649.html',
  },
  {
    name: 'Nanolicious Wash 5L',
    slug: 'nanolicious-wash-5l',
    phase: 3,
    autobarnSku: 'CC06504',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Nanolicious-Wash-5L/p/CC06504',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-nanolicious-wash-v2-5l/SPO10567751.html',
  },
  {
    name: 'Microfibre Wash 1L',
    slug: 'microfibre-wash-1l',
    phase: 3,
    autobarnSku: 'CC06220',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Microfibre-Wash-Deep-Cleaning-1L/p/CC06220',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-microfibre-wash-1-litre/415557.html',
  },

  // Phase 4 — Long-term preservation
  {
    name: 'Plush Brush',
    slug: 'plush-brush',
    phase: 4,
    autobarnSku: 'CC07387',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Plush-Brush-Deep-Soft-Bristle/p/CC07387',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-plush-brush/SPO7541270.html',
  },
  {
    name: 'Flash Prep 500ml',
    slug: 'flash-prep-500ml',
    phase: 4,
    autobarnSku: 'CC07796',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Flash-Prep-Pro-Grade-Formula-500ml/p/CC07796',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-flash-prep-spray-500ml/599354.html',
  },
  {
    name: 'Bead Machine 500ml',
    slug: 'bead-machine-500ml',
    phase: 4,
    autobarnSku: 'CC07797',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Bead-Machine-Hydrophobic-Beading-Protective-500ml/p/CC07797',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-bead-machine-sealant-500ml/599353.html',
  },
  {
    name: 'Big Softie Pair',
    slug: 'big-softie-pair',
    phase: 4,
    autobarnSku: 'CC02906',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Big-Softie-Blue-Piping-Feather-Soft-Microfibre/p/CC02906',
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-big-softie-microfibre-cloth-400-x-500mm/415549.html',
  },
  {
    name: 'Snow Job 5L',
    slug: 'snow-job-5l',
    phase: 4,
    autobarnSku: '152323',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Snow-Job-V2-5L/p/152323',
    supercheapUrl: null,
  },
  {
    name: 'Wheely Clean V2 5L',
    slug: 'wheely-clean-v2-5l',
    phase: 4,
    autobarnSku: null,
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-wheely-clean-v2-5l/SPO7219102.html?cgid=SCA01010404',
  },
];

// Phase 0 — tracked for price alerts but not part of the kit checklist.
const EXTRA_ITEMS: Item[] = [
  {
    name: 'Shagtastic Wash Pad',
    slug: 'shagtastic-wash-pad',
    phase: 0,
    autobarnSku: 'CC06685',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Shagtastic-Wash-Pad-Scratch-free-210mm-X-150mm/p/CC06685',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-shagtastic-wash-pad/559556.html',
  },
  {
    name: 'Happy Ending Cannon Bottle',
    slug: 'happy-ending-cannon-bottle',
    phase: 0,
    autobarnSku: 'CC07500',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Happy-Ending-Cannon-Bottle-Finishing-Foam/p/CC07500',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-happy-ending-cannon-bottle/SPO7303811.html',
  },
  {
    name: 'The Chubby Wheel Brush V2',
    slug: 'the-chubby-wheel-brush-v2',
    phase: 0,
    autobarnSku: '283256',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-The-Chubby-Wheel-Brush-V2/p/283256',
    supercheapUrl: null,
  },
  {
    name: 'Naked Inta-Mitt Glass Cleaning Pack',
    slug: 'naked-inta-mitt-pack',
    phase: 0,
    autobarnSku: '204189',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Naked-and-Inta-Mitt-Pack/p/204189',
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-naked-and-inta-mitt-pack/SPO9481181.html',
  },
  {
    name: 'Twisted Pro Sucker Drying Towel',
    slug: 'twisted-pro-sucker',
    phase: 0,
    autobarnSku: '210329',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Twisted-Pro-Sucker/p/210329',
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-twisted-pro-sucker-drying-towel-700-x-500mm/677470.html',
  },
  {
    name: 'Leather Love V2 500ml',
    slug: 'leather-love-v2-500ml',
    phase: 0,
    autobarnSku: '149084',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Leather-Love-500ml/p/149084',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-leather-love-500ml/323489.html',
  },
  {
    name: 'The Square Bear Interior Applicator',
    slug: 'the-square-bear',
    phase: 0,
    autobarnSku: 'CC06154',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Car-Care-%26-Accessories/Cleaning-Aids-%26-Applicators/Sponges-%26-Mitts/Bowden%27s-Own-The-Square-Bear-Microfibre-Weave/p/CC06154',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-square-bear-applicator-pad/415540.html',
  },
  {
    name: 'The Big Green Sucker Drying Towel',
    slug: 'the-big-green-sucker',
    phase: 0,
    autobarnSku: 'CC06483',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-The-Big-Green-Sucker-Luxurious-Plush-Drying-Towel/p/CC06483',
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-big-green-sucker-drying-towel-700-x-400mm/559555.html',
  },
  {
    name: 'Leather Guard 500ml',
    slug: 'leather-guard-500ml',
    phase: 0,
    autobarnSku: 'CC01827',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Leather-Guard-Protectant-500ml/p/CC01827',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-leather-guard-500ml/323490.html',
  },
  {
    name: 'Plush Daddy Interior Microfibre',
    slug: 'plush-daddy',
    phase: 0,
    autobarnSku: 'CC06155',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Plush-Daddy-Ultra-Microfibre/p/CC06155',
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-plush-daddy-microfibre-cloth-400-x-400mm/415542.html',
  },
  {
    name: 'Wet Dreams Sealant 770ml',
    slug: 'wet-dreams-770ml',
    phase: 0,
    autobarnSku: 'CC07473',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Wet-Dreams-Car-Care-770ml/p/CC07473',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-wet-dreams-sealant-770ml/591964.html',
  },
  {
    name: 'Happy Ending Foam 1L',
    slug: 'happy-ending-1l',
    phase: 0,
    autobarnSku: 'CC07474',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Happy-Ending-Spray-On-1L/p/CC07474',
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-happy-ending-finishing-foam-1l/591963.html',
  },
  // Supercheap stocks 770ml sizes not in the kit
  {
    name: 'Wheely Clean 770ml',
    slug: 'wheely-clean-770ml',
    phase: 0,
    autobarnSku: null,
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-wheely-clean-770ml/588684.html',
  },
  {
    name: 'Naked Glass 770ml',
    slug: 'naked-glass-770ml',
    phase: 0,
    autobarnSku: null,
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-naked-glass-cleaner-770ml/588682.html',
  },
  {
    name: 'Little Chubby Brush V2',
    slug: 'little-chubby-v2',
    phase: 0,
    autobarnSku: null,
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-little-chubby-brush-v2/700985.html',
  },
  {
    name: 'Nanolicious Shag Pack',
    slug: 'nanolicious-shag-pack',
    phase: 0,
    autobarnSku: null,
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-nanolicious-shag-pack/SPO6388657.html',
  },
  {
    name: 'The Essentials Starters Kit',
    slug: 'the-essentials-starters-kit',
    phase: 0,
    autobarnSku: null,
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-the-essentials-starters-kit/SPO10203079.html',
  },
  // Products found via Auto Barn URL export
  {
    name: 'Microfibre Bucket With Lid',
    slug: 'microfibre-bucket-lid',
    phase: 0,
    // The old CC07388 listing 404s since mid-2026; 141809 is the same bucket.
    autobarnSku: '141809',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Microfibre-Bucket/p/141809',
    supercheapUrl: null,
  },
  {
    name: 'Orange Agent 500ml',
    slug: 'orange-agent-500ml',
    phase: 0,
    autobarnSku: 'DI05894',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Orange-Agent-Degreaser-All-Purpose-Cleaner/p/DI05894',
    supercheapUrl: null,
  },
  {
    name: 'Debugger Cloth',
    slug: 'debugger-cloth',
    phase: 0,
    autobarnSku: 'CC06153',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Debugger-Cloth-Bug-Splatter/p/CC06153',
    supercheapUrl: null,
  },
  {
    name: 'Wet Dreams Sealant 5L',
    slug: 'wet-dreams-5l',
    phase: 0,
    autobarnSku: 'CC07502',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Bodreams-Wet-Dreams-5L/p/CC07502',
    supercheapUrl: null,
  },
  {
    name: 'Boss Gloss 5L',
    slug: 'boss-gloss-5l',
    phase: 0,
    autobarnSku: 'CC06563',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Boss-Gloss-5L/p/CC06563',
    supercheapUrl: null,
  },
  {
    name: 'Boss Gloss Pack',
    slug: 'boss-gloss-pack',
    phase: 0,
    autobarnSku: 'CC06449',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Boss-Gloss-Pack/p/CC06449',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-boss-gloss-pack/SPO7219105.html',
  },
  {
    name: 'Happy Ending Foam 5L',
    slug: 'happy-ending-5l',
    phase: 0,
    autobarnSku: 'CC07501',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Happy-Ending-5L/p/CC07501',
    supercheapUrl: null,
  },
  // New products from Auto Barn URL export
  {
    name: 'Big Softie Gulf Colours',
    slug: 'big-softie-gulf-colours',
    phase: 0,
    autobarnSku: 'CC02907',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Big-Softie-Gulf-Colours-Microfiber-Cloth/p/CC02907',
    supercheapUrl: null,
  },
  {
    name: 'All Sorts Tyre Applicator 2PK',
    slug: 'all-sorts-applicator',
    phase: 0,
    autobarnSku: 'CC07891',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-All-Sorts-Applicator-Tyre-Sheen-2PK/p/CC07891',
    supercheapUrl: null,
  },
  {
    name: 'Vinyl Care 500ml',
    slug: 'vinyl-care-500ml',
    phase: 0,
    autobarnSku: 'CC01420',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Vinyl-Care-Interior-Cleaner-And-Protectant-500ml/p/CC01420',
    supercheapUrl: null,
  },
  {
    name: 'Far Cough 770ml',
    slug: 'far-cough-770ml',
    phase: 0,
    autobarnSku: 'CC07845',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Far-Cough-Antibacterial-Surface-Spray-770ml/p/CC07845',
    supercheapUrl: null,
  },
  {
    name: 'TA TA TAR 500ml',
    slug: 'ta-ta-tar-500ml',
    phase: 0,
    autobarnSku: 'CC07670',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-TA-TA-TAR-Citrus-Based-Formula-500ml/p/CC07670',
    supercheapUrl: null,
  },
  {
    name: 'Wipe Out 1L',
    slug: 'wipe-out-1l',
    phase: 0,
    autobarnSku: 'CC07340',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Wipe-Out-Windscreen-Washer-Additive-1L/p/CC07340',
    supercheapUrl: null,
  },
  {
    name: 'Foursome Brush Set',
    slug: 'foursome-brush-set',
    phase: 0,
    autobarnSku: 'CC07299',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Foursome-Brush-Set-4-Round-Detailing-Brushes/p/CC07299',
    supercheapUrl: null,
  },
  {
    name: 'Bugger Off Pack',
    slug: 'bugger-off-pack',
    phase: 0,
    autobarnSku: 'CC06446',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Bugger-Off-Pack/p/CC06446',
    supercheapUrl: null,
  },
  {
    name: 'Bugger Off 500ml',
    slug: 'bugger-off-500ml',
    phase: 0,
    autobarnSku: 'CC06211',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Bugger-Off-Bug-Splatter-Citrus-Formula-500ml/p/CC06211',
    supercheapUrl: null,
  },
  {
    name: 'Tyre Sheen 500ml',
    slug: 'tyre-sheen-500ml',
    phase: 0,
    autobarnSku: 'CC04056',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Tyre-Long-lasting-Sheen-Easy-To-Use-500ml/p/CC04056',
    supercheapUrl: null,
  },
];

const ALL_ITEMS = [...KIT_ITEMS, ...EXTRA_ITEMS];

export async function seed() {
  console.log('Seeding products...');
  let inserted = 0;
  let skipped = 0;

  // Catalog products the user has explicitly deleted via the Products tab — never resurrect
  // these on a reseed. Loaded once up front rather than per-item.
  const deletedRows = await db.select({ slug: deletedProducts.slug, name: deletedProducts.name }).from(deletedProducts);
  const deletedSlugs = new Set(deletedRows.map((r) => r.slug));
  const deletedNames = new Set(deletedRows.map((r) => r.name));

  for (const item of ALL_ITEMS) {
    if (deletedSlugs.has(item.slug) || deletedNames.has(item.name)) {
      skipped++;
      continue;
    }

    // Look up by slug first — the common case, nothing's been renamed.
    let [existing] = await db.select({ id: products.id }).from(products).where(eq(products.slug, item.slug)).limit(1);

    // Not found by slug — it may already exist under a DIFFERENT slug if the user renamed it
    // via the Products tab's cascading slug rename. `name` is also UNIQUE, so check there
    // before assuming this is a genuinely new product. Never overwrite the existing slug here —
    // that would silently revert the user's intentional rename on every redeploy.
    if (!existing) {
      [existing] = await db.select({ id: products.id }).from(products).where(eq(products.name, item.name)).limit(1);
    }

    let productId: number;
    if (existing) {
      productId = existing.id;
      skipped++;
    } else {
      const [row] = await db
        .insert(products)
        .values({ name: item.name, slug: item.slug, phase: item.phase })
        .returning({ id: products.id });
      productId = row.id;
      inserted++;
    }

    // Auto Barn — prefer full canonical URL (autobarnUrl) over short /ab/p/{sku} form.
    // Short URLs hang server-side for ~half of all products; full URLs are reliable.
    if (item.autobarnUrl || item.autobarnSku) {
      const abUrl = item.autobarnUrl ?? `https://www.autobarn.com.au/ab/p/${item.autobarnSku}`;
      await db
        .insert(retailerUrls)
        .values({ productId, retailer: 'autobarn', url: abUrl })
        .onConflictDoUpdate({ target: [retailerUrls.productId, retailerUrls.retailer], set: { url: abUrl } });
    }

    // Supercheap Auto URL — full URL stored directly (slug varies per product, can't be templated)
    if (item.supercheapUrl) {
      await db
        .insert(retailerUrls)
        .values({ productId, retailer: 'supercheap', url: item.supercheapUrl })
        .onConflictDoUpdate({
          target: [retailerUrls.productId, retailerUrls.retailer],
          set: { url: item.supercheapUrl },
        });
    }
  }

  const autobarnCount = ALL_ITEMS.filter((i) => i.autobarnUrl || i.autobarnSku).length;
  const supercheapCount = ALL_ITEMS.filter((i) => i.supercheapUrl).length;

  console.log(`Done. ${inserted} products inserted, ${skipped} already existed.`);
  console.log(`Retailer URLs: ${autobarnCount} Auto Barn, ${supercheapCount} Supercheap`);
}

// One-time migration of the app's formerly-hardcoded BUNDLE_COMPONENTS constant (app.js) into
// the pack_components table, so existing users see identical Inventory behavior for these 8
// bundles on ship day of the user-configurable packs feature — nothing needs manual recreation.
// Idempotent: skipped per-pack if that pack already has component rows.
type PackComponentSeed = {
  slug?: string;
  name: string;
  volumeMl?: number;
  equipment?: boolean;
  sectionPath?: [string, string];
};

const PACKS: Record<string, PackComponentSeed[]> = {
  'nanolicious-wash-pack-ultimate': [
    { name: 'Nanolicious Wash (500ml)', volumeMl: 500, sectionPath: ['Exterior Wash', 'Contact Wash'] },
    { slug: 'shagtastic-wash-pad', name: 'Shagtastic Wash Pad', equipment: true },
    { slug: 'the-big-green-sucker', name: 'The Big Green Sucker', equipment: true },
    { name: 'Boss Gloss (125ml)', volumeMl: 125, sectionPath: ['Exterior Protection', 'Quick Detailer'] },
  ],
  'nanolicious-shag-pack': [
    { name: 'Nanolicious Wash (500ml)', volumeMl: 500, sectionPath: ['Exterior Wash', 'Contact Wash'] },
    { slug: 'shagtastic-wash-pad', name: 'Shagtastic Wash Pad', equipment: true },
  ],
  'wet-dreams-pack': [
    { slug: 'wet-dreams-770ml', name: 'Wet Dreams Sealant (770ml)' },
    { name: 'Big Softie', equipment: true, sectionPath: ['Equipment', 'Microfibre'] },
  ],
  'naked-inta-mitt-pack': [
    { slug: 'naked-glass-500ml', name: 'Naked Glass (500ml)' },
    { slug: 'inta-mitt', name: 'Inta-Mitt', equipment: true },
  ],
  'boss-gloss-pack': [{ slug: 'boss-gloss-770ml', name: 'Boss Gloss (770ml)' }],
  'bolp-leather-care-pack': [
    { slug: 'leather-love-v2-500ml', name: 'Leather Love V2 (500ml)' },
    { slug: 'leather-guard-500ml', name: 'Leather Guard (500ml)' },
    { slug: 'plush-daddy', name: 'Plush Daddy', equipment: true },
    { slug: 'the-square-bear', name: 'The Square Bear', equipment: true },
  ],
  '2-bucket-wash-kit': [
    { name: 'Wash Bucket', equipment: true, sectionPath: ['Equipment', 'Buckets'] },
    { name: 'Rinse Bucket', equipment: true, sectionPath: ['Equipment', 'Buckets'] },
    { name: 'Great Barrier Thingy', equipment: true, sectionPath: ['Equipment', 'Buckets'] },
    { name: 'Great Barrier Thingy', equipment: true, sectionPath: ['Equipment', 'Buckets'] },
  ],
  'the-essentials-starters-kit': [
    { name: 'Wash Bucket', equipment: true, sectionPath: ['Equipment', 'Buckets'] },
    { name: 'Rinse Bucket', equipment: true, sectionPath: ['Equipment', 'Buckets'] },
    { name: 'Great Barrier Thingy', equipment: true, sectionPath: ['Equipment', 'Buckets'] },
    { name: 'Great Barrier Thingy', equipment: true, sectionPath: ['Equipment', 'Buckets'] },
    { slug: 'microfibre-bucket-lid', name: 'Microfibre Bucket With Lid', equipment: true },
    { name: 'Nanolicious Wash (500ml)', volumeMl: 500, sectionPath: ['Exterior Wash', 'Contact Wash'] },
    { slug: 'shagtastic-wash-pad', name: 'Shagtastic Wash Pad', equipment: true },
    { slug: 'wet-dreams-770ml', name: 'Wet Dreams Sealant (770ml)' },
    { slug: 'boss-gloss-770ml', name: 'Boss Gloss (770ml)' },
    { slug: 'twisted-pro-sucker', name: 'Twisted Pro Sucker', equipment: true },
    { slug: 'microfibre-wash-1l', name: 'Microfibre Wash (1L)' },
  ],
};

export async function seedPacks() {
  console.log('Seeding packs...');
  let seeded = 0;
  let skipped = 0;

  for (const [packSlug, components] of Object.entries(PACKS)) {
    const [packRow] = await db.select({ id: products.id }).from(products).where(eq(products.slug, packSlug)).limit(1);
    if (!packRow) {
      console.warn(`  Pack slug not seeded as a product yet, skipping: ${packSlug}`);
      continue;
    }

    const existing = await db
      .select({ id: packComponents.id })
      .from(packComponents)
      .where(eq(packComponents.packProductId, packRow.id))
      .limit(1);
    if (existing.length) {
      skipped++;
      continue;
    }

    let sortOrder = 0;
    for (const comp of components) {
      let componentProductId: number | null = null;
      if (comp.slug) {
        const [compRow] = await db
          .select({ id: products.id })
          .from(products)
          .where(eq(products.slug, comp.slug))
          .limit(1);
        componentProductId = compRow?.id ?? null;
      }
      await db.insert(packComponents).values({
        packProductId: packRow.id,
        componentProductId,
        name: comp.name,
        volumeMl: comp.volumeMl ?? null,
        isEquipment: comp.equipment ?? false,
        sectionCategory: comp.sectionPath?.[0] ?? null,
        sectionLabel: comp.sectionPath?.[1] ?? null,
        sortOrder: sortOrder++,
      });
    }
    await db.update(products).set({ isPack: true }).where(eq(products.id, packRow.id));
    seeded++;
  }

  console.log(`Done. ${seeded} packs seeded, ${skipped} already existed.`);
}

// Allow running directly: npm run seed
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seed()
    .then(() => seedPacks())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
