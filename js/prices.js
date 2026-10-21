// Inventory → Prices sub-tab, live price loading and price alerts.
import { rebuildBundleComponents } from './catalog.js';
import { recompute, renderChecklist } from './checklist.js';
import { ALERTS_KEY, BACKEND_URL } from './config.js';
import { RETAILER_NAMES } from './data.js';
import { renderInventory } from './inventory.js';
import { renderProductsPage } from './products.js';
import { applyPrefs } from './settings.js';
import { state } from './state.js';
import { storageGet, storageSet, syncPush } from './storage.js';
import { escAttr } from './util.js';

// Pure read-only price display — category-grouped price rows, sparklines, sale badges, buy
// links, and the price-alert bell. Product identity/management (rename, slug, retailer URLs,
// category assignment, delete, pack config, add product) lives on the Inventory → Products
// sub-tab instead — see renderProductsPage().
export function renderPricesTab() {
  const container = document.getElementById('prices-list');
  if (!container) return;

  const productBySlug = Object.fromEntries(state.liveProducts.map((p) => [p.slug, p]));

  function renderProducts(slugs) {
    let html = '';
    for (const slug of slugs) {
      const product = productBySlug[slug];
      if (!product) continue;
      const RETAILER_ORDER = ['supercheap', 'repco', 'autobarn', 'autopro', 'bowdens'];
      const retailers = Object.entries(product.latestPrice ?? {}).sort(([a], [b]) => {
        const ai = RETAILER_ORDER.indexOf(a),
          bi = RETAILER_ORDER.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      if (retailers.length === 0) continue; // nothing scraped yet — nothing to display here
      const history = state.priceHistories[product.id] ?? [];
      const minPrice = Math.min(...retailers.map(([, d]) => d.priceCents));
      const allSame = retailers.every(([, d]) => d.priceCents === minPrice);
      let retailerRows = '';
      for (const [retailer, data] of retailers) {
        const price = `$${(data.priceCents / 100).toFixed(2)}`;
        const saleTag = data.onSale ? '<span class="price-on-sale">🔥 Sale</span>' : '';
        const retailerName = RETAILER_NAMES[retailer] || retailer;
        const url = product.urls?.[retailer] || null;
        const linkEl = url
          ? `<a href="${escAttr(url)}" target="_blank" rel="noopener noreferrer" class="price-row-link">Buy →</a>`
          : '<span class="price-row-link-none"></span>';
        const sparklineSvg = buildSparklineSVG(history, retailer);
        const sparkline =
          (state.settings.prefs.showSparklines ?? true)
            ? sparklineSvg || '<span class="prices-no-data">No data yet.</span>'
            : sparklineSvg
              ? ''
              : '<span class="prices-no-data">No data yet.</span>';
        const cheapestClass = !allSame && data.priceCents === minPrice ? ' prices-retailer-row--cheapest' : '';
        retailerRows += `
            <div class="prices-retailer-row${cheapestClass}">
              <span class="prices-retailer-name">${retailerName}</span>
              <div class="price-row-right">
                <div class="price-row-amount">${price}${saleTag}</div>
                ${sparkline}
              </div>
              ${linkEl}
            </div>`;
      }
      const hasAlert = !!state.priceAlerts[slug];
      const alertTitle = hasAlert ? 'Alert set — click to edit' : 'Set price alert';
      html += `
          <div class="prices-product">
            <div class="prices-product-name">
              ${product.name}
              ${state.syncEnabled ? `<button class="alert-btn${hasAlert ? ' active' : ''}" id="alert-btn-${slug}" data-alert-slug="${slug}" onclick="toggleAlertForm('${slug}')" title="${alertTitle}">🔔</button>` : ''}
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

  for (const category of state.allCategories) {
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

  // Products not assigned to any category, but that do have scraped price data.
  const categorisedSlugs = new Set(state.allCategories.flatMap((c) => c.sections.flatMap((s) => s.slugs)));
  const uncategorisedSlugs = state.liveProducts.filter((p) => !categorisedSlugs.has(p.slug)).map((p) => p.slug);
  if (uncategorisedSlugs.length > 0) {
    const body = renderProducts(uncategorisedSlugs);
    if (body) {
      const card = document.createElement('div');
      card.className = 'phase-spend-card';
      card.innerHTML = `<div class="phase-spend-head"><div class="phase-spend-name">Other</div></div>${body}`;
      container.appendChild(card);
      anyCard = true;
    }
  }

  if (!anyCard) {
    container.innerHTML = '<p class="prices-empty">No prices loaded yet.</p>';
  }

  renderAlertsPanel();
}

export function renderAlertsPanel() {
  const panel = document.getElementById('prices-alerts-summary');
  if (!panel) return;

  const slugs = Object.keys(state.priceAlerts);
  if (slugs.length === 0) {
    panel.style.display = 'none';
    return;
  }

  const productBySlug = Object.fromEntries(state.liveProducts.map((p) => [p.slug, p]));
  const CHANNEL_LABELS = { global: 'Global setting', ticktick: 'TickTick', email: 'Email' };

  let rows = '';
  for (const slug of slugs) {
    const alert = state.priceAlerts[slug];
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

export function editAlertInSummary(slug) {
  document.getElementById(`alert-summary-view-${slug}`).style.display = 'none';
  document.getElementById(`alert-summary-edit-${slug}`).style.display = '';
}

export function cancelAlertEdit(slug) {
  document.getElementById(`alert-summary-edit-${slug}`).style.display = 'none';
  document.getElementById(`alert-summary-view-${slug}`).style.display = '';
}

export async function saveAlertFromSummary(slug) {
  const inp = document.getElementById(`alert-summary-threshold-${slug}`);
  const sel = document.getElementById(`alert-summary-channel-${slug}`);
  const val = parseFloat(inp?.value ?? '');
  if (!val || val <= 0) {
    inp?.focus();
    return;
  }
  state.priceAlerts[slug] = { thresholdCents: Math.round(val * 100), channel: sel?.value || 'global' };
  await storageSet(ALERTS_KEY, state.priceAlerts);
  syncPush(ALERTS_KEY, state.priceAlerts);
  document.querySelectorAll(`[data-alert-slug="${slug}"]`).forEach((btn) => {
    btn.classList.add('active');
    btn.title = 'Alert set — click to edit';
  });
  renderAlertsPanel();
}

export async function loadAlerts() {
  const saved = await storageGet(ALERTS_KEY);
  if (saved && typeof saved === 'object') state.priceAlerts = saved;
  renderChecklist();
}

export function toggleAlertForm(slug) {
  const form = document.getElementById(`alert-form-${slug}`);
  if (!form) return;
  const opening = form.style.display === 'none' || form.style.display === '';
  form.style.display = opening ? 'block' : 'none';
  if (opening) {
    const alert = state.priceAlerts[slug];
    const inp = document.getElementById(`alert-threshold-${slug}`);
    const sel = document.getElementById(`alert-channel-${slug}`);
    if (inp) inp.value = alert ? (alert.thresholdCents / 100).toFixed(2) : '';
    if (sel) sel.value = alert?.channel || 'global';
  }
}

export async function saveAlert(slug) {
  const inp = document.getElementById(`alert-threshold-${slug}`);
  const sel = document.getElementById(`alert-channel-${slug}`);
  const val = parseFloat(inp?.value ?? '');
  if (!val || val <= 0) {
    inp?.focus();
    return;
  }
  state.priceAlerts[slug] = { thresholdCents: Math.round(val * 100), channel: sel?.value || 'global' };
  await storageSet(ALERTS_KEY, state.priceAlerts);
  syncPush(ALERTS_KEY, state.priceAlerts);
  document.querySelectorAll(`[data-alert-slug="${slug}"]`).forEach((btn) => {
    btn.classList.add('active');
    btn.title = 'Alert set — click to edit';
  });
  const form = document.getElementById(`alert-form-${slug}`);
  if (form) form.style.display = 'none';
  renderAlertsPanel();
}

export async function clearAlert(slug) {
  delete state.priceAlerts[slug];
  await storageSet(ALERTS_KEY, state.priceAlerts);
  syncPush(ALERTS_KEY, state.priceAlerts);
  document.querySelectorAll(`[data-alert-slug="${slug}"]`).forEach((btn) => {
    btn.classList.remove('active');
    btn.title = 'Set price alert';
  });
  const form = document.getElementById(`alert-form-${slug}`);
  if (form) form.style.display = 'none';
  const clForm = document.getElementById(`cl-alert-form-${slug}`);
  if (clForm) clForm.style.display = 'none';
  renderAlertsPanel();
}

export async function loadPriceData() {
  if (!BACKEND_URL || BACKEND_URL.startsWith('__')) return;
  const seq = ++state.priceDataRequestSeq;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 40000);
    const res = await fetch(`${BACKEND_URL}/api/products`, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timeout);
    if (!res.ok) return;
    const data = await res.json();
    // A newer loadPriceData() call has since started — its response (or a later one still in
    // flight) is authoritative, so discard this now-stale one rather than clobbering
    // liveProducts back to an earlier state.
    if (seq !== state.priceDataRequestSeq) return;
    state.liveProducts = data;
    applyLivePrices();
    rebuildBundleComponents();
    // Inventory's add-product picker and "Other" card depend on liveProducts,
    // which loads after the tab's initial render — re-render now that it's ready.
    renderInventory();
    // Products doesn't need price history, so render it here rather than waiting on the
    // slower loadPriceHistories() → renderPricesTab() chain below.
    renderProductsPage();
    loadPriceHistories();
  } catch {
    // backend unavailable or cold-starting — app works without prices
  }
}

export function applyLivePrices() {
  // Build slug → cheapest retailer across all with URL
  state.slugToBest = {};
  for (const product of state.liveProducts) {
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
    state.slugToBest[product.slug] = {
      retailer: bestRetailer,
      priceCents: bestData.priceCents,
      onSale: retailers.some(([, d]) => d.onSale),
      url: product.urls?.[bestRetailer] || null,
      id: product.id,
    };
  }

  // Update checklist item prices and buy button URLs
  state.itemData.forEach((item) => {
    const live = item.slug ? state.slugToBest[item.slug] : null;
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
    const buyBtn = item.el.querySelector('.item-buy-btn');
    if (buyBtn) {
      if (live.url) {
        buyBtn.href = live.url;
        buyBtn.removeAttribute('hidden');
      } else {
        buyBtn.setAttribute('hidden', '');
      }
    }
    item.price = Math.round(live.priceCents / 100);
  });

  recompute();
  applyPrefs();
}

export async function loadPriceHistories() {
  if (!BACKEND_URL || BACKEND_URL.startsWith('__')) return;
  try {
    const res = await fetch(`${BACKEND_URL}/api/products/prices`);
    if (!res.ok) return;
    const bulk = await res.json();
    Object.assign(state.priceHistories, bulk);
  } catch {}
  renderPricesTab();
}

export function buildSparklineSVG(history, retailer) {
  // history is DESC — filter to retailer, take last 20 obs, reverse to ASC
  const points = history
    .filter((h) => h.retailer === retailer)
    .slice(0, 20)
    .reverse();
  if (points.length < 2) return '';

  const prices = points.map((p) => p.priceCents);
  const min = Math.min(...prices),
    max = Math.max(...prices);
  const range = max - min || 1;
  const W = 80,
    H = 24,
    PAD = 3;

  const xs = points.map((_, i) => PAD + (i / (points.length - 1)) * (W - PAD * 2));
  const ys = prices.map((p) => PAD + (1 - (p - min) / range) * (H - PAD * 2));
  const polyline = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');

  const isOnSale = points[points.length - 1].onSale;
  const stroke = isOnSale ? 'var(--accent)' : 'var(--ink-low, #bbb)';
  const cx = xs[xs.length - 1].toFixed(1);
  const cy = ys[ys.length - 1].toFixed(1);

  return `<svg class="sparkline" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${polyline}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="2.5" fill="${stroke}"/></svg>`;
}
