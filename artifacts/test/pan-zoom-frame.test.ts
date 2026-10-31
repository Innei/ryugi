// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { GESTURE_SETTLE_MS, usePanZoom } from '../src/viewer/hooks/usePanZoom';

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

test('inputs within one frame produce one world write with the final view', () => {
  act(() => {
    panZoom.panBy(10, 0);
    panZoom.panBy(5, 3);
  });
  expect(world().style.transform).not.toContain('15px');
  flushFrame();
  expect(world().style.transform).toBe('translate(15px, 3px) scale(0.5)');
  expect(world().style.getPropertyValue('--zoom')).toBe('0.5');
  expect(JSON.parse(host.querySelector('output')!.textContent!)).toEqual({ x: 15, y: 3, k: 0.5 });
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
