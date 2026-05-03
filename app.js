  // ─── Backend ─────────────────────────────────────
  const BACKEND_URL = '__BACKEND_URL__';

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

  // ─── Checklist ───────────────────────────────────
  const CHECKLIST_KEY = 'corolla-detailing-app-v4';
  const items = document.querySelectorAll('.item');
  const itemData = Array.from(items).map((el, i) => ({
    id: 'item-' + i,
    el,
    input: el.querySelector('input'),
    price: parseInt(el.dataset.price, 10),
    phase: el.closest('.phase').dataset.phase,
    name: el.querySelector('.item-name').textContent.trim()
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
    document.getElementById('cnt-done').textContent = done;
    document.getElementById('cnt-total').textContent = itemData.length;
    document.getElementById('cnt-spent').textContent = spent;
    document.getElementById('cnt-remain').textContent = total - spent;
    document.getElementById('bar').style.width = Math.round((spent / total) * 100) + '%';
    Object.keys(byPhase).forEach(p => {
      const el = document.querySelector(`[data-phase-status="${p}"]`);
      if (!el) return;
      const { done, count } = byPhase[p];
      if (done === count) { el.textContent = 'Complete'; el.classList.add('done'); }
      else { el.textContent = `${done} of ${count}`; el.classList.remove('done'); }
    });
    // Also refresh spend panel if visible
    renderSpendPanel(byPhase, spent, total);
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
  let priceAlerts = [];

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
    recompute();
    document.getElementById('budget-status').textContent = 'Saved ✓';
    setTimeout(() => { document.getElementById('budget-status').textContent = ''; }, 2000);
  }

  function renderSpendPanel(byPhase, spent, total) {
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

    // Phase breakdown
    const container = document.getElementById('spend-phases');
    if (!container) return;
    container.innerHTML = '';
    Object.keys(byPhase).sort().forEach(p => {
      const { spent: ps, total: pt } = byPhase[p];
      const pct = pt > 0 ? Math.round((ps / pt) * 100) : 0;
      const phaseItems = itemData.filter(i => i.phase === p);
      const card = document.createElement('div');
      card.className = 'phase-spend-card';
      card.innerHTML = `
        <div class="phase-spend-head">
          <div class="phase-spend-name">${phaseNames[p] || 'Phase ' + p}</div>
          <div class="phase-spend-amounts"><strong>$${ps}</strong> of $${pt}</div>
        </div>
        <div class="phase-spend-bar"><div class="phase-spend-fill" style="width:${pct}%"></div></div>
        ${phaseItems.map(item => `
          <div class="phase-item-row">
            <span class="phase-item-name ${item.input.checked ? 'bought' : ''}">${item.name}</span>
            <span class="phase-item-price">$${item.price}</span>
            <span class="phase-item-badge ${item.input.checked ? 'bought' : 'pending'}">${item.input.checked ? 'Bought' : 'Pending'}</span>
          </div>`).join('')}
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
    car: { model: '', year: '', colour: '', rego: '' }
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
    document.getElementById('car-rego').value = settings.car.rego || '';
  }

  function applyCarInfo() {
    const { model, year, colour, rego } = settings.car;
    const parts = [year, model, colour].filter(Boolean);
    if (parts.length) {
      const eyebrow = document.querySelector('.eyebrow');
      if (eyebrow) eyebrow.textContent = rego ? `${rego} — Detailing kit + technique` : 'Detailing kit + technique';
    }
  }

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
      settings.car.rego = document.getElementById('car-rego').value.trim();
    }
    await storageSet(SETTINGS_KEY, settings);
    applyPrefs();
    applyCarInfo();
    applyLogStepChips();
    applySchedule();
    // Show saved message
    const msgEl = document.getElementById(`${section}-saved`);
    if (msgEl) {
      msgEl.classList.add('visible');
      setTimeout(() => msgEl.classList.remove('visible'), 2200);
    }
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
      if (saved.car)  settings.car  = { model:'', year:'', colour:'', rego:'', ...saved.car };
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
    applySchedule();
    showSaved('freq-saved');
  }

  async function resetRoutines() {
    if (!confirm('Reset all routine steps to defaults? Your customisations will be lost.')) return;
    settings.routines = JSON.parse(JSON.stringify(DEFAULT_STEPS));
    renderAllRoutineEditors();
    applyLogStepChips();
    await storageSet(SETTINGS_KEY, settings);
    showSaved('routines-saved');
  }

  async function resetPrefs() {
    if (!confirm('Reset display preferences to defaults?')) return;
    settings.prefs = { ...DEFAULT_PREFS };
    loadPrefsUI();
    applyPrefs();
    await storageSet(SETTINGS_KEY, settings);
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
    if (!BACKEND_URL || BACKEND_URL === '__BACKEND_URL__') return;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${BACKEND_URL}/api/alerts`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return;
      priceAlerts = await res.json();
      applyPriceAlerts();
    } catch {
      // backend unavailable or cold-starting — app works without prices
    }
  }

  function applyPriceAlerts() {
    // Flame icons on checklist items that are on sale
    document.querySelectorAll('.item').forEach(label => {
      const slug = label.dataset.slug;
      if (!slug) return;
      const alert = priceAlerts.find(a => a.slug === slug);
      const priceEl = label.querySelector('.item-price');
      if (!priceEl) return;
      const existing = priceEl.querySelector('[data-sale]');
      if (alert) {
        if (!existing) {
          const icon = document.createElement('span');
          icon.setAttribute('data-sale', '1');
          icon.title = `On sale at ${RETAILER_NAMES[alert.retailer] || alert.retailer}`;
          icon.textContent = ' 🔥';
          priceEl.appendChild(icon);
        }
      } else if (existing) {
        existing.remove();
      }
    });

    // "Price drops right now" card in the spend tab
    const spend = document.getElementById('spend');
    if (!spend) return;
    let section = document.getElementById('price-drops-section');

    if (priceAlerts.length === 0) {
      section?.remove();
      return;
    }

    if (!section) {
      section = document.createElement('div');
      section.id = 'price-drops-section';
      section.className = 'sale-section';
      const summary = spend.querySelector('.spend-summary');
      spend.insertBefore(section, summary);
    }

    section.innerHTML = `
      <div class="sale-section-title">Price drops right now</div>
      <div class="sale-section-desc">Live prices from Australian retailers.</div>
      ${priceAlerts.map(a => `
        <div class="sale-card">
          <div class="sale-card-name">${a.name}</div>
          <div class="sale-card-detail">$${(a.priceCents / 100).toFixed(2)} at ${RETAILER_NAMES[a.retailer] || a.retailer}</div>
        </div>
      `).join('')}
    `;
  }

  // ─── Init ────────────────────────────────────────
  async function init() {
    await loadChecklist();
    await loadLog();
    await loadBudget();
    await loadSettings();
    loadPriceData();
  }
  init();
