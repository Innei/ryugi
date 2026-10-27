import { expect, test } from 'vitest';

import { createHoverDwell } from '../src/viewer/lib/hover-dwell';

function setup(dwellMs = 600) {
  let now = 0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 0;
  let changes = 0;
  const dwell = createHoverDwell({
    dwellMs,
    schedule: (fn, ms) => {
      const id = ++nextId;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    cancel: (id) => {
      const at = timers.findIndex((timer) => timer.id === id);
      if (at >= 0) timers.splice(at, 1);
    },
    onChange: () => changes++,
  });
  const advance = (ms: number) => {
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
  };
  return { dwell, advance, changes: () => changes };
}

test('a board becomes hovered once the pointer rests on it for 600 ms', () => {
  const { dwell, advance, changes } = setup();
  dwell.move('a', { x: 10, y: 10 });
  advance(599);
  expect(dwell.current()).toBeNull();
  advance(1);
  expect(dwell.current()).toBe('a');
  expect(changes()).toBe(1);
});

test('moving less than 4 px keeps the dwell running; 4 px or more restarts it', () => {
  const { dwell, advance } = setup();
  dwell.move('a', { x: 10, y: 10 });
  advance(400);
  dwell.move('a', { x: 13, y: 10 });
  advance(200);
  expect(dwell.current()).toBe('a');
  dwell.move('b', { x: 10, y: 10 });
  advance(400);
  dwell.move('b', { x: 14, y: 10 });
  advance(500);
  expect(dwell.current()).toBeNull();
  advance(100);
  expect(dwell.current()).toBe('b');
});

test('moving within a hovered board keeps it hovered', () => {
  const { dwell, advance } = setup();
  dwell.move('a', { x: 10, y: 10 });
  advance(600);
  dwell.move('a', { x: 200, y: 10 });
  expect(dwell.current()).toBe('a');
});

test('leaving a hovered board for another board or empty canvas ends the hover', () => {
  const { dwell, advance } = setup();
  dwell.move('a', { x: 10, y: 10 });
  advance(600);
  dwell.move('b', { x: 10, y: 10 });
  expect(dwell.current()).toBeNull();
  advance(600);
  dwell.move(null, { x: 0, y: 0 });
  expect(dwell.current()).toBeNull();
  advance(1000);
  expect(dwell.current()).toBeNull();
});

test('zooming cancels the dwell, and it starts over once the zoom stops', () => {
  const { dwell, advance } = setup();
  dwell.move('a', { x: 10, y: 10 });
  advance(500);
  dwell.setScaling(true);
  advance(1000);
  expect(dwell.current()).toBeNull();
  dwell.setScaling(false);
  advance(599);
  expect(dwell.current()).toBeNull();
  advance(1);
  expect(dwell.current()).toBe('a');
});

test('the dwell length can be tuned', () => {
  const { dwell, advance } = setup(200);
  dwell.move('a', { x: 10, y: 10 });
  advance(200);
  expect(dwell.current()).toBe('a');
});
