import { describe, expect, test } from 'vitest';

import { openReady } from '../src/server/ready';
import type { CanvasPayload, CanvasSpec } from '../src/shared/types';

const board = (file: string, x: number) => ({ file, page: 'p', x, y: 0, w: 640, h: 400 });

const canvas = (overrides: Partial<CanvasSpec> = {}): CanvasSpec => ({
  version: 1,
  pages: [{ id: 'p', name: 'P' }],
  boards: {
    a: board('pages/p/a.html', 0),
    b: board('pages/p/b.html', 680),
  },
  ...overrides,
});

const payload = (
  spec: CanvasSpec,
  versions: Record<string, number>,
  pending: string[] = [],
  warnings: string[] = [],
) => ({ canvas: spec, versions, pending, warnings, layout: null }) satisfies CanvasPayload;

describe('openReady', () => {
  test('opens the full skeleton before any HTML is written during a build', () => {
    expect(openReady(payload(canvas({ building: true }), {}, ['a', 'b']))).toBe(true);
    expect(openReady(payload(canvas({ building: true }), {}, ['a', 'b'], ['invalid layout']))).toBe(
      false,
    );
  });

  test('needs a valid canvas and no warnings', () => {
    expect(openReady(payload({ ...canvas(), boards: {} }, {}))).toBe(false);
    expect(
      openReady({
        ...payload(canvas(), { 'pages/p/a.html': 1, 'pages/p/b.html': 1 }),
        canvas: null,
      }),
    ).toBe(false);
    expect(
      openReady(
        payload(canvas(), { 'pages/p/a.html': 1, 'pages/p/b.html': 1 }, [], ['board "a" overlaps']),
      ),
    ).toBe(false);
  });

  test('opens a single board as soon as it has a version', () => {
    const one = { ...canvas(), boards: { a: board('pages/p/a.html', 0) } };
    expect(openReady(payload(one, {}))).toBe(false);
    expect(openReady(payload(one, { 'pages/p/a.html': 1 }))).toBe(true);
  });

  test('without groups waits for two boards, or all when there is only one', () => {
    expect(openReady(payload(canvas(), { 'pages/p/a.html': 1 }))).toBe(false);
    expect(openReady(payload(canvas(), { 'pages/p/a.html': 1, 'pages/p/b.html': 1 }))).toBe(true);
  });

  test('opens once a group is complete, even while other boards are pending', () => {
    const spec = canvas({
      boards: {
        a: board('pages/p/a.html', 0),
        b: board('pages/p/b.html', 680),
        c: board('pages/p/c.html', 1360),
      },
      groups: { q1: { boards: ['a', 'b'] } },
    });
    expect(openReady(payload(spec, { 'pages/p/a.html': 1 }))).toBe(false);
    expect(openReady(payload(spec, { 'pages/p/a.html': 1, 'pages/p/b.html': 1 }))).toBe(true);
  });

  test('prefers the focus group over an earlier complete group', () => {
    const spec = canvas({
      boards: {
        a: board('pages/p/a.html', 0),
        b: board('pages/p/b.html', 680),
        c: board('pages/p/c.html', 1360),
        d: board('pages/p/d.html', 2040),
      },
      groups: { q1: { boards: ['a', 'b'] }, q2: { boards: ['c', 'd'] } },
      focus: { target: 'q2', at: '2026-10-20T00:00:00Z' },
    });
    const firstReady = { 'pages/p/a.html': 1, 'pages/p/b.html': 1 };
    expect(openReady(payload(spec, firstReady))).toBe(false);
    expect(
      openReady(payload(spec, { ...firstReady, 'pages/p/c.html': 1, 'pages/p/d.html': 1 })),
    ).toBe(true);
  });

  test('a focus board waits for the group that contains it', () => {
    const spec = canvas({
      boards: {
        a: board('pages/p/a.html', 0),
        b: board('pages/p/b.html', 680),
        c: board('pages/p/c.html', 1600),
      },
      groups: { q1: { boards: ['a', 'b'] }, q2: { boards: ['c'] } },
      focus: { target: 'c', at: '2026-10-20T00:00:00Z' },
    });
    expect(openReady(payload(spec, { 'pages/p/a.html': 1, 'pages/p/b.html': 1 }))).toBe(false);
    expect(
      openReady(payload(spec, { 'pages/p/a.html': 1, 'pages/p/b.html': 1, 'pages/p/c.html': 1 })),
    ).toBe(true);
  });

  test('a pending board is never ready, even if its version says otherwise', () => {
    expect(openReady(payload(canvas(), { 'pages/p/a.html': 1, 'pages/p/b.html': 1 }, ['b']))).toBe(
      false,
    );
  });
});
