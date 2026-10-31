import { expect, test } from 'vitest';

import { CULL_MARGIN, culledBoards } from '../src/viewer/lib/cull';

const viewport = { width: 1000, height: 800 };
const at = (id: string, x: number, y: number) => ({ id, x, y, w: 200, h: 100 });
const still = { x: 0, y: 0, k: 1 };

test('keeps boards on screen and within the margin', () => {
  const boards = [at('in', 100, 100), at('edge', 1000 + CULL_MARGIN - 1, 100)];
  expect(culledBoards(boards, still, viewport)).toEqual(new Set());
});

test('culls boards fully beyond the margin on every side', () => {
  const boards = [
    at('right', 1000 + CULL_MARGIN + 1, 100),
    at('left', -200 - CULL_MARGIN - 1, 100),
    at('below', 100, 800 + CULL_MARGIN + 1),
    at('above', 100, -100 - CULL_MARGIN - 1),
  ];
  expect(culledBoards(boards, still, viewport)).toEqual(
    new Set(['right', 'left', 'below', 'above']),
  );
});

test('zooming out brings culled boards back', () => {
  const boards = [at('far', 3000, 100)];
  expect(culledBoards(boards, still, viewport).has('far')).toBe(true);
  expect(culledBoards(boards, { x: 0, y: 0, k: 0.25 }, viewport).has('far')).toBe(false);
});
