// Static catalogue, defaults and templates. No imports from feature modules — safe to read at load time.

// Full product catalog — all phase 1–4 items + phase 0 extras available for the dropdown
export const CATALOG = [
  // Phase 1
  {
    slug: 'nanolicious-wash-pack-ultimate',
    name: 'Nanolicious Wash Pack Ultimate',
    desc: 'Includes Nanolicious, Wash Pad for Shags, Big Green Sucker, Boss Gloss 125ml',
    price: 95,
  },
  {
    slug: 'wet-dreams-pack',
    name: 'Wet Dreams Pack',
    desc: 'Hydrophobic spray sealant — apply to wet car post-rinse every wash',
    price: 54,
  },
  {
    slug: '2-bucket-wash-kit',
    name: '2 Bucket Wash Kit',
    desc: 'Two 15L buckets + Great Barrier Thingy grit guards',
    price: 55,
  },
  {
    slug: 'boss-gloss-770ml',
    name: 'Boss Gloss 770ml',
    desc: 'Drying aid, quick detailer, clay bar lubricant',
    price: 23,
  },
  { slug: 'naked-glass-500ml', name: 'Naked Glass 500ml', desc: 'Ammonia-free, tint-safe glass cleaner', price: 17 },
  {
    slug: 'inta-mitt',
    name: 'Inta-Mitt',
    desc: 'Purpose-built dual-sided glass cleaning mitt with flat profile for windscreen corners',
    price: 22,
  },
  {
    slug: 'karcher-k2',
    name: 'Kärcher K2 Premium Pressure Washer',
    desc: '1750 PSI · 6.2L/min · Kärcher K-series adapter compatible out-of-box with Snow Blow Cannon',
    price: 189,
  },
  {
    slug: 'snow-blow-cannon',
    name: "Bowden's Own Snow Blow Cannon",
    desc: 'Brass fittings, 1L anti-tip bottle, top air adjustment knob',
    price: 99,
  },
  { slug: 'snow-job-1l', name: 'Snow Job 1L', desc: 'Pre-wash snow foam — use before every contact wash', price: 25 },
  // Phase 2
  {
    slug: 'wheely-clean-v2-500ml',
    name: 'Wheely Clean V2 500ml',
    desc: 'pH-neutral wheel cleaner — protects alloys from brake dust corrosion',
    price: 22,
  },
  {
    slug: 'the-little-stiffy',
    name: 'The Little Stiffy',
    desc: 'Tyre brush — stiff bristles for sidewall texture',
    price: 15,
  },
  {
    slug: 'the-flat-head',
    name: 'The Flat Head',
    desc: 'Wheel brush for ZR\'s 18" alloy barrels. Non-slip handle, knuckle protector',
    price: 30,
  },
  {
    slug: 'fabra-cadabra-500ml',
    name: 'Fabra Cadabra 500ml',
    desc: 'Solvent-free Ultrasuede cleaner — non-negotiable for ZR seat inserts',
    price: 23,
  },
  {
    slug: 'bolp-leather-care-pack',
    name: 'BOLP — Leather Care Pack',
    desc: 'Leather Love + Leather Guard + Square Bear + Plush Daddy',
    price: 78,
  },
  {
    slug: 'fabratection',
    name: 'Fabratection',
    desc: 'Water-based protector for Ultrasuede seats, carpet floor mats, fabric headlining — apply while new',
    price: 47,
  },
  {
    slug: '303-aerospace',
    name: '303 Aerospace Protectant 473ml',
    desc: 'UV protection for interior plastics, dashboard, rubber/all-weather floor mats — SPF 40 equivalent. From BCF, Detailing Shed',
    price: 30,
  },
  // Phase 3
  { slug: 'pumpy-pump', name: 'Pumpy Pump', desc: "Screws into any Bowden's 5L bottle — 25ml per pump", price: 14 },
  {
    slug: 'nanolicious-wash-5l',
    name: 'Nanolicious Wash 5L',
    desc: 'Wait for 30% off sale at Supercheap/Repco before buying',
    price: 68,
  },
  {
    slug: 'microfibre-wash-1l',
    name: 'Microfibre Wash 1L',
    desc: 'Keeps Big Green Sucker and Inta-Mitt absorbent — never fabric softener',
    price: 28,
  },
  // Phase 4
  {
    slug: 'plush-brush',
    name: 'Plush Brush',
    desc: 'Soft-bristle brush for Ultrasuede pile and piano black trim',
    price: 18,
  },
  {
    slug: 'flash-prep-500ml',
    name: 'Flash Prep 500ml',
    desc: 'Required prep before Bead Machine — strips waxes, sealants, oils for proper bonding',
    price: 25,
  },
  {
    slug: 'bead-machine-500ml',
    name: 'Bead Machine 500ml',
    desc: "Most protective product in Bowden's range — synthetic sealant lasting 3–6 months",
    price: 50,
  },
  {
    slug: 'big-softie-pair',
    name: 'Big Softie pair (blue + orange)',
    desc: 'Two cloths required for Bead Machine application + buffing. Useful as dedicated paint cloths',
    price: 32,
  },
  { slug: 'snow-job-5l', name: 'Snow Job 5L', desc: 'Bulk pre-wash refill — wait for 30% off sale', price: 78 },
  {
    slug: 'wheely-clean-v2-5l',
    name: 'Wheely Clean V2 5L',
    desc: 'Bulk wheel cleaner refill — wait for 30% off sale',
    price: 83,
  },
  // Phase 0 extras (pricing-only in default kit, available to add to any phase)
  {
    slug: 'shagtastic-wash-pad',
    name: 'Shagtastic Wash Pad',
    desc: 'Wash pad for Nanolicious — thick shaggy microfibre',
    price: 0,
  },
  {
    slug: 'happy-ending-cannon-bottle',
    name: 'Happy Ending Cannon Bottle',
    desc: 'Snow foam cannon bottle sized for Happy Ending formula',
    price: 0,
  },
  {
    slug: 'the-chubby-wheel-brush-v2',
    name: 'The Chubby Wheel Brush V2',
    desc: 'Wheel spoke and barrel brush',
    price: 0,
  },
  {
    slug: 'naked-inta-mitt-pack',
    name: 'Naked Inta-Mitt Glass Cleaning Pack',
    desc: 'Naked Glass + Inta-Mitt bundle',
    price: 0,
  },
  {
    slug: 'twisted-pro-sucker',
    name: 'Twisted Pro Sucker Drying Towel',
    desc: 'Plush twisted-loop drying towel',
    price: 0,
  },
  {
    slug: 'leather-love-v2-500ml',
    name: 'Leather Love V2 500ml',
    desc: 'Leather cleaner — sold individually (also in BOLP pack)',
    price: 0,
  },
  {
    slug: 'the-square-bear',
    name: 'The Square Bear Interior Applicator',
    desc: 'Interior applicator pad for leather and trim',
    price: 0,
  },
  {
    slug: 'the-big-green-sucker',
    name: 'The Big Green Sucker Drying Towel',
    desc: 'Waffle-weave drying towel (also in Nanolicious Wash Pack)',
    price: 0,
  },
  {
    slug: 'leather-guard-500ml',
    name: 'Leather Guard 500ml',
    desc: 'Leather protectant — sold individually (also in BOLP pack)',
    price: 0,
  },
  {
    slug: 'plush-daddy',
    name: 'Plush Daddy Interior Microfibre',
    desc: 'Interior microfibre cloth for leather and trim',
    price: 0,
  },
  {
    slug: 'wet-dreams-770ml',
    name: 'Wet Dreams Sealant 770ml',
    desc: 'Hydrophobic spray sealant — larger 770ml bottle',
    price: 0,
  },
  {
    slug: 'happy-ending-1l',
    name: 'Happy Ending Foam 1L',
    desc: 'Post-wash finishing foam — seals and protects',
    price: 0,
  },
  { slug: 'wheely-clean-770ml', name: 'Wheely Clean 770ml', desc: 'Wheel cleaner 770ml (Supercheap size)', price: 0 },
  { slug: 'naked-glass-770ml', name: 'Naked Glass 770ml', desc: 'Glass cleaner 770ml (Supercheap size)', price: 0 },
  {
    slug: 'little-chubby-v2',
    name: 'Little Chubby Brush V2',
    desc: 'Small barrel and spoke detailing brush',
    price: 0,
  },
  {
    slug: 'nanolicious-shag-pack',
    name: 'Nanolicious Shag Pack',
    desc: 'Nanolicious Wash + Shagtastic wash pad bundle',
    price: 0,
  },
  {
    slug: 'the-essentials-starters-kit',
    name: 'The Essentials Starters Kit',
    desc: 'Entry-level starter kit bundle',
    price: 0,
  },
  {
    slug: 'microfibre-bucket-lid',
    name: 'Microfibre Bucket With Lid',
    desc: 'Dedicated microfibre washing bucket',
    price: 0,
  },
  {
    slug: 'orange-agent-500ml',
    name: 'Orange Agent 500ml',
    desc: 'All-purpose citrus-based cleaner and degreaser',
    price: 0,
  },
  { slug: 'debugger-cloth', name: 'Debugger Cloth', desc: 'Glass cleaning cloth', price: 0 },
  { slug: 'wet-dreams-5l', name: 'Wet Dreams Sealant 5L', desc: 'Hydrophobic spray sealant — 5L bulk', price: 0 },
  { slug: 'boss-gloss-5l', name: 'Boss Gloss 5L', desc: 'Detailing spray — 5L bulk', price: 0 },
  { slug: 'boss-gloss-pack', name: 'Boss Gloss Pack', desc: 'Boss Gloss bundle pack', price: 0 },
  { slug: 'happy-ending-5l', name: 'Happy Ending Foam 5L', desc: 'Post-wash finishing foam — 5L bulk', price: 0 },
];

