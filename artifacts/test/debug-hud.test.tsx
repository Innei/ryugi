// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { DebugHud } from '../src/viewer/components/DebugHud';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  props: () => ({}),
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({
  cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
}));

let root: Root;
let now = 0;
const frames: FrameRequestCallback[] = [];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  frames.length = 0;
  now = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const run = (count: number, ms: number) =>
  act(() => {
    for (let i = 0; i < count; i++) {
      now += ms;
      frames.splice(0).forEach((callback) => callback(now));
    }
  });
test('shows the frame rate, the slowest frame and slow frames over the last second, with board states', () => {
  const counts = { mounted: 3, capturing: 1, unloaded: 2, restoring: 0, uncapturable: 1 };
  act(() => root.render(createElement(DebugHud, { counts, culled: 4, gesturing: true })));
  run(60, 1000 / 60);
  const text = () => document.body.textContent ?? '';
  expect(text()).toMatch(/60 fps/);
  expect(text()).toMatch(/0 slow/);
  expect(text()).toContain('mounted 3');
  expect(text()).toContain('unloaded 2');
  expect(text()).toContain('culled 4');
  expect(text()).toContain('uncapturable 1');
  expect(text()).toContain('gesture');
  run(5, 50);
  run(20, 1000 / 60);
  expect(text()).toMatch(/worst 50 ms/);
  expect(text()).toMatch(/5 slow/);
});
