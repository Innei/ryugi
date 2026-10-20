import { expect, test } from 'vitest';
import { selectionContext } from '../src/viewer/document/selectionContext';

const blocks = [
  { id: 'h1', heading: true, text: '同步策略' },
  { id: 'p1', heading: false, text: '按事件粒度推送' },
  { id: 'h2', heading: true, text: '离线' },
  { id: 'p2', heading: false, text: '超过 7 天' },
  { id: '', heading: false, text: 'no id' },
  { id: 'p3', heading: false, text: '快照' },
];

test('lists the blocks a selection spans and the nearest heading above it', () => {
  expect(selectionContext(blocks, 3, 5)).toEqual({ blockIds: ['p2', 'p3'], heading: '离线' });
});

test('a selection inside a heading names that heading', () => {
  expect(selectionContext(blocks, 2, 2)).toEqual({ blockIds: ['h2'], heading: '离线' });
});

test('a selection made backwards gives the same blocks', () => {
  expect(selectionContext(blocks, 3, 1)).toEqual({ blockIds: ['p1', 'h2', 'p2'], heading: '同步策略' });
});

test('no heading above means an empty heading', () => {
  expect(selectionContext(blocks.slice(1), 0, 0)).toEqual({ blockIds: ['p1'], heading: '' });
});
