import { describe, expect, test } from 'vitest';
import type { CanvasLayout, CanvasSpec } from '../src/shared/types';
import { MAX_ZOOM, MIN_ZOOM, fitView, labelRect, resolveFocus, zoomAround } from '../src/viewer/lib/view';

describe('fitView', () => {
  const viewport = { width: 1000, height: 800 };
  const insets = { top: 60, right: 20, bottom: 20, left: 20 };

  test('centers the bounds inside the viewport minus insets with a margin', () => {
    const view = fitView({ minX: 0, minY: 0, maxX: 960, maxY: 720 }, viewport, insets);
    expect(view.k).toBeCloseTo(0.9);
    const centerX = view.x + 480 * view.k;
    const centerY = view.y + 360 * view.k;
    expect(centerX).toBeCloseTo(20 + 960 / 2);
    expect(centerY).toBeCloseTo(60 + 720 / 2);
  });

  test('never zooms in past 100%', () => {
    expect(fitView({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, viewport, insets).k).toBe(1);
  });

  test('clamps to the minimum zoom for huge pages', () => {
    expect(fitView({ minX: 0, minY: 0, maxX: 10_000_000, maxY: 10 }, viewport, insets).k).toBe(MIN_ZOOM);
  });
});

describe('zoomAround', () => {
  test('keeps the canvas point under the cursor fixed', () => {
    const view = { x: 100, y: 50, k: 0.5 };
    const next = zoomAround(view, 2, 300, 250);
    const before = { x: (300 - view.x) / view.k, y: (250 - view.y) / view.k };
    const after = { x: (300 - next.x) / next.k, y: (250 - next.y) / next.k };
    expect(next.k).toBe(1);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  test('clamps zoom between the limits', () => {
    expect(zoomAround({ x: 0, y: 0, k: 2 }, 100, 0, 0).k).toBe(MAX_ZOOM);
    expect(zoomAround({ x: 0, y: 0, k: 0.05 }, 0.0001, 0, 0).k).toBe(MIN_ZOOM);
  });
});

describe('resolveFocus', () => {
  const canvas: CanvasSpec = {
    version: 1,
    pages: [
      { id: 'p', name: 'P' },
      { id: 'q', name: 'Q' },
    ],
    boards: { a: { file: 'a.html', page: 'q', x: 10, y: 20, w: 300, h: 200 } },
    groups: { g: { boards: ['a'] } },
    notes: { n: { page: 'p', kind: 'sticky', x: 0, y: 0, text: 'hi' } },
  };
  const layout: CanvasLayout = {
    pages: {
      p: { groups: {}, notes: { n: { x: 0, y: 0, w: 240, h: 59 } }, bounds: null },
      q: { groups: { g: { x: -38, y: -124, w: 396, h: 392 } }, notes: {}, bounds: null },
    },
  };

  test('a board focuses its page and its rect including the name strip', () => {
    expect(resolveFocus(canvas, layout, 'a')).toEqual({
      page: 'q',
      bounds: { minX: 10, minY: -12, maxX: 310, maxY: 220 },
    });
  });

  test('a group focuses its frame', () => {
    expect(resolveFocus(canvas, layout, 'g')).toEqual({
      page: 'q',
      bounds: { minX: -38, minY: -124, maxX: 358, maxY: 268 },
    });
  });

  test('a note focuses its rect', () => {
    expect(resolveFocus(canvas, layout, 'n')?.page).toBe('p');
  });

  test('an unknown target resolves to null', () => {
    expect(resolveFocus(canvas, layout, 'ghost')).toBeNull();
  });
});

describe('labelRect', () => {
  test('places a board label in screen space at the board top-left', () => {
    expect(labelRect({ x: 100, y: 200, w: 400 }, { x: 10, y: 20, k: 0.5 })).toEqual({ left: 60, top: 120, width: 200 });
  });

  test('hides the label when the board is too narrow on screen', () => {
    expect(labelRect({ x: 0, y: 0, w: 80 }, { x: 0, y: 0, k: 0.5 })).toBeNull();
  });
});