export const PRODUCT_ACTIONS = {
  'nanolicious-wash-pack-ultimate': 'Two-bucket contact wash, top to bottom, straight strokes',
  'wet-dreams-pack': 'Spray onto wet car, dwell 20–30 sec, gentle rinse',
  'wet-dreams-770ml': 'Spray onto wet car, dwell 20–30 sec, gentle rinse',
  'wet-dreams-5l': 'Spray onto wet car, dwell 20–30 sec, gentle rinse',
  'boss-gloss-770ml': 'Mist on panel, buff off with clean microfibre',
  'boss-gloss-5l': 'Mist on panel, buff off with clean microfibre',
  'boss-gloss-pack': 'Mist on panel, buff off with clean microfibre',
  'naked-glass-500ml': 'Two-side technique — one side per panel, flip cloth',
  'naked-glass-770ml': 'Two-side technique — one side per panel, flip cloth',
  'inta-mitt': 'Wipe interior windscreen and all windows, flip mitt each panel',
  'snow-job-1l': 'Apply via foam cannon, dwell 2–4 min, rinse top to bottom',
  'snow-job-5l': 'Apply via foam cannon, dwell 2–4 min, rinse top to bottom',
  'wheely-clean-v2-500ml': 'Spray on wheels, agitate with Flat Head + Little Stiffy, rinse',
  'wheely-clean-v2-5l': 'Spray on wheels, agitate with Flat Head + Little Stiffy, rinse',
  'wheely-clean-770ml': 'Spray on wheels, agitate with Flat Head + Little Stiffy, rinse',
  'the-little-stiffy': 'Agitate wheel barrels, spokes, and around lug nuts',
  'the-flat-head': 'Clean wheel face and around lug nuts with flat profile',
  'fabra-cadabra-500ml': 'Spray on Ultrasuede, agitate with Plush Brush, blot with Plush Daddy',
  'plush-brush': 'Agitate fabric surfaces using circular then straight strokes',
  'leather-love-v2-500ml': 'Apply via Square Bear in sections — seats, wheel, gear knob, doors',
  'the-square-bear': 'Apply product in overlapping passes, flip pad between sections',
  'bolp-leather-care-pack': 'Apply Leather Love via Square Bear, follow with Leather Guard',
  'leather-guard-500ml': 'Apply thin layer after Leather Love. Buff gently when tacky',
  'plush-daddy': 'Wipe hard plastics, console, door pulls, climate controls with damp cloth',
  fabratection: 'Apply to Ultrasuede after Fabra Cadabra. Buff when dry. Reapply annually or when bead test fails',
  '303-aerospace': 'Spray on dashboard, plastic trim, rubber mats. Buff lightly. Reapply every 4–8 weeks',
  'bead-machine-500ml': 'Apply after Flash Prep. Spread thin, buff to haze, wipe off with clean microfibre',
  'flash-prep-500ml': 'Wipe panel by panel to strip old sealant and contamination before Bead Machine',
  'orange-agent-500ml': 'Dilute 1:10, spray on soiled surfaces, agitate, rinse thoroughly',
  'the-big-green-sucker': 'Dry top to bottom in long sweeping passes',
  'twisted-pro-sucker': 'Dry top to bottom in long sweeping passes',
  'happy-ending-cannon-bottle': 'Apply foam onto wet car, dwell 30 sec, gentle low-pressure rinse',
  'happy-ending-1l': 'Apply foam onto wet car, dwell 30 sec, gentle low-pressure rinse',
  'happy-ending-5l': 'Apply foam onto wet car, dwell 30 sec, gentle low-pressure rinse',
  'microfibre-wash-1l': 'Machine-wash on cold, no fabric softener. Air dry or low heat',
};

