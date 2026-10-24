import { expect, test } from 'vitest';
import { readBoardAnchor, type BoardThread } from '../src/shared/board-comments';
import { groupVerdict, verdictProgress } from '../src/shared/verdicts';
import { anchorLabel, pinNumbers } from '../src/viewer/lib/board-anchor';

const verdict = (id: string, kind: 'pass' | 'reject', at: string, fields: Partial<BoardThread> = {}): BoardThread => ({
  id,
  anchor: { page: 'p', group: 'g', verdict: kind, x: 0, y: 0 },
  status: kind === 'pass' ? 'resolved' : 'open',
  statusAt: at,
  messages: [{ id: `${id}-m`, author: 'human', text: kind === 'pass' ? '通过' : '字号小了一号', at }],
  ...fields,
});
const none = new Set<string>();

test('a group anchor reads its group and verdict; a verdict needs a group', () => {
  expect(readBoardAnchor({ page: 'p', x: 1, y: 2, group: 'g', verdict: 'reject' })).toEqual({ page: 'p', x: 1, y: 2, group: 'g', verdict: 'reject' });
  expect(readBoardAnchor({ page: 'p', x: 1, y: 2, verdict: 'pass' })).toBeNull();
  expect(readBoardAnchor({ page: 'p', x: 1, y: 2, group: 'g', verdict: 'maybe' })).toBeNull();
});

test('no verdict yet is pending', () => {
  expect(groupVerdict([], 'g', none)).toEqual({ state: 'pending', evidenceUpdated: false, rejectThreads: 0 });
});

test('the latest verdict decides, and an open reject counts its threads', () => {
  const reject = verdict('r1', 'reject', '2026-10-22T10:00:00Z');
  expect(groupVerdict([reject], 'g', none)).toEqual({ state: 'reject', at: '2026-10-22T10:00:00Z', evidenceUpdated: false, rejectThreads: 1 });
  const pass = verdict('p1', 'pass', '2026-10-22T11:00:00Z');
  const closed = { ...reject, status: 'resolved' as const };
  expect(groupVerdict([closed, pass], 'g', none)).toEqual({ state: 'pass', at: '2026-10-22T11:00:00Z', evidenceUpdated: false, rejectThreads: 0 });
});

test('new evidence after a verdict sends the group back to pending', () => {
  const reject = verdict('r1', 'reject', '2026-10-22T10:00:00Z');
  expect(groupVerdict([reject], 'g', new Set(['r1']))).toEqual({ state: 'pending', at: '2026-10-22T10:00:00Z', evidenceUpdated: true, rejectThreads: 1 });
});

test('a reject resolved by hand leaves the group pending, and other groups do not count', () => {
  const reject = verdict('r1', 'reject', '2026-10-22T10:00:00Z', { status: 'resolved' });
  const elsewhere = { ...verdict('r2', 'reject', '2026-10-22T12:00:00Z'), anchor: { page: 'p', group: 'h', verdict: 'reject' as const, x: 0, y: 0 } };
  expect(groupVerdict([reject, elsewhere], 'g', none).state).toBe('pending');
});

test('progress counts passed verify groups on the page and points at the next one to look at', () => {
  const groups = { a: { boards: ['x'], verify: true }, b: { boards: ['y'], verify: true }, c: { boards: ['z'] }, d: { boards: ['w'], verify: true } };
  const boards = { x: { page: 'p' }, y: { page: 'p' }, z: { page: 'p' }, w: { page: 'q' } };
  const pass = { ...verdict('p1', 'pass', '2026-10-22T11:00:00Z'), anchor: { page: 'p', group: 'a', verdict: 'pass' as const, x: 0, y: 0 } };
  expect(verdictProgress(groups, boards, 'p', [pass], none)).toEqual({ passed: 1, total: 2, next: 'b' });
});

test('pass verdicts get no pin number, and a reject is labelled by its group', () => {
  const numbers = pinNumbers([verdict('p1', 'pass', '2026-10-22T09:00:00Z'), verdict('r1', 'reject', '2026-10-22T10:00:00Z')]);
  expect(numbers.has('p1')).toBe(false);
  expect(numbers.get('r1')).toBe(1);
  expect(anchorLabel({ page: 'p', group: 'g', verdict: 'reject', x: 0, y: 0 })).toBe('g · Rejected');
});
