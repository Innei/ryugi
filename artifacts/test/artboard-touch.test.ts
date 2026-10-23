// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ConfigProvider } from '@lobehub/ui';
import { motion } from 'motion/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ArtboardLayout } from '../src/viewer/layouts/ArtboardLayout';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, defineConsts: (value: unknown) => value, defineVars: (value: unknown) => value, props: () => ({}) }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));
vi.mock('../src/viewer/hooks/useCanvasData', () => ({ useCanvasData: () => ({
  canvas: { version: 1, pages: [{ id: 'p', name: 'Page' }], boards: { a: { page: 'p', file: 'pages/p/a.html', x: 0, y: 0, w: 600, h: 400 } } },
  layout: { pages: { p: { groups: {}, notes: {}, bounds: { minX: 0, minY: 0, maxX: 600, maxY: 400 } } } },
  pending: [], versions: { 'pages/p/a.html': 1 }, contentBase: 'about:blank#', warnings: [], live: true, loaded: true, send: vi.fn(),
}) }));

let root: Root | undefined;
let host: HTMLDivElement | undefined;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ signedIn: false, artifacts: {} }) }));
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
});
afterEach(() => { if (root) act(() => root!.unmount()); host?.remove(); vi.unstubAllGlobals(); });

async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(ConfigProvider, { motion, enableCustomFonts: false, children: createElement(ArtboardLayout, { id: 'test' }) })));
  const viewport = host.querySelector('[data-board]')!.parentElement!.parentElement as HTMLDivElement;
  viewport.setPointerCapture = vi.fn();
  return viewport;
}

const press = (target: Element, pointerType: string) =>
  act(async () => target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 4, pointerType, button: 0, clientX: 900, clientY: 700 })));

test('a finger on the canvas background pans instead of starting a selection box', async () => {
  const viewport = await mount();
  await press(viewport, 'touch');
  expect(host!.querySelector('.ri-selection-capture')).toBeNull();
});

test('the mouse still starts a selection box there', async () => {
  const viewport = await mount();
  await press(viewport, 'mouse');
  expect(host!.querySelector('.ri-selection-capture')).not.toBeNull();
});

test('holding space draws the hand under the mouse and hides the system cursor until space is released', async () => {
  const viewport = await mount();
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })));
  await act(async () => viewport.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: 300, clientY: 200 })));
  expect(host!.querySelector('[data-hand-cursor]')).not.toBeNull();
  expect(viewport.hasAttribute('data-hand-drawn')).toBe(true);
  await act(async () => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })));
  expect(host!.querySelector('[data-hand-cursor]')).toBeNull();
  expect(viewport.hasAttribute('data-hand-drawn')).toBe(false);
});