export const DEFAULT_ROUTINES = [
  {
    id: 'routine-exterior',
    name: 'Full Exterior Wash',
    subtext:
      'Follow this sequence every wash. Order matters — steps done out of sequence re-contaminate surfaces already cleaned.',
    types: ['exterior'],
    steps: [
      { name: 'Pre-rinse', action: 'Dislodge loose grit before any product contact', products: [] },
      {
        name: 'Wheel clean',
        action: 'Spray wheels, agitate with Flat Head + Little Stiffy, rinse',
        products: [
          { name: 'Wheely Clean', ml: 20 },
          { name: 'The Flat Head', ml: null },
          { name: 'The Little Stiffy', ml: null },
        ],
      },
      {
        name: 'Pre-wash foam',
        action: 'Apply via foam cannon, dwell 2–4 min, rinse top to bottom',
        products: [{ name: 'Snow Job', ml: 50 }],
      },
      {
        name: 'Contact wash',
        action: 'Two-bucket method, top to bottom, straight strokes',
        products: [{ name: 'Nanolicious Wash', ml: 25 }],
      },
      { name: 'Sheet rinse', action: 'Free-flow rinse, remove nozzle, top to bottom', products: [] },
      {
        name: 'Rinse sealant',
        action: 'Spray onto wet car, dwell 20–30 sec, gentle rinse',
        products: [{ name: 'Wet Dreams', ml: 20 }],
      },
      {
        name: 'Foam rinse aid',
        action: 'Apply foam onto wet car, dwell 30 sec, gentle low-pressure rinse',
        products: [{ name: 'Happy Ending', ml: 50 }],
      },
      {
        name: 'Dry',
        action: 'Dry with towel — paint will be noticeably slicker',
        products: [{ name: 'The Big Green Sucker Drying Towel', ml: null }],
      },
      {
        name: 'Glass',
        action: 'Exterior glass first, then interior windscreen',
        products: [
          { name: 'Naked Glass', ml: 10 },
          { name: 'Inta-Mitt', ml: null },
        ],
      },
      {
        name: 'Quick detail',
        action: 'Spot-remove any remaining water spots or fingerprints',
        products: [{ name: 'Boss Gloss', ml: 10 }],
      },
    ],
    alerts: [],
  },
  {
    id: 'routine-interior',
    name: 'Interior Routine',
    subtext: 'Separate from the wash. Monthly, or whenever visibly soiled.',
    types: ['interior'],
    steps: [
      { name: 'Vacuum', action: 'Remove all grit before any liquid application — including floor mats', products: [] },
      {
        name: 'Upholstery clean',
        action: 'Clean Ultrasuede inserts in sections, blot with Plush Daddy',
        products: [
          { name: 'Fabra Cadabra', ml: 15 },
          { name: 'Plush Brush', ml: null },
        ],
      },
      {
        name: 'Leather clean',
        action: 'Clean leather seats, steering wheel, gear knob, doors',
        products: [
          { name: 'Leather Love', ml: 15 },
          { name: 'The Square Bear Interior Applicator', ml: null },
        ],
      },
      {
        name: 'Hard surfaces',
        action: 'Wipe hard plastics, console, door pulls, climate controls',
        products: [{ name: 'Plush Daddy Interior Microfibre', ml: null }],
      },
      {
        name: 'Interior glass',
        action: 'Interior windscreen and all windows',
        products: [
          { name: 'Naked Glass', ml: 10 },
          { name: 'Inta-Mitt', ml: null },
        ],
      },
      {
        name: 'Leather protect',
        action: 'Apply protectant to leather surfaces',
        products: [
          { name: 'Leather Guard', ml: 10 },
          { name: 'The Square Bear Interior Applicator', ml: null },
        ],
      },
      {
        name: 'Trim & rubber',
        action: 'UV protection on dashboard, plastic trim, rubber mats',
        products: [{ name: '303 Aerospace Protectant 473ml', ml: 10 }],
      },
      {
        name: 'Fabric protect',
        action: 'Reapply to Ultrasuede annually, carpet mats every 6 months',
        products: [{ name: 'Fabratection', ml: 15 }],
      },
    ],
    alerts: [
      {
        severity: 'warn',
        label: 'Critical',
        text: 'Never use the same cloth on Ultrasuede that has touched leather product. Cross-contamination is the most common cause of interior damage.',
      },
    ],
  },
  {
    id: 'routine-maintenance',
    name: 'Ongoing Schedule',
    subtext: '',
    types: ['maintenance'],
    steps: [
      { name: 'Full wash', action: 'Nanolicious + Wet Dreams + dry with Big Green Sucker', products: [] },
      {
        name: 'Interior wipe-down',
        action: 'Plush Daddy on high-touch surfaces (wheel, shifter, door pulls, screen)',
        products: [{ name: 'Plush Daddy Interior Microfibre', ml: null }],
      },
      {
        name: 'Deep wheel clean',
        action: 'Full tyre brush clean with Wheely Clean',
        products: [{ name: 'Wheely Clean', ml: 20 }],
      },
      {
        name: 'Full interior detail',
        action: 'Upholstery, leather clean + protect, trim',
        products: [
          { name: 'Fabra Cadabra', ml: 15 },
          { name: 'Leather Love', ml: 15 },
          { name: 'Leather Guard', ml: 10 },
        ],
      },
      {
        name: 'Trim & rubber',
        action: 'Interior plastics + rubber mats. More frequent in summer',
        products: [{ name: '303 Aerospace Protectant 473ml', ml: 10 }],
      },
      { name: 'Tyre pressure check', action: 'More critical for tyre life than any cleaning product', products: [] },
      {
        name: 'Sealant reapply',
        action: 'Use Flash Prep first. When water beading flattens, time to reapply',
        products: [
          { name: 'Flash Prep', ml: 50 },
          { name: 'Bead Machine', ml: 50 },
        ],
      },
      {
        name: 'Carpet protection',
        action: "Driver's mat especially — gets the most wear",
        products: [{ name: 'Fabratection', ml: 15 }],
      },
      {
        name: 'Ultrasuede protect',
        action: 'Reapply after bead test fails',
        products: [{ name: 'Fabratection', ml: 15 }],
      },
      {
        name: 'Leather protection',
        action: 'Focus on bolsters and seat base — highest contact wear areas',
        products: [{ name: 'Leather Guard', ml: 10 }],
      },
      { name: 'Replace mitts', action: 'If matted, stiff, or discoloured', products: [] },
    ],
    alerts: [],
  },
];

