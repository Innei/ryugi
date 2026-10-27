import { expect, test } from 'vitest';
import { boardsToWarm, chooseTiers, snapshotScale, visibleRenders, type TierBoard, type TierInput } from '../src/viewer/lib/board-tiers';

const viewport = { width: 1000, height: 800 };
const board = (id: string, x: number, y = 0, w = 1000, h = 800): TierBoard => ({ id, x, y, w, h });
const input = (patch: Partial<TierInput>): TierInput => ({ boards: [], view: { x: 0, y: 0, k: 1 }, viewport, pinned: new Set(), snapshots: new Set(), ...patch });
const tiers = (patch: Partial<TierInput>) => Object.fromEntries(chooseTiers(input(patch)));

test('snapshot resolution is the first scale at least zoom times pixel ratio, capped at 2', () => {
  expect(snapshotScale(0.05, 2)).toBe(0.125);
  expect(snapshotScale(0.1, 2)).toBe(0.25);
  expect(snapshotScale(0.25, 2)).toBe(0.5);
  expect(snapshotScale(0.33, 2)).toBe(1);
  expect(snapshotScale(0.5, 2)).toBe(1);
  expect(snapshotScale(0.75, 2)).toBe(2);
  expect(snapshotScale(3, 2)).toBe(2);
  expect(snapshotScale(0.5, 1)).toBe(0.5);
});

test('at a reading zoom every board more than half on screen goes live', () => {
  const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => board(id, (i % 3) * 320, Math.floor(i / 3) * 400, 300, 300));
  const edge = [board('half-in', 850, 0, 300, 100), board('third-in', 900, 200, 300, 100)];
  expect(tiers({ boards: [...six, ...edge], view: { x: 0, y: 0, k: 1 } })).toEqual({ a: 'live', b: 'live', c: 'live', d: 'live', e: 'live', f: 'live', 'half-in': 'placeholder', 'third-in': 'placeholder' });
  expect(tiers({ boards: [board('most-in', 800, 0, 300, 100)], view: { x: 0, y: 0, k: 1 } })).toEqual({ 'most-in': 'live' });
});

test('zoomed in on a board larger than the screen, it goes live when it fills more than half the screen', () => {
  expect(tiers({ boards: [board('a', 0, 0, 1000, 800)], view: { x: -200, y: -100, k: 2 } })).toEqual({ a: 'live' });
  expect(tiers({ boards: [board('a', 0, 0, 1000, 800)], view: { x: 700, y: 0, k: 2 } })).toEqual({ a: 'placeholder' });
});

test('at a reading zoom at most eight boards go live, the ones covering the most screen first', () => {
  const boards = Array.from({ length: 10 }, (_, i) => board(`b${i}`, (i % 5) * 200, Math.floor(i / 5) * 400, 100 + i * 5, 100 + i * 5));
  const result = tiers({ boards, view: { x: 0, y: 0, k: 1 } });
  expect(Object.entries(result).filter(([, tier]) => tier === 'live').map(([id]) => id)).toEqual(['b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9']);
});

test('a hovered board takes the place of the smallest live board when eight are already live', () => {
  const boards = Array.from({ length: 10 }, (_, i) => board(`b${i}`, (i % 5) * 200, Math.floor(i / 5) * 400, 100 + i * 5, 100 + i * 5));
  const result = tiers({ boards, view: { x: 0, y: 0, k: 1 }, hovered: 'b0', pinned: new Set(['b1']) });
  expect(Object.entries(result).filter(([, tier]) => tier === 'live').map(([id]) => id)).toEqual(['b0', 'b1', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9']);
});

test('a hovered board is live at an overview zoom', () => {
  expect(tiers({ boards: [board('a', 0, 0, 100, 100), board('b', 200, 0, 100, 100)], view: { x: 0, y: 0, k: 0.2 }, hovered: 'b' })).toEqual({ a: 'placeholder', b: 'live' });
});

test('below zoom 0.4 nothing goes live on its own', () => {
  const result = tiers({ boards: [board('a', 0), board('b', 1100)], view: { x: 0, y: 0, k: 0.39 }, snapshots: new Set(['a']) });
  expect(result).toEqual({ a: 'snapshot', b: 'placeholder' });
});

test('pinned boards stay live at any zoom, off screen and beyond the four', () => {
  const boards = [board('a', 0, 0, 100, 100), board('b', 120, 0, 100, 100), board('c', 240, 0, 100, 100), board('d', 360, 0, 100, 100), board('e', 480, 0, 100, 100), board('far', 90000)];
  expect(tiers({ boards, view: { x: 0, y: 0, k: 1 }, pinned: new Set(['e', 'far']) })).toMatchObject({ a: 'live', b: 'live', c: 'live', d: 'live', e: 'live', far: 'live' });
  expect(tiers({ boards, view: { x: 0, y: 0, k: 0.1 }, pinned: new Set(['far']) })).toMatchObject({ a: 'placeholder', far: 'live' });
});

test('near means within one viewport width of the screen; farther is empty', () => {
  const boards = [board('right-near', 1000 + 999, 0, 100, 100), board('right-far', 1000 + 1001, 0, 100, 100), board('above-near', 0, -100 - 1000, 100, 100), board('diagonal-far', 1800, 1500, 100, 100)];
  expect(tiers({ boards, view: { x: 0, y: 0, k: 1 }, snapshots: new Set(['right-near']) })).toEqual({ 'right-near': 'snapshot', 'right-far': 'empty', 'above-near': 'placeholder', 'diagonal-far': 'empty' });
});

test('screen geometry follows the view transform', () => {
  const boards = [board('a', 5000, 0, 1000, 800)];
  expect(tiers({ boards, view: { x: -5000 * 0.5, y: 0, k: 0.5 } })).toEqual({ a: 'live' });
  expect(tiers({ boards, view: { x: 0, y: 0, k: 0.5 } })).toEqual({ a: 'empty' });
});

test('outside the artboard, boards within 240 px of the screen mount live and the rest render nothing', () => {
  const boards = [board('inside', 0, 0, 400, 300), board('margin', 1200, 0, 400, 300), board('away', 1300, 0, 400, 300)];
  const renders = visibleRenders({ boards, view: { x: 0, y: 0, k: 1 }, viewport });
  expect(renders.get('inside')).toEqual({ tier: 'live', mounted: true, image: null, overlay: false, hidden: false });
  expect(renders.get('margin')?.mounted).toBe(true);
  expect(renders.get('away')).toEqual({ tier: 'empty', mounted: false, image: null, overlay: false, hidden: false });
});

test('boards drawn at least 120 px wide without a snapshot are warmed, the biggest first', () => {
  const boards = [board('small', 0, 0, 1000, 800), board('big', 1100, 0, 2000, 800), board('done', 0, 900, 2000, 800), board('away', 20000, 0, 2000, 800)];
  expect(boardsToWarm({ boards, view: { x: 0, y: 0, k: 0.13 }, viewport, snapshots: new Set(['done']), skip: new Set() })).toEqual(['big', 'small']);
  expect(boardsToWarm({ boards, view: { x: 0, y: 0, k: 0.11 }, viewport, snapshots: new Set(['done']), skip: new Set() })).toEqual(['big']);
  expect(boardsToWarm({ boards, view: { x: 0, y: 0, k: 0.13 }, viewport, snapshots: new Set(), skip: new Set(['big']) })).toEqual(['done', 'small']);
});
