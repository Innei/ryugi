import { expect, test } from 'vitest';

import { boardLabelLayout } from '../src/viewer/lib/board-label';

const metrics = { title: 120, actions: 104, id: 64, lead: 0, tail: 0 };

test('the title stays on one line at an exact fit beside the actions and wraps one pixel below', () => {
  expect(boardLabelLayout(metrics, 232, 1)).toEqual({ lines: 1, showId: false });
  expect(boardLabelLayout(metrics, 231, 1)).toEqual({ lines: 2, showId: true });
});

test('canvas scaling compares all widths in the same coordinate space', () => {
  expect(boardLabelLayout(metrics, 464, 2)).toEqual({ lines: 1, showId: false });
  expect(boardLabelLayout(metrics, 463, 2)).toEqual({ lines: 2, showId: true });
  expect(boardLabelLayout(metrics, 116, 0.5)).toEqual({ lines: 1, showId: false });
});

test('a secondary board ID never wraps an otherwise fitting title', () => {
  expect(boardLabelLayout(metrics, 302, 1)).toEqual({ lines: 1, showId: true });
  expect(boardLabelLayout(metrics, 301, 1)).toEqual({ lines: 1, showId: false });
});

test('a wrapped title keeps the ID when both lines have room for it', () => {
  const long = { ...metrics, title: 300 };
  expect(boardLabelLayout(long, 360, 1)).toEqual({ lines: 2, showId: true });
  expect(boardLabelLayout(long, 280, 1)).toEqual({ lines: 2, showId: false });
});

test('the radio before the title and the tag after it take room from the title', () => {
  const choice = { ...metrics, lead: 20, tail: 40 };
  expect(boardLabelLayout(choice, 292, 1)).toEqual({ lines: 1, showId: false });
  expect(boardLabelLayout(choice, 291, 1)).toEqual({ lines: 2, showId: true });
});
