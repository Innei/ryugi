import { expect, test } from 'vitest';

import { boardLabelLayout } from '../src/viewer/lib/board-label';

test('title and actions stay together at an exact fit and split one pixel below it', () => {
  const metrics = { title: 120, actions: 104, id: 64 };
  expect(boardLabelLayout(metrics, 232, 1)).toEqual({ stacked: false, showId: false });
  expect(boardLabelLayout(metrics, 231, 1)).toEqual({ stacked: true, showId: false });
});

test('canvas scaling compares all widths in the same coordinate space', () => {
  const metrics = { title: 120, actions: 104, id: 64 };
  expect(boardLabelLayout(metrics, 464, 2)).toEqual({ stacked: false, showId: false });
  expect(boardLabelLayout(metrics, 463, 2)).toEqual({ stacked: true, showId: false });
  expect(boardLabelLayout(metrics, 116, 0.5)).toEqual({ stacked: false, showId: false });
});

test('a secondary board ID cannot force an otherwise fitting title onto its own row', () => {
  const metrics = { title: 120, actions: 104, id: 64 };
  expect(boardLabelLayout(metrics, 302, 1)).toEqual({ stacked: false, showId: true });
  expect(boardLabelLayout(metrics, 301, 1)).toEqual({ stacked: false, showId: false });
});
