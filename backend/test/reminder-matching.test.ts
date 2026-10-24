import { describe, expect, it, vi } from 'vitest';
import { routineMatchesLog } from '../src/lib/notifications.js';

// The reminder cards (js/schedules.js) and the reminder cron (lib/notifications.ts) each decide which
// log entries count as a session of a routine. If they disagree, the app shows a routine as overdue
// while the cron sends nothing, or the other way round. These run the real frontend code against
// the backend's over the same cases.

// The frontend modules expect a browser: js/storage.js reads window when it's imported.
vi.stubGlobal('window', globalThis);
const { entryMatchesSchedule, calcRoutineNextDue } = await import('../../js/schedules.js');
const { state } = await import('../../js/state.js');

const TYPE_SETS = [
  [],
  ['exterior'],
  ['interior'],
  ['maintenance'],
  ['exterior', 'interior'],
  ['exterior', 'maintenance'],
  ['interior', 'maintenance'],
  ['exterior', 'interior', 'maintenance'],
];
// The routine's own id, another routine's id, the legacy log types, and something unknown.
const ENTRY_TYPES = ['r1', 'r2', 'full', 'quick', 'interior', 'both', 'mystery'];

const frontendMatches = (types: string[], entryType: string) => {
  state.routines = [
    { id: 'r1', name: 'Routine', types },
    { id: 'r2', name: 'Other routine', types: [] },
  ];
  return entryMatchesSchedule({ type: entryType }, { routineId: 'r1' });
};

describe('reminder matching', () => {
  for (const types of TYPE_SETS) {
    it(`agrees for a routine with types [${types.join(', ')}]`, () => {
      for (const entryType of ENTRY_TYPES) {
        expect([entryType, routineMatchesLog(types, entryType, 'r1')]).toEqual([
          entryType,
          frontendMatches(types, entryType),
        ]);
      }
    });
  }

  it('counts only its own sessions for a routine with no types', () => {
    expect(ENTRY_TYPES.filter((t) => routineMatchesLog([], t, 'r1'))).toEqual(['r1']);
  });

  it('matches legacy entries by declared type', () => {
    expect(ENTRY_TYPES.filter((t) => routineMatchesLog(['exterior'], t, 'r1'))).toEqual([
      'r1',
      'full',
      'quick',
      'both',
    ]);
    expect(ENTRY_TYPES.filter((t) => routineMatchesLog(['interior'], t, 'r1'))).toEqual(['r1', 'interior', 'both']);
  });

  it("has no due date for a routine that's never been logged", () => {
    state.routines = [{ id: 'r1', name: 'Routine', types: [] }];
    state.washLog = [{ id: 1, date: '2026-10-01', type: 'r2', steps: [], notes: '' }];
    expect(calcRoutineNextDue({ routineId: 'r1', intervalValue: 1, intervalUnit: 'weeks' })).toBeNull();
    state.washLog.push({ id: 2, date: '2026-10-01', type: 'r1', steps: [], notes: '' });
    expect(calcRoutineNextDue({ routineId: 'r1', intervalValue: 1, intervalUnit: 'weeks' })).toEqual(
      new Date(2026, 9, 8),
    );
  });
});
