import { describe, expect, test } from 'vitest';
import type { BoardSpec } from '../src/shared/types';
import { boardReady, canPlay } from '../src/viewer/lib/play';

const board: BoardSpec = { file: 'pages/p/a.html', page: 'p', x: 0, y: 0, w: 640, h: 400 };

describe('boardReady', () => {
  test('is true only when the board file has a version', () => {
    expect(boardReady({ 'pages/p/a.html': 12 }, board.file)).toBe(true);
    expect(boardReady({}, board.file)).toBe(false);
    expect(boardReady({ 'pages/p/a.html': 0 }, board.file)).toBe(false);
  });
});

describe('canPlay', () => {
  test('requires an explicit interactive board and a ready file', () => {
    expect(canPlay({ ...board, interactive: true }, { 'pages/p/a.html': 1 })).toBe(true);
    expect(canPlay(board, { 'pages/p/a.html': 1 })).toBe(false);
    expect(canPlay({ ...board, interactive: false }, { 'pages/p/a.html': 1 })).toBe(false);
    expect(canPlay({ ...board, interactive: true }, {})).toBe(false);
  });
});
