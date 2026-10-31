import { expect, test } from 'vitest';

import {
  CAPTURE_TIMEOUT_MS,
  createBoardLifecycle,
  IDLE_UNLOAD_MS,
  type LifecycleInput,
  READY_TIMEOUT_MS,
} from '../src/viewer/lib/board-lifecycle';

const VIEWPORT = { width: 1000, height: 800 };
const NEAR = { id: 'near', x: 100, y: 100, w: 400, h: 300, version: 1 };
const FAR = { id: 'far', x: 6000, y: 100, w: 400, h: 300, version: 1 };

function setup() {
  let time = 0;
  const lifecycle = createBoardLifecycle({ now: () => time });
  const input = (over: Partial<LifecycleInput> = {}): LifecycleInput => ({
    boards: [NEAR, FAR],
    view: { x: 0, y: 0, k: 1 },
    viewport: VIEWPORT,
    active: new Set(),
    gesturing: false,
    ...over,
  });
  return {
    lifecycle,
    input,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

function idleUntilCapture() {
  const ctx = setup();
  ctx.lifecycle.update(ctx.input());
  ctx.advance(IDLE_UNLOAD_MS);
  const out = ctx.lifecycle.update(ctx.input());
  return { ...ctx, out };
}

test('every board starts mounted', () => {
  const { lifecycle, input } = setup();
  const out = lifecycle.update(input());
  expect(out.phases.get('near')).toBe('mounted');
  expect(out.phases.get('far')).toBe('mounted');
  expect(out.capture).toEqual([]);
});

test('a board off screen for the idle time is captured, one on screen is not', () => {
  const { out } = idleUntilCapture();
  expect(out.capture).toEqual(['far']);
  expect(out.phases.get('far')).toBe('capturing');
  expect(out.phases.get('near')).toBe('mounted');
});

test('a board just short of the idle time stays mounted', () => {
  const { lifecycle, input, advance } = setup();
  lifecycle.update(input());
  advance(IDLE_UNLOAD_MS - 1);
  expect(lifecycle.update(input()).phases.get('far')).toBe('mounted');
});

test('an active board off screen is never captured', () => {
  const { lifecycle, input, advance } = setup();
  lifecycle.update(input());
  advance(IDLE_UNLOAD_MS * 3);
  const out = lifecycle.update(input({ active: new Set(['far']) }));
  expect(out.phases.get('far')).toBe('mounted');
  expect(out.capture).toEqual([]);
});

test('touching a board restarts its idle time', () => {
  const { lifecycle, input, advance } = setup();
  lifecycle.update(input());
  advance(IDLE_UNLOAD_MS - 10);
  lifecycle.touch('far');
  advance(20);
  expect(lifecycle.update(input()).phases.get('far')).toBe('mounted');
});

test('a successful capture of the current version unloads the board', () => {
  const { lifecycle, input } = idleUntilCapture();
  lifecycle.captured('far', { version: 1, ok: true });
  expect(lifecycle.update(input()).phases.get('far')).toBe('unloaded');
});

test('a failed capture keeps the board mounted and never retries that version', () => {
  const { lifecycle, input, advance } = idleUntilCapture();
  lifecycle.captured('far', { version: 1, ok: false });
  let out = lifecycle.update(input());
  expect(out.phases.get('far')).toBe('mounted');
  expect(out.uncapturable.has('far')).toBe(true);
  advance(IDLE_UNLOAD_MS * 2);
  out = lifecycle.update(input());
  expect(out.capture).toEqual([]);
  expect(out.phases.get('far')).toBe('mounted');
});

test('a capture that times out counts as uncapturable', () => {
  const { lifecycle, input, advance } = idleUntilCapture();
  advance(CAPTURE_TIMEOUT_MS);
  const out = lifecycle.update(input());
  expect(out.phases.get('far')).toBe('mounted');
  expect(out.uncapturable.has('far')).toBe(true);
});

test('an uncapturable board is tried again after its file changes', () => {
  const { lifecycle, input, advance } = idleUntilCapture();
  lifecycle.captured('far', { version: 1, ok: false });
  lifecycle.update(input());
  const changed = { ...FAR, version: 2 };
  lifecycle.update(input({ boards: [NEAR, changed] }));
  advance(IDLE_UNLOAD_MS);
  const out = lifecycle.update(input({ boards: [NEAR, changed] }));
  expect(out.capture).toEqual(['far']);
  expect(out.uncapturable.has('far')).toBe(false);
});

test('a capture of an older version does not unload', () => {
  const { lifecycle, input } = idleUntilCapture();
  lifecycle.update(input({ boards: [NEAR, { ...FAR, version: 2 }] }));
  lifecycle.captured('far', { version: 1, ok: true });
  expect(
    lifecycle.update(input({ boards: [NEAR, { ...FAR, version: 2 }] })).phases.get('far'),
  ).toBe('mounted');
});

test('becoming active during a capture abandons the unload', () => {
  const { lifecycle, input } = idleUntilCapture();
  expect(lifecycle.update(input({ active: new Set(['far']) })).phases.get('far')).toBe('mounted');
  lifecycle.captured('far', { version: 1, ok: true });
  expect(lifecycle.update(input()).phases.get('far')).toBe('mounted');
});

test('nothing changes phase during a gesture', () => {
  const { lifecycle, input, advance } = setup();
  lifecycle.update(input());
  advance(IDLE_UNLOAD_MS);
  let out = lifecycle.update(input({ gesturing: true }));
  expect(out.phases.get('far')).toBe('mounted');
  expect(out.capture).toEqual([]);
  out = lifecycle.update(input());
  expect(out.capture).toEqual(['far']);
});

function unloaded() {
  const ctx = idleUntilCapture();
  ctx.lifecycle.captured('far', { version: 1, ok: true });
  ctx.lifecycle.update(ctx.input());
  return ctx;
}

test('an unloaded board within one viewport restores, then mounts on ready', () => {
  const { lifecycle, input } = unloaded();
  const close = { x: -4500, y: 0, k: 1 };
  expect(lifecycle.update(input({ view: { x: -4000, y: 0, k: 1 } })).phases.get('far')).toBe(
    'unloaded',
  );
  expect(lifecycle.update(input({ view: close })).phases.get('far')).toBe('restoring');
  lifecycle.ready('far');
  expect(lifecycle.update(input({ view: close })).phases.get('far')).toBe('mounted');
});

test('an unloaded board restores when it becomes active', () => {
  const { lifecycle, input } = unloaded();
  expect(lifecycle.update(input({ active: new Set(['far']) })).phases.get('far')).toBe('restoring');
});

test('a restoring board mounts after the ready timeout', () => {
  const { lifecycle, input, advance } = unloaded();
  lifecycle.update(input({ active: new Set(['far']) }));
  advance(READY_TIMEOUT_MS);
  expect(lifecycle.update(input({ active: new Set(['far']) })).phases.get('far')).toBe('mounted');
});

test('a gesture defers restoring', () => {
  const { lifecycle, input } = unloaded();
  expect(
    lifecycle.update(input({ active: new Set(['far']), gesturing: true })).phases.get('far'),
  ).toBe('unloaded');
  expect(lifecycle.update(input({ active: new Set(['far']) })).phases.get('far')).toBe('restoring');
});

test('a file change while unloaded keeps the board unloaded', () => {
  const { lifecycle, input } = unloaded();
  const out = lifecycle.update(input({ boards: [NEAR, { ...FAR, version: 2 }] }));
  expect(out.phases.get('far')).toBe('unloaded');
});

test('reports when it next needs an update', () => {
  const { lifecycle, input } = setup();
  const out = lifecycle.update(input());
  expect(out.wakeAt).toBe(IDLE_UNLOAD_MS);
});

test('forgets removed boards', () => {
  const { lifecycle, input } = unloaded();
  const out = lifecycle.update(input({ boards: [NEAR] }));
  expect(out.phases.has('far')).toBe(false);
});

test('a board that has been on screen a long time starts its idle time when it leaves the view', () => {
  const { lifecycle, input, advance } = setup();
  lifecycle.update(input());
  advance(IDLE_UNLOAD_MS * 2);
  const away = input({ view: { x: -10_000, y: 0, k: 1 } });
  expect(lifecycle.update(away).capture).not.toContain('near');
  advance(IDLE_UNLOAD_MS);
  expect(lifecycle.update(away).capture).toContain('near');
});
