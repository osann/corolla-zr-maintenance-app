// Wash log photos and lightbox.
import { BACKEND_URL } from './config.js';
import { renderLog } from './log.js';
import { state } from './state.js';

export async function loadPhotoData(entryIds) {
  if (!state.syncEnabled || !BACKEND_URL || BACKEND_URL.startsWith('__') || !entryIds.length) return;
  try {
    const res = await fetch(`${BACKEND_URL}/api/photos?logEntryIds=${entryIds.join(',')}`, {
      credentials: 'include',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return;
    const data = await res.json();
    Object.assign(state.photosByEntryId, data);
  } catch {}
}

export async function deletePhoto(photoId, entryId) {
  if (!BACKEND_URL || BACKEND_URL.startsWith('__')) return;
  try {
    const res = await fetch(`${BACKEND_URL}/api/photos/${photoId}`, {
      method: 'DELETE',
      credentials: 'include',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return;
    if (state.photosByEntryId[entryId]) {
      state.photosByEntryId[entryId] = state.photosByEntryId[entryId].filter((p) => p.id !== photoId);
    }
    // Also remove from pending photos if in edit mode
    state.pendingPhotos = state.pendingPhotos.filter((p) => p.id !== photoId);
    // Refresh whichever view is active
    if (state.editingEntryId === entryId) {
      renderPhotoPreviews();
    } else {
      renderLog();
    }
  } catch {}
}

export function renderPhotoPreviews() {
  const container = document.getElementById('log-photo-preview');
  if (!container) return;
  if (!state.pendingPhotos.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = state.pendingPhotos
    .map(
      (p) => `
      <div class="log-photo-item${p.uploading ? ' uploading' : ''}">
        <img src="${p.thumbUrl}" alt="Preview">
        ${
          p.uploading
            ? '<div class="log-photo-spinner"></div>'
            : `<button class="log-photo-remove" data-photo-id="${p.id}" data-preview="1" title="Remove">✕</button>`
        }
      </div>`,
    )
    .join('');
  container.querySelectorAll('.log-photo-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.log-photo-item');
      const pid = Number(btn.dataset.photoId);
      if (item) {
        item.classList.add('removing');
        item.addEventListener('animationend', () => deletePhoto(pid, state.pendingEntryId ?? 0), { once: true });
      } else {
        deletePhoto(pid, state.pendingEntryId ?? 0);
      }
    });
  });
}

export function setupPhotoUploadUI() {
  const input = document.getElementById('log-photo-input');
  if (!input) return;
  input.addEventListener('change', async () => {
    const files = Array.from(input.files ?? []);
    input.value = '';
    for (const file of files) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) continue;
      if (file.size > 10 * 1024 * 1024) continue;
      await uploadPendingPhoto(file);
    }
  });
}

export async function uploadPendingPhoto(file) {
  if (!BACKEND_URL || BACKEND_URL.startsWith('__')) return;
  if (!state.pendingEntryId) state.pendingEntryId = Date.now();
  // Show local preview immediately while the upload is in flight
  const tempId = `temp-${Date.now()}-${Math.random()}`;
  const localUrl = URL.createObjectURL(file);
  state.pendingPhotos.push({ id: tempId, thumbUrl: localUrl, originalUrl: localUrl, uploading: true });
  renderPhotoPreviews();
  const form = new FormData();
  form.append('file', file);
  form.append('logEntryId', String(state.pendingEntryId));
  try {
    const res = await fetch(`${BACKEND_URL}/api/photos/upload`, {
      method: 'POST',
      credentials: 'include',
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    URL.revokeObjectURL(localUrl);
    if (!res.ok) {
      state.pendingPhotos = state.pendingPhotos.filter((p) => p.id !== tempId);
      renderPhotoPreviews();
      return;
    }
    const data = await res.json();
    const idx = state.pendingPhotos.findIndex((p) => p.id === tempId);
    if (idx >= 0) state.pendingPhotos[idx] = data;
    else state.pendingPhotos.push(data);
    renderPhotoPreviews();
  } catch {
    URL.revokeObjectURL(localUrl);
    state.pendingPhotos = state.pendingPhotos.filter((p) => p.id !== tempId);
    renderPhotoPreviews();
  }
}

export function openLightbox(entryId, index) {
  state.lightboxEntryId = entryId;
  state.lightboxIndex = index;
  (state.photosByEntryId[entryId] ?? []).forEach((p) => {
    new Image().src = p.originalUrl;
  });
  updateLightbox();
  document.getElementById('lightbox').removeAttribute('hidden');
}

export function closeLightbox() {
  document.getElementById('lightbox').setAttribute('hidden', '');
  state.lightboxEntryId = null;
}

export function lightboxNav(dir) {
  const photos = state.photosByEntryId[state.lightboxEntryId] ?? [];
  if (!photos.length) return;
  state.lightboxIndex = (state.lightboxIndex + dir + photos.length) % photos.length;
  updateLightbox();
}

export function updateLightbox() {
  const photos = state.photosByEntryId[state.lightboxEntryId] ?? [];
  const photo = photos[state.lightboxIndex];
  if (!photo) return;
  document.getElementById('lightbox-img').src = photo.originalUrl;
  document.getElementById('lightbox-counter').textContent = `${state.lightboxIndex + 1} / ${photos.length}`;
  const single = photos.length <= 1;
  document.querySelectorAll('.lightbox-arrow').forEach((el) => {
    el.hidden = single;
  });
}
