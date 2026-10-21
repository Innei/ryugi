// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ConfigProvider } from '@lobehub/ui';
import { motion } from 'motion/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ArtboardView } from '../src/viewer/layouts/ArtboardLayout';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, defineConsts: (value: unknown) => value, defineVars: (value: unknown) => value, props: () => ({}) }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));
vi.mock('@lobehub/ui', async (original) => ({
  ...await original<object>(),
  FloatingSheet: (props: { title: unknown; headerActions?: unknown; children: unknown; activeSnapPoint?: number }) =>
    createElement('section', { 'data-sheet': '', 'data-snap': String(props.activeSnapPoint) }, createElement('header', null, props.title as never, props.headerActions as never), props.children as never),
  DropdownMenu: (props: { items: { key: string; label: string; onClick: () => void }[]; children: unknown }) =>
    createElement('div', { 'data-menu': '' }, props.children as never, ...props.items.map((item) => createElement('button', { key: item.key, 'data-menu-item': item.key, onClick: item.onClick }, item.label))),
}));

const board = (page: string, x: number, y: number, title?: string) => ({ file: `pages/${page}/${x}-${y}.html`, page, x, y, w: 390, h: 844, ...(title ? { title } : {}) });
const canvas = {
  version: 1,
  title: 'mobile-comments',
  focus: { target: 'q2', at: '2026-10-21T10:00:00Z' },
  pages: [{ id: 'p', name: '手机上的文档' }, { id: 'q', name: '另一页' }],
  boards: { 'q1-a': board('p', 0, 0, '底部抽屉'), 'q2-a': board('p', 0, 1100, '选中文字'), 'q2-b': board('p', 470, 1100, '长按段落'), 'q3-a': board('p', 0, 2600), 'other-a': board('q', 0, 0) },
  groups: { q1: { title: '评论放在哪里', boards: ['q1-a'] }, q2: { title: '怎么开始一条评论', boards: ['q2-a', 'q2-b'] }, q3: { title: '离线', boards: ['q3-a'] }, other: { title: '另一页的问题', boards: ['other-a'] } },
  notes: { r1: { page: 'p', kind: 'title', x: 0, y: -340, text: '第 1 轮' }, r2: { page: 'p', kind: 'title', x: 0, y: 2200, text: '第 2 轮' } },
};
const layout = {
  pages: {
    p: {
      groups: { q1: { x: -48, y: -144, w: 486, h: 1036 }, q2: { x: -48, y: 956, w: 956, h: 1036 }, q3: { x: -48, y: 2456, w: 486, h: 1036 } },
      notes: { r1: { x: 0, y: -340, w: 300, h: 110 }, r2: { x: 0, y: 2200, w: 300, h: 110 } },
      bounds: { minX: -48, minY: -340, maxX: 908, maxY: 3492 },
    },
    q: { groups: { other: { x: -48, y: -144, w: 486, h: 1036 } }, notes: {}, bounds: { minX: -48, minY: -144, maxX: 438, maxY: 892 } },
  },
};
const versions = Object.fromEntries(Object.values(canvas.boards).map((b) => [b.file, 1]));

let root: Root | undefined;
let host: HTMLDivElement | undefined;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ signedIn: false, artifacts: {} }) }));
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('640px'), addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(844);
});
afterEach(() => { if (root) act(() => root!.unmount()); host?.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const view = createElement(ArtboardView, { id: 'mobile-comments', artifact: null, canvas, layout, warnings: [], pending: [], contentBase: 'about:blank#', versions, loaded: true } as never);
  await act(async () => root!.render(createElement(ConfigProvider, { motion, enableCustomFonts: false, children: view })));
  return host;
}

const button = (label: string) => [...host!.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
const bar = () => host!.querySelector('[data-question-bar]')?.textContent ?? '';

test('opens on the question the agent focused, with no selection tools or inspector', async () => {
  await mount();
  expect(bar()).toContain('q2');
  expect(bar()).toContain('怎么开始一条评论');
  expect(host!.querySelector('[aria-label="Toggle inspector"]')).toBeNull();
  expect(host!.querySelector('[aria-label="Select"]')).toBeNull();
  expect(host!.textContent).toContain('mobile-comments');
});

test('上一题 and 下一题 step through the list, newest round first, and stop at the ends', async () => {
  await mount();
  expect(button('下一题 ›')!.disabled).toBe(true);
  await act(async () => button('‹ 上一题')!.click());
  expect(bar()).toContain('q1');
  await act(async () => button('‹ 上一题')!.click());
  expect(bar()).toContain('q3');
  expect(button('‹ 上一题')!.disabled).toBe(true);
  await act(async () => button('下一题 ›')!.click());
  expect(bar()).toContain('q1');
});

test('the jump panel lists every question under its round and jumps to the one tapped', async () => {
  await mount();
  const rows = [...host!.querySelectorAll('[data-question-row]')].map((row) => row.getAttribute('data-question-row'));
  expect(rows).toEqual(['q3', 'q1', 'q2']);
  expect([...host!.querySelectorAll('[data-round]')].map((round) => round.textContent)).toEqual(['第 2 轮', '第 1 轮']);
  await act(async () => (host!.querySelector('[data-question-row="q1"]') as HTMLElement).click());
  expect(bar()).toContain('q1');
  expect(host!.querySelector('[data-sheet]')!.getAttribute('data-snap')).toBe('78');
});

test('the page switcher lists the other page’s questions', async () => {
  await mount();
  await act(async () => (host!.querySelector('[data-menu-item="q"]') as HTMLElement).click());
  expect([...host!.querySelectorAll('[data-question-row]')].map((row) => row.getAttribute('data-question-row'))).toEqual(['other']);
  expect(bar()).toContain('另一页的问题');
});

test('tapping a board opens it full screen and pages through its question', async () => {
  await mount();
  const slot = host!.querySelector('[data-board="q2-a"]') as HTMLElement;
  const world = slot.parentElement!.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/)!.slice(1).map(Number);
  const [x, y, k] = world as [number, number, number];
  const at = { clientX: x + (0 + 195) * k, clientY: y + (1100 + 422) * k };
  const viewport = slot.parentElement!.parentElement!;
  viewport.setPointerCapture = vi.fn();
  await act(async () => viewport.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9, pointerType: 'touch', ...at })));
  await act(async () => viewport.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9, pointerType: 'touch', ...at })));
  const full = host!.querySelector('[data-phone-board]')!;
  expect(full.textContent).toContain('选中文字');
  expect(full.textContent).toContain('q2-a');
  expect(full.textContent).toContain('1 / 2');
  await act(async () => button('下一张 ›')!.click());
  expect(host!.querySelector('[data-phone-board]')!.textContent).toContain('长按段落');
  expect(host!.querySelector('[data-phone-board]')!.textContent).toContain('2 / 2');
  await act(async () => (host!.querySelector('[aria-label="关闭"]') as HTMLElement).click());
  expect(host!.querySelector('[data-phone-board]')).toBeNull();
});
