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
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});

test('holding space in the comment tool lets a drag that starts over a board reach the canvas', async () => {
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
  await act(async () =>
    host!.querySelector<HTMLButtonElement>('button[aria-label="Comment"]')!.click(),
  );
  const board = () => host!.querySelector<HTMLIFrameElement>('iframe')!;
  expect(board().style.pointerEvents).toBe('auto');
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })));
  expect(board().style.pointerEvents).toBe('none');
  await act(async () => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })));
  expect(board().style.pointerEvents).toBe('auto');
});