export const DEFAULT_MAINTENANCE_ITEMS = [
  {
    id: 'maint-tyre-pressure',
    name: 'Tyre Pressure Check',
    notes: '33 psi / 2.3 bar front and rear when cold',
    intervalType: 'time',
    intervalValue: 1,
    intervalUnit: 'months',
    intervalKm: null,
    lastCompletedDate: null,
    lastCompletedOdometer: null,
    enabled: true,
  },
  {
    id: 'maint-oil-level',
    name: 'Engine Oil Level Check',
    notes: 'Check dipstick; top up with 0W-20 if needed',
    intervalType: 'time',
    intervalValue: 1,
    intervalUnit: 'months',
    intervalKm: null,
    lastCompletedDate: null,
    lastCompletedOdometer: null,
    enabled: true,
  },
  {
    id: 'maint-washer-fluid',
    name: 'Windscreen Washer Fluid',
    notes: '',
    intervalType: 'time',
    intervalValue: 3,
    intervalUnit: 'months',
    intervalKm: null,
    lastCompletedDate: null,
    lastCompletedOdometer: null,
    enabled: true,
  },
  {
    id: 'maint-cabin-filter',
    name: 'Cabin Air Filter Inspection',
    notes: '',
    intervalType: 'time',
    intervalValue: 12,
    intervalUnit: 'months',
    intervalKm: null,
    lastCompletedDate: null,
    lastCompletedOdometer: null,
    enabled: true,
  },
  {
    id: 'maint-logbook-service',
    name: 'Toyota Log Book Service',
    notes: 'Oil change + multi-point inspection at Toyota dealer',
    intervalType: 'odometer',
    intervalValue: null,
    intervalUnit: null,
    intervalKm: 10000,
    lastCompletedDate: null,
    lastCompletedOdometer: null,
    enabled: true,
  },
  {
    id: 'maint-tyre-rotation',
    name: 'Tyre Rotation',
    notes: '',
    intervalType: 'odometer',
    intervalValue: null,
    intervalUnit: null,
    intervalKm: 10000,
    lastCompletedDate: null,
    lastCompletedOdometer: null,
    enabled: true,
  },
  {
    id: 'maint-brake-fluid',
    name: 'Brake Fluid Check',
    notes: '',
    intervalType: 'odometer',
    intervalValue: null,
    intervalUnit: null,
    intervalKm: 40000,
    lastCompletedDate: null,
    lastCompletedOdometer: null,
    enabled: true,
  },
];

