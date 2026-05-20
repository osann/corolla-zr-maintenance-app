  // ─── Backend ─────────────────────────────────────
  const BACKEND_URL  = '__BACKEND_URL__';
  const BUILD_DATE   = '__BUILD_DATE__';
  let syncEnabled        = false;
  let syncEmail          = null;
  let ticktickIsConnected = false;
  let lastSyncedAt  = null;
  const AUTH_CACHE_KEY = 'corolla-auth-v1';

  // ─── Storage helpers ─────────────────────────────
  const hasStorage = typeof window.storage !== 'undefined';

  async function storageGet(key) {
    if (hasStorage) {
      try { const r = await window.storage.get(key); return r && r.value ? JSON.parse(r.value) : null; }
      catch(e) { return null; }
    } else {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
      catch(e) { return null; }
    }
  }
  async function storageSet(key, val) {
    if (hasStorage) {
      try { await window.storage.set(key, JSON.stringify(val)); } catch(e) {}
    } else {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
    }
  }

  async function syncPush(key, value) {
    if (!syncEnabled || !BACKEND_URL || BACKEND_URL.startsWith('__')) return;
    try {
      await fetch(`${BACKEND_URL}/api/sync/${encodeURIComponent(key)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
        signal: AbortSignal.timeout(8000),
      });
      lastSyncedAt = new Date();
      updateFooterSync();
    } catch {}
  }

  function updateFooterVersion() {
    const el = document.getElementById('footer-version');
    if (!el) return;
    el.textContent = BUILD_DATE.startsWith('__') ? '' : `Updated ${BUILD_DATE}`;
  }

  function updateFooterSync() {
    const el = document.getElementById('footer-sync');
    if (!el) return;
    if (syncEnabled && lastSyncedAt) {
      const t = lastSyncedAt.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });
      el.textContent = `Synced · ${t}`;
    } else if (syncEnabled) {
      el.textContent = 'Synced';
    } else {
      el.textContent = 'Local only — sign in to sync across devices';
    }
  }

  // ─── Checklist ───────────────────────────────────
  const CHECKLIST_KEY    = 'corolla-detailing-app-v4'; // v4: legacy positional IDs
  const CHECKLIST_V2_KEY = 'corolla-checklist-v2';     // v2: slug-keyed, used for migration only
  const CHECKLIST_V3_KEY = 'corolla-checklist-v3';     // v3: phases array with tag + title

  // Full product catalog — all phase 1–4 items + phase 0 extras available for the dropdown
  const CATALOG = [
    // Phase 1
    { slug: 'nanolicious-wash-pack-ultimate', name: 'Nanolicious Wash Pack Ultimate',       desc: 'Includes Nanolicious, Wash Pad for Shags, Big Green Sucker, Boss Gloss 125ml',                                    price: 95  },
    { slug: 'wet-dreams-pack',                name: 'Wet Dreams Pack',                       desc: 'Hydrophobic spray sealant — apply to wet car post-rinse every wash',                                              price: 54  },
    { slug: '2-bucket-wash-kit',              name: '2 Bucket Wash Kit',                     desc: 'Two 15L buckets + Great Barrier Thingy grit guards',                                                              price: 55  },
    { slug: 'boss-gloss-770ml',               name: 'Boss Gloss 770ml',                      desc: 'Drying aid, quick detailer, clay bar lubricant',                                                                  price: 23  },
    { slug: 'naked-glass-500ml',              name: 'Naked Glass 500ml',                     desc: 'Ammonia-free, tint-safe glass cleaner',                                                                           price: 17  },
    { slug: 'inta-mitt',                      name: 'Inta-Mitt',                             desc: 'Purpose-built dual-sided glass cleaning mitt with flat profile for windscreen corners',                           price: 22  },
    { slug: 'karcher-k2',                     name: 'Kärcher K2 Premium Pressure Washer',    desc: '1750 PSI · 6.2L/min · Kärcher K-series adapter compatible out-of-box with Snow Blow Cannon',                    price: 189 },
    { slug: 'snow-blow-cannon',               name: "Bowden's Own Snow Blow Cannon",         desc: 'Brass fittings, 1L anti-tip bottle, top air adjustment knob',                                                     price: 99  },
    { slug: 'snow-job-1l',                    name: 'Snow Job 1L',                           desc: 'Pre-wash snow foam — use before every contact wash',                                                              price: 25  },
    // Phase 2
    { slug: 'wheely-clean-v2-500ml',          name: 'Wheely Clean V2 500ml',                 desc: 'pH-neutral wheel cleaner — protects alloys from brake dust corrosion',                                           price: 22  },
    { slug: 'the-little-stiffy',              name: 'The Little Stiffy',                     desc: 'Tyre brush — stiff bristles for sidewall texture',                                                                price: 15  },
    { slug: 'the-flat-head',                  name: 'The Flat Head',                         desc: "Wheel brush for ZR's 18\" alloy barrels. Non-slip handle, knuckle protector",                                   price: 30  },
    { slug: 'fabra-cadabra-500ml',            name: 'Fabra Cadabra 500ml',                   desc: 'Solvent-free Ultrasuede cleaner — non-negotiable for ZR seat inserts',                                          price: 23  },
    { slug: 'bolp-leather-care-pack',         name: 'BOLP — Leather Care Pack',              desc: 'Leather Love + Leather Guard + Square Bear + Plush Daddy',                                                       price: 78  },
    { slug: 'fabratection',                   name: 'Fabratection',                          desc: 'Water-based protector for Ultrasuede seats, carpet floor mats, fabric headlining — apply while new',            price: 47  },
    { slug: '303-aerospace',                  name: '303 Aerospace Protectant 473ml',        desc: 'UV protection for interior plastics, dashboard, rubber/all-weather floor mats — SPF 40 equivalent. From BCF, Detailing Shed', price: 30 },
    // Phase 3
    { slug: 'pumpy-pump',                     name: 'Pumpy Pump',                            desc: "Screws into any Bowden's 5L bottle — 25ml per pump",                                                             price: 14  },
    { slug: 'nanolicious-wash-5l',            name: 'Nanolicious Wash 5L',                   desc: 'Wait for 30% off sale at Supercheap/Repco before buying',                                                        price: 68  },
    { slug: 'microfibre-wash-1l',             name: 'Microfibre Wash 1L',                    desc: 'Keeps Big Green Sucker and Inta-Mitt absorbent — never fabric softener',                                        price: 28  },
    // Phase 4
    { slug: 'plush-brush',                    name: 'Plush Brush',                           desc: 'Soft-bristle brush for Ultrasuede pile and piano black trim',                                                    price: 18  },
    { slug: 'flash-prep-500ml',               name: 'Flash Prep 500ml',                      desc: 'Required prep before Bead Machine — strips waxes, sealants, oils for proper bonding',                          price: 25  },
    { slug: 'bead-machine-500ml',             name: 'Bead Machine 500ml',                    desc: "Most protective product in Bowden's range — synthetic sealant lasting 3–6 months",                              price: 50  },
    { slug: 'big-softie-pair',                name: 'Big Softie pair (blue + orange)',        desc: 'Two cloths required for Bead Machine application + buffing. Useful as dedicated paint cloths',                  price: 32  },
    { slug: 'snow-job-5l',                    name: 'Snow Job 5L',                           desc: 'Bulk pre-wash refill — wait for 30% off sale',                                                                   price: 78  },
    { slug: 'wheely-clean-v2-5l',             name: 'Wheely Clean V2 5L',                    desc: 'Bulk wheel cleaner refill — wait for 30% off sale',                                                              price: 83  },
    // Phase 0 extras (pricing-only in default kit, available to add to any phase)
    { slug: 'shagtastic-wash-pad',            name: 'Shagtastic Wash Pad',                   desc: 'Wash pad for Nanolicious — thick shaggy microfibre',                                                             price: 0   },
    { slug: 'happy-ending-cannon-bottle',     name: 'Happy Ending Cannon Bottle',            desc: 'Snow foam cannon bottle sized for Happy Ending formula',                                                          price: 0   },
    { slug: 'the-chubby-wheel-brush-v2',      name: 'The Chubby Wheel Brush V2',             desc: 'Wheel spoke and barrel brush',                                                                                    price: 0   },
    { slug: 'naked-inta-mitt-pack',           name: 'Naked Inta-Mitt Glass Cleaning Pack',   desc: 'Naked Glass + Inta-Mitt bundle',                                                                                  price: 0   },
    { slug: 'twisted-pro-sucker',             name: 'Twisted Pro Sucker Drying Towel',       desc: 'Plush twisted-loop drying towel',                                                                                 price: 0   },
    { slug: 'leather-love-v2-500ml',          name: 'Leather Love V2 500ml',                 desc: 'Leather cleaner — sold individually (also in BOLP pack)',                                                        price: 0   },
    { slug: 'the-square-bear',                name: 'The Square Bear Interior Applicator',   desc: 'Interior applicator pad for leather and trim',                                                                    price: 0   },
    { slug: 'the-big-green-sucker',           name: 'The Big Green Sucker Drying Towel',     desc: 'Waffle-weave drying towel (also in Nanolicious Wash Pack)',                                                      price: 0   },
    { slug: 'leather-guard-500ml',            name: 'Leather Guard 500ml',                   desc: 'Leather protectant — sold individually (also in BOLP pack)',                                                     price: 0   },
    { slug: 'plush-daddy',                    name: 'Plush Daddy Interior Microfibre',       desc: 'Interior microfibre cloth for leather and trim',                                                                  price: 0   },
    { slug: 'wet-dreams-770ml',               name: 'Wet Dreams Sealant 770ml',              desc: 'Hydrophobic spray sealant — larger 770ml bottle',                                                                 price: 0   },
    { slug: 'happy-ending-1l',               name: 'Happy Ending Foam 1L',                  desc: 'Post-wash finishing foam — seals and protects',                                                                   price: 0   },
    { slug: 'wheely-clean-770ml',             name: 'Wheely Clean 770ml',                    desc: 'Wheel cleaner 770ml (Supercheap size)',                                                                           price: 0   },
    { slug: 'naked-glass-770ml',              name: 'Naked Glass 770ml',                     desc: 'Glass cleaner 770ml (Supercheap size)',                                                                           price: 0   },
    { slug: 'little-chubby-v2',              name: 'Little Chubby Brush V2',                desc: 'Small barrel and spoke detailing brush',                                                                          price: 0   },
    { slug: 'nanolicious-shag-pack',          name: 'Nanolicious Shag Pack',                 desc: 'Nanolicious Wash + Shagtastic wash pad bundle',                                                                   price: 0   },
    { slug: 'the-essentials-starters-kit',   name: 'The Essentials Starters Kit',           desc: 'Entry-level starter kit bundle',                                                                                  price: 0   },
    { slug: 'microfibre-bucket-lid',          name: 'Microfibre Bucket With Lid',            desc: 'Dedicated microfibre washing bucket',                                                                             price: 0   },
    { slug: 'orange-agent-500ml',             name: 'Orange Agent 500ml',                    desc: 'All-purpose citrus-based cleaner and degreaser',                                                                  price: 0   },
    { slug: 'debugger-cloth',                 name: 'Debugger Cloth',                        desc: 'Glass cleaning cloth',                                                                                            price: 0   },
    { slug: 'wet-dreams-5l',                  name: 'Wet Dreams Sealant 5L',                 desc: 'Hydrophobic spray sealant — 5L bulk',                                                                             price: 0   },
    { slug: 'boss-gloss-5l',                  name: 'Boss Gloss 5L',                         desc: 'Detailing spray — 5L bulk',                                                                                       price: 0   },
    { slug: 'boss-gloss-pack',                name: 'Boss Gloss Pack',                       desc: 'Boss Gloss bundle pack',                                                                                          price: 0   },
    { slug: 'happy-ending-5l',               name: 'Happy Ending Foam 5L',                  desc: 'Post-wash finishing foam — 5L bulk',                                                                              price: 0   },
  ];

  // ─── Routines ─────────────────────────────────────
  const ROUTINES_KEY = 'corolla-routines-v1';

  const PRODUCT_ACTIONS = {
    'nanolicious-wash-pack-ultimate': 'Two-bucket contact wash, top to bottom, straight strokes',
    'wet-dreams-pack':                'Spray onto wet car, dwell 20–30 sec, gentle rinse',
    'wet-dreams-770ml':               'Spray onto wet car, dwell 20–30 sec, gentle rinse',
    'wet-dreams-5l':                  'Spray onto wet car, dwell 20–30 sec, gentle rinse',
    'boss-gloss-770ml':               'Mist on panel, buff off with clean microfibre',
    'boss-gloss-5l':                  'Mist on panel, buff off with clean microfibre',
    'boss-gloss-pack':                'Mist on panel, buff off with clean microfibre',
    'naked-glass-500ml':              'Two-side technique — one side per panel, flip cloth',
    'naked-glass-770ml':              'Two-side technique — one side per panel, flip cloth',
    'inta-mitt':                      'Wipe interior windscreen and all windows, flip mitt each panel',
    'snow-job-1l':                    'Apply via foam cannon, dwell 2–4 min, rinse top to bottom',
    'snow-job-5l':                    'Apply via foam cannon, dwell 2–4 min, rinse top to bottom',
    'wheely-clean-v2-500ml':          'Spray on wheels, agitate with Flat Head + Little Stiffy, rinse',
    'wheely-clean-v2-5l':             'Spray on wheels, agitate with Flat Head + Little Stiffy, rinse',
    'wheely-clean-770ml':             'Spray on wheels, agitate with Flat Head + Little Stiffy, rinse',
    'the-little-stiffy':              'Agitate wheel barrels, spokes, and around lug nuts',
    'the-flat-head':                  'Clean wheel face and around lug nuts with flat profile',
    'fabra-cadabra-500ml':            'Spray on Ultrasuede, agitate with Plush Brush, blot with Plush Daddy',
    'plush-brush':                    'Agitate fabric surfaces using circular then straight strokes',
    'leather-love-v2-500ml':          'Apply via Square Bear in sections — seats, wheel, gear knob, doors',
    'the-square-bear':                'Apply product in overlapping passes, flip pad between sections',
    'bolp-leather-care-pack':         'Apply Leather Love via Square Bear, follow with Leather Guard',
    'leather-guard-500ml':            'Apply thin layer after Leather Love. Buff gently when tacky',
    'plush-daddy':                    'Wipe hard plastics, console, door pulls, climate controls with damp cloth',
    'fabratection':                   'Apply to Ultrasuede after Fabra Cadabra. Buff when dry. Reapply annually or when bead test fails',
    '303-aerospace':                  'Spray on dashboard, plastic trim, rubber mats. Buff lightly. Reapply every 4–8 weeks',
    'bead-machine-500ml':             'Apply after Flash Prep. Spread thin, buff to haze, wipe off with clean microfibre',
    'flash-prep-500ml':               'Wipe panel by panel to strip old sealant and contamination before Bead Machine',
    'orange-agent-500ml':             'Dilute 1:10, spray on soiled surfaces, agitate, rinse thoroughly',
    'the-big-green-sucker':           'Dry top to bottom in long sweeping passes',
    'twisted-pro-sucker':             'Dry top to bottom in long sweeping passes',
    'happy-ending-cannon-bottle':     'Apply foam onto wet car, dwell 30 sec, gentle low-pressure rinse',
    'happy-ending-1l':                'Apply foam onto wet car, dwell 30 sec, gentle low-pressure rinse',
    'happy-ending-5l':                'Apply foam onto wet car, dwell 30 sec, gentle low-pressure rinse',
    'microfibre-wash-1l':             'Machine-wash on cold, no fabric softener. Air dry or low heat',
  };

  const DEFAULT_ROUTINES = [
    {
      id: 'routine-exterior',
      name: 'Full Exterior Wash',
      subtext: 'Follow this sequence every wash. Order matters — steps done out of sequence re-contaminate surfaces already cleaned.',
      types: ['exterior'],
      steps: [
        { name: 'Pre-rinse',        action: 'Dislodge loose grit before any product contact', products: [] },
        { name: 'Wheel clean',      action: 'Spray wheels, agitate with Flat Head + Little Stiffy, rinse', products: [{ name: 'Wheely Clean V2 500ml', ml: null }, { name: 'The Flat Head', ml: null }, { name: 'The Little Stiffy', ml: null }] },
        { name: 'Pre-wash foam',    action: 'Apply via foam cannon, dwell 2–4 min, rinse top to bottom', products: [{ name: 'Snow Job 1L', ml: null }] },
        { name: 'Contact wash',     action: 'Two-bucket method, top to bottom, straight strokes', products: [{ name: 'Nanolicious Wash Pack Ultimate', ml: null }] },
        { name: 'Sheet rinse',      action: 'Free-flow rinse, remove nozzle, top to bottom', products: [] },
        { name: 'Rinse sealant',    action: 'Spray onto wet car, dwell 20–30 sec, gentle rinse', products: [{ name: 'Wet Dreams Sealant 770ml', ml: null }] },
        { name: 'Foam rinse aid',   action: 'Apply foam onto wet car, dwell 30 sec, gentle low-pressure rinse', products: [{ name: 'Happy Ending Cannon Bottle', ml: null }] },
        { name: 'Dry',              action: 'Dry with towel — paint will be noticeably slicker', products: [{ name: 'The Big Green Sucker Drying Towel', ml: null }] },
        { name: 'Glass',            action: 'Exterior glass first, then interior windscreen', products: [{ name: 'Naked Glass 500ml', ml: null }, { name: 'Inta-Mitt', ml: null }] },
        { name: 'Quick detail',     action: 'Spot-remove any remaining water spots or fingerprints', products: [{ name: 'Boss Gloss 770ml', ml: null }] },
      ],
      alerts: [],
    },
    {
      id: 'routine-interior',
      name: 'Interior Routine',
      subtext: 'Separate from the wash. Monthly, or whenever visibly soiled.',
      types: ['interior'],
      steps: [
        { name: 'Vacuum',           action: 'Remove all grit before any liquid application — including floor mats', products: [] },
        { name: 'Upholstery clean', action: 'Clean Ultrasuede inserts in sections, blot with Plush Daddy', products: [{ name: 'Fabra Cadabra 500ml', ml: null }, { name: 'Plush Brush', ml: null }] },
        { name: 'Leather clean',    action: 'Clean leather seats, steering wheel, gear knob, doors', products: [{ name: 'Leather Love V2 500ml', ml: null }, { name: 'The Square Bear Interior Applicator', ml: null }] },
        { name: 'Hard surfaces',    action: 'Wipe hard plastics, console, door pulls, climate controls', products: [{ name: 'Plush Daddy Interior Microfibre', ml: null }] },
        { name: 'Interior glass',   action: 'Interior windscreen and all windows', products: [{ name: 'Naked Glass 500ml', ml: null }, { name: 'Inta-Mitt', ml: null }] },
        { name: 'Leather protect',  action: 'Apply protectant to leather surfaces', products: [{ name: 'Leather Guard 500ml', ml: null }, { name: 'The Square Bear Interior Applicator', ml: null }] },
        { name: 'Trim & rubber',    action: 'UV protection on dashboard, plastic trim, rubber mats', products: [{ name: '303 Aerospace Protectant 473ml', ml: null }] },
        { name: 'Fabric protect',   action: 'Reapply to Ultrasuede annually, carpet mats every 6 months', products: [{ name: 'Fabratection', ml: null }] },
      ],
      alerts: [
        { severity: 'warn', label: 'Critical', text: 'Never use the same cloth on Ultrasuede that has touched leather product. Cross-contamination is the most common cause of interior damage.' },
      ],
    },
    {
      id: 'routine-maintenance',
      name: 'Ongoing Schedule',
      subtext: '',
      types: ['maintenance'],
      steps: [
        { name: 'Full wash',             action: 'Nanolicious + Wet Dreams + dry with Big Green Sucker', products: [] },
        { name: 'Interior wipe-down',    action: 'Plush Daddy on high-touch surfaces (wheel, shifter, door pulls, screen)', products: [{ name: 'Plush Daddy Interior Microfibre', ml: null }] },
        { name: 'Deep wheel clean',      action: 'Full tyre brush clean with Wheely Clean', products: [{ name: 'Wheely Clean V2 500ml', ml: null }] },
        { name: 'Full interior detail',  action: 'Upholstery, leather clean + protect, trim', products: [{ name: 'Fabra Cadabra 500ml', ml: null }, { name: 'Leather Love V2 500ml', ml: null }, { name: 'Leather Guard 500ml', ml: null }] },
        { name: 'Trim & rubber',         action: 'Interior plastics + rubber mats. More frequent in summer', products: [{ name: '303 Aerospace Protectant 473ml', ml: null }] },
        { name: 'Tyre pressure check',   action: 'More critical for tyre life than any cleaning product', products: [] },
        { name: 'Sealant reapply',       action: 'Use Flash Prep first. When water beading flattens, time to reapply', products: [{ name: 'Flash Prep 500ml', ml: null }, { name: 'Bead Machine 500ml', ml: null }] },
        { name: 'Carpet protection',     action: "Driver's mat especially — gets the most wear", products: [{ name: 'Fabratection', ml: null }] },
        { name: 'Ultrasuede protect',    action: 'Reapply after bead test fails', products: [{ name: 'Fabratection', ml: null }] },
        { name: 'Leather protection',    action: 'Focus on bolsters and seat base — highest contact wear areas', products: [{ name: 'Leather Guard 500ml', ml: null }] },
        { name: 'Replace mitts',         action: 'If matted, stiff, or discoloured', products: [] },
      ],
      alerts: [],
    },
  ];

  let routines = JSON.parse(JSON.stringify(DEFAULT_ROUTINES));

  // ─── Maintenance ──────────────────────────────────
  const MAINTENANCE_KEY = 'corolla-maintenance-v1';

  const DEFAULT_MAINTENANCE_ITEMS = [
    { id: 'maint-tyre-pressure',  name: 'Tyre Pressure Check',        notes: '33 psi / 2.3 bar front and rear when cold', intervalType: 'time',     intervalValue: 1,    intervalUnit: 'months', intervalKm: null,  lastCompletedDate: null, lastCompletedOdometer: null, enabled: true },
    { id: 'maint-oil-level',      name: 'Engine Oil Level Check',      notes: 'Check dipstick; top up with 0W-20 if needed', intervalType: 'time',   intervalValue: 1,    intervalUnit: 'months', intervalKm: null,  lastCompletedDate: null, lastCompletedOdometer: null, enabled: true },
    { id: 'maint-washer-fluid',   name: 'Windscreen Washer Fluid',     notes: '',                                          intervalType: 'time',     intervalValue: 3,    intervalUnit: 'months', intervalKm: null,  lastCompletedDate: null, lastCompletedOdometer: null, enabled: true },
    { id: 'maint-cabin-filter',   name: 'Cabin Air Filter Inspection', notes: '',                                          intervalType: 'time',     intervalValue: 12,   intervalUnit: 'months', intervalKm: null,  lastCompletedDate: null, lastCompletedOdometer: null, enabled: true },
    { id: 'maint-logbook-service',name: 'Toyota Log Book Service',     notes: 'Oil change + multi-point inspection at Toyota dealer', intervalType: 'odometer', intervalValue: null, intervalUnit: null, intervalKm: 10000, lastCompletedDate: null, lastCompletedOdometer: null, enabled: true },
    { id: 'maint-tyre-rotation',  name: 'Tyre Rotation',               notes: '',                                          intervalType: 'odometer', intervalValue: null, intervalUnit: null, intervalKm: 10000, lastCompletedDate: null, lastCompletedOdometer: null, enabled: true },
    { id: 'maint-brake-fluid',    name: 'Brake Fluid Check',           notes: '',                                          intervalType: 'odometer', intervalValue: null, intervalUnit: null, intervalKm: 40000, lastCompletedDate: null, lastCompletedOdometer: null, enabled: true },
  ];

  const MAINTENANCE_CSV_TEMPLATE = `You are generating a maintenance schedule in CSV format for import into a car maintenance tracking app.

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

  const MAINTENANCE_LOG_KEY = 'corolla-maintenance-log-v1';

  let maintenanceItems = [];
  let maintenanceLog = [];
  let maintenanceDragSrc = null;

  // ─── Inventory ────────────────────────────────────
  const INVENTORY_KEY = 'corolla-inventory-v1';

  const EQUIPMENT_SLUGS = new Set([
    '2-bucket-wash-kit', 'karcher-k2', 'snow-blow-cannon',
    'the-little-stiffy', 'the-flat-head', 'pumpy-pump',
    'inta-mitt', 'plush-brush', 'big-softie-pair',
    'the-square-bear', 'shagtastic-wash-pad', 'twisted-pro-sucker',
    'the-big-green-sucker', 'the-chubby-wheel-brush-v2', 'little-chubby-v2',
    'microfibre-bucket-lid', 'happy-ending-cannon-bottle',
    'the-essentials-starters-kit', 'debugger-cloth', 'naked-inta-mitt-pack',
    'plush-daddy',
  ]);

  const INVENTORY_DEFAULTS = {
    'nanolicious-wash-pack-ultimate': { volumeMl: 500,  usagePerWashMl: 25  },
    'nanolicious-wash-5l':            { volumeMl: 5000, usagePerWashMl: 25  },
    'nanolicious-shag-pack':          { volumeMl: 500,  usagePerWashMl: 25  },
    'wet-dreams-pack':                { volumeMl: 500,  usagePerWashMl: 20  },
    'wet-dreams-770ml':               { volumeMl: 770,  usagePerWashMl: 20  },
    'wet-dreams-5l':                  { volumeMl: 5000, usagePerWashMl: 20  },
    'boss-gloss-770ml':               { volumeMl: 770,  usagePerWashMl: 10  },
    'boss-gloss-5l':                  { volumeMl: 5000, usagePerWashMl: 10  },
    'boss-gloss-pack':                { volumeMl: 770,  usagePerWashMl: 10  },
    'naked-glass-500ml':              { volumeMl: 500,  usagePerWashMl: 10  },
    'naked-glass-770ml':              { volumeMl: 770,  usagePerWashMl: 10  },
    'naked-inta-mitt-pack':           { volumeMl: 500,  usagePerWashMl: 10  },
    'snow-job-1l':                    { volumeMl: 1000, usagePerWashMl: 50  },
    'snow-job-5l':                    { volumeMl: 5000, usagePerWashMl: 50  },
    'wheely-clean-v2-500ml':          { volumeMl: 500,  usagePerWashMl: 20  },
    'wheely-clean-v2-5l':             { volumeMl: 5000, usagePerWashMl: 20  },
    'wheely-clean-770ml':             { volumeMl: 770,  usagePerWashMl: 20  },
    'fabra-cadabra-500ml':            { volumeMl: 500,  usagePerWashMl: 15  },
    'fabratection':                   { volumeMl: 500,  usagePerWashMl: 15  },
    '303-aerospace':                  { volumeMl: 473,  usagePerWashMl: 10  },
    'microfibre-wash-1l':             { volumeMl: 1000, usagePerWashMl: 30  },
    'flash-prep-500ml':               { volumeMl: 500,  usagePerWashMl: 50  },
    'bead-machine-500ml':             { volumeMl: 500,  usagePerWashMl: 50  },
    'leather-love-v2-500ml':          { volumeMl: 500,  usagePerWashMl: 15  },
    'leather-guard-500ml':            { volumeMl: 500,  usagePerWashMl: 10  },
    'orange-agent-500ml':             { volumeMl: 500,  usagePerWashMl: 20  },
    'happy-ending-1l':                { volumeMl: 1000, usagePerWashMl: 50  },
    'happy-ending-5l':                { volumeMl: 5000, usagePerWashMl: 50  },
    'bolp-leather-care-pack':         { volumeMl: 1000, usagePerWashMl: 25  },
  };

  // Maps bundle slugs → ordered component definitions.
  // Components with a slug are looked up in INVENTORY_DEFAULTS for volume/usage defaults.
  // Components without a slug (inline) use the values defined here; their state is stored
  // under a composite key `bundleSlug:component-name-normalised`.
  const BUNDLE_COMPONENTS = {
    'nanolicious-wash-pack-ultimate': [
      { name: 'Nanolicious Wash (500ml)',  volumeMl: 500,  usagePerWashMl: 25  },
      { slug: 'shagtastic-wash-pad',       name: 'Shagtastic Wash Pad',         equipment: true },
      { slug: 'the-big-green-sucker',      name: 'The Big Green Sucker',        equipment: true },
      { name: 'Boss Gloss (125ml)',         volumeMl: 125,  usagePerWashMl: 10  },
    ],
    'nanolicious-shag-pack': [
      { name: 'Nanolicious Wash (500ml)',  volumeMl: 500,  usagePerWashMl: 25  },
      { slug: 'shagtastic-wash-pad',       name: 'Shagtastic Wash Pad',         equipment: true },
    ],
    'wet-dreams-pack': [
      { slug: 'wet-dreams-770ml',          name: 'Wet Dreams Sealant (770ml)' },
      { name: 'Big Softie (orange)',        equipment: true },
    ],
    'naked-inta-mitt-pack': [
      { slug: 'naked-glass-500ml',         name: 'Naked Glass (500ml)' },
      { slug: 'inta-mitt',                 name: 'Inta-Mitt',                   equipment: true },
    ],
    'boss-gloss-pack': [
      { slug: 'boss-gloss-770ml',          name: 'Boss Gloss (770ml)' },
    ],
    'bolp-leather-care-pack': [
      { slug: 'leather-love-v2-500ml',     name: 'Leather Love V2 (500ml)' },
      { slug: 'leather-guard-500ml',       name: 'Leather Guard (500ml)' },
      { slug: 'plush-daddy',               name: 'Plush Daddy',                 equipment: true },
      { slug: 'the-square-bear',           name: 'The Square Bear',             equipment: true },
    ],
    '2-bucket-wash-kit': [
      { name: 'Wash Bucket (15L)',          equipment: true },
      { name: 'Rinse Bucket (15L)',         equipment: true },
      { name: 'Great Barrier Thingy (×2)', equipment: true },
    ],
    'the-essentials-starters-kit': [
      { name: 'Wash Bucket (15L)',          equipment: true },
      { name: 'Rinse Bucket (15L)',         equipment: true },
      { name: 'Great Barrier Thingy (×2)', equipment: true },
      { slug: 'microfibre-bucket-lid',     name: 'Microfibre Bucket With Lid',  equipment: true },
      { name: 'Nanolicious Wash (500ml)',  volumeMl: 500,  usagePerWashMl: 25  },
      { slug: 'shagtastic-wash-pad',       name: 'Shagtastic Wash Pad',         equipment: true },
      { slug: 'wet-dreams-770ml',          name: 'Wet Dreams Sealant (770ml)' },
      { slug: 'boss-gloss-770ml',          name: 'Boss Gloss (770ml)' },
      { slug: 'twisted-pro-sucker',        name: 'Twisted Pro Sucker',          equipment: true },
      { slug: 'microfibre-wash-1l',        name: 'Microfibre Wash (1L)' },
    ],
  };

  let inventoryState = {}; // { [slug]: { purchaseDate, volumeMl, usagePerWashMl, remainingMl, manualOverride } }

  // Default phases — id order matches original HTML for v4/v2 → v3 migration
  const DEFAULT_PHASES = [
    { id: '1', tag: 'Phase 1 · foundation',                tag2: '', title: 'Wash, dry, glass, sealant, pre-wash',   items: ['nanolicious-wash-pack-ultimate','wet-dreams-pack','2-bucket-wash-kit','boss-gloss-770ml','naked-glass-500ml','inta-mitt','karcher-k2','snow-blow-cannon','snow-job-1l'] },
    { id: '2', tag: 'Phase 2 · complete exterior + interior', tag2: '', title: 'Wheels, tyres, leather, Ultrasuede', items: ['wheely-clean-v2-500ml','the-little-stiffy','the-flat-head','fabra-cadabra-500ml','bolp-leather-care-pack','fabratection','303-aerospace'] },
    { id: '3', tag: 'Phase 3 · daily-use bulk',             tag2: '', title: 'Cheaper washes, microfibre care',       items: ['pumpy-pump','nanolicious-wash-5l','microfibre-wash-1l'] },
    { id: '4', tag: 'Phase 4 · full bulk + base sealant',   tag2: '', title: 'Long-term preservation',                items: ['plush-brush','flash-prep-500ml','bead-machine-500ml','big-softie-pair','snow-job-5l','wheely-clean-v2-5l'] },
  ].map(({ tag2, ...p }) => p); // strip the dummy tag2 field (alignment hack)

  let itemData = []; // rebuilt by renderChecklist()
  let checklistState = { phases: DEFAULT_PHASES.map(p => ({ ...p, items: [...p.items] })), nextId: 5, checked: {} };
  const editingPhases = new Set();

  function getPhaseName(id) {
    const p = checklistState.phases.find(p => p.id === id);
    return p ? p.title : `Phase ${id}`;
  }

  function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function loadChecklist() {
    let saved = await storageGet(CHECKLIST_V3_KEY);
    if (!saved) {
      // Try migrating from v2
      const v2 = await storageGet(CHECKLIST_V2_KEY);
      if (v2 && v2.config) {
        const phases = DEFAULT_PHASES.map(p => ({
          ...p, items: [...(v2.config[p.id] || p.items)],
        }));
        saved = { phases, nextId: 5, checked: v2.checked || {} };
        await storageSet(CHECKLIST_V3_KEY, saved);
      } else {
        // Try migrating from v4 (positional IDs)
        const v4 = await storageGet(CHECKLIST_KEY);
        if (v4) {
          const allSlugs = DEFAULT_PHASES.flatMap(p => p.items);
          const checked = {};
          Object.entries(v4).forEach(([id, val]) => {
            const idx = parseInt(id.replace('item-', ''), 10);
            if (!isNaN(idx) && allSlugs[idx]) checked[allSlugs[idx]] = val;
          });
          saved = { phases: DEFAULT_PHASES.map(p => ({ ...p, items: [...p.items] })), nextId: 5, checked };
          await storageSet(CHECKLIST_V3_KEY, saved);
        }
      }
    }
    checklistState = saved
      ? { phases: saved.phases || DEFAULT_PHASES.map(p => ({ ...p, items: [...p.items] })), nextId: saved.nextId || 5, checked: saved.checked || {} }
      : { phases: DEFAULT_PHASES.map(p => ({ ...p, items: [...p.items] })), nextId: 5, checked: {} };
    renderChecklist();
    recompute();
  }

  async function saveChecklist() {
    const today = new Date().toISOString().split('T')[0];
    // Record purchase date for newly-checked items
    itemData.forEach(item => {
      const wasChecked = checklistState.checked[item.slug];
      const nowChecked = item.input.checked;
      if (!wasChecked && nowChecked) {
        if (!inventoryState[item.slug]) inventoryState[item.slug] = {};
        if (!inventoryState[item.slug].purchaseDate) {
          inventoryState[item.slug].purchaseDate = today;
        }
      }
    });

    itemData.forEach(item => { checklistState.checked[item.slug] = item.input.checked; });

    // Auto-archive phases where every item is checked
    const completedPhases = checklistState.phases.filter(phase =>
      phase.items.length > 0 && phase.items.every(slug => checklistState.checked[slug])
    );
    for (const phase of completedPhases) {
      // Ensure purchase dates are set for all items in the completed phase
      for (const slug of phase.items) {
        if (!inventoryState[slug]) inventoryState[slug] = {};
        if (!inventoryState[slug].purchaseDate) inventoryState[slug].purchaseDate = today;
      }
      showInvToast(`${phase.title} complete — items moved to Inventory`);
    }
    const didArchive = completedPhases.length > 0;
    if (didArchive) {
      const completedIds = new Set(completedPhases.map(p => p.id));
      checklistState.phases = checklistState.phases.filter(p => !completedIds.has(p.id));
    }

    await storageSet(CHECKLIST_V3_KEY, checklistState);
    syncPush(CHECKLIST_V3_KEY, checklistState);

    if (Object.keys(inventoryState).length > 0) {
      await storageSet(INVENTORY_KEY, inventoryState);
      syncPush(INVENTORY_KEY, inventoryState);
    }

    if (didArchive) {
      renderChecklist();
      recompute();
    }
    renderInventory();
  }

  function createPhaseEl(phase) {
    const isEditing = editingPhases.has(phase.id);
    const div = document.createElement('div');
    div.className = 'phase' + (isEditing ? ' phase--editing' : '');
    div.dataset.phase = phase.id;
    div.innerHTML = `
      <div class="phase-head">
        <div class="phase-head-left">
          ${isEditing
            ? `<input class="phase-tag-input" data-phase="${phase.id}" value="${escHtml(phase.tag)}" placeholder="Phase label">`
            : `<div class="phase-tag">${escHtml(phase.tag)}</div>`}
          ${isEditing
            ? `<input class="phase-title-input" data-phase="${phase.id}" value="${escHtml(phase.title)}" placeholder="Phase title">`
            : `<h2 class="phase-title">${escHtml(phase.title)}</h2>`}
        </div>
        <div class="phase-head-right">
          <span class="phase-status" data-phase-status="${phase.id}">0 of ${phase.items.length}</span>
          <button class="phase-edit-btn" data-phase="${phase.id}" type="button">${isEditing ? 'Done' : 'Edit'}</button>
        </div>
      </div>
      <div class="phase-items" id="phase-items-${phase.id}"></div>
      <div class="phase-edit-panel" id="phase-edit-${phase.id}" ${isEditing ? '' : 'hidden'}>
        <div class="phase-edit-add">
          <select class="phase-edit-select" id="phase-edit-select-${phase.id}">
            <option value="">— add a product —</option>
          </select>
          <button class="phase-edit-add-btn" data-phase="${phase.id}" type="button">Add</button>
        </div>
        <button class="phase-delete-btn" data-phase="${phase.id}" type="button">Delete phase</button>
      </div>
    `;
    return div;
  }

  function renderChecklist() {
    itemData = [];
    const container = document.getElementById('phases-container');
    if (!container) return;
    container.innerHTML = '';

    checklistState.phases.forEach(phase => {
      const phaseEl = createPhaseEl(phase);
      container.appendChild(phaseEl);
      const itemsContainer = phaseEl.querySelector('.phase-items');

      phase.items.forEach(slug => {
        const entry = CATALOG.find(c => c.slug === slug);
        if (!entry) return;
        const checked = checklistState.checked[slug] || false;
        const live = slugToBest[slug];
        let priceText;
        if (live) {
          priceText = `$${(live.priceCents / 100).toFixed(2)} · ${RETAILER_NAMES[live.retailer] || live.retailer}`;
        } else if (entry.price > 0) {
          priceText = `~$${entry.price}`;
        } else {
          priceText = '—';
        }
        const label = document.createElement('label');
        label.className = 'item';
        label.dataset.price = String(entry.price);
        label.dataset.slug = slug;
        label.innerHTML = `
          <input type="checkbox"${checked ? ' checked' : ''}>
          <div>
            <div class="item-name">${escHtml(entry.name)}</div>
            ${entry.desc ? `<div class="item-desc">${escHtml(entry.desc)}</div>` : ''}
          </div>
          <div class="item-price">${priceText}</div>
          <button class="item-remove" type="button" title="Remove from phase">×</button>
        `;
        const input = label.querySelector('input');
        input.addEventListener('change', () => { recompute(); saveChecklist(); });
        label.querySelector('.item-remove').addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          removeFromPhase(phase.id, slug);
        });
        itemsContainer.appendChild(label);
        itemData.push({
          slug, el: label, input,
          price: live ? Math.round(live.priceCents / 100) : entry.price,
          phase: phase.id,
          name: entry.name,
        });
      });
      updatePhaseEditDropdown(phase.id);
    });
    applyPrefs();
  }

  function updatePhaseEditDropdown(phaseId) {
    const select = document.getElementById(`phase-edit-select-${phaseId}`);
    if (!select) return;
    const phase = checklistState.phases.find(p => p.id === phaseId);
    const inPhase = new Set(phase ? phase.items : []);
    const prev = select.value;
    select.innerHTML = '<option value="">— add a product —</option>';
    CATALOG.forEach(entry => {
      if (inPhase.has(entry.slug)) return;
      const opt = document.createElement('option');
      opt.value = entry.slug;
      opt.textContent = entry.name;
      select.appendChild(opt);
    });
    if (prev && !inPhase.has(prev)) select.value = prev;
  }

  function addToPhase(phaseId, slug) {
    const phase = checklistState.phases.find(p => p.id === phaseId);
    if (!phase || phase.items.includes(slug)) return;
    phase.items.push(slug);
    saveChecklist();
    renderChecklist();
    recompute();
  }

  function removeFromPhase(phaseId, slug) {
    const phase = checklistState.phases.find(p => p.id === phaseId);
    if (!phase) return;
    phase.items = phase.items.filter(s => s !== slug);
    delete checklistState.checked[slug];
    saveChecklist();
    renderChecklist();
    recompute();
  }

  function addPhase() {
    const id = String(checklistState.nextId++);
    checklistState.phases.push({ id, tag: `Phase ${checklistState.phases.length}`, title: 'New phase', items: [] });
    editingPhases.add(id);
    saveChecklist();
    renderChecklist();
    recompute();
    setTimeout(() => {
      const el = document.querySelector(`[data-phase="${id}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const titleInput = document.querySelector(`.phase-title-input[data-phase="${id}"]`);
      if (titleInput) { titleInput.select(); }
    }, 50);
  }

  function deletePhase(phaseId) {
    const phase = checklistState.phases.find(p => p.id === phaseId);
    if (!phase) return;
    if (phase.items.length > 0 && !confirm(`Delete "${phase.title}" and remove its ${phase.items.length} item(s)?`)) return;
    phase.items.forEach(slug => delete checklistState.checked[slug]);
    checklistState.phases = checklistState.phases.filter(p => p.id !== phaseId);
    editingPhases.delete(phaseId);
    saveChecklist();
    renderChecklist();
    recompute();
  }

  function setupChecklist() {
    const container = document.getElementById('phases-container');
    if (container) {
      container.addEventListener('click', e => {
        const editBtn = e.target.closest('.phase-edit-btn');
        if (editBtn) {
          const id = editBtn.dataset.phase;
          if (editingPhases.has(id)) editingPhases.delete(id);
          else editingPhases.add(id);
          renderChecklist();
          return;
        }
        const addBtn = e.target.closest('.phase-edit-add-btn');
        if (addBtn) {
          const id = addBtn.dataset.phase;
          const select = document.getElementById(`phase-edit-select-${id}`);
          if (select && select.value) addToPhase(id, select.value);
          return;
        }
        const deleteBtn = e.target.closest('.phase-delete-btn');
        if (deleteBtn) { deletePhase(deleteBtn.dataset.phase); return; }
      });

      // Tag / title live edits — update state without re-rendering so inputs keep focus
      container.addEventListener('input', e => {
        if (e.target.classList.contains('phase-tag-input')) {
          const p = checklistState.phases.find(p => p.id === e.target.dataset.phase);
          if (p) { p.tag = e.target.value; saveChecklist(); }
        }
        if (e.target.classList.contains('phase-title-input')) {
          const p = checklistState.phases.find(p => p.id === e.target.dataset.phase);
          if (p) { p.title = e.target.value; saveChecklist(); }
        }
      });
    }

    const addPhaseBtn = document.getElementById('add-phase-btn');
    if (addPhaseBtn) addPhaseBtn.addEventListener('click', addPhase);
  }

  function recompute() {
    let done = 0, spent = 0, total = 0;
    const byPhase = {};
    itemData.forEach(item => {
      total += item.price;
      if (!byPhase[item.phase]) byPhase[item.phase] = { done: 0, count: 0, spent: 0, total: 0 };
      byPhase[item.phase].count++;
      byPhase[item.phase].total += item.price;
      if (item.input.checked) {
        item.el.classList.add('done');
        done++; spent += item.price;
        byPhase[item.phase].done++;
        byPhase[item.phase].spent += item.price;
      } else {
        item.el.classList.remove('done');
      }
    });
    Object.keys(byPhase).forEach(p => {
      const el = document.querySelector(`[data-phase-status="${p}"]`);
      if (!el) return;
      const { done, count } = byPhase[p];
      if (done === count) { el.textContent = 'Complete'; el.classList.add('done'); }
      else { el.textContent = `${done} of ${count}`; el.classList.remove('done'); }
    });
    renderSpendPanel(spent, total);
  }

  function resetAll() {
    if (!confirm('Reset all purchases?')) return;
    checklistState.checked = {};
    itemData.forEach(item => { item.input.checked = false; });
    recompute(); saveChecklist();
  }

  // ─── Spend panel ─────────────────────────────────
  const BUDGET_KEY = 'corolla-budget-v1';
  let budgetTarget = 0;
  let liveProducts = [];
  let slugToBest = {};
  let priceHistories = {}; // productId → [{ retailer, priceCents, onSale, observedAt }, ...]

  async function loadBudget() {
    const b = await storageGet(BUDGET_KEY);
    if (b && b.target) {
      budgetTarget = b.target;
      document.getElementById('budget-target').value = budgetTarget;
    }
  }

  async function saveBudget() {
    const val = parseInt(document.getElementById('budget-target').value, 10);
    if (isNaN(val) || val < 0) return;
    budgetTarget = val;
    await storageSet(BUDGET_KEY, { target: val });
    syncPush(BUDGET_KEY, { target: val });
    recompute();
    document.getElementById('budget-status').textContent = 'Saved ✓';
    setTimeout(() => { document.getElementById('budget-status').textContent = ''; }, 2000);
  }

  function renderSpendPanel(spent, total) {
    // Summary
    document.getElementById('sp-spent').textContent = spent;
    document.getElementById('sp-remain').textContent = total - spent;
    document.getElementById('sp-total').textContent = total;

    // Budget bar
    if (budgetTarget > 0) {
      const pct = Math.min(100, Math.round((spent / budgetTarget) * 100));
      document.getElementById('budget-bar').style.width = pct + '%';
      document.getElementById('budget-bar').style.background = pct >= 100 ? 'var(--danger)' : 'var(--accent)';
      document.getElementById('budget-bar-label').textContent =
        pct >= 100
          ? `$${spent - budgetTarget} over budget`
          : `$${spent} of $${budgetTarget} budget used (${pct}%)`;
    } else {
      document.getElementById('budget-bar').style.width = Math.round((spent / total) * 100) + '%';
      document.getElementById('budget-bar-label').textContent = `$${spent} of $${total} total kit cost`;
    }

    renderPriceList();
  }

  function renderPriceList() {
    const container = document.getElementById('price-list');
    if (!container) return;

    const byPhase = {};
    itemData.forEach(item => {
      if (!byPhase[item.phase]) byPhase[item.phase] = [];
      byPhase[item.phase].push(item);
    });

    const hasLive = Object.keys(slugToBest).length > 0;
    container.innerHTML = '';

    Object.keys(byPhase).sort().forEach(p => {
      const card = document.createElement('div');
      card.className = 'phase-spend-card';

      const rows = byPhase[p].map(item => {
        const live = item.slug ? slugToBest[item.slug] : null;
        const price = live ? `$${(live.priceCents / 100).toFixed(2)}` : `$${item.price}`;
        const retailerName = live ? (RETAILER_NAMES[live.retailer] || live.retailer) : '';
        const url = live?.url || null;
        const onSale = live?.onSale || false;
        const bought = item.input.checked;
        const saleTag = onSale ? '<span class="price-on-sale">Sale</span>' : '';
        const linkEl = url
          ? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="price-row-link">Buy →</a>`
          : '<span class="price-row-link-none"></span>';
        const history = live?.id !== undefined ? (priceHistories[live.id] ?? []) : [];
        const sparkline = history.length ? buildSparklineSVG(history, live.retailer) : '';

        return `
          <div class="price-row${bought ? ' bought' : ''}">
            <span class="price-row-name">${item.name}</span>
            <div class="price-row-right">
              <div class="price-row-amount">${price}${saleTag}</div>
              <div class="price-row-meta">${retailerName}</div>
              ${sparkline}
            </div>
            ${linkEl}
          </div>`;
      }).join('');

      card.innerHTML = `
        <div class="phase-spend-head">
          <div class="phase-spend-name">${getPhaseName(p)}</div>
          ${!hasLive ? '<div class="price-list-stale">Prices unavailable</div>' : ''}
        </div>
        ${rows}
      `;
      container.appendChild(card);
    });
  }

  function renderPricesTab() {
    const container = document.getElementById('prices-list');
    if (!container) return;

    const PRICE_CATEGORIES = [
      {
        label: 'Equipment',
        sections: [
          { label: 'Microfibre', slugs: ['debugger-cloth', 'inta-mitt', 'plush-daddy', 'big-softie-pair', 'the-square-bear'] },
          { label: 'Wash Pads', slugs: ['shagtastic-wash-pad'] },
          { label: 'Drying Towels', slugs: ['twisted-pro-sucker', 'the-big-green-sucker'] },
          { label: 'Other', slugs: ['plush-brush', '2-bucket-wash-kit', 'microfibre-bucket-lid', 'pumpy-pump', 'microfibre-wash-1l', 'the-essentials-starters-kit'] },
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
          { label: 'Contact Wash', slugs: ['nanolicious-wash-pack-ultimate', 'nanolicious-shag-pack', 'nanolicious-wash-5l'] },
        ],
      },
      {
        label: 'Exterior Protection',
        sections: [
          { label: 'Sealant', slugs: ['bead-machine-500ml', 'wet-dreams-770ml', 'wet-dreams-5l', 'happy-ending-1l', 'happy-ending-5l', 'wet-dreams-pack'] },
          { label: 'Quick Detailer', slugs: ['boss-gloss-770ml', 'boss-gloss-5l', 'boss-gloss-pack'] },
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
          { label: 'Equipment', slugs: ['little-chubby-v2', 'the-little-stiffy', 'the-flat-head', 'the-chubby-wheel-brush-v2'] },
          { label: 'Clean', slugs: ['wheely-clean-v2-500ml', 'wheely-clean-770ml', 'wheely-clean-v2-5l'] },
          { label: 'Protect', slugs: [] },
        ],
      },
    ];

    const productBySlug = Object.fromEntries(liveProducts.map(p => [p.slug, p]));

    function renderProducts(slugs) {
      let html = '';
      for (const slug of slugs) {
        const product = productBySlug[slug];
        if (!product) continue;
        const retailers = Object.entries(product.latestPrice ?? {});
        if (retailers.length === 0) continue;
        const history = priceHistories[product.id] ?? [];
        let retailerRows = '';
        for (const [retailer, data] of retailers) {
          const price = `$${(data.priceCents / 100).toFixed(2)}`;
          const saleTag = data.onSale ? '<span class="price-on-sale">🔥 Sale</span>' : '';
          const retailerName = RETAILER_NAMES[retailer] || retailer;
          const url = product.urls?.[retailer] || null;
          const linkEl = url
            ? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="price-row-link">Buy →</a>`
            : '<span class="price-row-link-none"></span>';
          const sparkline = buildSparklineSVG(history, retailer)
            || '<span class="prices-no-data">No data yet.</span>';
          retailerRows += `
            <div class="prices-retailer-row">
              <span class="prices-retailer-name">${retailerName}</span>
              <div class="price-row-right">
                <div class="price-row-amount">${price}${saleTag}</div>
                ${sparkline}
              </div>
              ${linkEl}
            </div>`;
        }
        const hasAlert = !!priceAlerts[slug];
        const alertTitle = hasAlert ? 'Alert set — click to edit' : 'Set price alert';
        html += `
          <div class="prices-product">
            <div class="prices-product-name">
              ${product.name}
              ${syncEnabled ? `<button class="alert-btn${hasAlert ? ' active' : ''}" id="alert-btn-${slug}" onclick="toggleAlertForm('${slug}')" title="${alertTitle}">🔔</button>` : ''}
            </div>
            <div class="alert-inline-form" id="alert-form-${slug}" style="display:none;">
              <div class="alert-form-row">
                <div class="alert-form-inputs">
                  <span class="alert-form-label">Alert when below</span>
                  <div class="alert-threshold-wrap"><span class="alert-dollar">$</span><input type="number" class="alert-threshold-input" id="alert-threshold-${slug}" min="0.01" step="0.01" placeholder="0.00"></div>
                  <select class="alert-channel-select" id="alert-channel-${slug}">
                    <option value="global">Global setting</option>
                    <option value="ticktick">TickTick</option>
                    <option value="email">Email</option>
                  </select>
                </div>
                <div class="alert-form-actions">
                  <button class="alert-set-btn" onclick="saveAlert('${slug}')">Set</button>
                  <button class="alert-clear-btn" onclick="clearAlert('${slug}')">Clear</button>
                </div>
              </div>
            </div>
            ${retailerRows}
          </div>`;
      }
      return html;
    }

    container.innerHTML = '';
    let anyCard = false;

    for (const category of PRICE_CATEGORIES) {
      let body = '';
      let firstSec = true;
      for (const sec of category.sections) {
        const secHtml = renderProducts(sec.slugs);
        if (!secHtml) continue;
        const headClass = firstSec ? 'section-head' : 'section-head section-head--gap';
        body += `<div class="${headClass}">${sec.label}</div>${secHtml}`;
        firstSec = false;
      }
      if (!body) continue;

      const card = document.createElement('div');
      card.className = 'phase-spend-card';
      card.innerHTML = `
        <div class="phase-spend-head">
          <div class="phase-spend-name">${category.label}</div>
        </div>
        ${body}`;
      container.appendChild(card);
      anyCard = true;
    }

    if (!anyCard) {
      container.innerHTML = '<p class="prices-empty">No prices loaded yet.</p>';
    }

    renderAlertsPanel();
  }

  function renderAlertsPanel() {
    const panel = document.getElementById('prices-alerts-summary');
    if (!panel) return;

    const slugs = Object.keys(priceAlerts);
    if (slugs.length === 0) {
      panel.style.display = 'none';
      return;
    }

    const productBySlug = Object.fromEntries(liveProducts.map(p => [p.slug, p]));
    const CHANNEL_LABELS = { global: 'Global setting', ticktick: 'TickTick', email: 'Email' };

    let rows = '';
    for (const slug of slugs) {
      const alert = priceAlerts[slug];
      const name = productBySlug[slug]?.name ?? slug;
      const thresholdVal = (alert.thresholdCents / 100).toFixed(2);
      const threshold = `$${thresholdVal}`;
      const channel = CHANNEL_LABELS[alert.channel] ?? 'Global setting';
      rows += `
        <div class="alert-summary-row">
          <span class="alert-summary-name">${name}</span>
          <div class="alert-summary-view-side" id="alert-summary-view-${slug}">
            <span class="alert-summary-meta">${threshold} · ${channel}</span>
            <div class="alert-summary-actions">
              <button class="alert-clear-btn" onclick="editAlertInSummary('${slug}')">Edit</button>
              <button class="alert-clear-btn" onclick="clearAlert('${slug}')">Remove</button>
            </div>
          </div>
          <div class="alert-summary-edit-side" id="alert-summary-edit-${slug}" style="display:none;">
            <div class="alert-form-inputs">
              <div class="alert-threshold-wrap"><span class="alert-dollar">$</span><input type="number" class="alert-threshold-input" id="alert-summary-threshold-${slug}" value="${thresholdVal}" min="0.01" step="0.01"></div>
              <select class="alert-channel-select" id="alert-summary-channel-${slug}">
                <option value="global"${alert.channel === 'global' ? ' selected' : ''}>Global setting</option>
                <option value="ticktick"${alert.channel === 'ticktick' ? ' selected' : ''}>TickTick</option>
                <option value="email"${alert.channel === 'email' ? ' selected' : ''}>Email</option>
              </select>
            </div>
            <div class="alert-form-actions">
              <button class="alert-set-btn" onclick="saveAlertFromSummary('${slug}')">Save</button>
              <button class="alert-clear-btn" onclick="cancelAlertEdit('${slug}')">Cancel</button>
            </div>
          </div>
        </div>`;
    }

    panel.style.display = '';
    panel.innerHTML = `
      <div class="phase-spend-card" style="margin-bottom:16px;">
        <div class="phase-spend-head"><div class="phase-spend-name">Active alerts</div></div>
        ${rows}
      </div>`;
  }

  function editAlertInSummary(slug) {
    document.getElementById(`alert-summary-view-${slug}`).style.display = 'none';
    document.getElementById(`alert-summary-edit-${slug}`).style.display = '';
  }

  function cancelAlertEdit(slug) {
    document.getElementById(`alert-summary-edit-${slug}`).style.display = 'none';
    document.getElementById(`alert-summary-view-${slug}`).style.display = '';
  }

  async function saveAlertFromSummary(slug) {
    const inp = document.getElementById(`alert-summary-threshold-${slug}`);
    const sel = document.getElementById(`alert-summary-channel-${slug}`);
    const val = parseFloat(inp?.value ?? '');
    if (!val || val <= 0) { inp?.focus(); return; }
    priceAlerts[slug] = { thresholdCents: Math.round(val * 100), channel: sel?.value || 'global' };
    await storageSet(ALERTS_KEY, priceAlerts);
    syncPush(ALERTS_KEY, priceAlerts);
    const btn = document.getElementById(`alert-btn-${slug}`);
    if (btn) btn.title = 'Alert set — click to edit';
    renderAlertsPanel();
  }

  // ─── Wash Log ────────────────────────────────────
  const LOG_KEY = 'corolla-washlog-v1';
  let washLog = [];
  let openMenuId = null;
  let editingEntryId = null;
  let pendingEntryId = null;
  let pendingPhotos = [];
  let photosByEntryId = {};
  let lightboxEntryId = null;
  let lightboxIndex = 0;

  // Set today's date as default
  (function() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    document.getElementById('log-date').value = `${yyyy}-${mm}-${dd}`;
  })();

  // Populate routine dropdown from routines[] and re-render step chips on change
  function renderLogTypeSelect() {
    const sel = document.getElementById('log-type');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = routines.map(r =>
      `<option value="${escAttr(r.id)}">${escHtml(r.name)}</option>`
    ).join('');
    if (current && routines.find(r => r.id === current)) sel.value = current;
    renderStepChipsForRoutine(sel.value);
  }

  function renderStepChipsForRoutine(routineId) {
    const container = document.getElementById('steps-checklist');
    if (!container) return;
    const routine = routines.find(r => r.id === routineId);
    const steps = (routine?.steps ?? []).filter(s => s.enabled !== false);
    container.innerHTML = steps.map(s =>
      `<label class="step-chip"><input type="checkbox" value="${escAttr(s.product)}"> ${escHtml(s.product)}</label>`
    ).join('');
    container.querySelectorAll('.step-chip').forEach(chip => {
      chip.addEventListener('click', () => chip.classList.toggle('checked', chip.querySelector('input').checked));
      chip.querySelector('input').addEventListener('change', function() { chip.classList.toggle('checked', this.checked); });
    });
  }

  document.getElementById('log-type')?.addEventListener('change', () => {
    renderStepChipsForRoutine(document.getElementById('log-type').value);
  });

  async function loadLog() {
    const saved = await storageGet(LOG_KEY);
    washLog = Array.isArray(saved) ? saved : [];
    renderLog();
    if (syncEnabled && washLog.length) {
      await loadPhotoData(washLog.map(e => e.id));
      renderLog();
    }
  }

  async function loadPhotoData(entryIds) {
    if (!syncEnabled || !BACKEND_URL || BACKEND_URL.startsWith('__') || !entryIds.length) return;
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/photos?logEntryIds=${entryIds.join(',')}`,
        { credentials: 'include', signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) return;
      const data = await res.json();
      Object.assign(photosByEntryId, data);
    } catch {}
  }

  async function deletePhoto(photoId, entryId) {
    if (!BACKEND_URL || BACKEND_URL.startsWith('__')) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/photos/${photoId}`, {
        method: 'DELETE',
        credentials: 'include',
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      if (photosByEntryId[entryId]) {
        photosByEntryId[entryId] = photosByEntryId[entryId].filter(p => p.id !== photoId);
      }
      // Also remove from pending photos if in edit mode
      pendingPhotos = pendingPhotos.filter(p => p.id !== photoId);
      // Refresh whichever view is active
      if (editingEntryId === entryId) {
        renderPhotoPreviews();
      } else {
        renderLog();
      }
    } catch {}
  }

  function renderPhotoPreviews() {
    const container = document.getElementById('log-photo-preview');
    if (!container) return;
    if (!pendingPhotos.length) { container.innerHTML = ''; return; }
    container.innerHTML = pendingPhotos.map(p => `
      <div class="log-photo-item${p.uploading ? ' uploading' : ''}">
        <img src="${p.thumbUrl}" alt="Preview">
        ${p.uploading
          ? '<div class="log-photo-spinner"></div>'
          : `<button class="log-photo-remove" data-photo-id="${p.id}" data-preview="1" title="Remove">✕</button>`}
      </div>`).join('');
    container.querySelectorAll('.log-photo-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.log-photo-item');
        const pid  = Number(btn.dataset.photoId);
        if (item) {
          item.classList.add('removing');
          item.addEventListener('animationend', () => deletePhoto(pid, pendingEntryId ?? 0), { once: true });
        } else {
          deletePhoto(pid, pendingEntryId ?? 0);
        }
      });
    });
  }

  function setupPhotoUploadUI() {
    const input = document.getElementById('log-photo-input');
    if (!input) return;
    input.addEventListener('change', async () => {
      const files = Array.from(input.files ?? []);
      input.value = '';
      for (const file of files) {
        if (!['image/jpeg','image/png','image/webp'].includes(file.type)) continue;
        if (file.size > 10 * 1024 * 1024) continue;
        await uploadPendingPhoto(file);
      }
    });
  }

  async function uploadPendingPhoto(file) {
    if (!BACKEND_URL || BACKEND_URL.startsWith('__')) return;
    if (!pendingEntryId) pendingEntryId = Date.now();
    // Show local preview immediately while the upload is in flight
    const tempId  = `temp-${Date.now()}-${Math.random()}`;
    const localUrl = URL.createObjectURL(file);
    pendingPhotos.push({ id: tempId, thumbUrl: localUrl, originalUrl: localUrl, uploading: true });
    renderPhotoPreviews();
    const form = new FormData();
    form.append('file', file);
    form.append('logEntryId', String(pendingEntryId));
    try {
      const res = await fetch(`${BACKEND_URL}/api/photos/upload`, {
        method: 'POST',
        credentials: 'include',
        body: form,
        signal: AbortSignal.timeout(30000),
      });
      URL.revokeObjectURL(localUrl);
      if (!res.ok) {
        pendingPhotos = pendingPhotos.filter(p => p.id !== tempId);
        renderPhotoPreviews();
        return;
      }
      const data = await res.json();
      const idx = pendingPhotos.findIndex(p => p.id === tempId);
      if (idx >= 0) pendingPhotos[idx] = data; else pendingPhotos.push(data);
      renderPhotoPreviews();
    } catch {
      URL.revokeObjectURL(localUrl);
      pendingPhotos = pendingPhotos.filter(p => p.id !== tempId);
      renderPhotoPreviews();
    }
  }

  async function saveLog() {
    await storageSet(LOG_KEY, washLog);
    syncPush(LOG_KEY, washLog);
  }

  function addLogEntry() {
    const date = document.getElementById('log-date').value;
    const type = document.getElementById('log-type').value;
    const notes = document.getElementById('log-notes').value.trim();
    const steps = Array.from(document.querySelectorAll('.step-chip input:checked')).map(cb => cb.value);
    const odometerVal = +document.getElementById('log-odometer')?.value || null;

    if (!date) { alert('Please select a date.'); return; }

    if (odometerVal && odometerVal > (settings.car?.currentOdometer ?? 0)) {
      settings.car.currentOdometer = odometerVal;
      const carOdoEl = document.getElementById('car-odometer');
      if (carOdoEl) carOdoEl.value = odometerVal;
      storageSet(SETTINGS_KEY, settings);
      syncPush(SETTINGS_KEY, settings);
      renderMaintenanceUpcoming();
    }

    if (editingEntryId !== null) {
      const savedEntryId = editingEntryId;
      const idx = washLog.findIndex(e => e.id === savedEntryId);
      if (idx >= 0) washLog[idx] = { ...washLog[idx], date, type, steps, notes };
      photosByEntryId[savedEntryId] = [...pendingPhotos];
      pendingEntryId = null;
      pendingPhotos  = [];
      editingEntryId = null;
      resetLogForm();
      renderPhotoPreviews();
      saveLog();
      renderLog();
      document.querySelector('.log-sub-tab[data-log-tab="history"]')?.click();
      // Inventory: steps may have changed — remind user to check stock levels manually
      const hasInventoryItems = steps.some(stepName => {
        const routine = routines.find(r => r.id === type);
        const step = routine?.steps?.find(s => s.name === stepName);
        return step?.products?.some(({ name }) => {
          const slug = CATALOG.find(p => p.name === name)?.slug;
          return slug && !EQUIPMENT_SLUGS.has(slug) && checklistState.checked[slug];
        });
      });
      if (hasInventoryItems) showInvToast('Session edited — check Inventory if stock levels need adjusting');
      // Re-fetch from server: catches photos whose upload finished after the save click
      loadPhotoData([savedEntryId]).then(() => renderLog());
      return;
    }

    const entry = { id: pendingEntryId ?? Date.now(), date, type, steps, notes };
    pendingEntryId = null;
    pendingPhotos = [];
    renderPhotoPreviews();

    decrementInventoryForSession(entry);
    washLog.unshift(entry);
    saveLog();
    renderLog();
    resetLogForm();
    document.querySelector('.log-sub-tab[data-log-tab="history"]')?.click();
  }

  function resetLogForm() {
    document.getElementById('log-notes').value = '';
    const sel = document.getElementById('log-type');
    if (sel && sel.options.length) sel.selectedIndex = 0;
    renderStepChipsForRoutine(sel?.value ?? '');
    const submitBtn = document.getElementById('log-submit-btn');
    const cancelBtn = document.getElementById('log-cancel-btn');
    const dupeWarn  = document.getElementById('log-dupe-warn');
    if (submitBtn) submitBtn.textContent = 'Save session';
    if (cancelBtn) cancelBtn.hidden = true;
    if (dupeWarn)  dupeWarn.hidden = true;
    const editTab = document.getElementById('log-edit-tab');
    if (editTab) editTab.style.display = 'none';
    // Reset date to today
    const d = new Date();
    document.getElementById('log-date').value =
      `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const logOdoEl = document.getElementById('log-odometer');
    if (logOdoEl) logOdoEl.value = settings.car?.currentOdometer || '';
  }

  function startEditEntry(id) {
    const entry = washLog.find(e => e.id === id);
    if (!entry) return;
    editingEntryId = id;
    pendingEntryId = id;
    pendingPhotos = (photosByEntryId[id] ?? []).map(p => ({ ...p }));

    document.getElementById('log-date').value  = entry.date;
    document.getElementById('log-notes').value = entry.notes || '';
    const sel = document.getElementById('log-type');
    if (sel) sel.value = entry.type;
    renderStepChipsForRoutine(entry.type);
    document.querySelectorAll('.step-chip input').forEach(cb => {
      const checked = (entry.steps ?? []).includes(cb.value);
      cb.checked = checked;
      cb.closest('.step-chip')?.classList.toggle('checked', checked);
    });

    const submitBtn = document.getElementById('log-submit-btn');
    const cancelBtn = document.getElementById('log-cancel-btn');
    const dupeWarn  = document.getElementById('log-dupe-warn');
    if (submitBtn) submitBtn.textContent = 'Save changes';
    if (cancelBtn) cancelBtn.hidden = false;
    if (dupeWarn)  dupeWarn.hidden = true;

    const editTab = document.getElementById('log-edit-tab');
    if (editTab) { editTab.style.display = ''; editTab.click(); }
    renderPhotoPreviews();
    renderLog();
  }

  function cancelEditEntry() {
    editingEntryId = null;
    pendingEntryId = null;
    pendingPhotos  = [];
    renderPhotoPreviews();
    resetLogForm();
    renderLog();
    document.querySelector('.log-sub-tab[data-log-tab="history"]')?.click();
  }

  function deleteLogEntry(id) {
    washLog = washLog.filter(e => e.id !== id);
    delete photosByEntryId[id];
    saveLog();
    renderLog();
  }

  function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m-1, d);
    return date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function typeLabel(type) {
    const routine = routines.find(r => r.id === type);
    if (routine) return routine.name;
    const map = { full: 'Full wash', quick: 'Quick wash', interior: 'Interior only', both: 'Full wash + interior' };
    return map[type] || type;
  }

  function calcStreak() {
    if (!washLog.length) return { streak: 0, lastWash: null, unit: 'weeks' };
    const sorted = [...washLog].sort((a,b) => b.date.localeCompare(a.date));
    const lastWash = sorted[0].date;
    const schedules = settings.schedules ?? [];
    if (schedules.length > 0) {
      // Use first schedule's streak for the global bar
      return { streak: calcScheduleStreak(schedules[0], weatherCache), lastWash, unit: 'sessions' };
    }
    // Legacy: weekly streak — count consecutive Mon-Sun weeks with at least one wash
    const uniqueDates = [...new Set(sorted.map(e => e.date))].sort((a,b) => b.localeCompare(a));
    let streak = 0;
    const today = new Date();
    for (let week = 0; week < 52; week++) {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay()-1) - (week * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const fmt = d => d.toISOString().split('T')[0];
      const hasWash = uniqueDates.some(d => d >= fmt(weekStart) && d <= fmt(weekEnd));
      if (hasWash) streak++;
      else if (week > 0) break;
    }
    return { streak, lastWash, unit: 'weeks' };
  }

  function calcNextDue(freqKey) {
    const label = FREQ_OPTIONS[freqKey]?.[settings.freq[freqKey] ?? FREQ_DEFAULTS[freqKey]];
    const intervalDays = FREQ_DAYS[label];
    if (!intervalDays) return null;

    let lastDate = null;
    if (freqKey === 'fullWash') {
      const sorted = [...washLog].sort((a, b) => b.date.localeCompare(a.date));
      if (sorted.length) lastDate = sorted[0].date;
    } else {
      const keyword = { beadMachine: 'Bead Machine' }[freqKey];
      if (!keyword) return null;
      const relevant = washLog
        .filter(e => Array.isArray(e.steps) && e.steps.some(s => s.toLowerCase().includes(keyword.toLowerCase())))
        .sort((a, b) => b.date.localeCompare(a.date));
      if (!relevant.length) return null;
      lastDate = relevant[0].date;
    }

    if (!lastDate) return null;
    const [y, m, d] = lastDate.split('-').map(Number);
    return new Date(y, m - 1, d + intervalDays);
  }

  function renderLog() {
    const { streak, lastWash, unit } = calcStreak();
    const streakUnit = unit === 'weeks' ? (streak === 1 ? 'week' : 'weeks') : (streak === 1 ? 'session' : 'sessions');
    document.getElementById('streak-val').textContent = streak > 0 ? `${streak} ${streakUnit}` : '—';
    document.getElementById('log-total-sessions').textContent = washLog.length;
    document.getElementById('log-last-wash').textContent = lastWash ? formatDate(lastWash).split(',')[0] + ' ' + lastWash.split('-').slice(1).reverse().join('/') : '—';

    const label = document.getElementById('log-history-label');
    label.textContent = washLog.length > 0 ? `History (${washLog.length} session${washLog.length !== 1 ? 's' : ''})` : 'History';

    renderWashReminderCards();
    if (weatherCache) renderWeatherCards(evalWeatherTriggers(weatherCache));

    const container = document.getElementById('log-entries');
    if (!washLog.length) {
      container.innerHTML = `<div class="log-empty"><div class="log-empty-icon">🪣</div>No sessions logged yet.<br>Log your first wash above.</div>`;
      return;
    }

    container.innerHTML = '';
    // Sort newest first
    const sorted = [...washLog].sort((a,b) => b.date.localeCompare(a.date));
    sorted.forEach(entry => {
      const div = document.createElement('div');
      div.className = 'log-entry';
      const entryPhotos = photosByEntryId[entry.id] ?? [];
      const rtypes = routines.find(r => r.id === entry.type)?.types ?? [];
      const typeClass = rtypes.includes('exterior') && rtypes.includes('interior') ? 'full'
        : rtypes.includes('interior') ? 'interior'
        : rtypes.length ? 'quick'
        : entry.type === 'full' || entry.type === 'both' ? 'full'
        : entry.type === 'interior' ? 'interior' : 'quick';
      div.innerHTML = `
        <button class="log-menu-btn" data-id="${entry.id}" title="Options">···</button>
        <div class="log-menu-dropdown" id="log-menu-${entry.id}" hidden>
          <button class="log-menu-item" data-action="edit" data-id="${entry.id}">Edit</button>
          <button class="log-menu-item log-menu-item--danger" data-action="delete" data-id="${entry.id}">Delete</button>
        </div>
        <div class="log-entry-head">
          <div class="log-entry-date">${formatDate(entry.date)}</div>
          <div class="log-entry-type ${typeClass}">${typeLabel(entry.type)}</div>
        </div>
        ${entry.steps.length ? `<div class="log-chips">${entry.steps.map(s => `<span class="log-chip">${s}</span>`).join('')}</div>` : ''}
        ${entry.notes ? `<div class="log-entry-notes">${entry.notes}</div>` : ''}
        ${entryPhotos.length ? `<div class="log-carousel">${entryPhotos.map((p, i) => `
          <div class="log-carousel-item">
            <img src="${p.thumbUrl}" loading="lazy" alt="Session photo" data-carousel-index="${i}" data-entry-id="${entry.id}">
            ${editingEntryId === entry.id ? `<button class="log-photo-remove" data-photo-id="${p.id}" data-entry-id="${entry.id}" title="Remove photo">✕</button>` : ''}
          </div>`).join('')}</div>` : ''}
        <div class="log-confirm-row" id="log-confirm-${entry.id}" hidden>
          <span>Delete this session?</span>
          <button class="log-confirm-cancel" data-id="${entry.id}">Cancel</button>
          <button class="log-confirm-delete" data-id="${entry.id}">Delete</button>
        </div>
      `;
      container.appendChild(div);
    });
  }

  // ─── Inventory ────────────────────────────────────

  async function loadInventory() {
    const saved = await storageGet(INVENTORY_KEY);
    inventoryState = saved ?? {};
    renderInventory();
  }

  async function saveInventory() {
    await storageSet(INVENTORY_KEY, inventoryState);
    syncPush(INVENTORY_KEY, inventoryState);
    renderInventory();
  }

  function updateInventoryItem(slug, updates) {
    inventoryState[slug] = { ...(inventoryState[slug] ?? {}), ...updates };
    saveInventory();
  }

  function markItemEmpty(slug) {
    updateInventoryItem(slug, { remainingMl: 0 });
  }

  async function resetInventory() {
    if (!confirm('Reset all inventory stock levels? Purchase dates are preserved. Cannot be undone.')) return;
    const today = new Date().toISOString().split('T')[0];
    const fresh = {};
    for (const slug of Object.keys(inventoryState)) {
      fresh[slug] = { purchaseDate: inventoryState[slug].purchaseDate ?? today };
    }
    inventoryState = fresh;
    await storageSet(INVENTORY_KEY, inventoryState);
    syncPush(INVENTORY_KEY, inventoryState);
    renderInventory();
  }

  function toggleInvAdjustForm(slug) {
    const form = document.getElementById(`inv-adjust-form-${slug}`);
    if (!form) return;
    const isHidden = form.hidden;
    // Close any other open forms first
    document.querySelectorAll('.inv-adjust-form').forEach(f => { f.hidden = true; });
    form.hidden = !isHidden;
  }

  // Returns ml-per-wash for a slug by looking up its product name across all routine steps.
  function getRoutineUsageMl(slug) {
    const catalogName = CATALOG.find(p => p.slug === slug)?.name;
    if (!catalogName) return null;
    for (const routine of routines) {
      for (const step of (routine.steps ?? [])) {
        const prod = step.products?.find(p => p.name === catalogName && p.ml != null);
        if (prod) return prod.ml;
      }
    }
    return null;
  }

  function saveInvAdjust(slug) {
    const volumeEl  = document.getElementById(`inv-vol-${slug}`);
    const remainEl  = document.getElementById(`inv-remain-${slug}`);
    const defaults  = INVENTORY_DEFAULTS[slug] ?? {};
    const volumeMl  = volumeEl && volumeEl.value !== '' ? +volumeEl.value : (inventoryState[slug]?.volumeMl ?? defaults.volumeMl ?? null);
    const remainingMl = remainEl && remainEl.value !== '' ? +remainEl.value : null;

    inventoryState[slug] = {
      ...(inventoryState[slug] ?? {}),
      volumeMl,
      remainingMl: remainingMl !== null ? Math.max(0, Math.min(volumeMl ?? Infinity, remainingMl)) : inventoryState[slug]?.remainingMl ?? null,
      manualOverride: remainingMl !== null,
    };
    saveInventory();
  }

  function countProductUses(slug) {
    const productName = CATALOG.find(p => p.slug === slug)?.name;
    if (!productName) return 0;
    let count = 0;
    for (const entry of washLog) {
      if (!entry.steps || !entry.steps.length) continue;
      const routine = routines.find(r => r.id === entry.type);
      if (!routine) continue;
      const usedInSession = entry.steps.some(stepName => {
        const step = routine.steps.find(s => s.name === stepName);
        return step?.products?.some(p => p.name === productName);
      });
      if (usedInSession) count++;
    }
    return count;
  }

  function decrementInventoryForSession(entry) {
    const routine = routines.find(r => r.id === entry.type);
    if (!routine) return;
    const catalogByName = new Map(CATALOG.map(p => [p.name, p.slug]));
    let changed = false;
    for (const stepName of (entry.steps ?? [])) {
      const step = routine.steps.find(s => s.name === stepName);
      if (!step?.products?.length) continue;
      for (const { name, ml } of step.products) {
        const slug = catalogByName.get(name);
        if (!slug || EQUIPMENT_SLUGS.has(slug)) continue;
        const inv = inventoryState[slug];
        if (!inv || inv.remainingMl == null) continue;
        if (ml == null) continue;
        inv.remainingMl = Math.max(0, inv.remainingMl - ml);
        changed = true;
      }
    }
    if (changed) {
      storageSet(INVENTORY_KEY, inventoryState);
      syncPush(INVENTORY_KEY, inventoryState);
    }
  }

  function showInvToast(msg) {
    let toast = document.getElementById('inv-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'inv-toast';
      toast.className = 'inv-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('visible'), 3000);
  }

  function renderInventory() {
    const container = document.getElementById('inventory-list');
    if (!container) return;

    // Build the set of owned slugs from checklist state
    const ownedSlugs = new Set(
      Object.entries(checklistState.checked ?? {})
        .filter(([, v]) => v)
        .map(([k]) => k)
    );

    if (ownedSlugs.size === 0) {
      container.innerHTML = `
        <div class="inv-empty-state">
          <p>No items in inventory yet.</p>
          <p>Check off items in the <button class="inv-link-btn" onclick="document.querySelector('.tab[data-tab=\\'spend\\']')?.click()">Kit Checklist</button> to add them here.</p>
        </div>`;
      return;
    }

    // Reuse PRICE_CATEGORIES structure for consistent category layout
    const PRICE_CATEGORIES = [
      { label: 'Equipment', sections: [
        { label: 'Microfibre', slugs: ['debugger-cloth', 'inta-mitt', 'plush-daddy', 'big-softie-pair', 'the-square-bear'] },
        { label: 'Wash Pads', slugs: ['shagtastic-wash-pad'] },
        { label: 'Drying Towels', slugs: ['twisted-pro-sucker', 'the-big-green-sucker'] },
        { label: 'Other', slugs: ['plush-brush', '2-bucket-wash-kit', 'microfibre-bucket-lid', 'pumpy-pump', 'the-essentials-starters-kit'] },
      ]},
      { label: 'Pressure Washer Equipment', sections: [
        { label: 'Pressure Washers', slugs: ['karcher-k2'] },
        { label: 'Foam Cannons', slugs: ['snow-blow-cannon', 'happy-ending-cannon-bottle'] },
      ]},
      { label: 'Exterior Wash', sections: [
        { label: 'Glass', slugs: ['naked-glass-500ml', 'naked-glass-770ml', 'naked-inta-mitt-pack'] },
        { label: 'Prep', slugs: ['flash-prep-500ml', 'orange-agent-500ml'] },
        { label: 'Pre-Wash', slugs: ['snow-job-1l', 'snow-job-5l'] },
        { label: 'Contact Wash', slugs: ['nanolicious-wash-pack-ultimate', 'nanolicious-shag-pack', 'nanolicious-wash-5l'] },
      ]},
      { label: 'Exterior Protection', sections: [
        { label: 'Sealant', slugs: ['bead-machine-500ml', 'wet-dreams-770ml', 'wet-dreams-5l', 'happy-ending-1l', 'happy-ending-5l', 'wet-dreams-pack'] },
        { label: 'Quick Detailer', slugs: ['boss-gloss-770ml', 'boss-gloss-5l', 'boss-gloss-pack'] },
        { label: 'Microfibre Wash', slugs: ['microfibre-wash-1l'] },
      ]},
      { label: 'Interior Clean', sections: [
        { label: 'Leather', slugs: ['leather-love-v2-500ml', 'bolp-leather-care-pack'] },
        { label: 'Fabric', slugs: ['fabra-cadabra-500ml'] },
      ]},
      { label: 'Interior Protect', sections: [
        { label: 'Leather', slugs: ['leather-guard-500ml'] },
        { label: 'Fabric & Suede', slugs: ['fabratection'] },
        { label: 'Plastic, Vinyl & Rubber', slugs: ['303-aerospace'] },
      ]},
      { label: 'Wheels', sections: [
        { label: 'Equipment', slugs: ['little-chubby-v2', 'the-little-stiffy', 'the-flat-head', 'the-chubby-wheel-brush-v2'] },
        { label: 'Clean', slugs: ['wheely-clean-v2-500ml', 'wheely-clean-770ml', 'wheely-clean-v2-5l'] },
      ]},
    ];

    function renderInvCard(slug) {
      const catalogItem = CATALOG.find(p => p.slug === slug);
      if (!catalogItem) return '';
      const meta = inventoryState[slug] ?? {};
      const defaults = INVENTORY_DEFAULTS[slug] ?? {};
      const isEquip = EQUIPMENT_SLUGS.has(slug);
      const safeSlug = escAttr(slug);
      const name = escHtml(catalogItem.name);

      if (isEquip) {
        const uses = countProductUses(slug);
        const dateStr = meta.purchaseDate
          ? `Since ${new Date(meta.purchaseDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
          : '';
        const usesStr = uses === 1 ? 'Used in 1 session' : uses > 0 ? `Used in ${uses} sessions` : '';
        const meta2 = [dateStr, usesStr].filter(Boolean).join(' · ');
        return `
          <div class="inv-card inv-card--equip">
            <div class="inv-card-name">${name}</div>
            ${meta2 ? `<div class="inv-equip-meta">${meta2}</div>` : ''}
          </div>`;
      }

      // Consumable
      const volumeMl       = meta.volumeMl  ?? defaults.volumeMl ?? null;
      const usagePerWashMl = getRoutineUsageMl(slug);
      const remainingMl    = meta.remainingMl;
      const notConfigured  = remainingMl == null;
      const pct            = (volumeMl && remainingMl != null) ? Math.max(0, Math.min(100, Math.round((remainingMl / volumeMl) * 100))) : null;
      const isLow          = pct != null && pct <= 20;

      let stockHtml = '';
      if (notConfigured) {
        stockHtml = `<div class="inv-not-set">Stock not set — <button class="inv-link-btn" onclick="toggleInvAdjustForm('${safeSlug}')">configure</button></div>`;
      } else {
        const fillColor = pct > 50 ? 'var(--accent)' : pct > 20 ? 'var(--warn)' : 'var(--danger)';
        const label = volumeMl
          ? `${remainingMl}ml remaining (${pct}%)`
          : `${remainingMl}ml remaining`;
        stockHtml = `
          <div class="inv-stock-wrap">
            <div class="inv-stock-bar"><div class="inv-stock-fill" style="width:${pct ?? 0}%;background:${fillColor}"></div></div>
            <span class="inv-stock-label">${label}</span>
            ${isLow ? '<span class="inv-low-badge">Running low</span>' : ''}
          </div>`;
      }

      // Sessions remaining estimate
      let sessionsHtml = '';
      if (!notConfigured && usagePerWashMl && remainingMl != null) {
        const sessionsLeft = Math.floor(remainingMl / usagePerWashMl);
        sessionsHtml = `<div class="inv-sessions-left">${sessionsLeft} wash${sessionsLeft !== 1 ? 'es' : ''} remaining</div>`;
      }

      const volVal = meta.volumeMl ?? defaults.volumeMl ?? '';
      const remVal = meta.remainingMl ?? '';

      return `
        <div class="inv-card inv-card--consumable${isLow ? ' inv-card--low' : ''}">
          <div class="inv-card-row">
            <div class="inv-card-name">${name}</div>
            <button class="inv-adjust-btn" onclick="toggleInvAdjustForm('${safeSlug}')" title="Adjust stock">Adjust</button>
          </div>
          ${stockHtml}
          ${sessionsHtml}
          <div class="inv-adjust-form" id="inv-adjust-form-${safeSlug}" hidden>
            <div class="inv-adjust-grid">
              <label class="inv-adjust-label">Volume (ml)</label>
              <label class="inv-adjust-label">Remaining (ml)</label>
              <input class="inv-adjust-input" type="number" id="inv-vol-${safeSlug}" value="${volVal}" min="1" placeholder="e.g. 500">
              <input class="inv-adjust-input" type="number" id="inv-remain-${safeSlug}" value="${remVal}" min="0" placeholder="e.g. 375">
            </div>
            <div class="inv-adjust-actions">
              <button class="settings-save-btn" onclick="saveInvAdjust('${safeSlug}')">Update</button>
              <button class="settings-reset-btn" style="color:var(--danger);border-color:var(--danger);" onclick="markItemEmpty('${safeSlug}')">Mark empty</button>
            </div>
          </div>
        </div>`;
    }

    // Renders a bundle component, which may or may not have its own catalog slug.
    // Inline components (no slug) use a composite state key derived from the bundle slug + component name.
    function renderComponentCard(comp, bundleSlug) {
      const compKey = comp.slug
        ?? `${bundleSlug}:${comp.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const safeKey = escAttr(compKey);
      const name = escHtml(comp.name);
      const isEquip = comp.equipment ?? EQUIPMENT_SLUGS.has(comp.slug ?? '');

      if (!inventoryState[compKey]) inventoryState[compKey] = {};
      if (!inventoryState[compKey].purchaseDate && inventoryState[bundleSlug]?.purchaseDate) {
        inventoryState[compKey].purchaseDate = inventoryState[bundleSlug].purchaseDate;
      }

      const meta     = inventoryState[compKey];
      const defaults = comp.slug ? (INVENTORY_DEFAULTS[comp.slug] ?? {}) : {};

      if (isEquip) {
        const uses    = comp.slug ? countProductUses(comp.slug) : 0;
        const dateStr = meta.purchaseDate
          ? `Since ${new Date(meta.purchaseDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
          : '';
        const usesStr = uses === 1 ? 'Used in 1 session' : uses > 0 ? `Used in ${uses} sessions` : '';
        const metaStr = [dateStr, usesStr].filter(Boolean).join(' · ');
        return `
          <div class="inv-card inv-card--equip">
            <div class="inv-card-name">${name}</div>
            ${metaStr ? `<div class="inv-equip-meta">${metaStr}</div>` : ''}
          </div>`;
      }

      const volumeMl       = meta.volumeMl ?? comp.volumeMl ?? defaults.volumeMl ?? null;
      const usagePerWashMl = comp.slug ? getRoutineUsageMl(comp.slug) : (comp.usagePerWashMl ?? null);
      const remainingMl    = meta.remainingMl;
      const notConfigured  = remainingMl == null;
      const pct = (volumeMl && remainingMl != null) ? Math.max(0, Math.min(100, Math.round((remainingMl / volumeMl) * 100))) : null;
      const isLow = pct != null && pct <= 20;

      let stockHtml = '';
      if (notConfigured) {
        stockHtml = `<div class="inv-not-set">Stock not set — <button class="inv-link-btn" onclick="toggleInvAdjustForm('${safeKey}')">configure</button></div>`;
      } else {
        const fillColor = pct > 50 ? 'var(--accent)' : pct > 20 ? 'var(--warn)' : 'var(--danger)';
        const label = volumeMl ? `${remainingMl}ml remaining (${pct}%)` : `${remainingMl}ml remaining`;
        stockHtml = `
          <div class="inv-stock-wrap">
            <div class="inv-stock-bar"><div class="inv-stock-fill" style="width:${pct ?? 0}%;background:${fillColor}"></div></div>
            <span class="inv-stock-label">${label}</span>
            ${isLow ? '<span class="inv-low-badge">Running low</span>' : ''}
          </div>`;
      }

      let sessionsHtml = '';
      if (!notConfigured && usagePerWashMl && remainingMl != null) {
        const sessionsLeft = Math.floor(remainingMl / usagePerWashMl);
        sessionsHtml = `<div class="inv-sessions-left">${sessionsLeft} wash${sessionsLeft !== 1 ? 'es' : ''} remaining</div>`;
      }

      const volVal = meta.volumeMl ?? comp.volumeMl ?? defaults.volumeMl ?? '';
      const remVal = meta.remainingMl ?? '';

      return `
        <div class="inv-card inv-card--consumable${isLow ? ' inv-card--low' : ''}">
          <div class="inv-card-row">
            <div class="inv-card-name">${name}</div>
            <button class="inv-adjust-btn" onclick="toggleInvAdjustForm('${safeKey}')" title="Adjust stock">Adjust</button>
          </div>
          ${stockHtml}
          ${sessionsHtml}
          <div class="inv-adjust-form" id="inv-adjust-form-${safeKey}" hidden>
            <div class="inv-adjust-grid">
              <label class="inv-adjust-label">Volume (ml)</label>
              <label class="inv-adjust-label">Remaining (ml)</label>
              <input class="inv-adjust-input" type="number" id="inv-vol-${safeKey}" value="${volVal}" min="1" placeholder="e.g. 500">
              <input class="inv-adjust-input" type="number" id="inv-remain-${safeKey}" value="${remVal}" min="0" placeholder="e.g. 375">
            </div>
            <div class="inv-adjust-actions">
              <button class="settings-save-btn" onclick="saveInvAdjust('${safeKey}')">Update</button>
              <button class="settings-reset-btn" style="color:var(--danger);border-color:var(--danger);" onclick="markItemEmpty('${safeKey}')">Mark empty</button>
            </div>
          </div>
        </div>`;
    }

    let html = '';
    let anyRendered = false;

    for (const category of PRICE_CATEGORIES) {
      let categoryBody = '';
      let firstSec = true;

      for (const sec of category.sections) {
        let secHtml = '';
        for (const slug of sec.slugs) {
          if (!ownedSlugs.has(slug)) continue;

          if (BUNDLE_COMPONENTS[slug]) {
            // Expand bundle into individual component cards
            for (const comp of BUNDLE_COMPONENTS[slug]) {
              // Skip slug-referenced components the user also owns independently — they render under their own entry
              if (comp.slug && ownedSlugs.has(comp.slug)) continue;
              const compKey = comp.slug ?? `${slug}:${comp.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
              const compMeta = inventoryState[compKey] ?? {};
              const isEquip = comp.equipment ?? EQUIPMENT_SLUGS.has(comp.slug ?? '');
              if (!isEquip && compMeta.remainingMl === 0) continue;
              secHtml += renderComponentCard(comp, slug);
            }
          } else {
            const inv = inventoryState[slug] ?? {};
            if (!EQUIPMENT_SLUGS.has(slug) && inv.remainingMl === 0) continue;
            secHtml += renderInvCard(slug);
          }
        }
        if (!secHtml) continue;
        const headClass = firstSec ? 'section-head' : 'section-head section-head--gap';
        categoryBody += `<div class="${headClass}">${escHtml(sec.label)}</div>${secHtml}`;
        firstSec = false;
      }

      if (!categoryBody) continue;
      html += `<div class="inv-category"><div class="inv-category-label">${escHtml(category.label)}</div>${categoryBody}</div>`;
      anyRendered = true;
    }

    if (!anyRendered) {
      html = `<div class="inv-empty-state"><p>No items with stock data yet. Check off items in the <button class="inv-link-btn" onclick="document.querySelector('.tab[data-tab=\\'spend\\']')?.click()">Kit Checklist</button> to populate your inventory.</p></div>`;
    }

    container.innerHTML = html;
  }

  // ─── Tab navigation ──────────────────────────────
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // ─── Spend sub-tab navigation ─────────────────────
  document.querySelectorAll('.spend-sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.spend-sub-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.spend-sub-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('spend-sub-' + btn.dataset.spendTab).classList.add('active');
    });
  });

  // ─── Log sub-tab navigation ────────────────────────
  document.querySelectorAll('.log-sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      // Navigating away from the edit form cancels the edit
      if (editingEntryId !== null && (btn.dataset.logTab === 'history' || (btn.dataset.logTab === 'new' && btn.id !== 'log-edit-tab'))) {
        editingEntryId = null;
        pendingEntryId = null;
        pendingPhotos  = [];
        renderPhotoPreviews();
        resetLogForm();
        renderLog();
      }
      document.querySelectorAll('.log-sub-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.log-sub-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('log-sub-' + btn.dataset.logTab).classList.add('active');
    });
  });

  // ─── Log entry delegated interactions ──────────────
  document.getElementById('log-entries').addEventListener('click', e => {
    // Ellipsis menu button
    const menuBtn = e.target.closest('.log-menu-btn');
    if (menuBtn) {
      const id = menuBtn.dataset.id;
      if (openMenuId && openMenuId !== id) {
        document.getElementById(`log-menu-${openMenuId}`)?.setAttribute('hidden', '');
      }
      const dropdown = document.getElementById(`log-menu-${id}`);
      if (openMenuId === id) {
        dropdown?.setAttribute('hidden', '');
        openMenuId = null;
      } else {
        dropdown?.removeAttribute('hidden');
        openMenuId = id;
      }
      return;
    }
    // Edit action
    const editItem = e.target.closest('.log-menu-item[data-action="edit"]');
    if (editItem) {
      if (openMenuId) { document.getElementById(`log-menu-${openMenuId}`)?.setAttribute('hidden', ''); openMenuId = null; }
      startEditEntry(Number(editItem.dataset.id));
      return;
    }
    // Delete action (from menu — shows confirm row)
    const deleteItem = e.target.closest('.log-menu-item[data-action="delete"]');
    if (deleteItem) {
      if (openMenuId) { document.getElementById(`log-menu-${openMenuId}`)?.setAttribute('hidden', ''); openMenuId = null; }
      document.getElementById(`log-confirm-${deleteItem.dataset.id}`)?.removeAttribute('hidden');
      return;
    }
    // Confirm row — cancel
    const cancelBtn = e.target.closest('.log-confirm-cancel');
    if (cancelBtn) {
      document.getElementById(`log-confirm-${cancelBtn.dataset.id}`)?.setAttribute('hidden', '');
      return;
    }
    // Confirm row — delete
    const confirmBtn = e.target.closest('.log-confirm-delete');
    if (confirmBtn) {
      deleteLogEntry(Number(confirmBtn.dataset.id));
      return;
    }
    // Photo remove (carousel in edit mode)
    const removePhotoBtn = e.target.closest('.log-photo-remove');
    if (removePhotoBtn) {
      const item = removePhotoBtn.closest('.log-carousel-item');
      const pid  = Number(removePhotoBtn.dataset.photoId);
      const eid  = Number(removePhotoBtn.dataset.entryId);
      if (item) {
        item.classList.add('removing');
        item.addEventListener('animationend', () => deletePhoto(pid, eid), { once: true });
      } else {
        deletePhoto(pid, eid);
      }
      return;
    }
    // Carousel image → open lightbox
    const carouselImg = e.target.closest('.log-carousel-item img');
    if (carouselImg) {
      openLightbox(Number(carouselImg.dataset.entryId), Number(carouselImg.dataset.carouselIndex));
      return;
    }
  });

  // Dismiss open menu on outside click
  document.addEventListener('click', e => {
    if (openMenuId && !e.target.closest('.log-menu-btn') && !e.target.closest('.log-menu-dropdown')) {
      document.getElementById(`log-menu-${openMenuId}`)?.setAttribute('hidden', '');
      openMenuId = null;
    }
  });

  // Dupe warning on date change
  document.getElementById('log-date').addEventListener('change', () => {
    const date = document.getElementById('log-date').value;
    const warn = document.getElementById('log-dupe-warn');
    if (!warn) return;
    const hasDupe = editingEntryId !== null
      ? washLog.some(e => e.date === date && e.id !== editingEntryId)
      : washLog.some(e => e.date === date);
    warn.hidden = !hasDupe;
  });

  // ─── Routine sub-tab navigation ───────────────────
  document.querySelectorAll('.routine-sub-tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      const leavingConfigure = document.getElementById('routine-sub-configure')?.classList.contains('active');
      if (leavingConfigure && btn.dataset.routineTab !== 'configure') {
        const saved = await storageGet(ROUTINES_KEY);
        routines = (saved && Array.isArray(saved) && saved.length) ? saved : JSON.parse(JSON.stringify(DEFAULT_ROUTINES));
        routines = routines.map(r => ({
          ...r,
          steps: (r.steps || []).map(s => {
            if ('product' in s && !('name' in s)) return { name: '', action: s.action || '', products: s.product ? [{ name: s.product, ml: null }] : [] };
            if (!('products' in s)) s.products = [];
            return s;
          }),
        }));
      }
      document.querySelectorAll('.routine-sub-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.routine-sub-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('routine-sub-' + btn.dataset.routineTab).classList.add('active');
    });
  });

  // ─── Maintenance sub-tab navigation ───────────────
  document.querySelectorAll('.maintenance-sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.maintenance-sub-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.maintenance-sub-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('maintenance-sub-' + btn.dataset.maintenanceTab).classList.add('active');
    });
  });

  // ─── TOC smooth scroll handling ──────────────────
  document.querySelectorAll('.toc-list a').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(link.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // ─── Settings ────────────────────────────────────
  const SETTINGS_KEY = 'corolla-settings-v1';

  // Frequency options per setting
  const FREQ_OPTIONS = {
    fullWash:      ['Every 3 days','Twice a week','Weekly','Fortnightly','Monthly'],
    interiorDetail:['Weekly','Fortnightly','Monthly','Every 6 weeks','Every 3 months'],
    beadMachine:   ['Every 6 weeks','Every 2 months','Every 3 months','Every 4 months','Every 6 months'],
    aerospace:     ['Every 2 weeks','Every 4 weeks','Every 6 weeks','Every 2 months','Every 3 months'],
    leatherGuard:  ['Monthly','Every 6 weeks','Every 2 months','Every 3 months','Every 6 months']
  };
  const FREQ_DEFAULTS = {
    fullWash: 2, interiorDetail: 2, beadMachine: 2, aerospace: 2, leatherGuard: 3
  };

  const FREQ_DAYS = {
    'Every 3 days': 3, 'Twice a week': 4, 'Weekly': 7,
    'Fortnightly': 14, 'Monthly': 30,
    'Every 2 weeks': 14, 'Every 4 weeks': 28, 'Every 6 weeks': 42,
    'Every 2 months': 60, 'Every 3 months': 90,
    'Every 4 months': 120, 'Every 6 months': 180,
  };

  // Default routine steps
  const DEFAULT_STEPS = {
    exterior: [
      { name: 'Plain water rinse', enabled: true },
      { name: 'Wheely Clean V2 — wheels', enabled: true },
      { name: 'Snow Job pre-wash foam', enabled: true },
      { name: 'Nanolicious contact wash', enabled: true },
      { name: 'Final free-flow rinse', enabled: true },
      { name: 'Wet Dreams sealant', enabled: true },
      { name: 'Happy Ending finishing foam', enabled: true },
      { name: 'Big Green Sucker dry', enabled: true },
      { name: 'Naked Glass + Inta-Mitt', enabled: true },
      { name: 'Boss Gloss quick detail', enabled: false }
    ],
    interior: [
      { name: 'Vacuum all surfaces + mats', enabled: true },
      { name: 'Fabra Cadabra — Ultrasuede seats', enabled: true },
      { name: 'Leather Love V2 — leather seats', enabled: true },
      { name: 'Leather Guard — leather protection', enabled: true },
      { name: 'Plush Daddy — hard plastics wipe', enabled: true },
      { name: 'Naked Glass — interior windows', enabled: true },
      { name: '303 Aerospace — plastics + rubber mats', enabled: true },
      { name: 'Fabratection — Ultrasuede (annually)', enabled: false }
    ],
    log: [
      { name: 'Snow Job pre-wash', enabled: true },
      { name: 'Wheely Clean wheels', enabled: true },
      { name: 'Nanolicious wash', enabled: true },
      { name: 'Wet Dreams sealant', enabled: true },
      { name: 'Happy Ending foam', enabled: true },
      { name: 'Naked Glass', enabled: true },
      { name: 'Fabra Cadabra seats', enabled: true },
      { name: 'Leather Love + Guard', enabled: true },
      { name: '303 Aerospace', enabled: true },
      { name: 'Bead Machine', enabled: true }
    ]
  };

  const DEFAULT_PREFS = {
    showPrices: true,
    showBadges: true,
    showDesc: true,
    confirmDelete: true
  };

  const DEFAULT_NOTIFICATIONS = {
    ticktickAlerts: true,
    ticktickProjectId: null,
    ticktickTags: [],
    ticktickPriority: 0,
    emailAlerts: false,
    washReminders: true,
    emailWashReminders: false,
    emailDigest: false,
  };

  const ALERTS_KEY = 'corolla-price-alerts-v1';
  let priceAlerts = {};

  let settings = {
    freq: { ...FREQ_DEFAULTS },
    routines: JSON.parse(JSON.stringify(DEFAULT_STEPS)),
    prefs: { ...DEFAULT_PREFS },
    car: { model: '', year: '', colour: '', rego: '', displayName: '' },
    notifications: { ...DEFAULT_NOTIFICATIONS },
    schedules: [],
  };

  // Frequency stepper
  function adjustFreq(key, delta) {
    const opts = FREQ_OPTIONS[key];
    let idx = settings.freq[key] ?? FREQ_DEFAULTS[key];
    idx = Math.max(0, Math.min(opts.length - 1, idx + delta));
    settings.freq[key] = idx;
    document.getElementById(`${key}-display`).textContent = opts[idx];
  }

  function renderFreqDisplays() {
    Object.keys(FREQ_OPTIONS).forEach(key => {
      const idx = settings.freq[key] ?? FREQ_DEFAULTS[key];
      const el = document.getElementById(`${key}-display`);
      if (el) el.textContent = FREQ_OPTIONS[key][idx];
    });
  }

  // Routine step editor
  let currentRoutineTab = 'exterior';
  let dragSrc = null;

  function switchRoutineTab(tab, btn) {
    currentRoutineTab = tab;
    document.querySelectorAll('.routine-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.routine-editor').forEach(e => e.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`routine-editor-${tab}`).classList.add('active');
  }

  function renderRoutineEditor(routineKey) {
    const list = document.getElementById(`steps-${routineKey}`);
    if (!list) return;
    list.innerHTML = '';
    const steps = settings.routines[routineKey] || [];
    steps.forEach((step, idx) => {
      const item = document.createElement('div');
      item.className = 'routine-step-item' + (step.enabled ? '' : ' opacity-50');
      item.draggable = true;
      item.dataset.idx = idx;
      item.style.opacity = step.enabled ? '1' : '0.5';
      item.innerHTML = `
        <span class="drag-handle">⠿</span>
        <span class="step-name-display" id="snd-${routineKey}-${idx}">${step.name}</span>
        <input class="step-chip-name-input" id="sni-${routineKey}-${idx}" value="${step.name}" onblur="finishEditStep('${routineKey}',${idx})" onkeydown="if(event.key==='Enter')this.blur()">
        <button class="step-edit-btn" onclick="startEditStep('${routineKey}',${idx})" title="Rename">✎</button>
        <label class="toggle-wrap step-toggle" title="${step.enabled ? 'Enabled' : 'Disabled'}">
          <input type="checkbox" ${step.enabled ? 'checked' : ''} onchange="toggleStep('${routineKey}',${idx},this.checked)">
          <span class="toggle-track" style="border-radius:100px;"></span>
        </label>
        <button class="step-remove-btn" onclick="removeStep('${routineKey}',${idx})" title="Remove">✕</button>
      `;
      // Drag events
      item.addEventListener('dragstart', e => { dragSrc = idx; item.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      item.addEventListener('dragend', () => { item.classList.remove('dragging'); list.querySelectorAll('.routine-step-item').forEach(i => i.classList.remove('drag-over')); });
      item.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; item.classList.add('drag-over'); });
      item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
      item.addEventListener('drop', e => {
        e.preventDefault();
        if (dragSrc === null || dragSrc === idx) return;
        const arr = settings.routines[routineKey];
        const moved = arr.splice(dragSrc, 1)[0];
        arr.splice(idx, 0, moved);
        renderRoutineEditor(routineKey);
      });
      list.appendChild(item);
    });
  }

  function renderAllRoutineEditors() {
    ['exterior','interior','log'].forEach(renderRoutineEditor);
  }

  function startEditStep(routineKey, idx) {
    document.getElementById(`snd-${routineKey}-${idx}`).style.display = 'none';
    const inp = document.getElementById(`sni-${routineKey}-${idx}`);
    inp.style.display = 'block';
    inp.focus();
    inp.select();
  }

  function finishEditStep(routineKey, idx) {
    const inp = document.getElementById(`sni-${routineKey}-${idx}`);
    const val = inp.value.trim();
    if (val) settings.routines[routineKey][idx].name = val;
    renderRoutineEditor(routineKey);
  }

  function toggleStep(routineKey, idx, checked) {
    settings.routines[routineKey][idx].enabled = checked;
    const item = document.querySelector(`#steps-${routineKey} .routine-step-item[data-idx="${idx}"]`);
    if (item) item.style.opacity = checked ? '1' : '0.5';
  }

  function removeStep(routineKey, idx) {
    settings.routines[routineKey].splice(idx, 1);
    renderRoutineEditor(routineKey);
  }

  function addStep(routineKey) {
    const inp = document.getElementById(`add-step-${routineKey}`);
    const val = inp.value.trim();
    if (!val) return;
    settings.routines[routineKey].push({ name: val, enabled: true });
    inp.value = '';
    renderRoutineEditor(routineKey);
  }

  // ─── Full routine objects (corolla-routines-v1) ───

  const ROUTINE_CSV_TEMPLATE = `You are generating car detailing routines in CSV format for import into a detailing app.

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

  function csvField(val) {
    const s = String(val ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  }

  function encodeProducts(products) {
    return (products || []).map(p => p.ml ? `${p.name}:${p.ml}` : p.name).join(';');
  }

  function decodeProducts(str) {
    if (!str) return [];
    return str.split(';').map(s => {
      const colon = s.lastIndexOf(':');
      if (colon !== -1) {
        const maybeNum = Number(s.slice(colon + 1));
        if (!isNaN(maybeNum) && s.slice(colon + 1).trim() !== '') {
          return { name: s.slice(0, colon).trim(), ml: maybeNum };
        }
      }
      return { name: s.trim(), ml: null };
    }).filter(p => p.name);
  }

  function exportRoutinesCSV() {
    const rows = ['row_type,routine_id,name,subtext,types,action,products,severity,label,text'];
    routines.forEach(r => {
      const types = (r.types || []).join(';');
      rows.push([csvField('routine'), csvField(r.id), csvField(r.name), csvField(r.subtext || ''), csvField(types), '', '', '', '', ''].join(','));
      (r.steps || []).forEach(s => {
        rows.push([csvField('step'), csvField(r.id), csvField(s.name || ''), '', '', csvField(s.action || ''), csvField(encodeProducts(s.products)), '', '', ''].join(','));
      });
      (r.alerts || []).forEach(a => {
        rows.push([csvField('alert'), csvField(r.id), '', '', '', '', '', csvField(a.severity), csvField(a.label || ''), csvField(a.text)].join(','));
      });
    });
    const csv = '﻿' + rows.join('\r\n');
    const date = new Date().toISOString().slice(0, 10);
    triggerDownload(csv, `routines-${date}.csv`, 'text/csv;charset=utf-8;');
  }

  function parseRoutinesCSV(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = parseCSVRow(lines[0]);
    const idx = {};
    headers.forEach((h, i) => idx[h.trim()] = i);
    const get = (row, col) => (row[idx[col]] ?? '').trim();

    const routineMap = {};
    const order = [];
    lines.slice(1).forEach(line => {
      const row = parseCSVRow(line);
      const type = get(row, 'row_type');
      const rid = get(row, 'routine_id');
      if (!rid) return;
      if (type === 'routine') {
        const types = get(row, 'types').split(';').map(t => t.trim()).filter(Boolean);
        routineMap[rid] = { id: rid, name: get(row, 'name'), subtext: get(row, 'subtext'), types, steps: [], alerts: [] };
        order.push(rid);
      } else if (type === 'step' && routineMap[rid]) {
        routineMap[rid].steps.push({ name: get(row, 'name'), action: get(row, 'action'), products: decodeProducts(get(row, 'products')) });
      } else if (type === 'alert' && routineMap[rid]) {
        routineMap[rid].alerts.push({ severity: get(row, 'severity') || 'tip', label: get(row, 'label'), text: get(row, 'text') });
      }
    });
    return order.map(rid => routineMap[rid]);
  }

  function parseCSVRow(line) {
    const fields = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQuote = false;
        else cur += ch;
      } else {
        if (ch === '"') inQuote = true;
        else if (ch === ',') { fields.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    fields.push(cur);
    return fields;
  }

  function importRoutinesCSV() {
    const input = document.getElementById('routine-csv-input');
    if (!input) return;
    input.value = '';
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async ev => {
        const parsed = parseRoutinesCSV(ev.target.result);
        if (!parsed.length) { alert('No valid routines found in the CSV file.'); return; }
        if (!confirm(`Import ${parsed.length} routine(s)? They will be added to your existing routines.`)) return;
        const ts = Date.now();
        parsed.forEach((r, i) => { r.id = `routine-import-${r.id}-${ts + i}`; });
        routines.push(...parsed);
        await saveRoutines();
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function downloadRoutineTemplate() {
    triggerDownload(ROUTINE_CSV_TEMPLATE, 'routine-template.txt', 'text/plain;charset=utf-8;');
  }

  function triggerDownload(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function loadRoutines() {
    const saved = await storageGet(ROUTINES_KEY);
    if (saved && Array.isArray(saved) && saved.length) routines = saved;
    // Migrate old step shape { product, action, enabled } → { name, action, products }
    routines = routines.map(routine => ({
      ...routine,
      steps: (routine.steps || []).map(step => {
        if ('product' in step && !('name' in step)) {
          return { name: '', action: step.action || '', products: step.product ? [{ name: step.product, ml: null }] : [] };
        }
        if (!('products' in step)) step.products = [];
        return step;
      }),
    }));
    buildCatalogDatalist();
    renderRoutinesView();
    renderRoutineConfigCards();
    renderSchedulesUI();
    renderLogTypeSelect();
  }

  async function saveRoutines() {
    await storageSet(ROUTINES_KEY, routines);
    syncPush(ROUTINES_KEY, routines);
    renderRoutinesView();
    renderRoutineConfigCards();
    renderLogTypeSelect();
    renderSchedulesUI();
    showSaved('routines-v1-saved');
  }

  function buildCatalogDatalist() {
    const dl = document.getElementById('catalog-datalist');
    if (!dl) return;
    dl.innerHTML = CATALOG.map(p => `<option value="${p.name}">`).join('');
  }

  function renderRoutinesView() {
    const container = document.getElementById('routines-view');
    if (!container) return;
    container.innerHTML = '';
    routines.forEach(routine => {
      const steps = routine.steps || [];
      if (steps.length === 0) return;
      const section = document.createElement('div');
      section.className = 'product-section';
      section.id = `routine-view-${routine.id}`;
      const typeLabel = (routine.types || []).map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ');
      const rows = steps.map((step, i) => {
        const productsList = (step.products || []).map(p =>
          p.ml ? `${escHtml(p.name)} (${p.ml} ml)` : escHtml(p.name)
        ).join('<br>');
        return `<tr>
          <td>${i + 1}</td>
          <td>${escHtml(step.name || '')}</td>
          <td>${escHtml(step.action || '')}</td>
          <td class="routine-products-cell">${productsList}</td>
        </tr>`;
      }).join('');
      const alertsHtml = (routine.alerts || []).map(a => {
        const label = a.label ? `<span class="callout-label">${escHtml(a.label)}</span>` : '';
        return `<div class="callout ${a.severity}">${label}${escHtml(a.text)}</div>`;
      }).join('');
      section.innerHTML = `
        <div class="product-num">${typeLabel}</div>
        <h2>${escHtml(routine.name)}</h2>
        ${routine.subtext ? `<p class="product-intro">${escHtml(routine.subtext)}</p>` : ''}
        <table class="routine-table">
          <thead><tr><th>#</th><th>Step</th><th>Action</th><th>Products</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${alertsHtml}
      `;
      container.appendChild(section);
    });
  }

  let routineDragSrc = null;

  function renderRoutineConfigCards() {
    const container = document.getElementById('routine-config-cards');
    if (!container) return;
    container.innerHTML = '';
    routines.forEach((routine, rIdx) => {
      const card = document.createElement('div');
      card.className = 'routine-config-card';
      card.draggable = true;
      card.dataset.idx = rIdx;
      card.innerHTML = buildRoutineConfigCardHTML(routine, rIdx);
      card.addEventListener('dragstart', e => {
        routineDragSrc = rIdx;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        container.querySelectorAll('.routine-config-card').forEach(c => c.classList.remove('drag-over'));
      });
      card.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.classList.add('drag-over');
      });
      card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
      card.addEventListener('drop', e => {
        e.preventDefault();
        if (routineDragSrc === null || routineDragSrc === rIdx) return;
        const moved = routines.splice(routineDragSrc, 1)[0];
        routines.splice(rIdx, 0, moved);
        renderRoutineConfigCards();
      });
      container.appendChild(card);
    });
  }

  function buildRoutineConfigCardHTML(routine, rIdx) {
    const typeKeys = ['exterior', 'interior', 'maintenance'];
    const typeCheckboxes = typeKeys.map(t =>
      `<label class="routine-type-label">
        <input type="checkbox" ${(routine.types || []).includes(t) ? 'checked' : ''}
          onchange="toggleRoutineType(${rIdx},'${t}',this.checked)">
        ${t.charAt(0).toUpperCase() + t.slice(1)}
      </label>`
    ).join('');

    const stepsHtml = routine.steps.map((step, sIdx) => {
      const productsHtml = (step.products || []).map((p, pIdx) => `
        <div class="step-product-row">
          <input list="catalog-datalist" value="${escAttr(p.name)}"
            onchange="updateStepProduct(${rIdx},${sIdx},${pIdx},'name',this.value)"
            oninput="updateStepProduct(${rIdx},${sIdx},${pIdx},'name',this.value)"
            placeholder="Product name…" class="step-product-input">
          <input type="number" value="${p.ml ?? ''}" min="0" step="5"
            onchange="updateStepProduct(${rIdx},${sIdx},${pIdx},'ml',this.value)"
            placeholder="ml" class="step-ml-input">
          <button class="step-remove-btn" onclick="removeStepProduct(${rIdx},${sIdx},${pIdx})" title="Remove product">✕</button>
        </div>
      `).join('');
      const totalSteps = routine.steps.length;
      return `
        <div class="step-editor-block">
          <div class="step-editor-header">
            <span class="step-number-label">Step ${sIdx + 1}</span>
            <div class="step-reorder-btns">
              <button class="step-reorder-btn" onclick="moveRoutineStep(${rIdx},${sIdx},-1)" ${sIdx === 0 ? 'disabled' : ''} title="Move up">↑</button>
              <button class="step-reorder-btn" onclick="moveRoutineStep(${rIdx},${sIdx},1)" ${sIdx === totalSteps - 1 ? 'disabled' : ''} title="Move down">↓</button>
            </div>
            <button class="step-remove-btn" onclick="removeRoutineStep(${rIdx},${sIdx})" title="Remove step">✕</button>
          </div>
          <div class="step-editor-field-group">
            <label class="step-field-label">Step</label>
            <input value="${escAttr(step.name || '')}"
              onchange="updateRoutineStep(${rIdx},${sIdx},'name',this.value)"
              oninput="updateRoutineStep(${rIdx},${sIdx},'name',this.value)"
              placeholder="Short description…" class="step-name-input">
          </div>
          <div class="step-editor-field-group">
            <label class="step-field-label">Action</label>
            <input value="${escAttr(step.action || '')}"
              id="step-action-${rIdx}-${sIdx}"
              onchange="updateRoutineStep(${rIdx},${sIdx},'action',this.value)"
              oninput="updateRoutineStep(${rIdx},${sIdx},'action',this.value)"
              placeholder="What to do (detail)…" class="step-action-input">
          </div>
          <div class="step-products-section">
            <div class="step-products-header">
              <span class="step-field-label">Products</span>
              <button class="add-product-btn" onclick="addStepProduct(${rIdx},${sIdx})">+ Add</button>
            </div>
            ${productsHtml || '<p class="step-no-products">No products yet…</p>'}
          </div>
        </div>
      `;
    }).join('');

    const alertsHtml = (routine.alerts || []).map((alert, aIdx) => `
      <div class="alert-editor-row">
        <select class="alert-severity-select" onchange="updateRoutineAlert(${rIdx},${aIdx},'severity',this.value)">
          <option value="tip"    ${alert.severity === 'tip'    ? 'selected' : ''}>Tip</option>
          <option value="warn"   ${alert.severity === 'warn'   ? 'selected' : ''}>Warning</option>
          <option value="danger" ${alert.severity === 'danger' ? 'selected' : ''}>Danger</option>
        </select>
        <input value="${escAttr(alert.label || '')}"
          onchange="updateRoutineAlert(${rIdx},${aIdx},'label',this.value)"
          placeholder="Label (optional)…" class="alert-label-input">
        <input value="${escAttr(alert.text)}"
          onchange="updateRoutineAlert(${rIdx},${aIdx},'text',this.value)"
          placeholder="Alert text…" class="alert-text-input">
        <button class="step-remove-btn" onclick="removeRoutineAlert(${rIdx},${aIdx})" title="Remove">✕</button>
      </div>
    `).join('');

    return `
      <div class="routine-config-card-title"><span class="drag-handle routine-card-handle">⠿</span>${escHtml(routine.name || 'Untitled routine')}</div>
      <div class="routine-config-field">
        <span class="routine-config-label">Name</span>
        <input value="${escAttr(routine.name)}" oninput="updateRoutineMeta(${rIdx},'name',this.value)" style="width:100%;" class="log-input">
      </div>
      <div class="routine-config-field">
        <span class="routine-config-label">Subtext</span>
        <input value="${escAttr(routine.subtext || '')}" oninput="updateRoutineMeta(${rIdx},'subtext',this.value)" style="width:100%;" class="log-input">
      </div>
      <div class="routine-config-field">
        <span class="routine-config-label">Type</span>
        <div class="routine-type-checkboxes">${typeCheckboxes}</div>
      </div>
      <div class="routine-config-label" style="margin-bottom:8px;">Steps</div>
      ${stepsHtml}
      <button class="add-step-btn" onclick="addRoutineStep(${rIdx})" style="margin:8px 0 20px;">+ Add step</button>
      <div class="routine-config-label" style="margin-bottom:8px;">Alerts</div>
      ${alertsHtml}
      <button class="add-step-btn" onclick="addRoutineAlert(${rIdx})" style="margin:8px 0 16px;">+ Add alert</button>
      <div class="settings-save-bar" style="padding-top:12px;">
        <button class="settings-save-btn" onclick="saveRoutines()">Save</button>
        <button class="settings-reset-btn" style="color:var(--danger);" onclick="showRoutineDeleteConfirm(${rIdx})">Delete routine</button>
      </div>
      <div class="log-confirm-row" id="routine-confirm-${rIdx}" hidden>
        <span>Delete this routine?</span>
        <button class="log-confirm-cancel" onclick="cancelRoutineDelete(${rIdx})">Cancel</button>
        <button class="log-confirm-delete" onclick="deleteRoutine(${rIdx})">Delete</button>
      </div>
    `;
  }

  function escAttr(str) {
    return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function updateRoutineMeta(rIdx, field, val) {
    routines[rIdx][field] = val;
    const card = document.querySelectorAll('.routine-config-card')[rIdx];
    if (card) {
      const title = card.querySelector('.routine-config-card-title');
      if (title && field === 'name') title.textContent = val || 'Untitled routine';
    }
  }

  function toggleRoutineType(rIdx, type, checked) {
    const types = routines[rIdx].types || [];
    if (checked && !types.includes(type)) types.push(type);
    if (!checked) routines[rIdx].types = types.filter(t => t !== type);
    else routines[rIdx].types = types;
  }

  function updateRoutineStep(rIdx, sIdx, field, val) {
    routines[rIdx].steps[sIdx][field] = val;
  }

  function addRoutineStep(rIdx) {
    routines[rIdx].steps.push({ name: '', action: '', products: [] });
    renderRoutineConfigCards();
  }

  function removeRoutineStep(rIdx, sIdx) {
    routines[rIdx].steps.splice(sIdx, 1);
    renderRoutineConfigCards();
  }

  function moveRoutineStep(rIdx, sIdx, dir) {
    const steps = routines[rIdx].steps;
    const newIdx = sIdx + dir;
    if (newIdx < 0 || newIdx >= steps.length) return;
    [steps[sIdx], steps[newIdx]] = [steps[newIdx], steps[sIdx]];
    renderRoutineConfigCards();
  }

  function addStepProduct(rIdx, sIdx) {
    routines[rIdx].steps[sIdx].products.push({ name: '', ml: null });
    renderRoutineConfigCards();
  }

  function removeStepProduct(rIdx, sIdx, pIdx) {
    routines[rIdx].steps[sIdx].products.splice(pIdx, 1);
    renderRoutineConfigCards();
  }

  function updateStepProduct(rIdx, sIdx, pIdx, field, val) {
    routines[rIdx].steps[sIdx].products[pIdx][field] = field === 'ml' ? (val === '' ? null : Number(val)) : val;
    if (field === 'name') {
      const match = CATALOG.find(p => p.name === val);
      if (match && PRODUCT_ACTIONS[match.slug]) {
        const actionEl = document.getElementById(`step-action-${rIdx}-${sIdx}`);
        if (actionEl && !actionEl.value.trim()) {
          actionEl.value = PRODUCT_ACTIONS[match.slug];
          routines[rIdx].steps[sIdx].action = PRODUCT_ACTIONS[match.slug];
        }
      }
    }
  }

  function updateRoutineAlert(rIdx, aIdx, field, val) {
    routines[rIdx].alerts[aIdx][field] = val;
  }

  function addRoutineAlert(rIdx) {
    routines[rIdx].alerts = routines[rIdx].alerts || [];
    routines[rIdx].alerts.push({ severity: 'tip', label: '', text: '' });
    renderRoutineConfigCards();
  }

  function removeRoutineAlert(rIdx, aIdx) {
    routines[rIdx].alerts.splice(aIdx, 1);
    renderRoutineConfigCards();
  }

  function addRoutine() {
    routines.push({ id: 'routine-' + Date.now(), name: 'New Routine', subtext: '', types: [], steps: [], alerts: [] });
    renderRoutineConfigCards();
  }

  function showRoutineDeleteConfirm(rIdx) {
    document.getElementById(`routine-confirm-${rIdx}`)?.removeAttribute('hidden');
  }

  function cancelRoutineDelete(rIdx) {
    document.getElementById(`routine-confirm-${rIdx}`)?.setAttribute('hidden', '');
  }

  function deleteRoutine(rIdx) {
    routines.splice(rIdx, 1);
    renderRoutineConfigCards();
    renderRoutinesView();
    renderLogTypeSelect();
    renderSchedulesUI();
  }

  // ─── Maintenance functions ────────────────────────

  function maintenanceIntervalDays(item) {
    const u = { days: 1, weeks: 7, months: 30.44, years: 365.25 };
    return Math.round((item.intervalValue || 1) * (u[item.intervalUnit] || 1));
  }

  function maintenanceIntervalLabel(item) {
    if (item.intervalType === 'odometer') return `Every ${(item.intervalKm || 0).toLocaleString()} km`;
    const val = item.intervalValue || 1;
    const unit = item.intervalUnit || 'months';
    return `Every ${val} ${val === 1 ? unit.replace(/s$/, '') : unit}`;
  }

  function maintenanceNextDue(item) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (item.intervalType === 'time') {
      if (!item.lastCompletedDate) return { dueDate: null, dueKm: null, status: 'never-done' };
      const days = maintenanceIntervalDays(item);
      const [y, m, d] = item.lastCompletedDate.split('-').map(Number);
      const due = new Date(y, m - 1, d + days);
      const diffDays = Math.round((due - today) / 86400000);
      const status = diffDays < 0 ? 'overdue' : diffDays <= 14 ? 'due-soon' : 'ok';
      return { dueDate: due, dueKm: null, status };
    }
    if (item.lastCompletedOdometer == null) return { dueDate: null, dueKm: null, status: 'never-done' };
    const dueKm = item.lastCompletedOdometer + (item.intervalKm || 0);
    const currentOdo = settings.car?.currentOdometer ?? null;
    if (currentOdo == null) return { dueDate: null, dueKm, status: 'ok' };
    const remaining = dueKm - currentOdo;
    const status = remaining <= 0 ? 'overdue' : remaining <= 2000 ? 'due-soon' : 'ok';
    return { dueDate: null, dueKm, status };
  }

  function maintenanceDueLabel(item) {
    const { dueDate, dueKm, status } = maintenanceNextDue(item);
    if (status === 'never-done') return 'Not yet recorded';
    if (item.intervalType === 'odometer') {
      const currentOdo = settings.car?.currentOdometer ?? null;
      if (currentOdo != null) {
        const remaining = dueKm - currentOdo;
        if (remaining <= 0) return `Overdue — was due at ${dueKm.toLocaleString()} km`;
        return `Due at ${dueKm.toLocaleString()} km (${remaining.toLocaleString()} km away)`;
      }
      return `Due at ${dueKm.toLocaleString()} km`;
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((dueDate - today) / 86400000);
    if (diffDays < 0) { const n = Math.abs(diffDays); return `Overdue — was due ${n} day${n !== 1 ? 's' : ''} ago`; }
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    const dueFmt = dueDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    return `Due in ${diffDays} days (${dueFmt})`;
  }

  function maintenanceItemIsUrgent(item) {
    if (!item.enabled) return false;
    const { status } = maintenanceNextDue(item);
    return status === 'overdue' || status === 'due-soon' || status === 'never-done';
  }

  async function loadMaintenance() {
    const saved = await storageGet(MAINTENANCE_KEY);
    if (saved && Array.isArray(saved) && saved.length) maintenanceItems = saved;
    else maintenanceItems = JSON.parse(JSON.stringify(DEFAULT_MAINTENANCE_ITEMS));
    const savedLog = await storageGet(MAINTENANCE_LOG_KEY);
    if (savedLog && Array.isArray(savedLog)) maintenanceLog = savedLog;
    renderMaintenanceUpcoming();
    renderMaintenanceSchedule();
    renderMaintenanceHistory();
    renderMaintenanceConfigCards();
  }

  async function saveMaintenance() {
    await storageSet(MAINTENANCE_KEY, maintenanceItems);
    syncPush(MAINTENANCE_KEY, maintenanceItems);
    renderMaintenanceUpcoming();
    renderMaintenanceSchedule();
    renderMaintenanceHistory();
    renderMaintenanceConfigCards();
    showSaved('maintenance-saved');
  }

  async function saveMaintenanceLog() {
    await storageSet(MAINTENANCE_LOG_KEY, maintenanceLog);
    syncPush(MAINTENANCE_LOG_KEY, maintenanceLog);
    renderMaintenanceHistory();
  }

  function renderMaintenanceUpcoming() {
    const el = document.getElementById('maintenance-upcoming-cards');
    if (!el) return;
    const urgentOrder = { overdue: 0, 'never-done': 1, 'due-soon': 2 };
    const urgent = maintenanceItems
      .filter(item => item.enabled && maintenanceItemIsUrgent(item))
      .map(item => ({ item, ...maintenanceNextDue(item) }))
      .sort((a, b) => (urgentOrder[a.status] ?? 3) - (urgentOrder[b.status] ?? 3));
    if (!urgent.length) {
      el.innerHTML = '<div class="maintenance-empty">Everything is on schedule.</div>';
      return;
    }
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const currentOdo = settings.car?.currentOdometer ?? '';
    el.innerHTML = urgent.map(({ item, status }) => {
      const cardClass = status === 'overdue' ? 'wash-reminder-card wash-reminder-card--overdue' : 'wash-reminder-card';
      const lastLabel = item.lastCompletedDate
        ? formatDate(item.lastCompletedDate)
        : item.lastCompletedOdometer != null ? `${item.lastCompletedOdometer.toLocaleString()} km` : 'Never';
      return `
        <div class="${cardClass}">
          <div class="reminder-row">
            <div class="reminder-body">
              <div class="reminder-name">${escHtml(item.name)}</div>
              <div class="reminder-status">${escHtml(maintenanceDueLabel(item))} · ${escHtml(maintenanceIntervalLabel(item))} · Last: ${escHtml(lastLabel)}</div>
              ${item.notes ? `<div class="reminder-status" style="margin-top:4px;">${escHtml(item.notes)}</div>` : ''}
            </div>
            <div class="reminder-actions">
              <button class="reminder-btn reminder-btn--accent" onclick="showMaintenanceCompleteForm('${escAttr(item.id)}')">Mark Complete</button>
            </div>
          </div>
          <div class="maintenance-complete-form" id="maint-form-${escAttr(item.id)}" hidden>
            <div class="log-field">
              <label class="log-label" for="maint-date-${escAttr(item.id)}">Date</label>
              <input class="log-input" type="date" id="maint-date-${escAttr(item.id)}" value="${todayStr}">
            </div>
            <div class="log-field">
              <label class="log-label" for="maint-odo-${escAttr(item.id)}">Odometer (km)</label>
              <input class="log-input" type="number" id="maint-odo-${escAttr(item.id)}" min="0" placeholder="e.g. 12450" value="${escAttr(String(currentOdo))}">
            </div>
            <div class="log-field full">
              <label class="log-label" for="maint-desc-${escAttr(item.id)}">Notes <span style="font-weight:400;color:var(--ink-mid)">(optional)</span></label>
              <input class="log-input" type="text" id="maint-desc-${escAttr(item.id)}" placeholder="e.g. used 0W-20, rotated front-to-back">
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              <button class="settings-save-btn" onclick="saveMaintenanceComplete('${escAttr(item.id)}')">Save</button>
              <button class="settings-reset-btn" onclick="hideMaintenanceCompleteForm('${escAttr(item.id)}')">Cancel</button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function renderMaintenanceSchedule() {
    const el = document.getElementById('maintenance-schedule-list');
    if (!el) return;
    const enabled = maintenanceItems.filter(item => item.enabled);
    if (!enabled.length) {
      el.innerHTML = '<p class="maintenance-schedule-empty">No items configured. Add some in the Configuration tab.</p>';
      return;
    }
    const withDue = enabled.map(item => ({ item, due: maintenanceNextDue(item) }));
    withDue.sort((a, b) => {
      const ord = { overdue: 0, 'never-done': 1, 'due-soon': 2, ok: 3 };
      return (ord[a.due.status] ?? 4) - (ord[b.due.status] ?? 4);
    });
    el.innerHTML = `
      <table class="routine-table" style="width:100%;table-layout:fixed;">
        <colgroup><col style="width:35%"><col style="width:22%"><col style="width:20%"><col style="width:23%"></colgroup>
        <thead><tr>
          <th style="text-align:left;">Item</th>
          <th style="text-align:left;">Interval</th>
          <th style="text-align:left;">Last done</th>
          <th style="text-align:left;">Next due</th>
        </tr></thead>
        <tbody>
          ${withDue.map(({ item, due }) => {
            const lastLabel = item.lastCompletedDate
              ? item.lastCompletedDate
              : item.lastCompletedOdometer != null ? `${item.lastCompletedOdometer.toLocaleString()} km` : '—';
            const nextLabel = maintenanceDueLabel(item);
            const urgent = due.status === 'overdue' || due.status === 'due-soon';
            const rowStyle = due.status === 'overdue' ? 'style="color:var(--accent);font-weight:600"' : '';
            return `<tr ${rowStyle}>
              <td>${escHtml(item.name)}</td>
              <td>${escHtml(maintenanceIntervalLabel(item))}</td>
              <td>${escHtml(lastLabel)}</td>
              <td>${escHtml(nextLabel)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  function renderMaintenanceHistory() {
    const el = document.getElementById('maintenance-history-list');
    if (!el) return;
    if (!maintenanceLog.length) {
      el.innerHTML = '<div class="maintenance-empty">No completed items yet. Mark items complete in the Upcoming tab.</div>';
      return;
    }
    el.innerHTML = maintenanceLog.map(entry => {
      const odoText = entry.odometer ? `${Number(entry.odometer).toLocaleString()} km` : '';
      return `
        <div class="log-entry">
          <button class="log-menu-btn" onclick="showMaintenanceLogDeleteConfirm(${entry.id})" title="Delete">···</button>
          <div class="log-entry-head">
            <div class="log-entry-date">${formatDate(entry.date)}</div>
            <div class="log-entry-type quick">${escHtml(entry.itemName)}</div>
          </div>
          ${odoText ? `<div style="font-size:13px;color:var(--ink-mid);margin-top:4px;">${odoText}</div>` : ''}
          ${entry.description ? `<div class="log-entry-notes">${escHtml(entry.description)}</div>` : ''}
          <div class="log-confirm-row" id="maint-hist-confirm-${entry.id}" hidden>
            <span>Delete this entry?</span>
            <button class="log-confirm-cancel" onclick="cancelMaintenanceLogDelete(${entry.id})">Cancel</button>
            <button class="log-confirm-delete" onclick="deleteMaintenanceLogEntry(${entry.id})">Delete</button>
          </div>
        </div>`;
    }).join('');
  }

  function renderMaintenanceConfigCards() {
    const el = document.getElementById('maintenance-config-cards');
    if (!el) return;
    el.innerHTML = maintenanceItems.map((item, idx) => `
      <div class="routine-config-card" draggable="true" id="maint-card-${idx}">
        <div class="routine-config-card-title">⠿ ${escHtml(item.name || 'Untitled item')}</div>
        <div class="log-form-grid" style="margin-bottom:12px;">
          <div class="log-field full">
            <label class="log-label">Name</label>
            <input class="log-input" type="text" value="${escAttr(item.name)}"
              oninput="updateMaintenanceItem(${idx},'name',this.value)">
          </div>
          <div class="log-field full">
            <label class="log-label">Notes <span style="font-weight:400;color:var(--ink-mid)">(optional)</span></label>
            <input class="log-input" type="text" value="${escAttr(item.notes || '')}"
              oninput="updateMaintenanceItem(${idx},'notes',this.value)">
          </div>
        </div>
        <div style="margin-bottom:12px;">
          <label class="log-label">Schedule type</label>
          <div style="display:flex;gap:16px;margin-top:6px;">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px;">
              <input type="radio" name="maint-type-${idx}" value="time"
                ${item.intervalType === 'time' ? 'checked' : ''}
                onchange="updateMaintenanceItem(${idx},'intervalType','time')"> Time-based
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px;">
              <input type="radio" name="maint-type-${idx}" value="odometer"
                ${item.intervalType === 'odometer' ? 'checked' : ''}
                onchange="updateMaintenanceItem(${idx},'intervalType','odometer')"> Odometer
            </label>
          </div>
        </div>
        <div id="maint-time-fields-${idx}" ${item.intervalType === 'odometer' ? 'hidden' : ''}>
          <div class="log-form-grid" style="margin-bottom:12px;">
            <div class="log-field">
              <label class="log-label">Every</label>
              <input class="log-input" type="number" min="1" max="365" value="${escAttr(String(item.intervalValue || 1))}"
                oninput="updateMaintenanceItem(${idx},'intervalValue',+this.value||1)">
            </div>
            <div class="log-field">
              <label class="log-label">Unit</label>
              <select class="log-select" onchange="updateMaintenanceItem(${idx},'intervalUnit',this.value)">
                ${['days','weeks','months','years'].map(u =>
                  `<option value="${u}"${item.intervalUnit === u ? ' selected' : ''}>${u}</option>`
                ).join('')}
              </select>
            </div>
          </div>
        </div>
        <div id="maint-odo-fields-${idx}" ${item.intervalType === 'time' ? 'hidden' : ''} style="margin-bottom:12px;">
          <div class="log-field">
            <label class="log-label">Every (km)</label>
            <input class="log-input" type="number" min="100" step="100" value="${escAttr(String(item.intervalKm || ''))}"
              placeholder="e.g. 10000" oninput="updateMaintenanceItem(${idx},'intervalKm',+this.value||null)">
          </div>
        </div>
        <div style="margin-bottom:16px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;">
            <input type="checkbox" ${item.enabled ? 'checked' : ''}
              onchange="updateMaintenanceItem(${idx},'enabled',this.checked)"> Enabled
          </label>
        </div>
        <div class="settings-save-bar">
          <button class="settings-save-btn" onclick="saveMaintenance()">Save</button>
          <button class="settings-reset-btn routine-delete-btn" onclick="showMaintenanceDeleteConfirm(${idx})">Delete</button>
        </div>
        <div id="maintenance-confirm-${idx}" hidden class="maintenance-confirm-row">
          <span style="color:var(--ink-mid);font-size:13px;">Delete this item?</span>
          <button class="settings-save-btn" onclick="deleteMaintenanceItem(${idx})">Delete</button>
          <button class="settings-reset-btn" onclick="cancelMaintenanceDelete(${idx})">Cancel</button>
        </div>
      </div>`).join('');

    el.querySelectorAll('.routine-config-card').forEach((card, idx) => {
      card.addEventListener('dragstart', e => {
        maintenanceDragSrc = idx;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drag-over'); });
      card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
      card.addEventListener('drop', e => {
        e.preventDefault();
        card.classList.remove('drag-over');
        if (maintenanceDragSrc === null || maintenanceDragSrc === idx) return;
        const [moved] = maintenanceItems.splice(maintenanceDragSrc, 1);
        maintenanceItems.splice(idx, 0, moved);
        maintenanceDragSrc = null;
        renderMaintenanceConfigCards();
      });
    });
  }

  function showMaintenanceCompleteForm(itemId) {
    document.getElementById(`maint-form-${itemId}`)?.removeAttribute('hidden');
  }

  function hideMaintenanceCompleteForm(itemId) {
    document.getElementById(`maint-form-${itemId}`)?.setAttribute('hidden', '');
  }

  function showMaintenanceLogDeleteConfirm(entryId) {
    document.getElementById(`maint-hist-confirm-${entryId}`)?.removeAttribute('hidden');
  }

  function cancelMaintenanceLogDelete(entryId) {
    document.getElementById(`maint-hist-confirm-${entryId}`)?.setAttribute('hidden', '');
  }

  async function deleteMaintenanceLogEntry(entryId) {
    const deleted = maintenanceLog.find(e => e.id === entryId);
    maintenanceLog = maintenanceLog.filter(e => e.id !== entryId);

    if (deleted) {
      const item = maintenanceItems.find(i => i.id === deleted.itemId);
      if (item) {
        const remaining = maintenanceLog.filter(e => e.itemId === deleted.itemId);
        item.lastCompletedDate     = remaining[0]?.date     ?? null;
        item.lastCompletedOdometer = remaining[0]?.odometer ?? null;
      }
    }

    await saveMaintenanceLog();
    await saveMaintenance();
  }

  async function saveMaintenanceComplete(itemId) {
    const item = maintenanceItems.find(i => i.id === itemId);
    if (!item) return;
    const dateVal = document.getElementById(`maint-date-${itemId}`)?.value || '';
    const odoVal  = +document.getElementById(`maint-odo-${itemId}`)?.value || null;
    const descVal = document.getElementById(`maint-desc-${itemId}`)?.value.trim() || '';
    if (!dateVal) { alert('Please select a date.'); return; }
    item.lastCompletedDate = dateVal;
    if (odoVal) item.lastCompletedOdometer = odoVal;
    if (odoVal && odoVal > (settings.car?.currentOdometer ?? 0)) {
      settings.car.currentOdometer = odoVal;
      const carOdoEl = document.getElementById('car-odometer');
      if (carOdoEl) carOdoEl.value = odoVal;
      storageSet(SETTINGS_KEY, settings);
      syncPush(SETTINGS_KEY, settings);
    }
    maintenanceLog.unshift({ id: Date.now(), itemId: item.id, itemName: item.name, date: dateVal, odometer: odoVal, description: descVal || null });
    saveMaintenanceLog();
    await saveMaintenance();
  }

  function updateMaintenanceItem(idx, field, val) {
    if (!maintenanceItems[idx]) return;
    maintenanceItems[idx][field] = val;
    if (field === 'intervalType') {
      const isOdo = val === 'odometer';
      document.getElementById(`maint-time-fields-${idx}`)?.toggleAttribute('hidden', isOdo);
      document.getElementById(`maint-odo-fields-${idx}`)?.toggleAttribute('hidden', !isOdo);
    }
  }

  function addMaintenanceItem() {
    maintenanceItems.push({
      id: `maint-custom-${Date.now()}`,
      name: '', notes: '',
      intervalType: 'time', intervalValue: 1, intervalUnit: 'months', intervalKm: null,
      lastCompletedDate: null, lastCompletedOdometer: null, enabled: true,
    });
    renderMaintenanceConfigCards();
    document.getElementById('maintenance-config-cards')?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function showMaintenanceDeleteConfirm(idx) {
    document.getElementById(`maintenance-confirm-${idx}`)?.removeAttribute('hidden');
  }

  function cancelMaintenanceDelete(idx) {
    document.getElementById(`maintenance-confirm-${idx}`)?.setAttribute('hidden', '');
  }

  async function deleteMaintenanceItem(idx) {
    maintenanceItems.splice(idx, 1);
    await saveMaintenance();
  }

  function exportMaintenanceCSV() {
    const header = 'row_type,item_id,name,notes,interval_type,interval_value,interval_unit,interval_km';
    const rows = [header];
    maintenanceItems.forEach(item => {
      rows.push([
        csvField('ITEM'),
        csvField(item.id),
        csvField(item.name),
        csvField(item.notes || ''),
        csvField(item.intervalType),
        csvField(item.intervalType === 'time' ? item.intervalValue : ''),
        csvField(item.intervalType === 'time' ? item.intervalUnit : ''),
        csvField(item.intervalType === 'odometer' ? item.intervalKm : ''),
      ].join(','));
    });
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    triggerDownload('﻿' + rows.join('\r\n'), `maintenance-${date}.csv`, 'text/csv;charset=utf-8;');
  }

  function parseMaintenanceCSV(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    const items = [];
    for (const line of lines) {
      const cols = parseCSVRow(line);
      if (!cols || cols[0]?.toUpperCase() !== 'ITEM') continue;
      const [, itemId, name, notes, intervalType, intervalValue, intervalUnit, intervalKm] = cols;
      if (!name) continue;
      items.push({
        id: itemId || `maint-import-${Date.now()}`,
        name: name.trim(),
        notes: (notes || '').trim(),
        intervalType: intervalType === 'odometer' ? 'odometer' : 'time',
        intervalValue: intervalValue ? +intervalValue : 1,
        intervalUnit: intervalUnit || 'months',
        intervalKm: intervalKm ? +intervalKm : null,
        lastCompletedDate: null,
        lastCompletedOdometer: null,
        enabled: true,
      });
    }
    return items;
  }

  function importMaintenanceCSV() {
    const input = document.getElementById('maintenance-csv-input');
    input.value = '';
    input.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const parsed = parseMaintenanceCSV(text);
      if (!parsed.length) { alert('No valid ITEM rows found in the file.'); return; }
      if (!confirm(`Import ${parsed.length} item${parsed.length !== 1 ? 's' : ''}? They will be appended to your existing items.`)) return;
      const ts = Date.now();
      parsed.forEach((item, i) => { item.id = `maint-import-${item.id}-${ts + i}`; });
      maintenanceItems.push(...parsed);
      await saveMaintenance();
    };
    input.click();
  }

  function downloadMaintenanceTemplate() {
    triggerDownload(MAINTENANCE_CSV_TEMPLATE, 'maintenance-template.txt', 'text/plain;charset=utf-8;');
  }

  // Preferences
  function loadPrefsUI() {
    document.getElementById('pref-show-prices').checked = settings.prefs.showPrices;
    document.getElementById('pref-show-badges').checked = settings.prefs.showBadges;
    document.getElementById('pref-show-desc').checked = settings.prefs.showDesc;
  }

  function applyPrefs() {
    // Prices
    document.querySelectorAll('.item-price').forEach(el => {
      el.style.display = settings.prefs.showPrices ? '' : 'none';
    });
    // Phase badges
    document.querySelectorAll('[data-phase-status]').forEach(el => {
      el.style.display = settings.prefs.showBadges ? '' : 'none';
    });
    // Item descriptions
    document.querySelectorAll('.item-desc').forEach(el => {
      el.style.display = settings.prefs.showDesc ? '' : 'none';
    });
  }

  // Car info
  function loadCarUI() {
    document.getElementById('car-model').value = settings.car.model || '';
    document.getElementById('car-year').value = settings.car.year || '';
    document.getElementById('car-colour').value = settings.car.colour || '';
    document.getElementById('car-display-name').value = settings.car.displayName || '';
    document.getElementById('car-postcode').value = settings.car.postcode || '';
    document.getElementById('car-odometer').value = settings.car.currentOdometer || '';
  }

  async function loadNotificationsUI() {
    document.getElementById('pref-ticktick-alerts').checked       = settings.notifications.ticktickAlerts;
    document.getElementById('ticktick-tags').value                = (settings.notifications.ticktickTags ?? []).join(', ');
    document.getElementById('ticktick-priority').value            = String(settings.notifications.ticktickPriority ?? 0);
    document.getElementById('pref-email-alerts').checked          = settings.notifications.emailAlerts;
    document.getElementById('pref-wash-reminders').checked        = settings.notifications.washReminders;
    document.getElementById('pref-email-wash-reminders').checked  = settings.notifications.emailWashReminders;
    document.getElementById('pref-email-digest').checked          = settings.notifications.emailDigest;
    await refreshTickTickStatus();
  }

  async function refreshTickTickStatus() {
    if (!syncEnabled) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/ticktick/status`, { credentials: 'include' });
      const { connected } = await res.json();
      const statusText   = document.getElementById('ticktick-status-text');
      const connectBtn   = document.getElementById('ticktick-connect-btn');
      const disconnectBtn = document.getElementById('ticktick-disconnect-btn');
      const projectRow  = document.getElementById('ticktick-project-row');
      const tagsRow     = document.getElementById('ticktick-tags-row');
      const priorityRow = document.getElementById('ticktick-priority-row');
      ticktickIsConnected = connected;
      if (connected) {
        statusText.textContent = 'Connected';
        connectBtn.hidden    = true;
        disconnectBtn.hidden = false;
        projectRow.hidden    = false;
        tagsRow.hidden       = false;
        priorityRow.hidden   = false;
        await loadTickTickProjects();
      } else {
        statusText.textContent = 'Not connected';
        connectBtn.hidden    = false;
        disconnectBtn.hidden = true;
        projectRow.hidden    = true;
        tagsRow.hidden       = true;
        priorityRow.hidden   = true;
      }
      renderWashReminderCards();
    } catch { /* backend unreachable — leave as-is */ }
  }

  async function loadTickTickProjects() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/ticktick/projects`, { credentials: 'include' });
      if (!res.ok) return;
      const projects = await res.json();
      const sel = document.getElementById('ticktick-project-id');
      sel.innerHTML = '<option value="">Select a list…</option>';
      for (const p of projects) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (p.id === settings.notifications.ticktickProjectId) opt.selected = true;
        sel.appendChild(opt);
      }
    } catch { /* ignore */ }
  }

  function connectTickTick() {
    window.location.href = `${BACKEND_URL}/api/ticktick/auth`;
  }
  window.connectTickTick = connectTickTick;

  async function disconnectTickTick() {
    if (!confirm('Disconnect TickTick?')) return;
    await fetch(`${BACKEND_URL}/api/ticktick/disconnect`, { method: 'DELETE', credentials: 'include' });
    await refreshTickTickStatus();
  }
  window.disconnectTickTick = disconnectTickTick;

  async function loadAlerts() {
    const saved = await storageGet(ALERTS_KEY);
    if (saved && typeof saved === 'object') priceAlerts = saved;
  }

  function applyCarInfo() {
    const { model, year, colour } = settings.car;
    const m = model || 'Corolla ZR Hybrid';
    const y = year  || '2025';
    const h1 = document.getElementById('header-h1');
    if (h1) h1.innerHTML = `${y} <em>${m}</em><br>care guide`;
    const footerCtx = document.getElementById('footer-context');
    if (footerCtx) footerCtx.textContent = `Kit & technique reference for the ${y} ${m}`;
    applyColourAccent(colour);
  }

  function applyColourAccent(colourText) {
    const root = document.documentElement;
    if (!colourText) {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-dark');
      root.style.removeProperty('--accent-tint');
      return;
    }
    const t = colourText.toLowerCase();
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const palettes = [
      {
        words: ['bronze', 'copper', 'amber', 'mango', 'spice', 'gold', 'caramel'],
        light:    ['#8b5e1a', '#6b4712', 'rgba(139,94,26,0.10)'],
        darkMode: ['#d4983a', '#8b5e1a', 'rgba(212,152,58,0.15)'],
      },
      {
        words: ['red', 'crimson', 'scarlet', 'burgundy', 'ruby', 'burn', 'rose'],
        light:    ['#a83030', '#7a2020', 'rgba(168,48,48,0.10)'],
        darkMode: ['#e06060', '#a83030', 'rgba(224,96,96,0.15)'],
      },
      {
        words: ['blue', 'mineral', 'navy', 'cobalt', 'sapphire', 'ocean', 'teal'],
        light:    ['#1a5a8b', '#124070', 'rgba(26,90,139,0.10)'],
        darkMode: ['#4a90d9', '#1a5a8b', 'rgba(74,144,217,0.15)'],
      },
      {
        words: ['grey', 'gray', 'graphite', 'graphene', 'silver', 'slate', 'platinum', 'titanium', 'meteor'],
        light:    ['#4a5460', '#323c48', 'rgba(74,84,96,0.10)'],
        darkMode: ['#8a9ab0', '#4a5460', 'rgba(138,154,176,0.15)'],
      },
      {
        words: ['black', 'obsidian', 'midnight', 'onyx', 'phantom', 'eclipse'],
        light:    ['#3a3a50', '#252535', 'rgba(58,58,80,0.10)'],
        darkMode: ['#7070a0', '#3a3a50', 'rgba(112,112,160,0.15)'],
      },
    ];

    for (const p of palettes) {
      if (p.words.some(w => t.includes(w))) {
        const [accent, accentDark, accentTint] = dark ? p.darkMode : p.light;
        root.style.setProperty('--accent', accent);
        root.style.setProperty('--accent-dark', accentDark);
        root.style.setProperty('--accent-tint', accentTint);
        return;
      }
    }
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-dark');
    root.style.removeProperty('--accent-tint');
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyCarInfo());

  // Rebuild log step chips from settings
  function applySchedule() {
    document.querySelectorAll('[data-sched]').forEach(cell => {
      const key = cell.dataset.sched;
      const idx = settings.freq[key] ?? FREQ_DEFAULTS[key];
      const opts = FREQ_OPTIONS[key];
      if (opts) cell.textContent = opts[idx];
    });
  }

  // Rebuild log step chips from settings
  function applyLogStepChips() {
    const container = document.getElementById('steps-checklist');
    if (!container) return;
    const steps = (settings.routines.log || DEFAULT_STEPS.log).filter(s => s.enabled);
    container.innerHTML = steps.map(s =>
      `<label class="step-chip"><input type="checkbox" value="${s.name}"> ${s.name}</label>`
    ).join('');
    // Re-attach toggle listeners
    container.querySelectorAll('.step-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const cb = chip.querySelector('input');
        chip.classList.toggle('checked', cb.checked);
      });
      chip.querySelector('input').addEventListener('change', function() {
        chip.classList.toggle('checked', this.checked);
      });
    });
  }

  // Save / load settings
  async function saveSettings(section) {
    if (section === 'freq') {
      // freq already updated via adjustFreq
    } else if (section === 'routines') {
      // routines already updated in-place
    } else if (section === 'prefs') {
      settings.prefs.showPrices = document.getElementById('pref-show-prices').checked;
      settings.prefs.showBadges = document.getElementById('pref-show-badges').checked;
      settings.prefs.showDesc = document.getElementById('pref-show-desc').checked;
    } else if (section === 'car') {
      settings.car.model = document.getElementById('car-model').value.trim();
      settings.car.year = document.getElementById('car-year').value.trim();
      settings.car.colour = document.getElementById('car-colour').value.trim();
      settings.car.displayName = document.getElementById('car-display-name').value.trim();
      settings.car.postcode = document.getElementById('car-postcode').value.trim();
      settings.car.currentOdometer = +document.getElementById('car-odometer').value || null;
    } else if (section === 'notifications') {
      settings.notifications.ticktickAlerts     = document.getElementById('pref-ticktick-alerts')?.checked ?? true;
      settings.notifications.ticktickProjectId  = document.getElementById('ticktick-project-id')?.value || null;
      settings.notifications.ticktickTags       = (document.getElementById('ticktick-tags')?.value ?? '')
        .split(',').map(t => t.trim()).filter(Boolean);
      settings.notifications.ticktickPriority   = Number(document.getElementById('ticktick-priority')?.value ?? 0);
      settings.notifications.emailAlerts        = document.getElementById('pref-email-alerts')?.checked ?? false;
      settings.notifications.washReminders      = document.getElementById('pref-wash-reminders')?.checked ?? true;
      settings.notifications.emailWashReminders = document.getElementById('pref-email-wash-reminders')?.checked ?? false;
      settings.notifications.emailDigest        = document.getElementById('pref-email-digest')?.checked ?? false;
    } else if (section === 'schedules') {
      // settings.schedules already mutated in-place via updateScheduleField / addScheduleEntry / removeScheduleEntry
    }
    await storageSet(SETTINGS_KEY, settings);
    syncPush(SETTINGS_KEY, settings);
    renderWashReminderCards();
    applyPrefs();
    applyCarInfo();
    applyLogStepChips();
    applySchedule();
    // Show saved message(s)
    const msgIds = section === 'car' ? ['car-saved', 'sync-name-saved'] : [`${section}-saved`];
    msgIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.classList.add('visible'); setTimeout(() => el.classList.remove('visible'), 2200); }
    });
    if (section === 'car') renderAuthUI();
    if (section === 'car') loadWeather();
  }

  async function loadSettings() {
    const saved = await storageGet(SETTINGS_KEY);
    if (saved) {
      // Merge carefully to preserve defaults for any missing keys
      if (saved.freq) settings.freq = { ...FREQ_DEFAULTS, ...saved.freq };
      if (saved.routines) {
        settings.routines = {
          exterior: saved.routines.exterior || JSON.parse(JSON.stringify(DEFAULT_STEPS.exterior)),
          interior: saved.routines.interior || JSON.parse(JSON.stringify(DEFAULT_STEPS.interior)),
          log:      saved.routines.log      || JSON.parse(JSON.stringify(DEFAULT_STEPS.log))
        };
      }
      if (saved.prefs) settings.prefs = { ...DEFAULT_PREFS, ...saved.prefs };
      if (saved.car)           settings.car           = { model:'', year:'', colour:'', displayName:'', postcode:'', ...saved.car };
      if (saved.notifications) settings.notifications = { ...DEFAULT_NOTIFICATIONS, ...saved.notifications };
      if (Array.isArray(saved.schedules)) settings.schedules = saved.schedules;
    }
    renderFreqDisplays();
    renderAllRoutineEditors();
    loadPrefsUI();
    loadCarUI();
    loadNotificationsUI();
    renderSchedulesUI();
    renderWashReminderCards();
    applyPrefs();
    applyCarInfo();
    applyLogStepChips();
    applySchedule();
  }

  // Reset helpers
  async function resetFreq() {
    if (!confirm('Reset frequency settings to defaults?')) return;
    settings.freq = { ...FREQ_DEFAULTS };
    renderFreqDisplays();
    await storageSet(SETTINGS_KEY, settings);
    syncPush(SETTINGS_KEY, settings);
    applySchedule();
    showSaved('freq-saved');
  }

  async function resetRoutines() {
    if (!confirm('Reset all routine steps to defaults? Your customisations will be lost.')) return;
    settings.routines = JSON.parse(JSON.stringify(DEFAULT_STEPS));
    renderAllRoutineEditors();
    applyLogStepChips();
    await storageSet(SETTINGS_KEY, settings);
    syncPush(SETTINGS_KEY, settings);
    showSaved('routines-saved');
  }

  async function resetPrefs() {
    if (!confirm('Reset display preferences to defaults?')) return;
    settings.prefs = { ...DEFAULT_PREFS };
    loadPrefsUI();
    applyPrefs();
    await storageSet(SETTINGS_KEY, settings);
    syncPush(SETTINGS_KEY, settings);
    showSaved('prefs-saved');
  }

  async function resetNotifications() {
    if (!confirm('Reset notification settings to defaults?')) return;
    settings.notifications = { ...DEFAULT_NOTIFICATIONS };
    loadNotificationsUI();
    await storageSet(SETTINGS_KEY, settings);
    syncPush(SETTINGS_KEY, settings);
    showSaved('notifications-saved');
  }
  function toggleAlertForm(slug) {
    const form = document.getElementById(`alert-form-${slug}`);
    if (!form) return;
    const opening = form.style.display === 'none' || form.style.display === '';
    form.style.display = opening ? 'block' : 'none';
    if (opening) {
      const alert = priceAlerts[slug];
      const inp = document.getElementById(`alert-threshold-${slug}`);
      const sel = document.getElementById(`alert-channel-${slug}`);
      if (inp) inp.value = alert ? (alert.thresholdCents / 100).toFixed(2) : '';
      if (sel) sel.value = alert?.channel || 'global';
    }
  }

  async function saveAlert(slug) {
    const inp = document.getElementById(`alert-threshold-${slug}`);
    const sel = document.getElementById(`alert-channel-${slug}`);
    const val = parseFloat(inp?.value ?? '');
    if (!val || val <= 0) { inp?.focus(); return; }
    priceAlerts[slug] = { thresholdCents: Math.round(val * 100), channel: sel?.value || 'global' };
    await storageSet(ALERTS_KEY, priceAlerts);
    syncPush(ALERTS_KEY, priceAlerts);
    const btn = document.getElementById(`alert-btn-${slug}`);
    if (btn) { btn.classList.add('active'); btn.title = 'Alert set — click to edit'; }
    const form = document.getElementById(`alert-form-${slug}`);
    if (form) form.style.display = 'none';
    renderAlertsPanel();
  }

  async function clearAlert(slug) {
    delete priceAlerts[slug];
    await storageSet(ALERTS_KEY, priceAlerts);
    syncPush(ALERTS_KEY, priceAlerts);
    const btn = document.getElementById(`alert-btn-${slug}`);
    if (btn) { btn.classList.remove('active'); btn.title = 'Set price alert'; }
    const form = document.getElementById(`alert-form-${slug}`);
    if (form) form.style.display = 'none';
    renderAlertsPanel();
  }

  function showSaved(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2200);
  }

  // Data management
  async function exportData() {
    const checklistData = await storageGet(CHECKLIST_V3_KEY) || {};
    const logData = await storageGet(LOG_KEY) || [];
    const budgetData = await storageGet(BUDGET_KEY) || {};
    const exportObj = {
      exported: new Date().toISOString(),
      app: 'Corolla ZR Detailing Guide',
      checklist: checklistData,
      washLog: logData,
      budget: budgetData,
      settings
    };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `corolla-detailing-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function clearLog() {
    if (!confirm('Delete all wash log sessions? This cannot be undone.')) return;
    washLog = [];
    await saveLog();
    renderLog();
  }

  async function resetRoutines() {
    if (!confirm('Reset all routines to defaults? Your customisations will be lost.')) return;
    routines = JSON.parse(JSON.stringify(DEFAULT_ROUTINES));
    await storageSet(ROUTINES_KEY, routines);
    syncPush(ROUTINES_KEY, routines);
    await loadRoutines();
  }

  async function resetMaintenance() {
    if (!confirm('Reset maintenance schedule to defaults? Your items and history will be lost.')) return;
    maintenanceItems = JSON.parse(JSON.stringify(DEFAULT_MAINTENANCE_ITEMS));
    maintenanceLog = [];
    await storageSet(MAINTENANCE_KEY, maintenanceItems);
    await storageSet(MAINTENANCE_LOG_KEY, maintenanceLog);
    syncPush(MAINTENANCE_KEY, maintenanceItems);
    syncPush(MAINTENANCE_LOG_KEY, maintenanceLog);
    renderMaintenanceUpcoming();
    renderMaintenanceSchedule();
    renderMaintenanceHistory();
    renderMaintenanceConfigCards();
  }

  async function resetEverything() {
    if (!confirm('This will clear ALL data — checklist, wash log, budget, and settings. Are you sure?')) return;
    if (!confirm('Last chance — all your data will be deleted. Continue?')) return;
    // Push empty values to remote first so the reset propagates to all devices
    if (syncEnabled) {
      await Promise.allSettled([
        syncPush(CHECKLIST_V3_KEY, {}),
        syncPush(LOG_KEY, []),
        syncPush(BUDGET_KEY, {}),
        syncPush(SETTINGS_KEY, {}),
        syncPush(ALERTS_KEY, {}),
        syncPush(ROUTINES_KEY, []),
        syncPush(MAINTENANCE_KEY, []),
        syncPush(MAINTENANCE_LOG_KEY, []),
        syncPush(INVENTORY_KEY, {}),
      ]);
      syncEnabled = false;
    }
    await storageSet(CHECKLIST_V3_KEY, {});
    await storageSet(LOG_KEY, []);
    await storageSet(BUDGET_KEY, {});
    await storageSet(SETTINGS_KEY, {});
    await storageSet(ALERTS_KEY, {});
    await storageSet(ROUTINES_KEY, null);
    await storageSet(MAINTENANCE_KEY, null);
    await storageSet(MAINTENANCE_LOG_KEY, null);
    await storageSet(INVENTORY_KEY, {});
    location.reload();
  }

  // ─── Price alerts ────────────────────────────────
  const RETAILER_NAMES = {
    bowdens: "Bowden's Own",
    autobarn: 'Auto Barn',
    repco: 'Repco',
    supercheap: 'Supercheap Auto',
    autopro: 'Autopro',
  };

  async function loadPriceData() {
    if (!BACKEND_URL || BACKEND_URL.startsWith('__')) return;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 40000);
      const res = await fetch(`${BACKEND_URL}/api/products`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return;
      liveProducts = await res.json();
      applyLivePrices();
      loadPriceHistories();
    } catch {
      // backend unavailable or cold-starting — app works without prices
    }
  }

  function applyLivePrices() {
    // Build slug → cheapest retailer across all with URL
    slugToBest = {};
    for (const product of liveProducts) {
      const retailers = Object.entries(product.latestPrice);
      if (retailers.length === 0) continue;
      let bestRetailer = null;
      let bestData = null;
      for (const [retailer, data] of retailers) {
        if (!bestData || data.priceCents < bestData.priceCents) {
          bestRetailer = retailer;
          bestData = data;
        }
      }
      slugToBest[product.slug] = {
        retailer: bestRetailer,
        priceCents: bestData.priceCents,
        onSale: retailers.some(([, d]) => d.onSale),
        url: product.urls?.[bestRetailer] || null,
        id: product.id,
      };
    }

    // Update checklist item prices for spend totals
    itemData.forEach(item => {
      const live = item.slug ? slugToBest[item.slug] : null;
      if (!live) return;
      const priceEl = item.el.querySelector('.item-price');
      const dollars = (live.priceCents / 100).toFixed(2);
      const retailerName = RETAILER_NAMES[live.retailer] || live.retailer;
      if (priceEl) {
        priceEl.textContent = `$${dollars} · ${retailerName}`;
        if (live.onSale) {
          const flame = document.createElement('span');
          flame.setAttribute('data-sale', '1');
          flame.title = 'On sale now';
          flame.textContent = ' 🔥';
          priceEl.appendChild(flame);
        }
      }
      item.price = Math.round(live.priceCents / 100);
    });

    recompute();
  }

  async function loadPriceHistories() {
    if (!BACKEND_URL || BACKEND_URL.startsWith('__')) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/products/prices`);
      if (!res.ok) return;
      const bulk = await res.json();
      Object.assign(priceHistories, bulk);
    } catch {}
    renderPriceList();
    renderPricesTab();
  }

  function buildSparklineSVG(history, retailer) {
    // history is DESC — filter to retailer, take last 20 obs, reverse to ASC
    const points = history.filter(h => h.retailer === retailer).slice(0, 20).reverse();
    if (points.length < 2) return '';

    const prices = points.map(p => p.priceCents);
    const min = Math.min(...prices), max = Math.max(...prices);
    const range = max - min || 1;
    const W = 80, H = 24, PAD = 3;

    const xs = points.map((_, i) => PAD + (i / (points.length - 1)) * (W - PAD * 2));
    const ys = prices.map(p => PAD + (1 - (p - min) / range) * (H - PAD * 2));
    const polyline = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');

    const isOnSale = points[points.length - 1].onSale;
    const stroke = isOnSale ? 'var(--accent)' : 'var(--ink-low, #bbb)';
    const cx = xs[xs.length - 1].toFixed(1);
    const cy = ys[ys.length - 1].toFixed(1);

    return `<svg class="sparkline" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${polyline}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="2.5" fill="${stroke}"/></svg>`;
  }

  // ─── Auth / sync ─────────────────────────────────
  function renderAuthUI() {
    const loginForm    = document.getElementById('auth-login-form');
    const logoutSec    = document.getElementById('auth-logout-section');
    const statusText   = document.getElementById('auth-status-text');
    const emailDisplay = document.getElementById('auth-email-display');
    const navBtn       = document.getElementById('nav-auth-btn');
    if (!loginForm || !logoutSec) return;
    const logTab         = document.querySelector('.tab[data-tab="log"]');
    const spendTab       = document.querySelector('.tab[data-tab="spend"]');
    const inventoryTab   = document.querySelector('.tab[data-tab="inventory"]');
    const routineSubTabs = document.querySelector('.routine-sub-tabs');
    const vehicleSec     = document.getElementById('settings-vehicle');
    const notifSec       = document.getElementById('settings-notifications');
    const prefsSec       = document.getElementById('settings-prefs');
    const dataSec        = document.getElementById('settings-data');
    if (syncEnabled) {
      loginForm.style.display  = 'none';
      logoutSec.style.display  = '';
      if (statusText)   statusText.textContent   = 'Signed in — data syncs automatically';
      if (emailDisplay) emailDisplay.textContent  = syncEmail ?? '';
      if (navBtn) { navBtn.textContent = settings.car.displayName || syncEmail || '●'; navBtn.classList.add('syncing'); }
      if (logTab) {
        const wasHidden = logTab.style.display === 'none';
        logTab.style.display = '';
        if (wasHidden) document.querySelector('.tab[data-tab="log"]')?.click();
      }
      if (spendTab)       spendTab.style.display       = '';
      if (inventoryTab)   inventoryTab.style.display   = '';
      if (routineSubTabs) routineSubTabs.style.display = '';
      if (vehicleSec)     vehicleSec.style.display     = '';
      if (notifSec)       notifSec.style.display       = '';
      if (prefsSec)       prefsSec.style.display       = '';
      if (dataSec)        dataSec.style.display        = '';
      document.querySelectorAll('.alert-btn').forEach(b => b.style.display = '');
      const photoField = document.getElementById('log-photo-field');
      if (photoField) photoField.style.display = '';
    } else {
      loginForm.style.display  = '';
      logoutSec.style.display  = 'none';
      if (statusText)   statusText.textContent   = 'Not signed in — data is local only';
      if (navBtn) { navBtn.textContent = 'Sign in'; navBtn.classList.remove('syncing'); }
      if (logTab) {
        logTab.style.display = 'none';
        if (logTab.classList.contains('active')) document.querySelector('.tab[data-tab="routine"]')?.click();
      }
      if (spendTab) {
        spendTab.style.display = 'none';
        if (spendTab.classList.contains('active')) document.querySelector('.tab[data-tab="routine"]')?.click();
      }
      if (inventoryTab) {
        inventoryTab.style.display = 'none';
        if (inventoryTab.classList.contains('active')) document.querySelector('.tab[data-tab="routine"]')?.click();
      }
      if (routineSubTabs) routineSubTabs.style.display = 'none';
      if (vehicleSec)     vehicleSec.style.display     = 'none';
      if (notifSec)       notifSec.style.display       = 'none';
      if (prefsSec)       prefsSec.style.display       = 'none';
      if (dataSec)        dataSec.style.display        = 'none';
      document.querySelectorAll('.alert-btn').forEach(b => b.style.display = 'none');
      const photoFieldOff = document.getElementById('log-photo-field');
      if (photoFieldOff) photoFieldOff.style.display = 'none';
    }
    updateFooterSync();
  }

  function navAuthClick() {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelector('.tab[data-tab="settings"]').classList.add('active');
    document.getElementById('settings').classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function requestMagicLink() {
    const input  = document.getElementById('auth-email-input');
    const btn    = document.getElementById('auth-send-btn');
    const msgEl  = document.getElementById('auth-message');
    const email  = input?.value?.trim();
    if (!email) return;
    if (!BACKEND_URL || BACKEND_URL.startsWith('__')) return;

    btn.disabled = true;
    if (msgEl) { msgEl.style.display = ''; msgEl.textContent = 'Sending…'; }

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/request`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 429) {
        if (msgEl) msgEl.textContent = 'Please wait a minute before requesting another link.';
        btn.disabled = false;
      } else {
        if (msgEl) msgEl.textContent = 'Check your email — link expires in 15 minutes.';
        btn.style.display = 'none';
        let remaining = 120;
        const interval = setInterval(() => {
          remaining--;
          if (msgEl) msgEl.textContent = `Check your email — link expires in 15 minutes. Resend available in ${remaining}s.`;
          if (remaining <= 0) {
            clearInterval(interval);
            btn.style.display = '';
            btn.disabled = false;
            if (msgEl) msgEl.textContent = 'Check your email — or send another link.';
          }
        }, 1000);
      }
    } catch {
      if (msgEl) msgEl.textContent = 'Could not reach server. Try again.';
      btn.disabled = false;
    }
  }

  async function signOut() {
    if (!BACKEND_URL || BACKEND_URL.startsWith('__')) return;
    try {
      await fetch(`${BACKEND_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        signal: AbortSignal.timeout(8000),
      });
    } catch {}
    syncEnabled = false;
    syncEmail   = null;
    photosByEntryId = {};
    pendingPhotos   = [];
    pendingEntryId  = null;
    await Promise.all([
      storageSet(CHECKLIST_V3_KEY, {}),
      storageSet(LOG_KEY, []),
      storageSet(BUDGET_KEY, {}),
      storageSet(SETTINGS_KEY, {}),
      storageSet(ALERTS_KEY, {}),
      storageSet(ROUTINES_KEY, null),
      storageSet(MAINTENANCE_KEY, null),
      storageSet(INVENTORY_KEY, {}),
      storageSet(AUTH_CACHE_KEY, null),
    ]);
    location.reload();
  }

  async function checkAuthAndSync() {
    if (!BACKEND_URL || BACKEND_URL.startsWith('__')) { renderAuthUI(); return; }

    // Handle magic link token in URL
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('token');
    if (token) {
      // Clean the URL immediately — don't leave the token in browser history
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState(null, '', cleanUrl);
      try {
        await fetch(`${BACKEND_URL}/api/auth/verify`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          signal: AbortSignal.timeout(10000),
        });
      } catch {}
    }

    // Check for existing session
    try {
      const meRes = await fetch(`${BACKEND_URL}/api/auth/me`, {
        credentials: 'include',
        signal: AbortSignal.timeout(8000),
      });
      if (!meRes.ok) { await storageSet(AUTH_CACHE_KEY, null); renderAuthUI(); return; }
      const me = await meRes.json();
      if (!me.authenticated) { await storageSet(AUTH_CACHE_KEY, null); renderAuthUI(); return; }

      syncEnabled = true;
      syncEmail   = me.email;
      await storageSet(AUTH_CACHE_KEY, { email: me.email });
      renderAuthUI();
      renderLogTypeSelect();

      // Pull remote data and overwrite local state
      const syncRes = await fetch(`${BACKEND_URL}/api/sync`, {
        credentials: 'include',
        signal: AbortSignal.timeout(8000),
      });
      if (!syncRes.ok) return;
      const remote = await syncRes.json();

      const keys = [CHECKLIST_V3_KEY, LOG_KEY, BUDGET_KEY, SETTINGS_KEY, ALERTS_KEY, ROUTINES_KEY, MAINTENANCE_KEY, MAINTENANCE_LOG_KEY, INVENTORY_KEY];
      for (const key of keys) {
        if (remote[key] !== undefined) await storageSet(key, remote[key]);
      }

      // Re-run loaders so UI reflects remote data.
      // loadRoutines must run before loadLog/loadSettings since
      // renderWashReminderCards (called by both) depends on routines[].
      await loadRoutines();
      await loadMaintenance();
      await loadChecklist();
      await loadInventory();
      await loadLog();
      await loadBudget();
      await loadSettings();
      await loadAlerts();
      renderWashReminderCards(); // loadLog fires before loadSettings, so re-render once both are done
      renderAuthUI();
    } catch {
      renderAuthUI();
    }
  }

  // ─── Weather ─────────────────────────────────────
  let weatherCache = null;

  async function fetchBomForecast(postcode) {
    if (!/^\d{4}$/.test(postcode)) return null;
    if (!BACKEND_URL || BACKEND_URL.startsWith('__')) return null;
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/weather?postcode=${encodeURIComponent(postcode)}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data) ? data : null;
    } catch {
      return null;
    }
  }

  // ── Wash schedule helpers ────────────────────────────────────────────────

  function scheduleIntervalDays({ intervalValue, intervalUnit }) {
    const mul = { days: 1, weeks: 7, months: 30, years: 365 };
    return (intervalValue || 1) * (mul[intervalUnit] || 7);
  }

  // Returns true for both new entries (e.type === routineId) and legacy entries
  // matched by the routine's declared types.
  function entryMatchesSchedule(entry, schedule) {
    if (entry.type === schedule.routineId) return true;
    const routine = routines.find(r => r.id === schedule.routineId);
    const types = routine?.types ?? [];
    const t = entry.type;
    if (types.includes('exterior')    && ['full','quick','both'].includes(t)) return true;
    if (types.includes('interior')    && ['interior','both'].includes(t))     return true;
    if (types.includes('maintenance') && ['full','both'].includes(t))         return true;
    return false;
  }

  function calcScheduleStreak(schedule, forecast) {
    const routine = routines.find(r => r.id === schedule.routineId);
    if (!routine) return 0;
    const dates = [...new Set(
      washLog.filter(e => entryMatchesSchedule(e, schedule)).map(e => e.date)
    )].sort((a, b) => b.localeCompare(a));
    if (!dates.length) return 0;
    const intervalDays = scheduleIntervalDays(schedule);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dueDate = new Date(dates[0] + 'T00:00:00');
    dueDate.setDate(dueDate.getDate() + intervalDays);
    if (today > dueDate) {
      // Grace: if it's raining today the user can't wash — hold the streak
      const rainingToday = forecast && (forecast[0]?.rain_chance ?? 0) >= 50;
      if (!rainingToday) return 0;
    }
    let streak = 1;
    for (let i = 1; i < dates.length; i++) {
      const gap = Math.round((new Date(dates[i-1] + 'T00:00:00') - new Date(dates[i] + 'T00:00:00')) / 86400000);
      if (gap <= intervalDays) streak++;
      else break;
    }
    return streak;
  }

  function calcRoutineNextDue(schedule) {
    const routine = routines.find(r => r.id === schedule.routineId);
    if (!routine) return null;
    const relevant = washLog
      .filter(e => entryMatchesSchedule(e, schedule))
      .sort((a, b) => b.date.localeCompare(a.date));
    if (!relevant.length) return new Date();
    const [y, m, d] = relevant[0].date.split('-').map(Number);
    return new Date(y, m - 1, d + scheduleIntervalDays(schedule));
  }

  function calcBestWashDay(dueDate, forecast) {
    if (!forecast || !dueDate) return null;
    const triggers = evalWeatherTriggers(forecast);
    if (!triggers.rainTomorrow) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (Math.ceil((dueDate - today) / 86400000) > 2) return null;
    return triggers.rainDay;
  }

  function renderWashReminderCards() {
    const container = document.getElementById('wash-reminder-cards');
    if (!container) return;
    const schedules = settings.schedules ?? [];
    if (!schedules.length) { container.innerHTML = ''; return; }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    container.innerHTML = '';
    schedules.forEach(schedule => {
      const routine = routines.find(r => r.id === schedule.routineId);
      if (!routine) return;
      const nextDue = calcRoutineNextDue(schedule);
      const daysUntil = nextDue ? Math.ceil((nextDue - today) / 86400000) : null;
      const bestDay = weatherCache ? calcBestWashDay(nextDue, weatherCache) : null;
      const streak = calcScheduleStreak(schedule, weatherCache);
      let statusText, subText = '', isOverdue = false;
      if (daysUntil === null)   statusText = 'No sessions logged yet';
      else if (daysUntil < 0)  { statusText = `Overdue by ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''}`; isOverdue = true; }
      else if (daysUntil === 0) statusText = 'Due today';
      else if (daysUntil === 1) statusText = 'Due tomorrow';
      else                      statusText = `Due in ${daysUntil} days`;
      if (bestDay) {
        subText = `🌧 Rain forecast`;
        statusText = `Best day: ${bestDay}`;
      }
      const hasTickTick = ticktickIsConnected && !!settings.notifications?.ticktickAlerts;
      const dueDateStr = nextDue ? nextDue.toISOString() : '';
      const card = document.createElement('div');
      card.className = `wash-reminder-card${isOverdue ? ' wash-reminder-card--overdue' : ''}`;
      card.innerHTML = `
        <div class="reminder-row">
          <div class="reminder-body">
            <div class="reminder-name">${escHtml(routine.name)}</div>
            <div class="reminder-status">${statusText}</div>
            ${subText ? `<div class="reminder-weather">${subText}</div>` : ''}
            ${streak > 0 ? `<div class="reminder-streak">🔥 ${streak}-session streak</div>` : ''}
          </div>
          <div class="reminder-actions">
            <button class="reminder-btn" onclick="goToRoutine('${escAttr(schedule.routineId)}')">View routine</button>
            ${hasTickTick ? `<button class="reminder-btn reminder-btn--accent" onclick="sendWashReminderToTickTick('${escAttr(schedule.routineId)}','${escAttr(routine.name)}','${dueDateStr}',this)">Send to TickTick</button>` : ''}
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  function goToRoutine(routineId) {
    document.querySelector('.tab[data-tab="routine"]')?.click();
    setTimeout(() => {
      document.getElementById(`routine-view-${routineId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  async function sendWashReminderToTickTick(routineId, routineName, dueDate, btn) {
    if (!BACKEND_URL || BACKEND_URL.startsWith('__')) return;
    const orig = btn.textContent;
    btn.disabled = true;
    try {
      const res = await fetch(`${BACKEND_URL}/api/notify/wash-reminder`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routineId, routineName, dueDate }),
        signal: AbortSignal.timeout(8000),
      });
      btn.textContent = res.ok ? 'Sent ✓' : 'Failed';
    } catch { btn.textContent = 'Failed'; }
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
  }

  // ── Schedule settings UI ─────────────────────────────────────────────────

  function renderSchedulesUI() {
    const container = document.getElementById('schedule-list');
    if (!container) return;
    const schedules = settings.schedules ?? [];
    if (!schedules.length) {
      container.innerHTML = '<p class="settings-hint">No schedules set. Add one below.</p>';
      return;
    }
    container.innerHTML = schedules.map((s, i) => {
      const opts = routines.map(r =>
        `<option value="${escAttr(r.id)}"${r.id === s.routineId ? ' selected' : ''}>${escHtml(r.name)}</option>`
      ).join('');
      const unitOpts = ['days', 'weeks', 'months', 'years'].map(u =>
        `<option value="${u}"${u === s.intervalUnit ? ' selected' : ''}>${u}</option>`
      ).join('');
      return `<div class="schedule-entry">
        <select class="schedule-routine-select" onchange="updateScheduleField(${i},'routineId',this.value)">${opts}</select>
        <span class="schedule-label">every</span>
        <input class="schedule-interval-input" type="number" min="1" max="365" value="${s.intervalValue || 1}" onchange="updateScheduleField(${i},'intervalValue',+this.value)">
        <select class="schedule-unit-select" onchange="updateScheduleField(${i},'intervalUnit',this.value)">${unitOpts}</select>
        <button class="schedule-remove-btn" onclick="removeScheduleEntry(${i})" title="Remove">✕</button>
      </div>`;
    }).join('');
  }

  function updateScheduleField(idx, field, val) {
    if (settings.schedules) settings.schedules[idx][field] = val;
  }

  function addScheduleEntry() {
    if (!settings.schedules) settings.schedules = [];
    settings.schedules.push({ routineId: routines[0]?.id ?? '', intervalValue: 2, intervalUnit: 'weeks' });
    renderSchedulesUI();
  }

  function removeScheduleEntry(idx) {
    settings.schedules.splice(idx, 1);
    renderSchedulesUI();
  }

  // ── Weather triggers ─────────────────────────────────────────────────────

  function evalWeatherTriggers(forecast) {
    const result = { rainTomorrow: false, rainDay: null, heatWave: false, heatDay: null };
    if (!Array.isArray(forecast) || forecast.length < 2) return result;

    const toWeekday = dateStr => {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('en-AU', { weekday: 'long' });
    };

    if ((forecast[1]?.rain_chance ?? 0) >= 50) {
      result.rainTomorrow = true;
      for (let i = 1; i < Math.min(forecast.length, 8); i++) {
        if ((forecast[i]?.rain_chance ?? 0) < 50) {
          result.rainDay = toWeekday(forecast[i].date);
          break;
        }
      }
    }

    for (let i = 0; i < Math.min(forecast.length, 7); i++) {
      if ((forecast[i]?.temp_max ?? 0) >= 35) {
        result.heatWave = true;
        result.heatDay = toWeekday(forecast[i].date);
        break;
      }
    }

    return result;
  }

  function isBeadMachineDueSoon() {
    const due = calcNextDue('beadMachine');
    if (due === null) return true;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.ceil((due - today) / 86400000) <= 14;
  }

  function renderWeatherCards(triggers) {
    const section = document.getElementById('weather-section');
    if (!section) return;

    const rainCard = document.getElementById('weather-rain-card');
    const rainDesc = document.getElementById('weather-rain-desc');
    const heatCard = document.getElementById('weather-heat-card');
    const heatDesc = document.getElementById('weather-heat-desc');

    if (triggers.rainTomorrow) {
      rainDesc.textContent = triggers.rainDay
        ? `Rain is likely tomorrow — wait until ${triggers.rainDay} for the next wash.`
        : `Rain is likely tomorrow — check the forecast before washing.`;
      rainCard.style.display = '';
    } else {
      rainCard.style.display = 'none';
    }

    const showHeat = triggers.heatWave && isBeadMachineDueSoon();
    if (showHeat) {
      const peak = triggers.heatDay ? ` Temperatures reaching 35°C+ are expected ${triggers.heatDay}.` : '';
      heatDesc.textContent = `High UV and heat accelerate sealant breakdown.${peak} Consider a Bead Machine reapplication before the heat arrives.`;
      heatCard.style.display = '';
    } else {
      heatCard.style.display = 'none';
    }

    section.style.display = (triggers.rainTomorrow || showHeat) ? '' : 'none';
  }

  async function loadWeather() {
    const postcode = settings.car?.postcode?.trim();
    const section = document.getElementById('weather-section');
    if (!postcode || !section) {
      if (section) section.style.display = 'none';
      return;
    }
    const forecast = await fetchBomForecast(postcode);
    if (!forecast) { section.style.display = 'none'; return; }
    weatherCache = forecast;
    renderWeatherCards(evalWeatherTriggers(forecast));
  }

  // ─── Lightbox ────────────────────────────────────
  function openLightbox(entryId, index) {
    lightboxEntryId = entryId;
    lightboxIndex = index;
    (photosByEntryId[entryId] ?? []).forEach(p => { new Image().src = p.originalUrl; });
    updateLightbox();
    document.getElementById('lightbox').removeAttribute('hidden');
  }

  function closeLightbox() {
    document.getElementById('lightbox').setAttribute('hidden', '');
    lightboxEntryId = null;
  }

  function lightboxNav(dir) {
    const photos = photosByEntryId[lightboxEntryId] ?? [];
    if (!photos.length) return;
    lightboxIndex = (lightboxIndex + dir + photos.length) % photos.length;
    updateLightbox();
  }

  function updateLightbox() {
    const photos = photosByEntryId[lightboxEntryId] ?? [];
    const photo = photos[lightboxIndex];
    if (!photo) return;
    document.getElementById('lightbox-img').src = photo.originalUrl;
    document.getElementById('lightbox-counter').textContent = `${lightboxIndex + 1} / ${photos.length}`;
    const single = photos.length <= 1;
    document.querySelectorAll('.lightbox-arrow').forEach(el => { el.hidden = single; });
  }

  // Expose for onclick handlers in HTML
  window.closeLightbox = closeLightbox;
  window.lightboxNav = lightboxNav;

  // ─── Init ────────────────────────────────────────
  async function init() {
    const ttParam = new URLSearchParams(location.search).get('ticktick');
    if (ttParam === 'connected' || ttParam === 'error') {
      history.replaceState({}, '', location.pathname);
      if (ttParam === 'connected') showTab('settings');
    }

    setupChecklist();
    setupPhotoUploadUI();
    document.addEventListener('keydown', e => {
      const lb = document.getElementById('lightbox');
      if (!lb || lb.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') lightboxNav(-1);
      else if (e.key === 'ArrowRight') lightboxNav(1);
    });
    await loadChecklist();
    await loadInventory();
    await loadLog();
    await loadBudget();
    await loadRoutines();
    await loadMaintenance();
    await loadSettings();
    await loadAlerts();
    // Restore cached auth state immediately so the nav/settings UI shows
    // signed-in without waiting for the /api/auth/me round-trip.
    const cachedAuth = await storageGet(AUTH_CACHE_KEY);
    if (cachedAuth?.email) {
      syncEnabled = true;
      syncEmail   = cachedAuth.email;
      renderAuthUI();
    }
    await checkAuthAndSync();
    updateFooterVersion();
    loadPriceData();
    loadWeather();
  }
  init();
