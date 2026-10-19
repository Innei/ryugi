import { describe, expect, test } from 'vitest';
import { boardSrc, togglePlaying } from '../src/viewer/lib/play';

describe('togglePlaying', () => {
  test('plays the board, and a second press stops it', () => {
    const on = togglePlaying(new Set(), 'q1-a');
    expect([...on]).toEqual(['q1-a']);
    expect([...togglePlaying(on, 'q1-a')]).toEqual([]);
  });

  test('boards play independently', () => {
    const both = togglePlaying(togglePlaying(new Set(), 'q1-a'), 'q1-b');
    expect([...both].sort()).toEqual(['q1-a', 'q1-b']);
    expect([...togglePlaying(both, 'q1-a')]).toEqual(['q1-b']);
  });
});

describe('boardSrc', () => {
  test('carries the file version so edits reload the board', () => {
    expect(boardSrc('/c/k/artboard/x/', 'pages/p/a.html', 3, 0)).toBe('/c/k/artboard/x/pages/p/a.html?v=3');
  });

  test('a replay changes the url so the board starts over', () => {
    expect(boardSrc('/c/k/artboard/x/', 'pages/p/a.html', 3, 2)).toBe('/c/k/artboard/x/pages/p/a.html?v=3&r=2');
  });
});
