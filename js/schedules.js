// Routine reminder schedules and wash reminder cards.
import { BACKEND_URL } from './config.js';
import { state } from './state.js';
import { escAttr, escHtml } from './util.js';
import { evalWeatherTriggers } from './weather.js';

// ── Wash schedule helpers ────────────────────────────────────────────────

export function scheduleIntervalDays({ intervalValue, intervalUnit }) {
  const mul = { days: 1, weeks: 7, months: 30, years: 365 };
  return (intervalValue || 1) * (mul[intervalUnit] || 7);
}

// Returns true for both new entries (e.type === routineId) and legacy entries matched by the
// routine's declared types; a routine with no types only matches its own entries. Mirrors
// routineMatchesLog() in backend/src/lib/notifications.ts, and backend/test/reminder-matching.test.ts
// runs both over the same cases.
export function entryMatchesSchedule(entry, schedule) {
  if (entry.type === schedule.routineId) return true;
  const routine = state.routines.find((r) => r.id === schedule.routineId);
  const types = routine?.types ?? [];
  const t = entry.type;
  if (types.includes('exterior') && ['full', 'quick', 'both'].includes(t)) return true;
  if (types.includes('interior') && ['interior', 'both'].includes(t)) return true;
  if (types.includes('maintenance') && ['full', 'both'].includes(t)) return true;
  return false;
}

export function calcScheduleStreak(schedule, forecast) {
  const routine = state.routines.find((r) => r.id === schedule.routineId);
  if (!routine) return 0;
  const dates = [...new Set(state.washLog.filter((e) => entryMatchesSchedule(e, schedule)).map((e) => e.date))].sort(
    (a, b) => b.localeCompare(a),
  );
  if (!dates.length) return 0;
  const intervalDays = scheduleIntervalDays(schedule);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(dates[0] + 'T00:00:00');
  dueDate.setDate(dueDate.getDate() + intervalDays);
  if (today > dueDate) {
    // Grace: if it's raining today the user can't wash — hold the streak
    const rainingToday = forecast && (forecast[0]?.rain_chance ?? 0) >= 50;
    if (!rainingToday) return 0;
  }
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const gap = Math.round((new Date(dates[i - 1] + 'T00:00:00') - new Date(dates[i] + 'T00:00:00')) / 86400000);
    if (gap <= intervalDays) streak++;
    else break;
  }
  return streak;
}

// Null when the routine has never been logged: there's nothing to count from, and the backend
// sends no reminder for it either.
export function calcRoutineNextDue(schedule) {
  const routine = state.routines.find((r) => r.id === schedule.routineId);
  if (!routine) return null;
  const relevant = state.washLog
    .filter((e) => entryMatchesSchedule(e, schedule))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!relevant.length) return null;
  const [y, m, d] = relevant[0].date.split('-').map(Number);
  return new Date(y, m - 1, d + scheduleIntervalDays(schedule));
}

export function calcBestWashDay(dueDate, forecast) {
  if (!forecast || !dueDate) return null;
  const triggers = evalWeatherTriggers(forecast);
  if (!triggers.rainTomorrow) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (Math.round((dueDate - today) / 86400000) > 2) return null;
  return triggers.rainDay;
}

export function renderWashReminderCards() {
  const container = document.getElementById('wash-reminder-cards');
  if (!container) return;
  const schedules = state.settings.schedules ?? [];
  if (!schedules.length) {
    container.innerHTML = '';
    return;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  container.innerHTML = '';
  schedules.forEach((schedule) => {
    const routine = state.routines.find((r) => r.id === schedule.routineId);
    if (!routine) return;
    const nextDue = calcRoutineNextDue(schedule);
    // Both are local midnights, so the difference is whole days give or take a DST hour: round, not
    // ceil, or a 23-day gap across a DST change comes out as 22.
    const daysUntil = nextDue ? Math.round((nextDue - today) / 86400000) : null;
    const bestDay = state.weatherCache ? calcBestWashDay(nextDue, state.weatherCache) : null;
    const streak = calcScheduleStreak(schedule, state.weatherCache);
    let statusText,
      subText = '',
      isOverdue = false;
    if (daysUntil === null) statusText = 'No sessions logged yet';
    else if (daysUntil < 0) {
      statusText = `Overdue by ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''}`;
      isOverdue = true;
    } else if (daysUntil === 0) statusText = 'Due today';
    else if (daysUntil === 1) statusText = 'Due tomorrow';
    else statusText = `Due in ${daysUntil} days`;
    if (bestDay) {
      subText = `🌧 Rain forecast`;
      statusText = `Best day: ${bestDay}`;
    }
    const hasTickTick = state.ticktickIsConnected && !!state.settings.notifications?.ticktickAlerts;
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

export function goToRoutine(routineId) {
  document.querySelector('.tab[data-tab="routine"]')?.click();
  setTimeout(() => {
    document.getElementById(`routine-view-${routineId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

export async function sendWashReminderToTickTick(routineId, routineName, dueDate, btn) {
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
  } catch {
    btn.textContent = 'Failed';
  }
  setTimeout(() => {
    btn.textContent = orig;
    btn.disabled = false;
  }, 2000);
}

// ── Schedule settings UI ─────────────────────────────────────────────────

export function renderSchedulesUI() {
  const container = document.getElementById('schedule-list');
  if (!container) return;
  const schedules = state.settings.schedules ?? [];
  if (!schedules.length) {
    container.innerHTML = '<p class="settings-hint">No schedules set. Add one below.</p>';
    return;
  }
  container.innerHTML = schedules
    .map((s, i) => {
      const opts = state.routines
        .map(
          (r) =>
            `<option value="${escAttr(r.id)}"${r.id === s.routineId ? ' selected' : ''}>${escHtml(r.name)}</option>`,
        )
        .join('');
      const unitOpts = ['days', 'weeks', 'months', 'years']
        .map((u) => `<option value="${u}"${u === s.intervalUnit ? ' selected' : ''}>${u}</option>`)
        .join('');
      return `<div class="schedule-entry">
        <select class="schedule-routine-select" onchange="updateScheduleField(${i},'routineId',this.value)">${opts}</select>
        <span class="schedule-label">every</span>
        <input class="schedule-interval-input" type="number" min="1" max="365" value="${s.intervalValue || 1}" onchange="updateScheduleField(${i},'intervalValue',+this.value)">
        <select class="schedule-unit-select" onchange="updateScheduleField(${i},'intervalUnit',this.value)">${unitOpts}</select>
        <button class="schedule-remove-btn" onclick="removeScheduleEntry(${i})" title="Remove">✕</button>
      </div>`;
    })
    .join('');
}

export function updateScheduleField(idx, field, val) {
  if (state.settings.schedules) state.settings.schedules[idx][field] = val;
}

export function addScheduleEntry() {
  if (!state.settings.schedules) state.settings.schedules = [];
  state.settings.schedules.push({ routineId: state.routines[0]?.id ?? '', intervalValue: 2, intervalUnit: 'weeks' });
  renderSchedulesUI();
}

export function removeScheduleEntry(idx) {
  state.settings.schedules.splice(idx, 1);
  renderSchedulesUI();
}
