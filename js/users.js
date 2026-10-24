// Settings → Users (admin only): the account list, invites and removing people.
import { BACKEND_URL } from './config.js';
import { state } from './state.js';
import { escAttr, escHtml } from './util.js';

const shortDate = (iso) =>
  new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

const adminFetch = (path, init = {}) =>
  fetch(`${BACKEND_URL}/api/admin${path}`, { credentials: 'include', signal: AbortSignal.timeout(10000), ...init });

export async function loadUsers() {
  if (!state.isAdmin || !BACKEND_URL || BACKEND_URL.startsWith('__')) return;
  try {
    const res = await adminFetch('/users');
    if (!res.ok) return;
    state.adminUsers = await res.json();
    renderUsers();
  } catch {
    /* backend unreachable — leave the list as it is */
  }
}

function userStatus(u) {
  if (u.isAdmin) return 'Admin (you)';
  if (u.joinedAt) return `Joined ${shortDate(u.joinedAt)}`;
  if (u.inviteExpiresAt && new Date(u.inviteExpiresAt) > new Date()) {
    return `Invited · link expires ${shortDate(u.inviteExpiresAt)}`;
  }
  return 'Invited · link expired';
}

export function renderUsers() {
  const list = document.getElementById('users-list');
  if (!list) return;
  list.innerHTML = state.adminUsers
    .map((u) => {
      const email = escHtml(u.email);
      const actions = u.isAdmin
        ? ''
        : `${u.joinedAt ? '' : `<button class="settings-reset-btn" onclick="resendInvite(${u.id}, this)">Resend</button>`}
           <button class="settings-reset-btn" style="color:var(--danger);" onclick="showRemoveUserConfirm(${u.id})">${u.joinedAt ? 'Remove' : 'Withdraw'}</button>`;
      const confirmText = u.joinedAt
        ? `Remove ${email} and delete their wash log, settings and photos? This can't be undone.`
        : `Withdraw the invite for ${email}? Their link will stop working.`;
      return `
        <div class="settings-row">
          <div class="settings-row-label">
            <strong>${email}</strong>
            <span>${userStatus(u)}</span>
          </div>
          <div class="settings-control">${actions}</div>
        </div>
        <div class="log-confirm-row" id="remove-user-confirm-${u.id}" hidden>
          <span>${confirmText}</span>
          <button class="log-confirm-cancel" onclick="cancelRemoveUserConfirm(${u.id})">Cancel</button>
          <button class="log-confirm-delete" onclick="removeUser(${u.id})">${u.joinedAt ? 'Remove' : 'Withdraw'}</button>
        </div>`;
    })
    .join('');
}

// Shows the outcome of an invite under the form. The link is shown even when the email went out,
// so it can be sent another way if the email doesn't arrive.
function showInviteResult(html) {
  const el = document.getElementById('invite-result');
  if (!el) return;
  el.innerHTML = html;
  el.hidden = false;
}

async function postInvite(email) {
  try {
    const res = await adminFetch('/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      showInviteResult(
        `<p style="margin:0;color:var(--danger);">${escHtml(body.error || 'Couldn’t send the invite.')}</p>`,
      );
      return false;
    }
    const sent = body.emailed
      ? `Invite sent to ${escHtml(email)}.`
      : `The invite email to ${escHtml(email)} couldn’t be sent.`;
    showInviteResult(`
      <p style="margin:0 0 8px;">${sent} You can also send them this link yourself. It works once and expires in 7 days.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <input class="log-input" type="text" id="invite-link" readonly value="${escAttr(body.link)}" style="flex:1;min-width:200px;">
        <button class="settings-reset-btn" onclick="copyInviteLink(this)">Copy link</button>
      </div>`);
    await loadUsers();
    return true;
  } catch {
    showInviteResult('<p style="margin:0;color:var(--danger);">Could not reach the server. Try again.</p>');
    return false;
  }
}

export async function sendInvite() {
  const input = document.getElementById('invite-email-input');
  const btn = document.getElementById('invite-send-btn');
  const email = input?.value.trim();
  if (!email) return;
  btn.disabled = true;
  if (await postInvite(email)) input.value = '';
  btn.disabled = false;
}

export async function resendInvite(id, btn) {
  const user = state.adminUsers.find((u) => u.id === id);
  if (!user) return;
  btn.disabled = true;
  await postInvite(user.email);
  btn.disabled = false;
}

export async function copyInviteLink(btn) {
  const input = document.getElementById('invite-link');
  if (!input) return;
  try {
    await navigator.clipboard.writeText(input.value);
    btn.textContent = 'Copied ✓';
  } catch {
    input.select();
    btn.textContent = 'Selected — copy it';
  }
  setTimeout(() => (btn.textContent = 'Copy link'), 2000);
}

export function showRemoveUserConfirm(id) {
  document.getElementById(`remove-user-confirm-${id}`)?.removeAttribute('hidden');
}

export function cancelRemoveUserConfirm(id) {
  document.getElementById(`remove-user-confirm-${id}`)?.setAttribute('hidden', '');
}

export async function removeUser(id) {
  const row = document.getElementById(`remove-user-confirm-${id}`);
  try {
    const res = await adminFetch(`/users/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(String(res.status));
    state.adminUsers = state.adminUsers.filter((u) => u.id !== id);
    renderUsers();
  } catch {
    const text = row?.querySelector('span');
    if (text) text.textContent = 'That didn’t work. Try again.';
  }
}
