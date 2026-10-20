// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ConfigProvider } from '@lobehub/ui';
import { motion } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ArtboardLayout } from '../src/viewer/layouts/ArtboardLayout';
import { Properties } from '../src/viewer/inspector/Properties';
import { INSPECTOR_PROPERTIES, type InspectorSelection } from '../src/shared/inspector';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, defineConsts: (value: unknown) => value, defineVars: (value: unknown) => value, props: () => ({}) }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));
vi.mock('../src/viewer/hooks/useCanvasData', () => ({ useCanvasData: () => ({
  canvas: { version: 1, pages: [{ id: 'p', name: 'Page' }], boards: { a: { page: 'p', file: 'pages/p/a.html', x: 0, y: 0, w: 600, h: 400 } } },
  layout: { pages: { p: { groups: {}, notes: {}, bounds: { minX: 0, minY: 0, maxX: 600, maxY: 400 } } } },
  pending: [], versions: { 'pages/p/a.html': 1 }, contentBase: 'about:blank#', warnings: [], live: true, loaded: true,
}) }));

let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => { if (root) act(() => root!.unmount()); host?.remove(); vi.unstubAllGlobals(); });

test('the Inspector opens and closes without changing canvas zoom or iframe sandbox', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ signedIn: false, login: null, origin: 'https://cloud.test', artifacts: {}, warning: null }) }));
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(ConfigProvider, { motion, enableCustomFonts: false, children: createElement(ArtboardLayout, { id: 'test' }) })));
  const frame = host.querySelector('iframe')!;
  const transform = frame.parentElement!.style.transform;
  const toggle = host.querySelector<HTMLButtonElement>('[aria-label="Toggle inspector"]');
  expect(toggle).not.toBeNull();
  expect(host.querySelector('[aria-label="Inspector"]')).toBeNull();
  await act(async () => toggle!.click());
  expect(host.querySelector('[aria-label="Inspector"]')).not.toBeNull();
  expect(host.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Properties');
  expect(frame.parentElement!.style.transform).toBe(transform);
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
  await act(async () => host!.querySelector<HTMLButtonElement>('[aria-label="Close inspector"]')!.click());
  expect(host.querySelector('[aria-label="Inspector"]')).toBeNull();
  expect(frame.parentElement!.style.transform).toBe(transform);
});

test('property controls have associated labels and editing a number previews CSS', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
  const change = vi.fn();
  const node: InspectorSelection = { id: 1, name: 'Box', tag: 'div', selector: '.box', html: '<div class="box"></div>', rect: { x: 0, y: 0, width: 120, height: 80 }, widthMode: 'fixed', heightMode: 'fixed', css: Object.fromEntries(INSPECTOR_PROPERTIES.map((property) => [property, property === 'width' ? '120px' : '0'])) as InspectorSelection['css'] };
  await act(async () => root!.render(createElement(ConfigProvider, { motion, enableCustomFonts: false, children: createElement(Properties, { node, change }) })));
  const label = Array.from(host.querySelectorAll('label')).find((el) => el.textContent === 'Width');
  const input = label?.control as HTMLInputElement | undefined;
  expect(input?.tagName).toBe('INPUT');
  expect(input?.value).toBe('120');
  for (const control of host.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input:not([type=hidden]):not([aria-hidden=true]), button[role=combobox]')) expect(!!control.getAttribute('aria-label') || Array.from(host.querySelectorAll('label')).some((label) => label.htmlFor === control.id), control.outerHTML).toBe(true);
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '160'); input!.dispatchEvent(new Event('input', { bubbles: true })); input!.dispatchEvent(new Event('change', { bubbles: true })); input!.blur(); });
  expect(change).toHaveBeenCalledWith('width', '160px');
});
