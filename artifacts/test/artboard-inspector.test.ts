// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ConfigProvider } from '@lobehub/ui';
import { motion } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ArtboardLayout } from '../src/viewer/layouts/ArtboardLayout';
import { Properties } from '../src/viewer/inspector/Properties';
import { Layers } from '../src/viewer/inspector/Layers';
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

test('the pointer selects nodes with the sidebar closed and keeps all selected outlines when it opens', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ signedIn: false, artifacts: {} }) }));
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(ConfigProvider, { motion, enableCustomFonts: false, children: createElement(ArtboardLayout, { id: 'test' }) })));
  const frame = host.querySelector('iframe')!;
  const sent: any[] = [];
  vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation((message) => sent.push(message));
  await act(async () => frame.dispatchEvent(new Event('load')));
  expect(sent.at(-1)?.action).toBe('enable');
  const connection = sent.at(-1)!.connection;
  const report = async (type: string, fields: Record<string, unknown>) => act(async () => window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow!, data: { type: `ryugi:inspect:${type}`, session: 'test', connection, ...fields } })));
  await report('tree', { nodes: [], truncated: false });
  const node = { id: 1, name: 'First', tag: 'h1', selector: 'h1', rect: { x: 10, y: 10, width: 120, height: 40 }, html: '<h1>First</h1>', css: Object.fromEntries(INSPECTOR_PROPERTIES.map((property) => [property, '0'])), widthMode: 'fixed', heightMode: 'hug' };
  await report('selection', { reason: 'user', selection: node });
  await report('selection', { reason: 'user', toggle: true, selection: { ...node, id: 2, name: 'Second', rect: { ...node.rect, y: 80 } } });
  expect(host.querySelector('[aria-label="Inspector"]')).toBeNull();
  expect(host.querySelectorAll('.ri-outline-selected')).toHaveLength(2);
  await act(async () => host!.querySelector<HTMLButtonElement>('[aria-label="Toggle inspector"]')!.click());
  expect(host.querySelectorAll('.ri-outline-selected')).toHaveLength(2);
  expect(host.querySelector('[aria-label="Inspector"]')?.textContent).toContain('2 selected');
  await report('drag', { phase: 'start', id: 1, x: 0, y: 0, append: false });
  expect(host.querySelector('.ri-selection-capture')).not.toBeNull();
  await report('drag', { phase: 'move', x: 500, y: 500, append: false });
  expect(host.querySelector('.ri-marquee')).not.toBeNull();
  const viewport = frame.parentElement!.parentElement!;
  await act(async () => viewport.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: 100, clientY: 100 })));
  expect(host.querySelector('.ri-marquee')).toBeNull();
  expect(sent.some((message) => message.action === 'marquee')).toBe(true);
});

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
  const properties = host.querySelector<HTMLButtonElement>('[role=tab][aria-selected=true]')!;
  await act(async () => { properties.focus(); properties.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true })); });
  const code = host.querySelector<HTMLButtonElement>('[role=tab][aria-selected=true]')!;
  expect(code.textContent).toBe('Code');
  expect(host.querySelector('[role=tabpanel]')?.getAttribute('aria-labelledby')).toBe(code.id);
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

test('Shadow keeps an editable draft and commits it on blur', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
  const change = vi.fn();
  const node = { id: 1, rect: { width: 100, height: 50 }, css: Object.fromEntries(INSPECTOR_PROPERTIES.map((property) => [property, property === 'box-shadow' ? 'none' : '0'])) } as InspectorSelection;
  const render = async () => act(async () => root!.render(createElement(ConfigProvider, { motion, enableCustomFonts: false, children: createElement(Properties, { node, change }) })));
  await render();
  const input = host.querySelector<HTMLInputElement>('[aria-label="Shadow"]')!;
  const type = async (value: string) => act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await type('0');
  expect(input.value).toBe('0');
  expect(change).not.toHaveBeenCalled();
  await type('0 2px 4px black');
  await act(async () => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(change).toHaveBeenLastCalledWith('box-shadow', '0 2px 4px black');
  node.css['box-shadow'] = 'rgb(0, 0, 0) 0px 2px 4px 0px'; await render();
  node.css['box-shadow'] = 'none'; await render();
  expect(input.value).toBe('none');
});

test('layer keyboard navigation survives collapse and quoted board/session names', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
  const nodes = [
    { id: 1, parentId: null, children: [2], name: 'Root', tag: 'body', kind: 'Frame' as const, selector: 'body' },
    { id: 2, parentId: 1, children: [], name: 'Child', tag: 'p', kind: 'Text' as const, selector: 'p' },
  ];
  const boardId = 'board "A"';
  const select = vi.fn();
  await act(async () => root!.render(createElement(Layers, { boards: [[boardId, { page: 'p', title: 'Board', file: 'a.html', x: 0, y: 0, w: 100, h: 100 }]], frames: { [boardId]: { session: 'session "quoted"', nodes, truncated: false, tweaks: [] } }, selection: { boardId, node: { id: 2 } as InspectorSelection }, playing: new Set<string>(), select, hoverNode: vi.fn() })));
  const rows = Array.from(host.querySelectorAll<HTMLElement>('[role=treeitem]'));
  rows.find((el) => el.textContent?.includes('Child'))!.focus();
  await act(async () => rows.find((el) => el.textContent?.includes('Board'))!.querySelector('button')!.click());
  const entry = host.querySelector<HTMLElement>('[role=treeitem][tabindex="0"]');
  expect(entry?.textContent).toContain('Board');
  expect(document.activeElement).toBe(entry);
  const key = async (key: string) => act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true })); });
  await key('ArrowRight');
  await key('ArrowRight');
  expect(document.activeElement?.textContent).toContain('Child');
  await key('Enter');
  expect(select).toHaveBeenCalledWith(boardId, 2);
});

test('computed RGB colors remain readable in the color picker fields', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
  const node = { css: { ...Object.fromEntries(INSPECTOR_PROPERTIES.map((property) => [property, '0'])), 'background-color': 'rgb(255, 0, 128)', color: 'rgba(12, 34, 56, 0.5)' } } as InspectorSelection;
  await act(async () => root!.render(createElement(ConfigProvider, { motion, enableCustomFonts: false, children: createElement(Properties, { node, change: vi.fn() }) })));
  expect(Array.from(host.querySelectorAll('.lobe-color-picker__text')).map((el) => el.textContent)).toEqual(['#FF0080', '#0C2238']);
});

test('direction icons have readable names and preview the chosen layout direction', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
  const change = vi.fn();
  const node = { css: { ...Object.fromEntries(INSPECTOR_PROPERTIES.map((property) => [property, '0'])), display: 'flex', 'flex-direction': 'column' } } as InspectorSelection;
  await act(async () => root!.render(createElement(ConfigProvider, { motion, enableCustomFonts: false, children: createElement(Properties, { node, change }) })));
  const horizontal = host.querySelector<HTMLButtonElement>('button[title="Horizontal"]')!;
  expect(horizontal.getAttribute('aria-label') || horizontal.textContent).toBe('Horizontal');
  await act(async () => horizontal.click());
  expect(change).toHaveBeenCalledWith('flex-direction', 'row');
});
