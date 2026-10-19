import { describe, expect, test } from 'vitest';
import { computeLayout, groupFrame, noteRect } from '../src/shared/geometry';
import type { CanvasSpec } from '../src/shared/types';

const board = (x: number, y: number, w = 1280, h = 800, page = 'p') => ({
  file: `pages/${page}/b.html`,
  page,
  x,
  y,
  w,
  h,
});

describe('groupFrame', () => {
  test('extends 48px on the sides and bottom and 144px above the boards', () => {
    const boards = { a: board(0, 0), b: board(1360, 0) };
    expect(groupFrame({ boards: ['a', 'b'] }, boards)).toEqual({
      page: 'p',
      x: -48,
      y: -144,
      w: 2640 + 96,
      h: 800 + 144 + 48,
    });
  });

  test('ignores member ids that do not exist', () => {
    const boards = { a: board(0, 0) };
    expect(groupFrame({ boards: ['a', 'missing'] }, boards)?.w).toBe(1280 + 96);
  });

  test('returns null when no member exists', () => {
    expect(groupFrame({ boards: ['missing'] }, {})).toBeNull();
  });
});

describe('noteRect', () => {
  test('a title without w is one line tall at 1.15 × size', () => {
    const rect = noteRect({ page: 'p', kind: 'title', x: 10, y: 20, text: 'Round 2', size: 40 });
    expect(rect.x).toBe(10);
    expect(rect.y).toBe(20);
    expect(rect.h).toBeCloseTo(46);
  });

  test('a title defaults to size 56', () => {
    expect(noteRect({ page: 'p', kind: 'title', x: 0, y: 0, text: 'Hi' }).h).toBeCloseTo(64.4);
  });

  test('a title with w wraps and grows taller', () => {
    const long = 'A much longer heading that will not fit in a narrow box at all';
    const rect = noteRect({ page: 'p', kind: 'title', x: 0, y: 0, text: long, size: 40, w: 300 });
    expect(rect.w).toBe(300);
    expect(rect.h).toBeGreaterThan(46 * 2);
  });

  test('CJK title text is estimated wider than the same number of latin characters', () => {
    const cjk = noteRect({ page: 'p', kind: 'title', x: 0, y: 0, text: '足迹统计与日期' });
    const latin = noteRect({ page: 'p', kind: 'title', x: 0, y: 0, text: 'abcdefg' });
    expect(cjk.w).toBeGreaterThan(latin.w);
  });

  test('a sticky defaults to 240 wide and grows one line per newline', () => {
    const one = noteRect({ page: 'p', kind: 'sticky', x: 0, y: 0, text: 'short' });
    const three = noteRect({ page: 'p', kind: 'sticky', x: 0, y: 0, text: 'a\nb\nc' });
    expect(one.w).toBe(240);
    expect(one.h).toBe(27 + 32);
    expect(three.h).toBe(27 * 3 + 32);
  });

  test('a sticky wraps long text inside its width', () => {
    const text = 'This sticky has a fairly long sentence that must wrap several times';
    expect(noteRect({ page: 'p', kind: 'sticky', x: 0, y: 0, w: 200, text }).h).toBeGreaterThan(27 * 3);
  });
});

describe('computeLayout', () => {
  const canvas: CanvasSpec = {
    version: 1,
    pages: [
      { id: 'p', name: 'P' },
      { id: 'empty', name: 'Empty' },
    ],
    boards: { a: board(0, 0), b: board(0, 1200, 640, 400) },
    groups: { q1: { title: 'Q1', boards: ['a'] } },
    notes: { t: { page: 'p', kind: 'title', x: 0, y: -400, text: 'Round 1' } },
  };

  test('reports group frames and note rects per page', () => {
    const layout = computeLayout(canvas);
    expect(layout.pages.p?.groups.q1).toEqual({ x: -48, y: -144, w: 1376, h: 992 });
    expect(layout.pages.p?.notes.t?.y).toBe(-400);
  });

  test('page bounds cover boards with their name strips, frames and notes', () => {
    const bounds = computeLayout(canvas).pages.p?.bounds;
    expect(bounds).toEqual({ minX: -48, minY: -400, maxX: 1328, maxY: 1600 });
  });

  test('a page with nothing on it has null bounds', () => {
    expect(computeLayout(canvas).pages.empty?.bounds).toBeNull();
  });
});
