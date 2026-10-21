// Settings → Categories editor.
import { saveCategories } from './catalog.js';
import { state } from './state.js';
import { escAttr, escHtml, showSaved } from './util.js';

export function renderCustomCategoryCards() {
  const container = document.getElementById('custom-category-cards');
  if (!container) return;
  container.innerHTML = state.allCategories.map((cat, idx) => buildCustomCategoryCardHTML(cat, idx)).join('');
}

export function buildCustomCategoryCardHTML(cat, idx) {
  const sectionsHtml = (cat.sections || [])
    .map(
      (sec, sIdx) => `
      <div class="url-form-row" style="margin-bottom:8px;">
        <input value="${escAttr(sec.label)}" oninput="updateCustomCategorySection(${idx},${sIdx},this.value)" placeholder="Section name…" class="log-input" style="flex:1;">
        <button class="step-remove-btn" onclick="removeCustomCategorySection(${idx},${sIdx})" title="Remove section">✕</button>
      </div>
    `,
    )
    .join('');
  const totalSlugs = (cat.sections || []).reduce((sum, s) => sum + (s.slugs?.length || 0), 0);
  return `
      <div class="routine-config-card">
        <div class="routine-config-card-title">${escHtml(cat.label || 'Untitled category')}</div>
        <div class="routine-config-field">
          <span class="routine-config-label">Category name</span>
          <input value="${escAttr(cat.label)}" oninput="updateCustomCategoryLabel(${idx},this.value)" style="width:100%;" class="log-input">
        </div>
        <div class="routine-config-label" style="margin-bottom:8px;">Sections</div>
        ${sectionsHtml || '<p class="step-no-products">No sections yet…</p>'}
        <button class="add-step-btn" onclick="addCustomCategorySection(${idx})" style="margin:8px 0 16px;">+ Add section</button>
        <div class="settings-save-bar" style="padding-top:12px;">
          <button class="settings-save-btn" onclick="saveCustomCategories()">Save</button>
          <button class="settings-reset-btn" style="color:var(--danger);" onclick="showCustomCategoryDeleteConfirm(${idx})">Delete category</button>
        </div>
        <div class="log-confirm-row" id="custom-cat-confirm-${idx}" hidden>
          <span>Delete this category?${totalSlugs > 0 ? ` ${totalSlugs} product${totalSlugs === 1 ? '' : 's'} will show as Uncategorised.` : ''}</span>
          <button class="log-confirm-cancel" onclick="cancelCustomCategoryDelete(${idx})">Cancel</button>
          <button class="log-confirm-delete" onclick="deleteCustomCategory(${idx})">Delete</button>
        </div>
      </div>
    `;
}

export function updateCustomCategoryLabel(idx, val) {
  state.allCategories[idx].label = val;
  const card = document.querySelectorAll('#custom-category-cards .routine-config-card')[idx];
  const title = card?.querySelector('.routine-config-card-title');
  if (title) title.textContent = val || 'Untitled category';
}

export function updateCustomCategorySection(idx, sIdx, val) {
  state.allCategories[idx].sections[sIdx].label = val;
}

export function addCustomCategorySection(idx) {
  state.allCategories[idx].sections.push({ label: '', slugs: [] });
  renderCustomCategoryCards();
}

export function removeCustomCategorySection(idx, sIdx) {
  const sec = state.allCategories[idx].sections[sIdx];
  const count = sec.slugs?.length || 0;
  if (
    count > 0 &&
    !confirm(
      `This section has ${count} product${count === 1 ? '' : 's'} assigned. Remove it anyway? They'll show as Uncategorised.`,
    )
  )
    return;
  state.allCategories[idx].sections.splice(sIdx, 1);
  renderCustomCategoryCards();
}

export function addCustomCategory() {
  state.allCategories.push({ label: '', sections: [{ label: '', slugs: [] }] });
  renderCustomCategoryCards();
}

export function showCustomCategoryDeleteConfirm(idx) {
  document.getElementById(`custom-cat-confirm-${idx}`)?.removeAttribute('hidden');
}

export function cancelCustomCategoryDelete(idx) {
  document.getElementById(`custom-cat-confirm-${idx}`)?.setAttribute('hidden', '');
}

export async function deleteCustomCategory(idx) {
  state.allCategories.splice(idx, 1);
  await saveCategories();
  renderCustomCategoryCards();
}

export async function saveCustomCategories() {
  const errorEl = document.getElementById('custom-categories-error');
  if (errorEl) errorEl.style.display = 'none';

  const seenLabels = new Set();
  for (const cat of state.allCategories) {
    const label = (cat.label || '').trim();
    if (!label) {
      if (errorEl) {
        errorEl.textContent = 'Every category needs a name.';
        errorEl.style.display = 'block';
      }
      return;
    }
    if (seenLabels.has(label.toLowerCase())) {
      if (errorEl) {
        errorEl.textContent = `Category name "${label}" is already used.`;
        errorEl.style.display = 'block';
      }
      return;
    }
    seenLabels.add(label.toLowerCase());

    const sections = (cat.sections || [])
      .map((s) => ({ label: (s.label || '').trim(), slugs: s.slugs || [] }))
      .filter((s) => s.label);
    if (sections.length === 0) {
      if (errorEl) {
        errorEl.textContent = `"${label}" needs at least one section.`;
        errorEl.style.display = 'block';
      }
      return;
    }
    const seenSections = new Set();
    for (const sec of sections) {
      if (seenSections.has(sec.label.toLowerCase())) {
        if (errorEl) {
          errorEl.textContent = `"${label}" has a duplicate section "${sec.label}".`;
          errorEl.style.display = 'block';
        }
        return;
      }
      seenSections.add(sec.label.toLowerCase());
    }
    cat.label = label;
    cat.sections = sections;
  }

  await saveCategories();
  renderCustomCategoryCards();
  showSaved('custom-categories-saved');
}
