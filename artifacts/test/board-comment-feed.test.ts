import { expect, test } from 'vitest';
import { boardCommentsFromMessage, boardCommentsFromPayload } from '../src/viewer/lib/board-comments';

const comments = { version: 1 as const, threads: [{ id: 't1', anchor: { page: 'p', x: 1, y: 2 }, status: 'open' as const, statusAt: 'x', messages: [] }] };

test('the artboard payload carries comments and the stale thread ids', () => {
  expect(boardCommentsFromPayload({ canvas: null, comments, staleThreads: ['t1'] })).toEqual({ comments, stale: ['t1'] });
});

test('a payload from an older server has no comments', () => {
  expect(boardCommentsFromPayload({ canvas: null })).toBeNull();
  expect(boardCommentsFromPayload({ comments: 'nope' })).toBeNull();
});

test('a board-comments message for this artboard replaces the state', () => {
  expect(boardCommentsFromMessage({ type: 'board-comments', artifact: 'artboard/review', comments, stale: [] }, 'artboard/review')).toEqual({ comments, stale: [] });
});

test('messages for another artifact or of another type are ignored', () => {
  expect(boardCommentsFromMessage({ type: 'board-comments', artifact: 'artboard/other', comments, stale: [] }, 'artboard/review')).toBeNull();
  expect(boardCommentsFromMessage({ type: 'change', artifact: 'artboard/review', files: [] }, 'artboard/review')).toBeNull();
});

test('the relay names an artboard by its cloud id, so any board-comments message on that feed counts', () => {
  expect(boardCommentsFromMessage({ type: 'board-comments', artifact: 'artboard/review', comments, stale: [] }, null)).toEqual({ comments, stale: [] });
});
