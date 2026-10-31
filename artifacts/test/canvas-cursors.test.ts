import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

import { COMMENT_CURSOR, CURSOR_BLUE, POINTER_CURSOR } from '../src/shared/inspector';

const svgOf = (cursor: string) =>
  decodeURIComponent(cursor.match(/data:image\/svg\+xml,([^")]+)/)![1]!);

test('the canvas cursors share one blue', () => {
  expect(CURSOR_BLUE).toBe('#0D99FF');
});

test('the pointer is a 24px blue arrow pointing from its tip, falling back to the system arrow', () => {
  const svg = svgOf(POINTER_CURSOR);
  expect(svg).toContain("width='24'");
  expect(svg).toContain(`fill='${CURSOR_BLUE}'`);
  expect(POINTER_CURSOR).toMatch(/\) 3 3, default$/);
});

test('the comment cursor is a 24px blue pin pointing from its bottom-left corner', () => {
  const svg = svgOf(COMMENT_CURSOR);
  expect(svg).toContain("width='24'");
  expect(svg).toContain(`fill='${CURSOR_BLUE}'`);
  expect(svg).not.toContain('#c65d3b');
  expect(COMMENT_CURSOR).toMatch(/\) 3 21, crosshair$/);
});

test('selection marks on the canvas use the cursor blue', () => {
  const tokens = readFileSync(new URL('../src/viewer/tokens.stylex.ts', import.meta.url), 'utf8');
  expect(tokens).toContain(`selection: '${CURSOR_BLUE}'`);
  for (const name of ['selectionFill', 'selectionWash', 'selectionLine']) {
    expect(tokens).toMatch(new RegExp(`${name}: 'rgb\\(13 153 255 / [\\d.]+\\)'`));
  }
  expect(tokens).not.toMatch(/\bcursor: '#/);
});

test.each([
  'src/viewer/components/Canvas.tsx',
  'src/viewer/components/CommentLayer.tsx',
  'src/viewer/comments/CommentsPanel.tsx',
])('%s marks boards and agent pins with the selection blue, not the brand accent', (file) => {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  expect(source).not.toMatch(/brand\.accent/);
});
