// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { useHoverDwell } from '../src/viewer/hooks/useHoverDwell';
import type { View } from '../src/viewer/lib/view';

let root: Root;
let result: ReturnType<typeof useHoverDwell>;
let props: { scaling: boolean; view: View; inside?: string | null };
let located = 0;
const board = { x: 0, y: 0, w: 500, h: 500 };
const locate = (client: { clientX: number; clientY: number }) => {
  located++;
  const x = (client.clientX - props.view.x) / props.view.k,
    y = (client.clientY - props.view.y) / props.view.k;
  const inside = x >= board.x && x <= board.x + board.w && y >= board.y && y <= board.y + board.h;
  return { board: inside ? 'a' : null, x: x * props.view.k, y: y * props.view.k };
};

function Harness() {
  result = useHoverDwell({ ...props, locate });
  return null;
}
const render = async (patch: Partial<typeof props> = {}) => {
  props = { ...props, ...patch };
  await act(async () => root.render(createElement(Harness)));
};
const advance = async (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  props = { scaling: false, view: { x: 0, y: 0, k: 1 } };
  located = 0;
  root = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  history.replaceState(null, '', '/');
});

test('a pointer resting on a board for 150 ms hovers it', async () => {
  await render();
  act(() => result.track({ clientX: 100, clientY: 100 }));
  await advance(150);
  expect(result.hovered).toBe('a');
});

test('panning the board under a resting pointer restarts the dwell', async () => {
  await render();
  act(() => result.track({ clientX: 100, clientY: 100 }));
  await advance(100);
  await render({ view: { x: -50, y: 0, k: 1 } });
  await advance(100);
  expect(result.hovered).toBeNull();
  await advance(50);
  expect(result.hovered).toBe('a');
});

test('leaving the canvas ends the hover', async () => {
  await render();
  act(() => result.track({ clientX: 100, clientY: 100 }));
  await advance(150);
  act(() => result.leave());
  expect(result.hovered).toBeNull();
});

test('with ?debug, ?hover sets the dwell length', async () => {
  history.replaceState(null, '', '/?debug&hover=200');
  await render();
  act(() => result.track({ clientX: 100, clientY: 100 }));
  await advance(200);
  expect(result.hovered).toBe('a');
});

test('a board the pointer is inside, as its frame reports, is hovered only after the same dwell', async () => {
  await render({ inside: 'a' });
  await advance(149);
  expect(result.hovered).toBeNull();
  await render({ inside: 'a' });
  await advance(1);
  expect(result.hovered).toBe('a');
});

test('a frame reporting the same board again does not restart the dwell', async () => {
  await render({ inside: 'a' });
  await advance(400);
  await render({ inside: null });
  await render({ inside: 'a' });
  await advance(200);
  expect(result.hovered).toBe('a');
});

test('once the pointer is inside a frame, panning does not re-locate its old position on the canvas', async () => {
  await render();
  act(() => result.track({ clientX: 100, clientY: 100 }));
  await render({ inside: 'a' });
  const before = located;
  await render({ view: { x: -50, y: 0, k: 1 } });
  expect(located).toBe(before);
});

test('while zooming the pointer is not re-located on every frame, only once the zoom ends', async () => {
  await render();
  act(() => result.track({ clientX: 100, clientY: 100 }));
  await render({ scaling: true });
  const before = located;
  await render({ view: { x: 0, y: 0, k: 1.1 } });
  await render({ view: { x: 0, y: 0, k: 1.2 } });
  expect(located).toBe(before);
  await render({ scaling: false });
  expect(located).toBe(before + 1);
});
