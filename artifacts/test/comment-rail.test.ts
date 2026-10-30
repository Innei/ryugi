import { describe, expect, test } from 'vitest';

import { resolveAnchor, shownThreadIds } from '../src/viewer/document/anchor';
import { createDrafts, draftKey } from '../src/viewer/document/drafts';
import {
  barLinkStart,
  blockBar,
  connectorPath,
  layoutCards,
  popoverPosition,
  toolbarPosition,
} from '../src/viewer/document/layoutCards';

test('unsent comments on different selections starting at the same block stay separate', () => {
  const drafts = createDrafts();
  drafts.save(draftKey('b1', '', ['b1', 'b2']), 'First pair');
  expect(drafts.take(draftKey('b1', '', ['b1', 'b3']))).toBe('');
  expect(drafts.take(draftKey('b1', '', ['b1', 'b2']))).toBe('First pair');
});

test('unsent comments on repeated text at different offsets stay separate', () => {
  const drafts = createDrafts();
  drafts.save(
    draftKey(
      'b1',
      'same',
      ['b1', 'b2'],
      [
        { blockId: 'b1', quote: 'same', start: 0 },
        { blockId: 'b2', quote: 'end', start: 0 },
      ],
    ),
    'First occurrence',
  );
  expect(
    drafts.take(
      draftKey(
        'b1',
        'same',
        ['b1', 'b2'],
        [
          { blockId: 'b1', quote: 'same', start: 5 },
          { blockId: 'b2', quote: 'end', start: 0 },
        ],
      ),
    ),
  ).toBe('');
});

describe('layoutCards', () => {
  test('a card sits at its anchor when there is room', () => {
    expect(layoutCards([{ id: 'a', anchorTop: 100, height: 80 }], 12)).toEqual({ a: 100 });
  });

  test('overlapping cards push later ones down, in anchor order', () => {
    const tops = layoutCards(
      [
        { id: 'b', anchorTop: 120, height: 60 },
        { id: 'a', anchorTop: 100, height: 80 },
        { id: 'c', anchorTop: 400, height: 50 },
      ],
      12,
    );
    expect(tops).toEqual({ a: 100, b: 192, c: 400 });
  });

  test('the active card keeps its anchor and others move around it', () => {
    const tops = layoutCards(
      [
        { id: 'a', anchorTop: 100, height: 80 },
        { id: 'b', anchorTop: 120, height: 60 },
      ],
      12,
      'b',
    );
    expect(tops.b).toBe(120);
    expect(tops.a! + 80 + 12).toBeLessThanOrEqual(120);
  });
});

describe('resolveAnchor', () => {
  test('a saved text offset distinguishes a repeated quote in the same paragraph', () => {
    expect(resolveAnchor('same same', 'same', 5)).toEqual({ start: 5, end: 9 });
  });
  test('finds the quote inside the block text', () => {
    expect(resolveAnchor('服务端改为按事件粒度推送：每条变更', '按事件粒度推送')).toEqual({
      start: 5,
      end: 12,
    });
  });

  test('falls back to the whole block when the quote is gone', () => {
    expect(resolveAnchor('服务端改为按批次推送', '按事件粒度推送')).toBe('block');
  });

  test('an empty quote anchors the whole block', () => {
    expect(resolveAnchor('anything', '')).toBe('block');
  });
});

describe('connectorPath', () => {
  test('runs along the highlight line, then curves into the panel', () => {
    expect(connectorPath({ x: -300, y: 40 }, { x: 0, y: 18 }, 40)).toBe(
      'M-300 40 H-40 C-20 40 -20 18 0 18',
    );
  });

  test('curves straight from the highlight when it ends inside the bend', () => {
    expect(connectorPath({ x: -20, y: 40 }, { x: 0, y: 18 }, 40)).toBe(
      'M-20 40 C-10 40 -10 18 0 18',
    );
  });
});

describe('blockBar', () => {
  test('sits just outside the right edge of the block, full height', () => {
    expect(blockBar({ top: 100, right: 700, bottom: 400 })).toEqual({
      left: 708,
      right: 711,
      top: 100,
      bottom: 400,
    });
  });

  test('links to the panel from near the top of the bar', () => {
    expect(barLinkStart({ left: 708, right: 711, top: 100, bottom: 400 })).toEqual({
      x: 711,
      y: 118,
    });
  });

  test('links from the middle of a bar shorter than the card offset', () => {
    expect(barLinkStart({ left: 708, right: 711, top: 100, bottom: 120 })).toEqual({
      x: 711,
      y: 110,
    });
  });
});

describe('popoverPosition', () => {
  const bounds = { left: 0, right: 760 };

  test('opens under the selection, aligned to its start', () => {
    expect(popoverPosition({ left: 100, bottom: 200 }, bounds, 340, 8)).toEqual({
      left: 100,
      top: 208,
    });
  });

  test('shifts left so the panel stays inside the column', () => {
    expect(popoverPosition({ left: 600, bottom: 200 }, bounds, 340, 8)).toEqual({
      left: 420,
      top: 208,
    });
  });

  test('never starts before the column', () => {
    expect(popoverPosition({ left: -30, bottom: 200 }, bounds, 340, 8)).toEqual({
      left: 0,
      top: 208,
    });
  });
});

describe('toolbarPosition', () => {
  const bounds = { left: 0, right: 760 };

  test('sits above the start of the selection', () => {
    expect(toolbarPosition({ left: 120, top: 200 }, bounds, 140, 36, 8)).toEqual({
      left: 120,
      top: 156,
    });
  });

  test('shifts left so the toolbar stays inside the column', () => {
    expect(toolbarPosition({ left: 700, top: 200 }, bounds, 140, 36, 8)).toEqual({
      left: 620,
      top: 156,
    });
  });
});

describe('drafts', () => {
  test('keeps an unsent draft for the passage it was written on', () => {
    const drafts = createDrafts();
    drafts.save(draftKey('b1', '按事件粒度推送'), '离线怎么办');
    expect(drafts.take(draftKey('b1', '按事件粒度推送'))).toBe('离线怎么办');
    expect(drafts.take(draftKey('b1', '别的段落'))).toBe('');
  });

  test('saving blank text forgets the draft', () => {
    const drafts = createDrafts();
    const key = draftKey('b1', 'q');
    drafts.save(key, '写了一半');
    drafts.save(key, '   ');
    expect(drafts.take(key)).toBe('');
  });
});

describe('shownThreadIds', () => {
  const threads = [
    { id: 'a', status: 'open' as const },
    { id: 'b', status: 'resolved' as const },
    { id: 'c', status: 'resolved' as const },
  ];

  test('open threads show their highlight and link; resolved ones stay hidden', () => {
    expect([...shownThreadIds(threads, null)]).toEqual(['a']);
  });

  test('a resolved thread shows them again while it is active', () => {
    expect([...shownThreadIds(threads, 'b')].sort()).toEqual(['a', 'b']);
  });
});
