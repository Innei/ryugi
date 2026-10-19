import { expect, test } from 'vitest';
import { sectionLabel } from '../src/viewer/lib/section';

const blocks = [
  { heading: true, text: 'Relay 事件级同步方案' },
  { heading: false, text: '背景说明' },
  { heading: true, text: '2. 方案' },
  { heading: false, text: '按事件推送' },
  { heading: true, text: '待定问题' },
  { heading: false, text: '阈值' },
];

test('a numbered heading becomes §N', () => {
  expect(sectionLabel(blocks, 3)).toBe('§2');
});

test('an unnumbered heading is named by its text', () => {
  expect(sectionLabel(blocks, 5)).toBe('「待定问题」');
});

test('a block before any heading has no section', () => {
  expect(sectionLabel([{ heading: false, text: 'intro' }], 0)).toBeNull();
});

test('the heading block itself belongs to its own section', () => {
  expect(sectionLabel(blocks, 2)).toBe('§2');
});
