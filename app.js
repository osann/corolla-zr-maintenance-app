  // ─── Backend ─────────────────────────────────────
  const BACKEND_URL = '__BACKEND_URL__';
  let syncEnabled = false;
  let syncEmail   = null;

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
    } catch {}
  }

  // ─── Checklist ───────────────────────────────────
  const CHECKLIST_KEY = 'corolla-detailing-app-v4';
  const items = document.querySelectorAll('.item');
  const itemData = Array.from(items).map((el, i) => ({
    id: 'item-' + i,
    el,
    input: el.querySelector('input'),
    price: parseInt(el.dataset.price, 10),
    phase: el.closest('.phase').dataset.phase,
    name: el.querySelector('.item-name').textContent.trim(),
    slug: el.dataset.slug ?? null,
  }));

  // Phase metadata
  const phaseNames = {
    '1': 'Phase 1 — Wash, dry, glass, sealant',
    '2': 'Phase 2 — Wheels, tyres, leather, Ultrasuede',
    '3': 'Phase 3 — Daily-use bulk',
    '4': 'Phase 4 — Long-term preservation'
  };

  async function loadChecklist() {
    const state = await storageGet(CHECKLIST_KEY) || {};
    itemData.forEach(item => {
      if (state[item.id] !== undefined) item.input.checked = state[item.id];
    });
    recompute();
  }

  async function saveChecklist() {
    const state = {};
    itemData.forEach(item => { state[item.id] = item.input.checked; });
    await storageSet(CHECKLIST_KEY, state);
    syncPush(CHECKLIST_KEY, state);
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
    // Also refresh spend panel if visible
    renderSpendPanel(spent, total);
  }

  items.forEach(item => {
    item.querySelector('input').addEventListener('change', () => { recompute(); saveChecklist(); });
  });

  function resetAll() {
    if (!confirm('Reset all purchases?')) return;
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
          <div class="phase-spend-name">${phaseNames[p] || 'Phase ' + p}</div>
          ${!hasLive ? '<div class="price-list-stale">Prices unavailable</div>' : ''}
        </div>
        ${rows}
      `;
      container.appendChild(card);
    });
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

  function renderLog() {
    const { streak, lastWash } = calcStreak();
    document.getElementById('streak-val').textContent = streak > 0 ? `${streak} week${streak !== 1 ? 's' : ''}` : '—';
    document.getElementById('log-total-sessions').textContent = washLog.length;
    document.getElementById('log-last-wash').textContent = lastWash ? formatDate(lastWash).split(',')[0] + ' ' + lastWash.split('-').slice(1).reverse().join('/') : '—';

    const label = document.getElementById('log-history-label');
    label.textContent = washLog.length > 0 ? `History (${washLog.length} session${washLog.length !== 1 ? 's' : ''})` : 'History';

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

  let settings = {
    freq: { ...FREQ_DEFAULTS },
    routines: JSON.parse(JSON.stringify(DEFAULT_STEPS)),
    prefs: { ...DEFAULT_PREFS },
    car: { model: '', year: '', colour: '', rego: '', displayName: '' }
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
        <label class="toggle-wrap step-toggle" style="width:36px;height:22px;" title="${step.enabled ? 'Enabled' : 'Disabled'}">
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
  }

  function applyCarInfo() {
    const { model, year, colour } = settings.car;
    const h1 = document.getElementById('header-h1');
    if (h1) {
      const m = model || 'Corolla ZR Hybrid';
      const y = year  || '2025';
      h1.innerHTML = `${y} <em>${m}</em><br>care guide`;
    }
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
        words: ['grey', 'gray', 'graphite', 'silver', 'slate', 'platinum', 'titanium', 'meteor'],
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
      if (saved.car)  settings.car  = { model:'', year:'', colour:'', displayName:'', ...saved.car };
    }
    renderFreqDisplays();
    renderAllRoutineEditors();
    loadPrefsUI();
    loadCarUI();
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

  function showSaved(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2200);
  }

  // Data management
  async function exportData() {
    const checklistState = await storageGet(CHECKLIST_KEY) || {};
    const logData = await storageGet(LOG_KEY) || [];
    const budgetData = await storageGet(BUDGET_KEY) || {};
    const exportObj = {
      exported: new Date().toISOString(),
      app: 'Corolla ZR Detailing Guide',
      checklist: checklistState,
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
        syncPush(CHECKLIST_KEY, {}),
        syncPush(LOG_KEY, []),
        syncPush(BUDGET_KEY, {}),
        syncPush(SETTINGS_KEY, {}),
      ]);
      syncEnabled = false;
    }
    await storageSet(CHECKLIST_KEY, {});
    await storageSet(LOG_KEY, []);
    await storageSet(BUDGET_KEY, {});
    await storageSet(SETTINGS_KEY, {});
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
    const targets = liveProducts.filter(p => Object.keys(p.latestPrice).length > 0);
    await Promise.all(targets.map(async (p) => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/products/${p.id}/prices`);
        if (res.ok) priceHistories[p.id] = await res.json();
      } catch {}
    }));
    renderPriceList();
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

      const keys = [CHECKLIST_KEY, LOG_KEY, BUDGET_KEY, SETTINGS_KEY];
      for (const key of keys) {
        if (remote[key] !== undefined) await storageSet(key, remote[key]);
      }

      // Re-run loaders so UI reflects remote data
      await loadChecklist();
      await loadLog();
      await loadBudget();
      await loadSettings();
      renderAuthUI();
    } catch {
      renderAuthUI();
    }
  }

  // ─── Init ────────────────────────────────────────
  async function init() {
    await loadChecklist();
    await loadLog();
    await loadBudget();
    await loadSettings();
    await checkAuthAndSync();
    loadPriceData();
  }
  init();
