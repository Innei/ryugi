// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { GESTURE_SETTLE_MS, OVERLAY_DRIFT_PX, usePanZoom } from '../src/viewer/hooks/usePanZoom';

let root: Root;
let host: HTMLDivElement;
let panZoom: ReturnType<typeof usePanZoom>;
let renders = 0;
let frames: FrameRequestCallback[] = [];

function Harness() {
  panZoom = usePanZoom('select');
  renders++;
  return createElement(
    'div',
    { ref: panZoom.viewportRef },
    createElement('div', { ref: panZoom.worldRef, id: 'world' }),
    createElement('div', { ref: panZoom.overlayRef, id: 'overlay' }),
    createElement(
      'output',
      { 'data-gesturing': String(panZoom.gesturing) },
      JSON.stringify(panZoom.view),
    ),
  );
}

const flushFrame = () =>
  act(() => {
    const queued = frames;
    frames = [];
    for (const callback of queued) callback(performance.now());
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(createElement(Harness)));
  flushFrame();
  renders = 0;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  frames = [];
});

const world = () => host.querySelector<HTMLDivElement>('#world')!;
const overlay = () => host.querySelector<HTMLDivElement>('#overlay')!;
const rendered = () => JSON.parse(host.querySelector('output')!.textContent!);

test('inputs within one frame produce one world write with the final view', () => {
  act(() => {
    panZoom.panBy(10, 0);
    panZoom.panBy(5, 3);
  });
  expect(world().style.transform).not.toContain('15px');
  flushFrame();
  expect(world().style.transform).toBe('translate(15px, 3px) scale(0.5)');
  expect(world().style.getPropertyValue('--zoom')).toBe('0.5');
  expect(panZoom.viewNow()).toEqual({ x: 15, y: 3, k: 0.5 });
});

test('the view state renders at most once per frame', () => {
  act(() => {
    for (let i = 0; i < 10; i++) panZoom.panBy(1, 0);
  });
  const before = renders;
  flushFrame();
  expect(renders - before).toBeLessThanOrEqual(2);
});

test('a gesture sets will-change and clears it once input settles', () => {
  act(() => panZoom.wheelAt({ deltaX: 0, deltaY: -20, x: 100, y: 100, zoom: true }));
  flushFrame();
  expect(host.querySelector('output')!.dataset.gesturing).toBe('true');
  expect(world().style.willChange).toBe('transform');
  act(() => vi.advanceTimersByTime(GESTURE_SETTLE_MS - 1));
  expect(host.querySelector('output')!.dataset.gesturing).toBe('true');
  act(() => vi.advanceTimersByTime(1));
  expect(host.querySelector('output')!.dataset.gesturing).toBe('false');
  expect(world().style.willChange).toBe('');
});

test('a pan moves the overlay with the world in the same frame and leaves the view state alone', () => {
  act(() => panZoom.panBy(30, 0));
  flushFrame();
  expect(world().style.transform).toBe('translate(30px, 0px) scale(0.5)');
  expect(overlay().style.transform).toBe('translate(30px, 0px) scale(1)');
  expect(rendered()).toEqual({ x: 0, y: 0, k: 0.5 });
});

test('the view state catches up once the gesture settles and the overlay drops its transform', () => {
  act(() => panZoom.panBy(30, 0));
  flushFrame();
  act(() => vi.advanceTimersByTime(GESTURE_SETTLE_MS));
  expect(rendered()).toEqual({ x: 30, y: 0, k: 0.5 });
  expect(overlay().style.transform).toBe('');
});

test('a pan that drifts past the overlay margin renders the view mid-gesture', () => {
  act(() => panZoom.panBy(OVERLAY_DRIFT_PX + 1, 0));
  flushFrame();
  expect(rendered()).toEqual({ x: OVERLAY_DRIFT_PX + 1, y: 0, k: 0.5 });
  expect(overlay().style.transform).toBe('');
});

test('a zoom scales the overlay so a canvas point stays under the same pixel as on the world', () => {
  act(() => panZoom.wheelAt({ deltaX: 0, deltaY: -5, x: 300, y: 200, zoom: true }));
  flushFrame();
  const now = panZoom.viewNow();
  expect(now.k).toBeGreaterThan(0.5);
  const [, tx, ty, s] = /translate\((.+)px, (.+)px\) scale\((.+)\)/
    .exec(overlay().style.transform)!
    .map(Number);
  const point = { x: 120, y: -40 };
  expect((0 + point.x * 0.5) * s! + tx!).toBeCloseTo(now.x + point.x * now.k, 6);
  expect((0 + point.y * 0.5) * s! + ty!).toBeCloseTo(now.y + point.y * now.k, 6);
});