export const MAINTENANCE_CSV_TEMPLATE = `You are generating a maintenance schedule in CSV format for import into a car maintenance tracking app.

## Context

Vehicle: 2025 Toyota Corolla Hatch Hybrid ZR (Australian market, GR-Sport variant)
Engine: 2ZR-FXE 1.8L hybrid (M20A-FXS in some variants — confirm from owner's logbook)
Transmission: ECVT
Use: Daily driver, suburban + occasional highway

The app already contains these default items (do not duplicate):
- Tyre Pressure Check — time, every 1 month
- Engine Oil Level Check — time, every 1 month
- Windscreen Washer Fluid — time, every 3 months
- Cabin Air Filter Inspection — time, every 12 months
- Toyota Log Book Service — odometer, every 10,000 km
- Tyre Rotation — odometer, every 10,000 km
- Brake Fluid Check — odometer, every 40,000 km

## CSV format

One file, 8 columns, always include this exact header row:
row_type,item_id,name,notes,interval_type,interval_value,interval_unit,interval_km

One row per item (row_type = ITEM):
  item_id       : unique snake_case identifier (e.g. "spark_plugs", "coolant_top_up")
  name          : display name shown on the reminder card
  notes         : one sentence shown on the card — spec, threshold, or reminder tip (leave blank if none)
  interval_type : "time" or "odometer"
  interval_value: number for time intervals (e.g. 6 for every 6 months) — leave blank for odometer
  interval_unit : "days", "weeks", "months", or "years" — leave blank for odometer
  interval_km   : km interval for odometer items (e.g. 80000) — leave blank for time

Rules:
- Fields containing commas must be wrapped in double quotes
- A literal double-quote inside a field is written as two double-quotes ("")
- Output raw CSV only — no markdown, no explanation, no code fences

## Example

row_type,item_id,name,notes,interval_type,interval_value,interval_unit,interval_km
ITEM,wiper_blades,Wiper Blade Inspection,"Check for streaking or skipping; replace if needed",time,12,months,
ITEM,spark_plugs,Spark Plug Replacement,"Toyota iridium plugs — replace at 80,000 km",odometer,,,80000

## Your task

Generate additional maintenance items suitable for the 2025 Toyota Corolla Hatch Hybrid ZR.

Suggested areas to cover (adapt to Toyota's AU service schedule):
- Wiper blade inspection / replacement
- Spark plug replacement (iridium — Toyota spec interval)
- Engine coolant inspection / replacement
- 12V auxiliary battery check (hybrid vehicles carry a small 12V battery separate from the traction pack)
- Power steering fluid check (EPS — typically no fluid, but confirm)
- Tyre condition / tread depth check
- Brake pad inspection (hybrids use regen braking — pads last longer but still need checking)
- Air filter (engine) replacement
- Annual registration renewal reminder (time-based, 12 months)
- Annual pink slip / safety inspection (NSW/ACT) or equivalent state roadworthy (time-based, 12 months)

Use Toyota Australia's logbook intervals where known. For anything uncertain, err on the conservative side.

Output only the CSV starting with the header row.`;

export const EQUIPMENT_SLUGS = new Set([
  '2-bucket-wash-kit',
  'karcher-k2',
  'snow-blow-cannon',
  'the-little-stiffy',
  'the-flat-head',
  'pumpy-pump',
  'inta-mitt',
  'plush-brush',
  'big-softie-pair',
  'the-square-bear',
  'shagtastic-wash-pad',
  'twisted-pro-sucker',
  'the-big-green-sucker',
  'the-chubby-wheel-brush-v2',
  'little-chubby-v2',
  'microfibre-bucket-lid',
  'happy-ending-cannon-bottle',
  'the-essentials-starters-kit',
  'debugger-cloth',
  'naked-inta-mitt-pack',
  'plush-daddy',
]);

