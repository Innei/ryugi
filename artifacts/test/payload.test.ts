import { describe, expect, test } from 'vitest';
import type { CanvasSpec } from '../src/shared/types';
import { mergePayload, type ViewerPayload } from '../src/viewer/lib/payload';

const canvas: CanvasSpec = { version: 1, pages: [{ id: 'p', name: 'P' }], boards: {} };
const good: ViewerPayload = {
  canvas,
  layout: { pages: { p: { groups: {}, notes: {}, bounds: null } } },
  warnings: [],
  versions: { 'pages/p/a.html': 1 },
  contentBase: '/b/one/',
  stale: false,
};

describe('mergePayload', () => {
  test('a valid payload replaces the previous one', () => {
    const next = { ...good, warnings: ['x'], contentBase: '/b/two/' };
    expect(mergePayload(good, next)).toEqual({ ...next, stale: false });
  });

  test('a withheld canvas keeps the last good canvas, takes the new warnings and marks it stale', () => {
    const broken = { canvas: null, layout: null, warnings: ['bad'], versions: {}, contentBase: '/b/two/', stale: false };
    expect(mergePayload(good, broken)).toEqual({ ...good, warnings: ['bad'], contentBase: '/b/two/', stale: true });
  });

  test('with no previous canvas a withheld canvas stays empty', () => {
    const empty = { ...good, canvas: null, layout: null };
    const broken = { canvas: null, layout: null, warnings: ['bad'], versions: {}, contentBase: '/b/two/', stale: false };
    expect(mergePayload(empty, broken).canvas).toBeNull();
  });
});
