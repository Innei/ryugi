import { expect, test } from 'vitest';
import { lockAxis, rubber, settle, velocityTracker } from '../src/viewer/lib/gesture';

test('rubber passes values inside the range and resists past either end', () => {
  expect(rubber(50, 0, 100)).toBe(50);
  expect(rubber(140, 0, 100)).toBe(110);
  expect(rubber(-40, 0, 100)).toBe(-10);
});

test('a slow release settles on the nearest height', () => {
  expect(settle([78, 400, 800], 230, 0)).toBe(0);
  expect(settle([78, 400, 800], 260, 0)).toBe(1);
  expect(settle([78, 400, 800], 700, 0.1)).toBe(2);
});

test('a flick moves one height in its direction even short of halfway', () => {
  expect(settle([78, 400, 800], 120, 0.6)).toBe(1);
  expect(settle([78, 400, 800], 380, -0.6)).toBe(0);
  expect(settle([78, 400, 800], 790, 0.9)).toBe(2);
  expect(settle([78, 400, 800], 60, -0.9)).toBe(0);
});

test('the axis locks only after the finger passes the slop', () => {
  expect(lockAxis(3, 4)).toBeNull();
  expect(lockAxis(20, 5)).toBe('x');
  expect(lockAxis(-4, -12)).toBe('y');
});

test('velocity follows the last moves and drops to zero once the finger rests', () => {
  const track = velocityTracker();
  track.add(0, 0, 0);
  track.add(10, 40, 16);
  track.add(20, 80, 32);
  expect(track.velocity(32).y).toBeCloseTo(2.5, 1);
  expect(track.velocity(32).x).toBeCloseTo(0.625, 2);
  expect(track.velocity(200)).toEqual({ x: 0, y: 0 });
});