export const INVENTORY_DEFAULTS = {
  'nanolicious-wash-pack-ultimate': { volumeMl: 500, usagePerWashMl: 25 },
  'nanolicious-wash-5l': { volumeMl: 5000, usagePerWashMl: 25 },
  'nanolicious-shag-pack': { volumeMl: 500, usagePerWashMl: 25 },
  'wet-dreams-pack': { volumeMl: 500, usagePerWashMl: 20 },
  'wet-dreams-770ml': { volumeMl: 770, usagePerWashMl: 20 },
  'wet-dreams-5l': { volumeMl: 5000, usagePerWashMl: 20 },
  'boss-gloss-770ml': { volumeMl: 770, usagePerWashMl: 10 },
  'boss-gloss-5l': { volumeMl: 5000, usagePerWashMl: 10 },
  'boss-gloss-pack': { volumeMl: 770, usagePerWashMl: 10 },
  'naked-glass-500ml': { volumeMl: 500, usagePerWashMl: 10 },
  'naked-glass-770ml': { volumeMl: 770, usagePerWashMl: 10 },
  'naked-inta-mitt-pack': { volumeMl: 500, usagePerWashMl: 10 },
  'snow-job-1l': { volumeMl: 1000, usagePerWashMl: 50 },
  'snow-job-5l': { volumeMl: 5000, usagePerWashMl: 50 },
  'wheely-clean-v2-500ml': { volumeMl: 500, usagePerWashMl: 20 },
  'wheely-clean-v2-5l': { volumeMl: 5000, usagePerWashMl: 20 },
  'wheely-clean-770ml': { volumeMl: 770, usagePerWashMl: 20 },
  'fabra-cadabra-500ml': { volumeMl: 500, usagePerWashMl: 15 },
  fabratection: { volumeMl: 500, usagePerWashMl: 15 },
  '303-aerospace': { volumeMl: 473, usagePerWashMl: 10 },
  'microfibre-wash-1l': { volumeMl: 1000, usagePerWashMl: 30 },
  'flash-prep-500ml': { volumeMl: 500, usagePerWashMl: 50 },
  'bead-machine-500ml': { volumeMl: 500, usagePerWashMl: 50 },
  'leather-love-v2-500ml': { volumeMl: 500, usagePerWashMl: 15 },
  'leather-guard-500ml': { volumeMl: 500, usagePerWashMl: 10 },
  'orange-agent-500ml': { volumeMl: 500, usagePerWashMl: 20 },
  'happy-ending-1l': { volumeMl: 1000, usagePerWashMl: 50 },
  'happy-ending-5l': { volumeMl: 5000, usagePerWashMl: 50 },
  'bolp-leather-care-pack': { volumeMl: 1000, usagePerWashMl: 25 },
};

// Groups size/format variants of the same product so depletion can fall back to
// whichever variant the user actually owns when the step references a different size.
export const SLUG_FAMILIES = {
  'nanolicious-wash-pack-ultimate': 'nanolicious',
  'nanolicious-wash-5l': 'nanolicious',
  'nanolicious-shag-pack': 'nanolicious',
  'wet-dreams-pack': 'wet-dreams',
  'wet-dreams-770ml': 'wet-dreams',
  'wet-dreams-5l': 'wet-dreams',
  'boss-gloss-770ml': 'boss-gloss',
  'boss-gloss-5l': 'boss-gloss',
  'boss-gloss-pack': 'boss-gloss',
  'naked-glass-500ml': 'naked-glass',
  'naked-glass-770ml': 'naked-glass',
  'naked-inta-mitt-pack': 'naked-glass',
  'snow-job-1l': 'snow-job',
  'snow-job-5l': 'snow-job',
  'wheely-clean-v2-500ml': 'wheely-clean',
  'wheely-clean-v2-5l': 'wheely-clean',
  'wheely-clean-770ml': 'wheely-clean',
  'happy-ending-cannon-bottle': 'happy-ending',
  'happy-ending-1l': 'happy-ending',
  'happy-ending-5l': 'happy-ending',
  'leather-love-v2-500ml': 'leather-love',
  'leather-guard-500ml': 'leather-guard',
  'fabra-cadabra-500ml': 'fabra-cadabra',
  'flash-prep-500ml': 'flash-prep',
  'bead-machine-500ml': 'bead-machine',
  'microfibre-wash-1l': 'microfibre-wash',
  'orange-agent-500ml': 'orange-agent',
  'bolp-leather-care-pack': 'leather-care',
};

export const FAMILY_NAMES = {
  nanolicious: 'Nanolicious Wash',
  'wet-dreams': 'Wet Dreams',
  'boss-gloss': 'Boss Gloss',
  'naked-glass': 'Naked Glass',
  'snow-job': 'Snow Job',
  'wheely-clean': 'Wheely Clean',
  'happy-ending': 'Happy Ending',
  'leather-love': 'Leather Love',
  'leather-guard': 'Leather Guard',
  'fabra-cadabra': 'Fabra Cadabra',
  'flash-prep': 'Flash Prep',
  'bead-machine': 'Bead Machine',
  'microfibre-wash': 'Microfibre Wash',
  'orange-agent': 'Orange Agent',
  'leather-care': 'Leather Care',
};

// Canonical name → representative non-equipment slug (for action auto-fill + depletion lookup)
export const CANONICAL_SLUG_MAP = Object.fromEntries(
  Object.entries(FAMILY_NAMES).flatMap(([family, name]) => {
    const rep = CATALOG.find((c) => SLUG_FAMILIES[c.slug] === family && !EQUIPMENT_SLUGS.has(c.slug));
    return rep ? [[name, rep.slug]] : [];
  }),
);

