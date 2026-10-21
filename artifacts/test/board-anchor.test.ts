import { expect, test } from 'vitest';
import { anchorLabel, clickAnchor, pinNumbers, pinPoint, selectionAnchor } from '../src/viewer/lib/board-anchor';

test('a click on a node anchors to it with the offset inside the node', () => {
  expect(clickAnchor('review', 'after', { x: 510, y: 172 }, { rect: { x: 10, y: 72, width: 500, height: 200 }, path: 'body > img' })).toEqual({
    page: 'review',
    board: 'after',
    x: 510,
    y: 172,
    nodes: [{ board: 'after', path: 'body > img' }],
    offset: { x: 1, y: 0.5 },
  });
});

test('an offset is clamped to the node, and a zero-size node gets none', () => {
  expect(clickAnchor('p', 'b', { x: 0, y: 0 }, { rect: { x: 10, y: 10, width: 100, height: 100 }, path: 'p' }).offset).toEqual({ x: 0, y: 0 });
  expect(clickAnchor('p', 'b', { x: 5, y: 5 }, { rect: { x: 5, y: 5, width: 0, height: 10 }, path: 'p' }).offset).toBeUndefined();
});

test('a click on a board whose node is unknown anchors to the board only', () => {
  expect(clickAnchor('p', 'b', { x: 4.4, y: 9.6 })).toEqual({ page: 'p', board: 'b', x: 4, y: 10 });
});

test('a click on the page anchors to page coordinates', () => {
  expect(clickAnchor('p', null, { x: -40.2, y: 1200.7 })).toEqual({ page: 'p', x: -40, y: 1201 });
});

test('a selection anchors to its nodes with the pin at the first node top-right', () => {
  expect(
    selectionAnchor('p', [
      { boardId: 'design', rect: { x: 154, y: 139, width: 380, height: 57 }, path: 'main > div:nth-of-type(2)' },
      { boardId: 'design', rect: { x: 154, y: 196, width: 380, height: 57 }, path: 'main > div:nth-of-type(3)' },
    ]),
  ).toEqual({
    page: 'p',
    board: 'design',
    x: 534,
    y: 139,
    nodes: [
      { board: 'design', path: 'main > div:nth-of-type(2)' },
      { board: 'design', path: 'main > div:nth-of-type(3)' },
    ],
  });
});

test('a selection without node paths cannot be commented on', () => {
  expect(selectionAnchor('p', [])).toBeNull();
  expect(selectionAnchor('p', [{ boardId: 'b', rect: { x: 0, y: 0, width: 1, height: 1 } }])).toBeNull();
});

test('a pin follows its board when the board moves', () => {
  const boards = { after: { x: 1520, y: 0 } };
  expect(pinPoint({ page: 'p', board: 'after', x: 510, y: 172 }, boards)).toEqual({ x: 2030, y: 172 });
  expect(pinPoint({ page: 'p', board: 'after', x: 510, y: 172 }, { after: { x: 0, y: 900 } })).toEqual({ x: 510, y: 1072 });
});

test('a page pin sits at its own coordinates and a pin on a removed board has no place', () => {
  expect(pinPoint({ page: 'p', x: -40, y: 1200 }, {})).toEqual({ x: -40, y: 1200 });
  expect(pinPoint({ page: 'p', board: 'gone', x: 1, y: 1 }, {})).toBeNull();
});

test('labels say where a thread is', () => {
  expect(anchorLabel({ page: 'p', board: 'after', x: 1, y: 1, nodes: [{ board: 'after', path: 'body > img' }], offset: { x: 0.91, y: 0.454 } })).toBe('after · body > img · 91%, 45%');
  expect(anchorLabel({ page: 'p', board: 'design', x: 1, y: 1, nodes: [{ board: 'design', path: 'a' }, { board: 'design', path: 'b' }] })).toBe('design · 2 个元素');
  expect(anchorLabel({ page: 'p', board: 'after', x: 1, y: 1 })).toBe('after');
  expect(anchorLabel({ page: 'p', x: 1, y: 1 })).toBe('页面 p');
});

test('pins are numbered in the order threads were opened', () => {
  expect(pinNumbers([{ id: 'a', statusAt: '1', messages: [{ at: '2026-10-22T10:05:00Z' }] }, { id: 'b', statusAt: '1', messages: [{ at: '2026-10-22T10:01:00Z' }] }] as never)).toEqual(
    new Map([
      ['b', 1],
      ['a', 2],
    ]),
  );
});
