import { expect, test } from 'vitest';
import { handPose } from '../src/viewer/lib/handPose';
import { stepSpring } from '../src/viewer/lib/spring';

const gap = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

test('an open hand keeps the index and thumb tips well apart', () => {
  const { index, thumb } = handPose(0, 0);
  expect(gap(index.tip, thumb.tip)).toBeGreaterThan(8);
});

test('a pinched hand brings the index and thumb tips together', () => {
  const { index, thumb } = handPose(1, 1);
  expect(gap(index.tip, thumb.tip)).toBeLessThan(3.6);
});

test('both pinching fingers bend instead of staying straight', () => {
  const straightness = (finger: { from: { x: number; y: number }; control: { x: number; y: number }; tip: { x: number; y: number } }) => {
    const { from, control, tip } = finger;
    const cross = (control.x - from.x) * (tip.y - from.y) - (control.y - from.y) * (tip.x - from.x);
    return Math.abs(cross) / gap(from, tip);
  };
  const open = handPose(0, 0);
  const pinched = handPose(1, 1);
  expect(straightness(open.index)).toBeLessThan(0.5);
  expect(straightness(open.thumb)).toBeLessThan(0.5);
  expect(straightness(pinched.index)).toBeGreaterThan(3);
  expect(straightness(pinched.thumb)).toBeGreaterThan(3);
});

test('curling shortens the other three fingers and leaves the pinch alone', () => {
  const open = handPose(0, 0);
  const curled = handPose(0, 1);
  for (const [i, finger] of curled.fingers.entries()) expect(finger.height).toBeLessThan(open.fingers[i]!.height * 0.7);
  expect(curled.index).toEqual(open.index);
  expect(curled.thumb).toEqual(open.thumb);
});

test('the thumb outline only appears once the pinch starts', () => {
  expect(handPose(0, 0).seam).toBe(0);
  expect(handPose(1, 1).seam).toBe(1);
  expect(handPose(1.08, 1).seam).toBe(1);
});

test('a spring settles on its target and stops moving', () => {
  let spring = { value: 0, velocity: 0 };
  for (let i = 0; i < 90; i++) spring = stepSpring(spring, 1, 1 / 60);
  expect(spring.value).toBeCloseTo(1, 3);
  expect(Math.abs(spring.velocity)).toBeLessThan(0.01);
});

test('the default spring overshoots a little before settling', () => {
  let spring = { value: 0, velocity: 0 };
  let peak = 0;
  for (let i = 0; i < 90; i++) {
    spring = stepSpring(spring, 1, 1 / 60);
    peak = Math.max(peak, spring.value);
  }
  expect(peak).toBeGreaterThan(1.02);
  expect(peak).toBeLessThan(1.2);
});