// Default phases — id order matches original HTML for v4/v2 → v3 migration
export const DEFAULT_PHASES = [
  {
    id: '1',
    tag: 'Phase 1 · foundation',
    tag2: '',
    title: 'Wash, dry, glass, sealant, pre-wash',
    items: [
      'nanolicious-wash-pack-ultimate',
      'wet-dreams-pack',
      '2-bucket-wash-kit',
      'boss-gloss-770ml',
      'naked-glass-500ml',
      'inta-mitt',
      'karcher-k2',
      'snow-blow-cannon',
      'snow-job-1l',
    ],
  },
  {
    id: '2',
    tag: 'Phase 2 · complete exterior + interior',
    tag2: '',
    title: 'Wheels, tyres, leather, Ultrasuede',
    items: [
      'wheely-clean-v2-500ml',
      'the-little-stiffy',
      'the-flat-head',
      'fabra-cadabra-500ml',
      'bolp-leather-care-pack',
      'fabratection',
      '303-aerospace',
    ],
  },
  {
    id: '3',
    tag: 'Phase 3 · daily-use bulk',
    tag2: '',
    title: 'Cheaper washes, microfibre care',
    items: ['pumpy-pump', 'nanolicious-wash-5l', 'microfibre-wash-1l'],
  },
  {
    id: '4',
    tag: 'Phase 4 · full bulk + base sealant',
    tag2: '',
    title: 'Long-term preservation',
    items: [
      'plush-brush',
      'flash-prep-500ml',
      'bead-machine-500ml',
      'big-softie-pair',
      'snow-job-5l',
      'wheely-clean-v2-5l',
    ],
  },
].map(({ tag2, ...p }) => p); // strip the dummy tag2 field (alignment hack)

export const SCRAPED_RETAILERS = ['supercheap', 'repco', 'autobarn', 'autopro'];

export const INV_CATEGORIES = [
  {
    label: 'Equipment',
    sections: [
      {
        label: 'Microfibre',
        slugs: ['debugger-cloth', 'inta-mitt', 'plush-daddy', 'big-softie-pair', 'the-square-bear'],
      },
      { label: 'Wash Pads', slugs: ['shagtastic-wash-pad'] },
      { label: 'Drying Towels', slugs: ['twisted-pro-sucker', 'the-big-green-sucker'] },
      { label: 'Buckets', slugs: ['2-bucket-wash-kit', 'microfibre-bucket-lid'] },
      { label: 'Other', slugs: ['plush-brush', 'pumpy-pump', 'the-essentials-starters-kit'] },
    ],
  },
  {
    label: 'Pressure Washer Equipment',
    sections: [
      { label: 'Pressure Washers', slugs: ['karcher-k2'] },
      { label: 'Foam Cannons', slugs: ['snow-blow-cannon', 'happy-ending-cannon-bottle'] },
    ],
  },
  {
    label: 'Exterior Wash',
    sections: [
      { label: 'Glass', slugs: ['naked-glass-500ml', 'naked-glass-770ml', 'naked-inta-mitt-pack'] },
      { label: 'Prep', slugs: ['flash-prep-500ml', 'orange-agent-500ml'] },
      { label: 'Pre-Wash', slugs: ['snow-job-1l', 'snow-job-5l'] },
      {
        label: 'Contact Wash',
        slugs: ['nanolicious-wash-pack-ultimate', 'nanolicious-shag-pack', 'nanolicious-wash-5l'],
      },
    ],
  },
  {
    label: 'Exterior Protection',
    sections: [
      {
        label: 'Sealant',
        slugs: [
          'bead-machine-500ml',
          'wet-dreams-770ml',
          'wet-dreams-5l',
          'happy-ending-1l',
          'happy-ending-5l',
          'wet-dreams-pack',
        ],
      },
      { label: 'Quick Detailer', slugs: ['boss-gloss-770ml', 'boss-gloss-5l', 'boss-gloss-pack'] },
      { label: 'Microfibre Wash', slugs: ['microfibre-wash-1l'] },
    ],
  },
  {
    label: 'Interior Clean',
    sections: [
      { label: 'Leather', slugs: ['leather-love-v2-500ml', 'bolp-leather-care-pack'] },
      { label: 'Fabric', slugs: ['fabra-cadabra-500ml'] },
    ],
  },
  {
    label: 'Interior Protect',
    sections: [
      { label: 'Leather', slugs: ['leather-guard-500ml'] },
      { label: 'Fabric & Suede', slugs: ['fabratection'] },
      { label: 'Plastic, Vinyl & Rubber', slugs: ['303-aerospace'] },
    ],
  },
  {
    label: 'Wheels',
    sections: [
      {
        label: 'Equipment',
        slugs: ['little-chubby-v2', 'the-little-stiffy', 'the-flat-head', 'the-chubby-wheel-brush-v2'],
      },
      { label: 'Clean', slugs: ['wheely-clean-v2-500ml', 'wheely-clean-770ml', 'wheely-clean-v2-5l'] },
    ],
  },
];

// Frequency options per setting
export const FREQ_OPTIONS = {
  fullWash: ['Every 3 days', 'Twice a week', 'Weekly', 'Fortnightly', 'Monthly'],
  interiorDetail: ['Weekly', 'Fortnightly', 'Monthly', 'Every 6 weeks', 'Every 3 months'],
  beadMachine: ['Every 6 weeks', 'Every 2 months', 'Every 3 months', 'Every 4 months', 'Every 6 months'],
  aerospace: ['Every 2 weeks', 'Every 4 weeks', 'Every 6 weeks', 'Every 2 months', 'Every 3 months'],
  leatherGuard: ['Monthly', 'Every 6 weeks', 'Every 2 months', 'Every 3 months', 'Every 6 months'],
};

export const FREQ_DEFAULTS = {
  fullWash: 2,
  interiorDetail: 2,
  beadMachine: 2,
  aerospace: 2,
  leatherGuard: 3,
};

export const FREQ_DAYS = {
  'Every 3 days': 3,
  'Twice a week': 4,
  Weekly: 7,
  Fortnightly: 14,
  Monthly: 30,
  'Every 2 weeks': 14,
  'Every 4 weeks': 28,
  'Every 6 weeks': 42,
  'Every 2 months': 60,
  'Every 3 months': 90,
  'Every 4 months': 120,
  'Every 6 months': 180,
};

