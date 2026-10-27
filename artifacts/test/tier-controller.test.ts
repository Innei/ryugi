import { expect, test } from 'vitest';

import type { TierBoard } from '../src/viewer/lib/board-tiers';
import { type ControllerInput, createTierController } from '../src/viewer/lib/tier-controller';

function clock() {
  let now = 0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 0;
  return {
    now: () => now,
    schedule: (fn: () => void, ms: number) => {
      const id = ++nextId;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    cancel: (id: number) => {
      const at = timers.findIndex((timer) => timer.id === id);
      if (at >= 0) timers.splice(at, 1);
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > end) break;
        timers.shift();
        now = next.at;
        next.fn();
      }
      now = end;
    },
  };
}

const viewport = { width: 1000, height: 800 };
const board = (id: string, x: number, w = 400, h = 300): TierBoard => ({ id, x, y: 0, w, h });
const row = [board('a', 0), board('b', 450), board('c', 2200), board('d', 9000)];

function setup(patch: Partial<ControllerInput> = {}) {
  const time = clock();
  let changes = 0;
  const gaveUp: string[] = [];
  const controller = createTierController({
    now: time.now,
    schedule: time.schedule,
    cancel: time.cancel,
    onChange: () => changes++,
    onGiveUp: (id) => gaveUp.push(id),
  });
  let input: ControllerInput = {
    boards: row,
    view: { x: 0, y: 0, k: 1 },
    viewport,
    pinned: new Set(),
    snapshots: new Set(),
    scaling: false,
    hovered: null,
    hoverPromotes: false,
    ...patch,
  };
  const run = (next: Partial<ControllerInput> = {}) => {
    input = { ...input, ...next };
    return Object.fromEntries(
      [...controller.update(input)].map(([id, state]) => [
        id,
        `${state.tier}${state.mounted ? '+mounted' : ''}${state.ready ? '+ready' : ''}${state.warming ? '+warming' : ''}`,
      ]),
    );
  };
  return { time, controller, run, changes: () => changes, gaveUp };
}

test('live boards mount at most two at a time and the queue moves on as boards report ready', () => {
  const boards = ['a', 'b', 'c', 'd', 'e'].map((id, i) => board(id, i * 120, 100, 100));
  const { controller, run } = setup({ boards, pinned: new Set(['e']) });
  const first = run();
  expect(Object.values(first).filter((state) => state.includes('mounted'))).toHaveLength(2);
  controller.ready('a');
  const second = run();
  expect(second.a).toBe('live+mounted+ready');
  expect(
    Object.values(second).filter((state) => state.includes('mounted') && !state.includes('ready')),
  ).toHaveLength(2);
});

test('a board that loads but never reports ready counts as ready 3 s after load', () => {
  const { time, controller, run } = setup({ boards: [board('a', 0)] });
  expect(run().a).toBe('live+mounted');
  controller.loaded('a');
  time.advance(2999);
  expect(run().a).toBe('live+mounted');
  time.advance(1);
  expect(run().a).toBe('live+mounted+ready');
});

test('a board that never loads frees its mount slot after 8 s', () => {
  const boards = ['a', 'b', 'c'].map((id, i) => board(id, i * 120, 100, 100));
  const { time, run } = setup({ boards });
  expect(run().c).toBe('placeholder');
  time.advance(8000);
  expect(run().c).toBe('live+mounted');
});

test('a board stays live for 1.5 s after it stops qualifying', () => {
  const { time, controller, run, changes } = setup();
  run();
  controller.ready('a');
  controller.ready('b');
  expect(run({ view: { x: 0, y: 0, k: 0.3 } }).a).toBe('live+mounted+ready');
  const before = changes();
  time.advance(1499);
  expect(run().a).toBe('live+mounted+ready');
  time.advance(1);
  expect(changes()).toBeGreaterThan(before);
  expect(run().a).toBe('placeholder');
});

test('while the scale changes no board mounts or unmounts, but images still follow the view', () => {
  const { controller, run } = setup();
  run();
  controller.ready('a');
  const zoomedOut = run({ scaling: true, view: { x: 0, y: 0, k: 0.2 }, snapshots: new Set(['d']) });
  expect(zoomedOut.a).toBe('live+mounted+ready');
  expect(zoomedOut.d).toBe('snapshot');
  const zoomedIn = run({ scaling: true, view: { x: -2200, y: 0, k: 1 } });
  expect(zoomedIn.c).toBe('placeholder');
  expect(run({ scaling: false }).c).toBe('live+mounted');
});

