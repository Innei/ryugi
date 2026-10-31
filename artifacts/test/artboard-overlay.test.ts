// @vitest-environment happy-dom
import { ConfigProvider } from '@lobehub/ui';
import { motion } from 'motion/react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { ArtboardLayout } from '../src/viewer/layouts/ArtboardLayout';

const flat = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.flatMap(flat)
    : value && typeof value === 'object'
      ? [value as Record<string, unknown>]
      : [];
vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  defineConsts: (value: unknown) => value,
  defineVars: (value: unknown) => value,
  keyframes: (value: unknown) => value,
  props: (...styles: unknown[]) => ({
    style: Object.fromEntries(
      flat(styles)
        .flatMap(Object.entries)
        .filter(([, v]) => typeof v === 'string' || typeof v === 'number'),
    ),
  }),
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({
  cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
}));
vi.mock('../src/viewer/hooks/useCanvasData', () => ({
  useCanvasData: () => ({
    canvas: {
      version: 1,
      pages: [{ id: 'p', name: 'Page' }],
      boards: { a: { page: 'p', file: 'pages/p/a.html', x: 0, y: 0, w: 600, h: 400 } },
    },
    layout: {
      pages: { p: { groups: {}, notes: {}, bounds: { minX: 0, minY: 0, maxX: 600, maxY: 400 } } },
    },
    pending: [],
    versions: { 'pages/p/a.html': 1 },
    contentBase: 'about:blank#',
    warnings: [],
    live: true,
    loaded: true,
    send: vi.fn(),
    comments: { comments: { version: 1, threads: [] }, stale: [] },
    comment: vi.fn(),
  }),
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ signedIn: false, artifacts: {} }) }),
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ target, isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      disconnect() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  frames = [];
});

const flushFrames = () =>
  act(() => {
    for (let i = 0; i < 4; i++) {
      const queued = frames;
      frames = [];
      for (const callback of queued) callback(performance.now());
    }
  });
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 200)));

test('panning moves board labels with the canvas in the same frame, then settles them in place', async () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(800);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      createElement(ConfigProvider, {
        motion,
        enableCustomFonts: false,
        children: createElement(ArtboardLayout, { id: 'test' }),
      }),
    ),
  );
  flushFrames();
  await settle();
  const label = () => host!.querySelector<HTMLElement>('[data-board-label="a"]')!;
  const left = Number.parseFloat(label().style.left);
  await act(async () => {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 30 });
    Object.defineProperty(event, 'ctrlKey', { value: false });
    label().dispatchEvent(event);
  });
  flushFrames();
  expect(Number.parseFloat(label().style.left)).toBe(left);
  expect(label().parentElement!.style.transform).toBe('translate(-30px, 0px) scale(1)');
  await settle();
  expect(Number.parseFloat(label().style.left)).toBe(left - 30);
  expect(label().parentElement!.style.transform).toBe('');
});
