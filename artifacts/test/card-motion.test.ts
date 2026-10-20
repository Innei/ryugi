// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { play, spring } from '../src/viewer/document/motion';

afterEach(() => vi.unstubAllGlobals());

const points = (easing: string) => easing.slice('linear('.length, -1).split(', ').map(Number);

test('the soft spring starts at 0, ends at 1, barely overshoots and settles in about half a second', () => {
  const { easing, duration } = spring(260, 28);
  const values = points(easing);
  expect(values[0]).toBe(0);
  expect(values.at(-1)).toBe(1);
  expect(Math.max(...values)).toBeLessThan(1.01);
  expect(duration).toBeGreaterThan(300);
  expect(duration).toBeLessThan(800);
});

test('play skips the animation when the system asks for reduced motion', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  const el = document.createElement('div');
  const animate = vi.spyOn(el, 'animate');
  await play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
  expect(animate).not.toHaveBeenCalled();
});
