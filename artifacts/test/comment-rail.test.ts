import { describe, expect, test } from 'vitest';
import { resolveAnchor } from '../src/viewer/document/anchor';
import { createDrafts, draftKey } from '../src/viewer/document/drafts';
import { connectorPath, layoutCards, popoverPosition, toolbarPosition } from '../src/viewer/document/layoutCards';

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
  test('finds the quote inside the block text', () => {
    expect(resolveAnchor('服务端改为按事件粒度推送：每条变更', '按事件粒度推送')).toEqual({ start: 5, end: 12 });
  });

  test('falls back to the whole block when the quote is gone', () => {
    expect(resolveAnchor('服务端改为按批次推送', '按事件粒度推送')).toBe('block');
  });

  test('an empty quote anchors the whole block', () => {
    expect(resolveAnchor('anything', '')).toBe('block');
  });
});

describe('connectorPath', () => {
  test('runs along the highlight line, then bends into the panel', () => {
    expect(connectorPath({ x: -300, y: 40 }, { x: 0, y: 18 }, 40)).toBe('M-300 40 H-40 L0 18');
  });

  test('skips the horizontal run when the highlight ends inside the bend', () => {
    expect(connectorPath({ x: -20, y: 40 }, { x: 0, y: 18 }, 40)).toBe('M-20 40 L0 18');
  });
});

describe('popoverPosition', () => {
  const bounds = { left: 0, right: 760 };

  test('opens under the selection, aligned to its start', () => {
    expect(popoverPosition({ left: 100, bottom: 200 }, bounds, 340, 8)).toEqual({ left: 100, top: 208 });
  });

  test('shifts left so the panel stays inside the column', () => {
    expect(popoverPosition({ left: 600, bottom: 200 }, bounds, 340, 8)).toEqual({ left: 420, top: 208 });
  });

  test('never starts before the column', () => {
    expect(popoverPosition({ left: -30, bottom: 200 }, bounds, 340, 8)).toEqual({ left: 0, top: 208 });
  });
});

describe('toolbarPosition', () => {
  const bounds = { left: 0, right: 760 };

  test('sits above the start of the selection', () => {
    expect(toolbarPosition({ left: 120, top: 200 }, bounds, 140, 36, 8)).toEqual({ left: 120, top: 156 });
  });

  test('shifts left so the toolbar stays inside the column', () => {
    expect(toolbarPosition({ left: 700, top: 200 }, bounds, 140, 36, 8)).toEqual({ left: 620, top: 156 });
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