test('with the select or comment tool, a hovered board goes live at once', () => {
  const { run } = setup({ view: { x: 0, y: 0, k: 0.2 }, hoverPromotes: true });
  expect(run({ hovered: 'b' }).b).toBe('live+mounted');
  expect(run({ hovered: 'a', hoverPromotes: false }).a).toBe('placeholder');
});

test('a hovered board mounts ahead of other live boards', () => {
  const boards = ['a', 'b', 'c', 'd'].map((id, i) => board(id, i * 120, 100, 100));
  const { run } = setup({ boards, hoverPromotes: true, hovered: 'd' });
  expect(run().d).toBe('live+mounted');
});

test('a board that disappears releases its mount slot', () => {
  const boards = ['a', 'b', 'c'].map((id, i) => board(id, i * 120, 100, 100));
  const { run } = setup({ boards });
  run();
  const next = run({ boards: boards.filter((b) => b.id !== 'a') });
  expect(next.c).toBe('live+mounted');
});

test('boards to warm mount after live boards, two at a time, under their placeholder, and leave once captured', () => {
  const boards = ['a', 'b', 'c', 'd'].map((id, i) => board(id, i * 120, 100, 100));
  const { controller, run } = setup({
    boards,
    view: { x: 0, y: 0, k: 0.2 },
    warm: ['a', 'b', 'c'],
  });
  expect(run()).toEqual({
    a: 'placeholder+mounted+warming',
    b: 'placeholder+mounted+warming',
    c: 'placeholder',
    d: 'placeholder',
  });
  controller.ready('a');
  expect(run({ snapshots: new Set(['a']), warm: ['b', 'c'] })).toMatchObject({
    a: 'snapshot',
    b: 'placeholder+mounted+warming',
    c: 'placeholder+mounted+warming',
  });
});

test('a warming board that never reports ready is given up after 8 s and its slot goes to the next board', () => {
  const boards = ['a', 'b', 'c'].map((id, i) => board(id, i * 120, 100, 100));
  const { time, run, gaveUp } = setup({
    boards,
    view: { x: 0, y: 0, k: 0.2 },
    warm: ['a', 'b', 'c'],
  });
  run();
  time.advance(8000);
  expect(gaveUp).toEqual(['a', 'b']);
  expect(run({ warm: ['c'] })).toEqual({
    a: 'placeholder',
    b: 'placeholder',
    c: 'placeholder+mounted+warming',
  });
});

test('a warming board that has loaded still has until 8 s after mounting to report ready', () => {
  const { time, controller, run, gaveUp } = setup({
    boards: [board('a', 0, 100, 100)],
    view: { x: 0, y: 0, k: 0.2 },
    warm: ['a'],
  });
  run();
  time.advance(500);
  controller.loaded('a');
  time.advance(3000);
  expect(gaveUp).toEqual([]);
  expect(run().a).toBe('placeholder+mounted+warming');
  time.advance(4500);
  expect(gaveUp).toEqual(['a']);
});

test('a live board that only timed into ready is given up once it would stay mounted just to be warmed', () => {
  const { time, controller, run, gaveUp } = setup({ boards: [board('a', 0)] });
  run();
  controller.loaded('a');
  time.advance(3000);
  expect(run().a).toBe('live+mounted+ready');
  run({ view: { x: 0, y: 0, k: 0.3 }, warm: ['a'] });
  time.advance(1500);
  expect(run().a).toBe('placeholder');
  expect(gaveUp).toEqual(['a']);
});

test('a live board that reported ready stays mounted to be warmed when it is demoted', () => {
  const { time, controller, run, gaveUp } = setup({ boards: [board('a', 0)] });
  run();
  controller.ready('a');
  run({ view: { x: 0, y: 0, k: 0.3 }, warm: ['a'] });
  time.advance(1500);
  expect(run().a).toBe('placeholder+mounted+ready+warming');
  expect(gaveUp).toEqual([]);
});

test('nothing is warmed while the scale changes', () => {
  const { run } = setup({
    boards: [board('a', 0, 100, 100)],
    view: { x: 0, y: 0, k: 0.2 },
    warm: ['a'],
    scaling: true,
  });
  expect(run().a).toBe('placeholder');
});