export const DEFAULT_PREFS = {
  showPrices: true,
  showBadges: true,
  showDesc: true,
  showBuyButtons: true,
  showSparklines: true,
  confirmDelete: true,
};

export const DEFAULT_NOTIFICATIONS = {
  saleAlerts: true,
  thresholdAlerts: true,
  ticktickAlerts: true,
  ticktickProjectId: null,
  ticktickTags: [],
  ticktickPriority: 0,
  emailAlerts: false,
  washReminders: true,
  emailWashReminders: false,
  emailDigest: false,
};

export const ROUTINE_CSV_TEMPLATE = `You are generating car detailing routines in CSV format for import into a detailing app.

## CSV format

One file, 10 columns, always include this exact header row:
row_type,routine_id,name,subtext,types,action,products,severity,label,text

Row types:

ROUTINE row — one per routine:
  routine_id : unique snake_case identifier (e.g. "quick_rinse", "bead_machine_apply")
  name       : display heading
  subtext    : one sentence shown under the heading (leave blank if none)
  types      : one or more of: exterior / interior / maintenance — separated by semicolons

STEP row — one per step, grouped after its routine row:
  routine_id : must match the parent routine
  name       : short step label (e.g. "Pre-wash foam", "Contact wash") — displayed as the Step column
  action     : what to do — one or two concise sentences (the how-to detail)
  products   : semicolon-separated list of products used in this step.
               To include a millilitre amount, append ":ml" after the product name (e.g. "Snow Job 1L:60").
               Leave blank if no products are needed (e.g. a plain water rinse or vacuum step).
               Example: "Wheely Clean V2 500ml:30;The Flat Head;The Little Stiffy"

ALERT row — optional, shown as a coloured callout at the bottom of the routine:
  routine_id : must match the parent routine
  severity   : tip (green) | warn (orange) | danger (red)
  label      : short label, e.g. "Critical" or "Note" — leave blank if none
  text       : the alert message

Rules:
- Fields containing commas must be wrapped in double quotes
- A literal double-quote inside a field is written as two double-quotes ("")
- Group each routine's steps and alerts immediately after the routine row (steps first, then alerts)
- Output raw CSV only — no markdown, no explanation, no code fences

## Example (two routines)

row_type,routine_id,name,subtext,types,action,products,severity,label,text
routine,quick_detail,Quick Detail,Fast finish between full washes — no water needed,exterior,,,,,,
step,quick_detail,Panel wipe,Mist onto dry panel and buff off with a clean microfibre in straight passes,Boss Gloss 770ml:5,,,
step,quick_detail,Glass,Wipe interior windscreen and all windows — one side per pane,Naked Glass 500ml:5;Inta-Mitt,,,
alert,quick_detail,,,,,,,tip,Note,Only use on a cool panel in shade — streaks in direct sun
routine,bead_machine_apply,Bead Machine Application,"Apply after Flash Prep when water beading flattens or sheeting improves",exterior,,,,,,
step,bead_machine_apply,Paint prep,"Wipe every panel with Flash Prep to strip old sealant, oils, and contamination",Flash Prep 500ml:10,,,
step,bead_machine_apply,Apply sealant,"Spread thin coat panel by panel, buff to a light haze, wipe off with clean Big Softie",Bead Machine 500ml:15,,,
alert,bead_machine_apply,,,,,,,warn,Timing,Do not apply in direct sun or on a hot panel — product flashes too fast

## Available products (use exact names for best auto-fill in the app)

Nanolicious Wash Pack Ultimate, Wet Dreams Pack, Boss Gloss 770ml, Boss Gloss 5L, Naked Glass 500ml, Naked Glass 770ml, Inta-Mitt, Kärcher K2 Premium Pressure Washer, Bowden's Own Snow Blow Cannon, Snow Job 1L, Snow Job 5L, Wheely Clean V2 500ml, Wheely Clean V2 5L, Wheely Clean 770ml, The Little Stiffy, The Flat Head, Fabra Cadabra 500ml, BOLP — Leather Care Pack, Leather Love V2 500ml, Leather Guard 500ml, Fabratection, 303 Aerospace Protectant 473ml, Pumpy Pump, Nanolicious Wash 5L, Microfibre Wash 1L, Plush Brush, Flash Prep 500ml, Bead Machine 500ml, Big Softie pair (blue + orange), Shagtastic Wash Pad, Happy Ending Cannon Bottle, The Chubby Wheel Brush V2, Naked Inta-Mitt Glass Cleaning Pack, Twisted Pro Sucker Drying Towel, The Square Bear Interior Applicator, The Big Green Sucker Drying Towel, Plush Daddy Interior Microfibre, Wet Dreams Sealant 770ml, Happy Ending Foam 1L, Little Chubby Brush V2, Orange Agent 500ml, Wet Dreams Sealant 5L, Happy Ending Foam 5L

## Your task

Generate [DESCRIBE THE ROUTINE(S) — e.g. "a quick post-rain rinse routine" or "a full Bead Machine reapplication routine with Flash Prep"].

[OPTIONAL: Add any constraints — e.g. "time budget: 20 minutes", "only products I own: Snow Job, Nanolicious, Wet Dreams", "for Ultrasuede seats only"]

Output only the CSV starting with the header row.`;

export const RETAILER_NAMES = {
  bowdens: "Bowden's Own",
  autobarn: 'Auto Barn',
  repco: 'Repco',
  supercheap: 'Supercheap Auto',
  autopro: 'Autopro',
};
