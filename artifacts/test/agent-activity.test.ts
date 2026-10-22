import { describe, expect, test } from 'vitest';
import { activityLabel, agentActivity, STALE_MS } from '../src/viewer/document/agentActivity';

const now = 1_000_000_000;

describe('agentActivity', () => {
  test('a write in progress is editing, whatever is left', () => {
    expect(agentActivity({ streaming: true, pending: 0, agentActiveAt: now - STALE_MS * 2, now })).toEqual({ kind: 'editing' });
  });

  test('nothing pending is idle', () => {
    expect(agentActivity({ streaming: false, pending: 0, agentActiveAt: now - 1000, now })).toEqual({ kind: 'idle' });
  });

  test('pending sections with a recent write are still being worked on', () => {
    expect(agentActivity({ streaming: false, pending: 3, agentActiveAt: now - 40_000, now })).toEqual({ kind: 'working', pending: 3, idleMs: 40_000 });
  });

  test('pending sections with no write for the stale window may be abandoned', () => {
    expect(agentActivity({ streaming: false, pending: 2, agentActiveAt: now - STALE_MS - 1, now })).toEqual({
      kind: 'stale',
      pending: 2,
      idleMs: STALE_MS + 1,
    });
  });

  test('without a write time it never turns stale', () => {
    expect(agentActivity({ streaming: false, pending: 2, agentActiveAt: undefined, now })).toEqual({ kind: 'working', pending: 2, idleMs: null });
  });
});

describe('activityLabel', () => {
  test('editing names the section', () => {
    expect(activityLabel({ kind: 'editing' }, 'Codex', '方案')).toBe('Codex 正在编辑 方案');
    expect(activityLabel({ kind: 'editing' }, 'Codex', null)).toBe('Codex 正在编辑');
  });

  test('working counts what is left and how long since the last write', () => {
    expect(activityLabel({ kind: 'working', pending: 3, idleMs: 4_000 }, 'Codex', null)).toBe('Codex 还有 3 节待写 · 刚刚更新');
    expect(activityLabel({ kind: 'working', pending: 3, idleMs: 40_000 }, 'Codex', null)).toBe('Codex 还有 3 节待写 · 40 秒前更新');
    expect(activityLabel({ kind: 'working', pending: 1, idleMs: 125_000 }, 'Codex', null)).toBe('Codex 还有 1 节待写 · 2 分钟前更新');
    expect(activityLabel({ kind: 'working', pending: 1, idleMs: null }, 'Codex', null)).toBe('Codex 还有 1 节待写');
  });

  test('stale says how long it has been quiet', () => {
    expect(activityLabel({ kind: 'stale', pending: 2, idleMs: 6 * 60_000 }, 'Codex', null)).toBe('Codex 6 分钟没有更新 · 还有 2 节待写');
    expect(activityLabel({ kind: 'stale', pending: 2, idleMs: 2 * 3_600_000 }, 'Codex', null)).toBe('Codex 2 小时没有更新 · 还有 2 节待写');
  });

  test('idle has no label', () => {
    expect(activityLabel({ kind: 'idle' }, 'Codex', null)).toBeNull();
  });
});
