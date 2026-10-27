import { describe, expect, test } from 'vitest';

import {
  applyBoardAgentOp,
  applyBoardHumanOp,
  type BoardAnchor,
  emptyBoardComments,
  mergeBoardComments,
  readBoardAnchor,
  savedBoardComments,
} from '../src/shared/board-comments';
import { parseComments, unreadThreads, waitingOn } from '../src/shared/comments';

let counter = 0;
const ids = () => `id${++counter}`;
const at = (minute: number) => `2026-10-22T10:${String(minute).padStart(2, '0')}:00.000Z`;

const onNode: BoardAnchor = {
  page: 'review',
  board: 'notify-after',
  x: 510,
  y: 172,
  nodes: [{ board: 'notify-after', path: 'body > img' }],
  offset: { x: 0.91, y: 0.45 },
};
const onPage: BoardAnchor = { page: 'review', x: -40, y: 1200 };

describe('readBoardAnchor', () => {
  test('keeps a node anchor with its offset and hashes', () => {
    expect(readBoardAnchor({ ...onNode, hashes: { 'notify-after': 'abc' }, extra: 1 })).toEqual({
      ...onNode,
      hashes: { 'notify-after': 'abc' },
    });
  });

  test('keeps a page anchor without a board', () => {
    expect(readBoardAnchor(onPage)).toEqual(onPage);
  });

  test('keeps a selection anchor over several nodes', () => {
    const selection = {
      page: 'review',
      board: 'notify-design',
      x: 380,
      y: 140,
      nodes: [
        { board: 'notify-design', path: 'main > div:nth-of-type(2)' },
        { board: 'notify-design', path: 'main > div:nth-of-type(3)' },
      ],
    };
    expect(readBoardAnchor(selection)).toEqual(selection);
  });

  test.each([
    ['no page', { x: 1, y: 2 }],
    ['an empty page', { page: '', x: 1, y: 2 }],
    ['a coordinate that is not finite', { page: 'p', x: Number.NaN, y: 2 }],
    [
      'an empty node path',
      { page: 'p', board: 'b', x: 1, y: 2, nodes: [{ board: 'b', path: '' }] },
    ],
    ['an offset outside the node', { ...onNode, offset: { x: 1.2, y: 0.5 } }],
    ['an offset without a node', { page: 'p', board: 'b', x: 1, y: 2, offset: { x: 0.5, y: 0.5 } }],
    ['an empty board name', { page: 'p', board: '', x: 1, y: 2 }],
  ])('rejects an anchor with %s', (_name, value) => {
    expect(readBoardAnchor(value)).toBeNull();
  });
});

describe('board threads', () => {
  test('create opens a thread on the anchor with the first human message', () => {
    const file = applyBoardHumanOp(
      emptyBoardComments(),
      { op: 'create', anchor: onNode, text: '开关离右边多了 18px' },
      at(1),
      ids,
    );
    expect(file.threads).toHaveLength(1);
    expect(file.threads[0]).toMatchObject({
      anchor: onNode,
      status: 'open',
      statusBy: 'human',
      messages: [{ author: 'human', text: '开关离右边多了 18px', at: at(1) }],
    });
    expect(waitingOn(file.threads[0]!)).toBe('agent');
  });

  test('the agent replies and resolves through its own ops', () => {
    let file = applyBoardHumanOp(
      emptyBoardComments(),
      { op: 'create', anchor: onPage, text: '整体太挤' },
      at(2),
      ids,
    );
    const threadId = file.threads[0]!.id;
    file = applyBoardAgentOp(file, { op: 'reply', threadId, text: '加大了间距' }, at(3), ids).file;
    expect(waitingOn(file.threads[0]!)).toBe('human');
    file = applyBoardAgentOp(file, { op: 'resolve', threadId }, at(4), ids).file;
    expect(file.threads[0]).toMatchObject({ status: 'resolved', statusBy: 'agent' });
  });

  test('the agent can open a thread on a board', () => {
    const { file, threadId } = applyBoardAgentOp(
      emptyBoardComments(),
      { op: 'add', anchor: { page: 'review', board: 'q1-a', x: 1440, y: 0 }, text: '这里我不确定' },
      at(5),
      ids,
    );
    expect(file.threads.find((t) => t.id === threadId)).toMatchObject({
      anchor: { board: 'q1-a' },
      statusBy: 'agent',
    });
  });

  test('a saved board file round-trips through parse, saved and merge', () => {
    const file = applyBoardHumanOp(
      emptyBoardComments(),
      { op: 'create', anchor: { ...onNode, hashes: { 'notify-after': 'h1' } }, text: 'x' },
      at(6),
      ids,
    );
    const text = JSON.stringify(file);
    const saved = savedBoardComments(parseComments(text));
    expect(saved).toEqual(file);
    expect(mergeBoardComments(saved, parseComments(text), 'agent', at(7), ids).file).toEqual(file);
  });

  test('a saved thread whose anchor is no longer valid is dropped', () => {
    const file = applyBoardHumanOp(
      emptyBoardComments(),
      { op: 'create', anchor: onPage, text: 'x' },
      at(8),
      ids,
    );
    const broken = JSON.parse(JSON.stringify(file));
    broken.threads[0].anchor = { page: '' };
    expect(savedBoardComments(parseComments(JSON.stringify(broken))).threads).toEqual([]);
  });

  test('an agent hand-written thread without ids is added once', () => {
    const base = emptyBoardComments();
    const incoming = {
      threads: [{ anchor: onPage, messages: [{ author: 'agent' as const, text: '看看这里' }] }],
    };
    const first = mergeBoardComments(base, incoming, 'agent', at(9), ids).file;
    const second = mergeBoardComments(first, incoming, 'agent', at(10), ids).file;
    expect(second.threads).toHaveLength(1);
  });

  test('an agent thread with an invalid anchor is dropped with a warning', () => {
    const { file, warnings } = mergeBoardComments(
      emptyBoardComments(),
      { threads: [{ anchor: { page: 'p' }, messages: [{ text: 'x' }] }] },
      'agent',
      at(11),
      ids,
    );
    expect(file.threads).toEqual([]);
    expect(warnings).toEqual(['a new thread needs a board anchor (page, x, y); dropped it']);
  });

  test('unread threads work on board files', () => {
    const file = applyBoardHumanOp(
      emptyBoardComments(),
      { op: 'create', anchor: onNode, text: 'x' },
      at(12),
      ids,
    );
    expect(unreadThreads(file, null).threads.map((t) => t.anchor)).toEqual([onNode]);
  });
});
