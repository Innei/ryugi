import { expect, test } from 'vitest';

import { keepBoard, KEPT_MAX, pruneKept } from '../src/viewer/lib/kept-boards';

const ids = (list: { id: string }[]) => list.map((entry) => entry.id);

test('a board interacted with again moves to the most recent place', () => {
  const list = keepBoard(keepBoard(keepBoard([], 'a', 1), 'b', 1), 'a', 1);
  expect(ids(list)).toEqual(['b', 'a']);
});

test('keeping a seventh board drops the one used longest ago', () => {
  let list = ['a', 'b', 'c', 'd', 'e', 'f'].reduce(
    (kept, id) => keepBoard(kept, id, 1),
    [] as ReturnType<typeof keepBoard>,
  );
  expect(KEPT_MAX).toBe(6);
  list = keepBoard(keepBoard(list, 'a', 1), 'g', 1);
  expect(ids(list)).toEqual(['c', 'd', 'e', 'f', 'a', 'g']);
});

test('a board rewritten since it was kept is no longer kept', () => {
  const list = keepBoard(keepBoard([], 'a', 1), 'b', 1);
  expect(
    ids(
      pruneKept(
        list,
        new Map([
          ['a', 2],
          ['b', 1],
        ]),
      ),
    ),
  ).toEqual(['b']);
});

test('a board not on the current page is no longer kept', () => {
  const list = keepBoard(keepBoard([], 'a', 1), 'b', 1);
  expect(ids(pruneKept(list, new Map([['b', 1]])))).toEqual(['b']);
});

test('pruning a list with nothing to drop returns the same list', () => {
  const list = keepBoard([], 'a', 1);
  expect(pruneKept(list, new Map([['a', 1]]))).toBe(list);
});
