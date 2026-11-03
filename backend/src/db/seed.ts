import { eq } from 'drizzle-orm';
import { db } from './connection.js';
import { products, retailerUrls, packComponents, deletedProducts } from './schema.js';

// autobarnSku:    SKU code on autobarn.com.au — fallback short URL (/ab/p/{sku}) when no autobarnUrl
// autobarnUrl:    Full canonical Auto Barn URL — used in preference to the short /ab/p/{sku} form.
//                 Short URLs hang at the server level for ~half of products; full URLs are reliable.
//                 Strip ?queryID=...&indexUsed=... tracking params before storing.
// supercheapUrl:  Full product URL on supercheapauto.com.au (slug varies, can't be templated)
// bowdensUrl:     Product page on bowdensown.com.au, plus #size or #SKU when the page sells several
//                 (see scrapers/bowdens.ts). Absent when Bowden's doesn't sell that size or pack.
//
// Repco and Autopro block bots and were retired; their URLs are archived in
// docs/archive/blocked-retailer-urls.csv.
//
// Slugs and names match production, so seed() finds each product and keeps its URLs current; a
// product renamed in the app needs its entry renamed here too.
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
  bowdensUrl?: string;
};

const KIT_ITEMS: Item[] = [
  // Phase 1 — Core wash setup
  {
    name: 'Nanolicious Wash Pack',
    slug: 'nanolicious-wash-pack-ultimate',
    phase: 1,
    autobarnSku: 'CC06713',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Nanolicious-Wash-Pack-Ultimate/p/CC06713',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-nanolicious-shag-pack/SPO6388657.html',
    bowdensUrl: 'https://www.bowdensown.com.au/nanolicous-wash-pack',
  },
  {
    name: 'Wet Dreams Pack',
    slug: 'wet-dreams-pack',
    phase: 1,
    autobarnSku: 'CC07521',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Wet-Dreams-Pack/p/CC07521',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-wet-dreams-pack/SPO8290954.html',
    bowdensUrl: 'https://www.bowdensown.com.au/wet-dreams-pack',
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
    bowdensUrl: 'https://www.bowdensown.com.au/2-bucket-wash-kit',
  },
  {
    name: 'Boss Gloss 770ml',
    slug: 'boss-gloss-770ml',
    phase: 1,
    autobarnSku: 'CC06384',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Boss-Gloss-Slick-Detailing-Spray-770ml/p/CC06384',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-boss-gloss-770ml/526272.html',
    bowdensUrl: 'https://www.bowdensown.com.au/boss-gloss#770ml',
  },
  {
    name: 'Naked Glass 500ml',
    slug: 'naked-glass-500ml',
    phase: 1,
    autobarnSku: 'CC04058',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Naked-Glass-Spray-Solution-500ml/p/CC04058',
    supercheapUrl: null,
    bowdensUrl: 'https://www.bowdensown.com.au/products/interior-car-care/naked-glass#500ml',
  },
  {
    name: 'Inta-Mitt',
    slug: 'inta-mitt',
    phase: 1,
    autobarnSku: 'CC08069',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-The-Inta-Mitt/p/CC08069',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-the-inta-mitt/608451.html',
    bowdensUrl: 'https://www.bowdensown.com.au/the-inta-mitt',
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
    bowdensUrl: 'https://www.bowdensown.com.au/snow-blow-cannon#BOCANNON_KARCHER',
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
    bowdensUrl: 'https://www.bowdensown.com.au/snow-job~3816#1L',
  },
  // Supercheap only stocks Happy Ending in 1L — tracked separately as happy-ending-1l

  // Phase 2 — Complete exterior + interior
  // Supercheap only stocks Wheely Clean in 770ml — tracked separately as wheely-clean-770ml
  {
    name: 'Wheely Clean 500ml',
    slug: 'wheely-clean-500ml',
    phase: 2,
    autobarnSku: 'CC04777',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Wheely-Clean-Wheel-Spray-Solution-500ml/p/CC04777',
    supercheapUrl: null,
    bowdensUrl: 'https://www.bowdensown.com.au/new-wheely-clean#500mL',
  },
  {
    name: 'The Little Stiffy',
    slug: 'the-little-stiffy',
    phase: 2,
    autobarnSku: '298647',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Car-Care-%26-Accessories/Cleaning-Aids-%26-Applicators/Brushes/Bowden%27s-Own-The-Little-Stiffy-Tyre-Underbody-Brush/p/298647',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-little-stiffy-brush/695480.html',
    bowdensUrl: 'https://www.bowdensown.com.au/the-little-stiffy',
  },
  {
    name: 'The Flat Head',
    slug: 'the-flat-head',
    phase: 2,
    autobarnSku: 'CC07664',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Flat-Head-Wheel-Brush-AKA-Flatty/p/CC07664',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-the-flat-head-brush/615655.html',
    bowdensUrl: 'https://www.bowdensown.com.au/the-flat-head-brush',
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
    bowdensUrl: 'https://www.bowdensown.com.au/fabra-cadabra~3826#500mL',
  },
  {
    name: 'BOLP Leather Care Pack',
    slug: 'bolp-leather-care-pack',
    phase: 2,
    autobarnSku: 'CC02275',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Leather-Care-Pack/p/CC02275',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-leather-pack/SPO3537750.html',
    bowdensUrl: 'https://www.bowdensown.com.au/leather-care-pack',
  },
  {
    name: 'Fabratection 500ml',
    slug: 'fabratection-500ml',
    phase: 2,
    autobarnSku: 'CC07353',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Pro-grade-Super-Hydrophobic-Fabric-Protectant-500ml/p/CC07353',
    supercheapUrl: null,
    bowdensUrl: 'https://www.bowdensown.com.au/fabratection#500mL',
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
    bowdensUrl: 'https://www.bowdensown.com.au/5-litre-bottle-pump',
  },
  {
    name: 'Nanolicious Wash 5L',
    slug: 'nanolicious-wash-5l',
    phase: 3,
    autobarnSku: 'CC06504',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Nanolicious-Wash-5L/p/CC06504',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-nanolicious-wash-v2-5l/SPO10567751.html',
    bowdensUrl: 'https://www.bowdensown.com.au/nanolicious-wash#5L',
  },
  {
    name: 'Microfibre Wash 1L',
    slug: 'microfibre-wash-1l',
    phase: 3,
    autobarnSku: 'CC06220',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Microfibre-Wash-Deep-Cleaning-1L/p/CC06220',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-microfibre-wash-1-litre/415557.html',
    bowdensUrl: 'https://www.bowdensown.com.au/products/microfibre/microfibre-wash#1L',
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
    bowdensUrl: 'https://www.bowdensown.com.au/plush-brush',
  },
  {
    name: 'Flash Prep 500ml',
    slug: 'flash-prep-500ml',
    phase: 4,
    autobarnSku: 'CC07796',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Flash-Prep-Pro-Grade-Formula-500ml/p/CC07796',
    // Supercheap stopped selling the 500ml in 2026-10 (410 Gone).
    supercheapUrl: null,
    bowdensUrl: 'https://www.bowdensown.com.au/flash-prep#500mL',
  },
  {
    name: 'Bead Machine 500ml',
    slug: 'bead-machine-500ml',
    phase: 4,
    autobarnSku: 'CC07797',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Bead-Machine-Hydrophobic-Beading-Protective-500ml/p/CC07797',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-bead-machine-sealant-500ml/599353.html',
    bowdensUrl: 'https://www.bowdensown.com.au/bead-machine#500mL',
  },
  {
    name: 'Big Softie Microfibre Cloth Orange Piping',
    slug: 'big-softie-orange',
    phase: 4,
    autobarnSku: 'CC02907',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Big-Softie-Gulf-Colours-Microfiber-Cloth/p/CC02907',
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-big-softie-microfibre-cloth-400-x-500mm/415549.html',
    bowdensUrl: 'https://www.bowdensown.com.au/products/microfibre/big-softie-gulf-colours',
  },
  {
    name: 'Snow Job 5L',
    slug: 'snow-job-5l',
    phase: 4,
    autobarnSku: '152323',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Snow-Job-V2-5L/p/152323',
    supercheapUrl: null,
    bowdensUrl: 'https://www.bowdensown.com.au/snow-job~3816#5L',
  },
  {
    name: 'Wheely Clean 5L',
    slug: 'wheely-clean-5l',
    phase: 4,
    autobarnSku: 'CC04858',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Wheely-Clean-5L/p/CC04858',
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-wheely-clean-v2-5l/SPO7219102.html?cgid=SCA01010404',
    bowdensUrl: 'https://www.bowdensown.com.au/new-wheely-clean#5L',
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
    bowdensUrl: 'https://www.bowdensown.com.au/shagtastic-wash-pad',
  },
  {
    name: 'Happy Ending Cannon Bottle',
    slug: 'happy-ending-cannon-bottle',
    phase: 0,
    autobarnSku: 'CC07500',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Happy-Ending-Cannon-Bottle-Finishing-Foam/p/CC07500',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-happy-ending-cannon-bottle/SPO7303811.html',
    bowdensUrl: 'https://www.bowdensown.com.au/happy-ending-cannon-bottle',
  },
  {
    name: 'The Chubby Wheel Brush',
    slug: 'the-chubby-wheel-brush',
    phase: 0,
    autobarnSku: '283256',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-The-Chubby-Wheel-Brush-V2/p/283256',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-little-chubby-brush-v2/700985.html',
    bowdensUrl: 'https://www.bowdensown.com.au/the-chubby',
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
    bowdensUrl: 'https://www.bowdensown.com.au/naked-and-inta-mitt-pack',
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
    bowdensUrl: 'https://www.bowdensown.com.au/twisted-pro-sucker',
  },
  {
    name: 'Leather Love 500ml',
    slug: 'leather-love-500ml',
    phase: 0,
    autobarnSku: '149084',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Leather-Love-500ml/p/149084',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-leather-love-500ml/323489.html',
    bowdensUrl: 'https://www.bowdensown.com.au/leather-love-v2#500mL',
  },
  {
    name: 'The Square Bear Interior Applicator',
    slug: 'the-square-bear',
    phase: 0,
    autobarnSku: 'CC06154',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Car-Care-%26-Accessories/Cleaning-Aids-%26-Applicators/Sponges-%26-Mitts/Bowden%27s-Own-The-Square-Bear-Microfibre-Weave/p/CC06154',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-square-bear-applicator-pad/415540.html',
    bowdensUrl: 'https://www.bowdensown.com.au/products/microfibre/square-bear',
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
    bowdensUrl: 'https://www.bowdensown.com.au/the-big-green-sucker',
  },
  {
    name: 'Leather Guard 500ml',
    slug: 'leather-guard-500ml',
    phase: 0,
    autobarnSku: 'CC01827',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Leather-Guard-Protectant-500ml/p/CC01827',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-leather-guard-500ml/323490.html',
    bowdensUrl: 'https://www.bowdensown.com.au/leather-guard#500mL',
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
    bowdensUrl: 'https://www.bowdensown.com.au/products/microfibre/plush-daddy',
  },
  {
    name: 'Wet Dreams Sealant 770ml',
    slug: 'wet-dreams-770ml',
    phase: 0,
    autobarnSku: 'CC07473',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Wet-Dreams-Car-Care-770ml/p/CC07473',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-wet-dreams-sealant-770ml/591964.html',
    bowdensUrl: 'https://www.bowdensown.com.au/wet-dreams#770ml',
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
    bowdensUrl: 'https://www.bowdensown.com.au/happy-ending#1L',
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
    bowdensUrl: 'https://www.bowdensown.com.au/the-essentials-starter-kit',
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
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-tool---microfibre-bucket/SPO9767586.html',
    bowdensUrl: 'https://www.bowdensown.com.au/microfibre-bucket',
  },
  {
    name: 'Orange Agent 500ml',
    slug: 'orange-agent-500ml',
    phase: 0,
    autobarnSku: 'DI05894',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Orange-Agent-Degreaser-All-Purpose-Cleaner/p/DI05894',
    supercheapUrl: null,
    bowdensUrl: 'https://www.bowdensown.com.au/products/exterior/agent-orange#500mL',
  },
  {
    name: 'Debugger Cloth',
    slug: 'debugger-cloth',
    phase: 0,
    autobarnSku: 'CC06153',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Debugger-Cloth-Bug-Splatter/p/CC06153',
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-debugger-microfibre-cloth-400-x-500mm/415544.html',
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
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-boss-gloss-v2-quick-detailer-drying-aid-5l/SPO10585410.html',
    bowdensUrl: 'https://www.bowdensown.com.au/boss-gloss#5L',
  },
  {
    name: 'Boss Gloss Pack',
    slug: 'boss-gloss-pack',
    phase: 0,
    autobarnSku: 'CC06449',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Boss-Gloss-Pack/p/CC06449',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-boss-gloss-pack/SPO7219105.html',
    bowdensUrl: 'https://www.bowdensown.com.au/boss-gloss-pack',
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
    name: 'All Sorts Tyre Applicator 2PK',
    slug: 'all-sorts-applicator-2pk',
    phase: 0,
    autobarnSku: 'CC07891',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-All-Sorts-Applicator-Tyre-Sheen-2PK/p/CC07891',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-all-sorts/SPO9481184.html',
    bowdensUrl: 'https://www.bowdensown.com.au/all-sorts#BOASORTS__',
  },
  {
    name: 'Vinyl Care 500ml',
    slug: 'vinyl-care-500ml',
    phase: 0,
    autobarnSku: 'CC01420',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Vinyl-Care-Interior-Cleaner-And-Protectant-500ml/p/CC01420',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-vinyl-care-500ml/323491.html',
    bowdensUrl: 'https://www.bowdensown.com.au/vinyl-care#500mL',
  },
  {
    name: 'Far Cough 770ml',
    slug: 'far-cough-770ml',
    phase: 0,
    autobarnSku: 'CC07845',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Far-Cough-Antibacterial-Surface-Spray-770ml/p/CC07845',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-far-cough-770ml/SPO8093643.html',
    bowdensUrl: 'https://www.bowdensown.com.au/far-cough#770ml',
  },
  {
    name: 'TA TA TAR 500ml',
    slug: 'ta-ta-tar-500ml',
    phase: 0,
    autobarnSku: 'CC07670',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-TA-TA-TAR-Citrus-Based-Formula-500ml/p/CC07670',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-ta-ta-tar-remover-500ml/587757.html',
    bowdensUrl: 'https://www.bowdensown.com.au/Citrus_Ta_Ta_Tar#500mL',
  },
  {
    name: 'Wipe Out 1L',
    slug: 'wipe-out-1l',
    phase: 0,
    autobarnSku: 'CC07340',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Wipe-Out-Windscreen-Washer-Additive-1L/p/CC07340',
    supercheapUrl: null,
    bowdensUrl: 'https://www.bowdensown.com.au/wipe-out#1L',
  },
  {
    name: 'Foursome Brush Set',
    slug: 'foursome-brush-set',
    phase: 0,
    autobarnSku: 'CC07299',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Foursome-Brush-Set-4-Round-Detailing-Brushes/p/CC07299',
    supercheapUrl: null,
    bowdensUrl: 'https://www.bowdensown.com.au/the-foursome',
  },
  {
    name: 'Bugger Off Pack',
    slug: 'bugger-off-pack',
    phase: 0,
    autobarnSku: 'CC06446',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Bugger-Off-Pack/p/CC06446',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bugger-off-pack/SPO3537760.html',
    bowdensUrl: 'https://www.bowdensown.com.au/products/value-packs/bugger-pack',
  },
  {
    name: 'Bugger Off 500ml',
    slug: 'bugger-off-500ml',
    phase: 0,
    autobarnSku: 'CC06211',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Bugger-Off-Bug-Splatter-Citrus-Formula-500ml/p/CC06211',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-bugger-off-500ml/415550.html',
    bowdensUrl: 'https://www.bowdensown.com.au/products/exterior/bugger-off#500mL',
  },
  {
    name: 'Tyre Sheen 500ml',
    slug: 'tyre-sheen-500ml',
    phase: 0,
    autobarnSku: 'CC04056',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Tyre-Long-lasting-Sheen-Easy-To-Use-500ml/p/CC04056',
    // Supercheap only sells a 770ml (588685).
    supercheapUrl: null,
    bowdensUrl: 'https://www.bowdensown.com.au/tyre-sheen#500mL',
  },
  // Added in the app (Products tab). Listed here too so seed() keeps their retailer URLs current.
  {
    name: 'Big Softie Microfibre Cloth Blue Piping',
    slug: 'big-softie-blue',
    phase: 0,
    autobarnSku: 'CC02906',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Big-Softie-Blue-Piping-Feather-Soft-Microfibre/p/CC02906',
    supercheapUrl: null,
    bowdensUrl: 'https://www.bowdensown.com.au/products/microfibre/big-softie-blue-colours',
  },
  {
    name: 'Wipe Out 500ml',
    slug: 'wipe-out-500ml',
    phase: 0,
    autobarnSku: '210236',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Wipe-Out-500ml/p/210236',
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-wipe-out-windscreen-washer-additive-500ml/700705.html',
    bowdensUrl: 'https://www.bowdensown.com.au/wipe-out#500mL',
  },
  {
    name: 'Nanolicious Wash 500ml',
    slug: 'nanolicious-wash-500ml',
    phase: 0,
    autobarnSku: 'CC06387',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Nanolicious-Wash-Polymer-based-Protection-500ml/p/CC06387',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-nanolicious-wash-v2-500ml/SPO10567749.html',
    bowdensUrl: 'https://www.bowdensown.com.au/nanolicious-wash#500mL',
  },
  {
    name: 'Nanolicious Wash 2L',
    slug: 'nanolicious-wash-2l',
    phase: 0,
    autobarnSku: 'CC06486',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Nanolicious-Wash-2L/p/CC06486',
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-nanolicious-wash-v2-2-litre/738544.html',
    bowdensUrl: 'https://www.bowdensown.com.au/nanolicious-wash#2L',
  },
  {
    name: "Bowden's Own Nanolicious Wash V2 2L",
    slug: 'bowden-s-own-nanolicious-wash-v2-2l',
    phase: 0,
    autobarnSku: '340315',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Nanolicious-Wash-V2-2L/p/340315',
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-nanolicious-wash-v2-2-litre/738544.html',
    bowdensUrl: 'https://www.bowdensown.com.au/nanolicious-wash#2L',
  },
  {
    name: "Bowden's Own Snow Job 2L",
    slug: 'bowden-s-own-snow-job-2l',
    phase: 0,
    autobarnSku: '141808',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Snow-Job-2L/p/141808',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-snow-job-snow-foam-2-litre/531514.html',
    bowdensUrl: 'https://www.bowdensown.com.au/snow-job~3816#2L',
  },
  {
    name: 'Wax Wash 2L',
    slug: 'wax-wash-2l',
    phase: 0,
    autobarnSku: 'CC06813',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Wash-%26-Wax-Shine-And-Protection-2L/p/CC06813',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-wax-wash-2-litre/526275.html',
    bowdensUrl: 'https://www.bowdensown.com.au/wax_wash#2L',
  },
  {
    name: 'Sweet Rubber 500ml',
    slug: 'sweet-rubber-500ml',
    phase: 0,
    autobarnSku: '141901',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Sweet-Rubber-500ml/p/141901',
    supercheapUrl: null,
    bowdensUrl: 'https://www.bowdensown.com.au/sweet-rubber#500mL',
  },
  {
    name: 'Sweet Rubber 700 ml',
    slug: 'sweet-rubber-700-ml',
    phase: 0,
    autobarnSku: null,
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-sweet-rubber-tyre-dressing-770ml/685132.html?cgid=SCA8001380',
  },
  {
    name: 'Orange Agent 770mL',
    slug: 'orange-agent-cleaner-770ml',
    phase: 0,
    autobarnSku: null,
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-orange-agent-cleaner-770ml/588683.html',
  },
  {
    name: 'All Sort Applicator 1PK',
    slug: 'all-sort-applicator-1pk',
    phase: 0,
    autobarnSku: null,
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-all-sort-applicator-1pk/726444.html',
    bowdensUrl: 'https://www.bowdensown.com.au/all-sorts#BOASORT',
  },
  {
    name: 'Circle Work Applicator Pad',
    slug: 'circle-work-applicator-pad',
    phase: 0,
    autobarnSku: 'CC02908',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Circle-Work-Blue-Microfibre-Applicator/p/CC02908',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-circle-work-blue-piping/SPO3537696.html',
    bowdensUrl: 'https://www.bowdensown.com.au/products/microfibre/circle-work-blue-colours',
  },
  {
    name: "Bowden's Own Claying Rubber Pad",
    slug: 'bowden-s-own-claying-rubber-pad',
    phase: 0,
    autobarnSku: 'CC07352',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Fine-Claying-Rubber-Pad-Smooth/p/CC07352',
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-claying-rubber-pad/591966.html?cgid=SCA8001380',
    bowdensUrl: 'https://www.bowdensown.com.au/claying-rubber',
  },
  {
    name: "Bowden's Own Three Way Prep Spray 770mL",
    slug: 'bowden-s-own-three-way-prep-spray-770ml',
    phase: 0,
    autobarnSku: 'CC07341',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Three-Way-Intensive-Removal-750ml/p/CC07341',
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-three-way-prep-spray-770ml/591965.html?cgid=SCA8001380',
    bowdensUrl: 'https://www.bowdensown.com.au/three-way#770ml',
  },
  {
    name: "Bowden's Own Paint Cleanse and Restore Liquid Polish 500mL",
    slug: 'bowden-s-own-paint-cleanse-and-restore-liquid-polish-500ml',
    phase: 0,
    autobarnSku: 'CC02337',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Paint-Cleanse-%26-Restore-Non-Abrasive-500ml/p/CC02337',
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-bowdens-own-paint-cleanse-and-restore-liquid-polish-500ml/323484.html?cgid=SCA8001380',
    bowdensUrl: 'https://www.bowdensown.com.au/products/exterior/paint-cleanse-restore#500mL',
  },
  {
    name: "Bowden's Own Claying Rubber Pack - BOFCRP",
    slug: 'bowden-s-own-claying-rubber-pack-bofcrp',
    phase: 0,
    autobarnSku: null,
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-claying-rubber-pack/SPO7541274.html?cgid=SCA8001380',
    bowdensUrl: 'https://www.bowdensown.com.au/claying-rubber-pack',
  },
  {
    name: "Bowden's Own Paint Rejuvenation Pack - BOCP",
    slug: 'bowden-s-own-paint-rejuvenation-pack-bocp',
    phase: 0,
    autobarnSku: 'CC05715',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Paint-Rejuvenation-Pack/p/CC05715',
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-paint-rejuvenation-pack/SPO3537756.html?cgid=SCA8001380',
    bowdensUrl: 'https://www.bowdensown.com.au/products/value-packs/paint-rejuvenation-pack',
  },
  {
    name: "Bowden's Own Vinyl Care Pack - BOVP",
    slug: 'bowden-s-own-vinyl-care-pack-bovp',
    phase: 0,
    autobarnSku: 'CC02033',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Vinyl-Care-Pack/p/CC02033',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-vinyl-pack/SPO3537747.html?cgid=SCA8001380',
    bowdensUrl: 'https://www.bowdensown.com.au/vinyl-care-pack',
  },
  {
    name: "Bowden's Own Beautiful Beads Pack - BOMACHINEP",
    slug: 'bowden-s-own-beautiful-beads-pack-bomachinep',
    phase: 0,
    autobarnSku: null,
    supercheapUrl:
      'https://www.supercheapauto.com.au/p/bowdens-own-pack---beautiful-beads/SPO9697763.html?cgid=SCA8001380',
    bowdensUrl: 'https://www.bowdensown.com.au/beautiful-beads-pack',
  },
  {
    name: "Bowden's Own Happy Ending Pack - BOHAPPYP",
    slug: 'bowden-s-own-happy-ending-pack-bohappyp',
    phase: 0,
    autobarnSku: 'CC07499',
    autobarnUrl:
      'https://autobarn.com.au/ab/Autobarn-Category/Shop-our-Full-Range-by-Brand-at-Autobarn/Bowdens-Own/Bowden%27s-Own-Happy-Ending-Pack/p/CC07499',
    supercheapUrl: 'https://www.supercheapauto.com.au/p/bowdens-own-happy-ending-pack/SPO7541273.html?cgid=SCA8001380',
    bowdensUrl: 'https://www.bowdensown.com.au/happy-ending-pack',
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

    if (item.bowdensUrl) {
      await db
        .insert(retailerUrls)
        .values({ productId, retailer: 'bowdens', url: item.bowdensUrl })
        .onConflictDoUpdate({
          target: [retailerUrls.productId, retailerUrls.retailer],
          set: { url: item.bowdensUrl },
        });
    }
  }

  const autobarnCount = ALL_ITEMS.filter((i) => i.autobarnUrl || i.autobarnSku).length;
  const supercheapCount = ALL_ITEMS.filter((i) => i.supercheapUrl).length;
  const bowdensCount = ALL_ITEMS.filter((i) => i.bowdensUrl).length;

  console.log(`Done. ${inserted} products inserted, ${skipped} already existed.`);
  console.log(`Retailer URLs: ${autobarnCount} Auto Barn, ${supercheapCount} Supercheap, ${bowdensCount} Bowden's Own`);
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
