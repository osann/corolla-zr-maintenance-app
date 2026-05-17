  // ─── Backend ─────────────────────────────────────
  const BACKEND_URL  = '__BACKEND_URL__';
  const BUILD_DATE   = '__BUILD_DATE__';
  let syncEnabled   = false;
  let syncEmail     = null;
  let lastSyncedAt  = null;

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
    itemData.forEach(item => { checklistState.checked[item.slug] = item.input.checked; });
    await storageSet(CHECKLIST_V3_KEY, checklistState);
    syncPush(CHECKLIST_V3_KEY, checklistState);
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
              <button class="alert-btn${hasAlert ? ' active' : ''}" id="alert-btn-${slug}" onclick="toggleAlertForm('${slug}')" title="${alertTitle}">🔔</button>
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
      const threshold = `$${(alert.thresholdCents / 100).toFixed(2)}`;
      const channel = CHANNEL_LABELS[alert.channel] ?? 'Global setting';
      rows += `
        <div class="alert-summary-row">
          <span class="alert-summary-name">${name}</span>
          <span class="alert-summary-meta">${threshold} · ${channel}</span>
          <div class="alert-summary-actions">
            <button class="alert-clear-btn" onclick="editAlertFromSummary('${slug}')">Edit</button>
            <button class="alert-clear-btn" onclick="clearAlert('${slug}')">Remove</button>
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

  function editAlertFromSummary(slug) {
    const form = document.getElementById(`alert-form-${slug}`);
    if (!form) return;
    if (form.style.display === 'none' || form.style.display === '') toggleAlertForm(slug);
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ─── Wash Log ────────────────────────────────────
  const LOG_KEY = 'corolla-washlog-v1';
  let washLog = [];

  // Set today's date as default
  (function() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    document.getElementById('log-date').value = `${yyyy}-${mm}-${dd}`;
  })();

  // Step chip interactions
  document.querySelectorAll('.step-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const cb = chip.querySelector('input');
      chip.classList.toggle('checked', cb.checked);
    });
    chip.querySelector('input').addEventListener('change', function() {
      chip.classList.toggle('checked', this.checked);
    });
  });

  async function loadLog() {
    const saved = await storageGet(LOG_KEY);
    washLog = Array.isArray(saved) ? saved : [];
    renderLog();
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

    if (!date) { alert('Please select a date.'); return; }

    const entry = {
      id: Date.now(),
      date,
      type,
      steps,
      notes
    };

    // Prevent duplicate same-date entries (warn only)
    const dupeIdx = washLog.findIndex(e => e.date === date);
    if (dupeIdx >= 0) {
      if (!confirm(`You already have a session logged for ${formatDate(date)}. Add another?`)) return;
    }

    washLog.unshift(entry);
    saveLog();
    renderLog();

    // Reset form
    document.getElementById('log-notes').value = '';
    document.querySelectorAll('.step-chip input').forEach(cb => { cb.checked = false; });
    document.querySelectorAll('.step-chip').forEach(c => c.classList.remove('checked'));
  }

  function deleteLogEntry(id) {
    if (!confirm('Delete this session?')) return;
    washLog = washLog.filter(e => e.id !== id);
    saveLog();
    renderLog();
  }

  function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m-1, d);
    return date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function typeLabel(type) {
    const map = { full: 'Full wash', quick: 'Quick wash', interior: 'Interior only', both: 'Full wash + interior' };
    return map[type] || type;
  }

  function calcStreak() {
    if (!washLog.length) return { streak: 0, lastWash: null };
    const sorted = [...washLog].sort((a,b) => b.date.localeCompare(a.date));
    const lastWash = sorted[0].date;
    // Count how many of the last N consecutive weeks had at least one wash
    const uniqueDates = [...new Set(sorted.map(e => e.date))].sort((a,b) => b.localeCompare(a));
    // Weekly streak: count consecutive weeks (Mon-Sun) that have at least one wash
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
      else if (week > 0) break; // Allow current week gap only at week 0
    }
    return { streak, lastWash };
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
    const { streak, lastWash } = calcStreak();
    document.getElementById('streak-val').textContent = streak > 0 ? `${streak} week${streak !== 1 ? 's' : ''}` : '—';
    document.getElementById('log-total-sessions').textContent = washLog.length;
    document.getElementById('log-last-wash').textContent = lastWash ? formatDate(lastWash).split(',')[0] + ' ' + lastWash.split('-').slice(1).reverse().join('/') : '—';

    const label = document.getElementById('log-history-label');
    label.textContent = washLog.length > 0 ? `History (${washLog.length} session${washLog.length !== 1 ? 's' : ''})` : 'History';

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
      div.innerHTML = `
        <button class="log-delete" onclick="deleteLogEntry(${entry.id})" title="Delete">✕</button>
        <div class="log-entry-head">
          <div class="log-entry-date">${formatDate(entry.date)}</div>
          <div class="log-entry-type ${entry.type === 'full' || entry.type === 'both' ? 'full' : entry.type === 'interior' ? 'interior' : 'quick'}">${typeLabel(entry.type)}</div>
        </div>
        ${entry.steps.length ? `<div class="log-chips">${entry.steps.map(s => `<span class="log-chip">${s}</span>`).join('')}</div>` : ''}
        ${entry.notes ? `<div class="log-entry-notes">${entry.notes}</div>` : ''}
      `;
      container.appendChild(div);
    });
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
    confirmDelete: true,
    weeklyStreak: true
  };

  const DEFAULT_NOTIFICATIONS = {
    ticktickEmail: '',
    ticktickAlerts: true,
    ticktickMetadata: '^Car #Corolla today',
    emailAlerts: false,
    washReminders: true,
    emailWashReminders: false,
  };

  const ALERTS_KEY = 'corolla-price-alerts-v1';
  let priceAlerts = {};

  let settings = {
    freq: { ...FREQ_DEFAULTS },
    routines: JSON.parse(JSON.stringify(DEFAULT_STEPS)),
    prefs: { ...DEFAULT_PREFS },
    car: { model: '', year: '', colour: '', rego: '', displayName: '' },
    notifications: { ...DEFAULT_NOTIFICATIONS },
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
        <input class="step-name-input" id="sni-${routineKey}-${idx}" value="${step.name}" onblur="finishEditStep('${routineKey}',${idx})" onkeydown="if(event.key==='Enter')this.blur()">
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

  // Preferences
  function loadPrefsUI() {
    document.getElementById('pref-show-prices').checked = settings.prefs.showPrices;
    document.getElementById('pref-show-badges').checked = settings.prefs.showBadges;
    document.getElementById('pref-show-desc').checked = settings.prefs.showDesc;
    document.getElementById('pref-confirm-delete').checked = settings.prefs.confirmDelete;
    document.getElementById('pref-weekly-streak').checked = settings.prefs.weeklyStreak;
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
  }

  function loadNotificationsUI() {
    document.getElementById('ticktick-email').value               = settings.notifications.ticktickEmail || '';
    document.getElementById('pref-ticktick-alerts').checked       = settings.notifications.ticktickAlerts;
    document.getElementById('ticktick-metadata').value            = settings.notifications.ticktickMetadata || '';
    document.getElementById('pref-email-alerts').checked          = settings.notifications.emailAlerts;
    document.getElementById('pref-wash-reminders').checked        = settings.notifications.washReminders;
    document.getElementById('pref-email-wash-reminders').checked  = settings.notifications.emailWashReminders;
  }

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
      settings.prefs.confirmDelete = document.getElementById('pref-confirm-delete').checked;
      settings.prefs.weeklyStreak = document.getElementById('pref-weekly-streak').checked;
    } else if (section === 'car') {
      settings.car.model = document.getElementById('car-model').value.trim();
      settings.car.year = document.getElementById('car-year').value.trim();
      settings.car.colour = document.getElementById('car-colour').value.trim();
      settings.car.displayName = document.getElementById('car-display-name').value.trim();
      settings.car.postcode = document.getElementById('car-postcode').value.trim();
    } else if (section === 'notifications') {
      settings.notifications.ticktickEmail    = (document.getElementById('ticktick-email')?.value ?? '').trim();
      settings.notifications.ticktickAlerts   = document.getElementById('pref-ticktick-alerts')?.checked ?? true;
      settings.notifications.ticktickMetadata = (document.getElementById('ticktick-metadata')?.value ?? '').trim();
      settings.notifications.emailAlerts         = document.getElementById('pref-email-alerts')?.checked ?? false;
      settings.notifications.washReminders       = document.getElementById('pref-wash-reminders')?.checked ?? true;
      settings.notifications.emailWashReminders  = document.getElementById('pref-email-wash-reminders')?.checked ?? false;
    }
    await storageSet(SETTINGS_KEY, settings);
    syncPush(SETTINGS_KEY, settings);
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
    }
    renderFreqDisplays();
    renderAllRoutineEditors();
    loadPrefsUI();
    loadCarUI();
    loadNotificationsUI();
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
      ]);
      syncEnabled = false;
    }
    await storageSet(CHECKLIST_V3_KEY, {});
    await storageSet(LOG_KEY, []);
    await storageSet(BUDGET_KEY, {});
    await storageSet(SETTINGS_KEY, {});
    await storageSet(ALERTS_KEY, {});
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
    if (syncEnabled) {
      loginForm.style.display  = 'none';
      logoutSec.style.display  = '';
      if (statusText)   statusText.textContent   = 'Signed in — data syncs automatically';
      if (emailDisplay) emailDisplay.textContent  = syncEmail ?? '';
      if (navBtn) { navBtn.textContent = settings.car.displayName || syncEmail || '●'; navBtn.classList.add('syncing'); }
    } else {
      loginForm.style.display  = '';
      logoutSec.style.display  = 'none';
      if (statusText)   statusText.textContent   = 'Not signed in — data is local only';
      if (navBtn) { navBtn.textContent = 'Sign in'; navBtn.classList.remove('syncing'); }
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
    renderAuthUI();
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
      if (!meRes.ok) { renderAuthUI(); return; }
      const me = await meRes.json();
      if (!me.authenticated) { renderAuthUI(); return; }

      syncEnabled = true;
      syncEmail   = me.email;
      renderAuthUI();

      // Pull remote data and overwrite local state
      const syncRes = await fetch(`${BACKEND_URL}/api/sync`, {
        credentials: 'include',
        signal: AbortSignal.timeout(8000),
      });
      if (!syncRes.ok) return;
      const remote = await syncRes.json();

      const keys = [CHECKLIST_V3_KEY, LOG_KEY, BUDGET_KEY, SETTINGS_KEY, ALERTS_KEY];
      for (const key of keys) {
        if (remote[key] !== undefined) await storageSet(key, remote[key]);
      }

      // Re-run loaders so UI reflects remote data
      await loadChecklist();
      await loadLog();
      await loadBudget();
      await loadSettings();
      await loadAlerts();
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

  // ─── Init ────────────────────────────────────────
  async function init() {
    setupChecklist();
    await loadChecklist();
    await loadLog();
    await loadBudget();
    await loadSettings();
    await loadAlerts();
    await checkAuthAndSync();
    updateFooterVersion();
    loadPriceData();
    loadWeather();
  }
  init();
