import { describe, expect, test } from 'vitest';

import { activityLabel, agentActivity, STALE_MS } from '../src/viewer/document/agentActivity';

const now = 1_000_000_000;

describe('agentActivity', () => {
  test('a write in progress is editing, whatever is left', () => {
    expect(
      agentActivity({ editing: true, pending: 0, agentActiveAt: now - STALE_MS * 2, now }),
    ).toEqual({ kind: 'editing' });
  });

  test('nothing pending is idle', () => {
    expect(agentActivity({ editing: false, pending: 0, agentActiveAt: now - 1000, now })).toEqual({
      kind: 'idle',
    });
  });

  test('pending sections with a recent write are still being worked on', () => {
    expect(agentActivity({ editing: false, pending: 3, agentActiveAt: now - 40_000, now })).toEqual(
      { kind: 'working', pending: 3, idleMs: 40_000 },
    );
  });

  test('pending sections with no write for the stale window may be abandoned', () => {
    expect(
      agentActivity({ editing: false, pending: 2, agentActiveAt: now - STALE_MS - 1, now }),
    ).toEqual({
      kind: 'stale',
      pending: 2,
      idleMs: STALE_MS + 1,
    });
  });

  test('without a write time it never turns stale', () => {
    expect(agentActivity({ editing: false, pending: 2, agentActiveAt: undefined, now })).toEqual({
      kind: 'working',
      pending: 2,
      idleMs: null,
    });
  });
});

describe('activityLabel', () => {
  test('editing names the section', () => {
    expect(activityLabel({ kind: 'editing' }, 'Codex', '方案')).toBe('Codex is editing 方案');
    expect(activityLabel({ kind: 'editing' }, 'Codex', null)).toBe('Codex is editing');
  });

  test('working counts what is left and how long since the last write', () => {
    expect(activityLabel({ kind: 'working', pending: 3, idleMs: 4_000 }, 'Codex', null)).toBe(
      'Codex has 3 sections left · updated just now',
    );
    expect(activityLabel({ kind: 'working', pending: 3, idleMs: 40_000 }, 'Codex', null)).toBe(
      'Codex has 3 sections left · updated 40s ago',
    );
    expect(activityLabel({ kind: 'working', pending: 1, idleMs: 125_000 }, 'Codex', null)).toBe(
      'Codex has 1 section left · updated 2 min ago',
    );
    expect(activityLabel({ kind: 'working', pending: 1, idleMs: null }, 'Codex', null)).toBe(
      'Codex has 1 section left',
    );
  });

  test('stale says how long it has been quiet', () => {
    expect(activityLabel({ kind: 'stale', pending: 2, idleMs: 6 * 60_000 }, 'Codex', null)).toBe(
      "Codex hasn't updated in 6 min · 2 sections left",
    );
    expect(activityLabel({ kind: 'stale', pending: 2, idleMs: 2 * 3_600_000 }, 'Codex', null)).toBe(
      "Codex hasn't updated in 2 h · 2 sections left",
    );
  });

  test('idle has no label', () => {
    expect(activityLabel({ kind: 'idle' }, 'Codex', null)).toBeNull();
  });
});
