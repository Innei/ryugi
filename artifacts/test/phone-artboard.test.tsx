// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { ConfigProvider } from '@lobehub/ui';
import { motion } from 'motion/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PhoneBoard } from '../src/viewer/components/PhoneBoard';
import { ArtboardView } from '../src/viewer/layouts/ArtboardLayout';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, defineConsts: (value: unknown) => value, defineVars: (value: unknown) => value, props: () => ({}) }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));
vi.mock('@lobehub/ui', async (original) => ({
  ...await original<object>(),
  FloatingSheet: (props: { title: unknown; headerActions?: unknown; children: unknown; activeSnapPoint?: number }) =>
    createElement('section', { 'data-sheet': '', 'data-snap': String(props.activeSnapPoint) }, createElement('header', null, props.title as never, props.headerActions as never), props.children as never),
  DropdownMenu: (props: { items: { key: string; label: string; onClick: () => void }[]; children: unknown }) =>
    createElement('div', { 'data-menu': '' }, props.children as never, createPortal(props.items.map((item) => createElement('button', { key: item.key, 'data-menu-item': item.key, onClick: item.onClick }, item.label)), document.body)),
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
afterEach(() => { if (root) act(() => root!.unmount()); host?.remove(); document.body.innerHTML = ''; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function mount(spec: object = canvas, specLayout: object = layout, extra: object = {}) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const specVersions = Object.fromEntries(Object.values((spec as typeof canvas).boards).map((b) => [b.file, 1]));
  const view = createElement(ArtboardView, { id: 'mobile-comments', artifact: null, canvas: spec, layout: specLayout, warnings: [], pending: [], contentBase: 'about:blank#', versions: specVersions, loaded: true, ...extra } as never);
  await act(async () => root!.render(createElement(ConfigProvider, { motion, enableCustomFonts: false, children: view })));
  return host;
}

const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
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
  await act(async () => (document.querySelector('[data-menu-item="q"]') as HTMLElement).click());
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

const touchOn = (target: Element, type: string, x: number, y: number, id = 11) =>
  act(async () => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: 'touch', clientX: x, clientY: y })));

function screenOf(boardId: string, bx: number, by: number) {
  const slot = host!.querySelector(`[data-board="${boardId}"]`) as HTMLElement;
  const [x, y, k] = slot.parentElement!.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/)!.slice(1).map(Number) as [number, number, number];
  return { x: x + bx * k, y: y + by * k, viewport: slot.parentElement!.parentElement! };
}

test('a finger opens the jump panel by swiping the bar up or tapping it, and closes it swiping down', async () => {
  await mount();
  const title = host!.querySelector('[data-question-bar]')!;
  const snap = () => host!.querySelector('[data-sheet]')!.getAttribute('data-snap');
  await touchOn(title, 'pointerdown', 100, 800);
  await touchOn(title, 'pointerup', 100, 700);
  expect(snap()).toBe('0.66');
  await touchOn(title, 'pointerdown', 100, 300);
  await touchOn(title, 'pointerup', 100, 420);
  expect(snap()).toBe('78');
  await touchOn(title, 'pointerdown', 100, 800);
  await touchOn(title, 'pointerup', 100, 802);
  expect(snap()).toBe('0.66');
});

test('choosing a page from a menu over a board never opens that board', async () => {
  await mount();
  const { x, y, viewport } = screenOf('q2-a', 195, 1522);
  viewport.setPointerCapture = vi.fn();
  const item = document.querySelectorAll('[data-menu-item="q"]')[1]!;
  await touchOn(item, 'pointerdown', x, y);
  await touchOn(item, 'pointerup', x, y);
  await act(async () => (item as HTMLElement).click());
  expect(host!.querySelector('[data-phone-board]')).toBeNull();
});

test('opens on the focused question even when it lives on another page', async () => {
  await mount({ ...canvas, focus: { target: 'other', at: '2026-10-21T11:00:00Z' } });
  expect(bar()).toContain('另一页的问题');
});

test('a board outside every group pages through the other loose boards of its round', async () => {
  const loose = {
    ...canvas,
    focus: undefined,
    boards: { ...canvas.boards, 'loose-1': board('p', 1000, 2600, '散板一'), 'loose-2': board('p', 1500, 2600, '散板二') },
  };
  await mount(loose);
  const { x, y, viewport } = screenOf('loose-1', 1195, 3022);
  viewport.setPointerCapture = vi.fn();
  await touchOn(viewport, 'pointerdown', x, y);
  await touchOn(viewport, 'pointerup', x, y);
  const full = host!.querySelector('[data-phone-board]')!;
  expect(full.textContent).toContain('散板一');
  expect(full.textContent).toContain('1 / 2');
});

test('an interactive board fits the whole screen so every part of it can be reached', async () => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const render = (interactive: boolean) =>
    act(async () => root!.render(createElement(PhoneBoard, { id: 'p1', board: { ...board('p', 0, 0, '原型'), interactive }, src: 'about:blank', siblings: ['p1'], onOpen: () => {}, onClose: () => {} })));
  const scale = () => Number(host!.querySelector('iframe')!.parentElement!.style.transform.match(/scale\(([-\d.]+)\)/)![1]);
  await render(true);
  expect(scale()).toBeCloseTo(600 / 844, 3);
  await render(false);
  expect(scale()).toBe(1);
});

test('a verify group on the phone shows its verdict but never the verdict buttons', async () => {
  const spec = { ...canvas, groups: { ...canvas.groups, q1: { ...canvas.groups.q1, verify: true }, q2: { ...canvas.groups.q2, verify: true } } };
  const pass = { id: 'p1', anchor: { page: 'p', group: 'q1', verdict: 'pass', x: 0, y: 0 }, status: 'resolved', statusAt: '2026-10-22T08:40:00Z', messages: [{ id: 'm', author: 'human', text: '通过', at: '2026-10-22T08:40:00Z' }] };
  await mount(spec, layout, { comments: { comments: { version: 1, threads: [pass] }, stale: [] }, comment: vi.fn() });
  expect(host!.querySelector('[data-group-label="q1"]')!.textContent).toContain('已通过');
  const pending = host!.querySelector<HTMLElement>('[data-group-label="q2"]')!;
  expect(pending.textContent).toContain('待验收');
  expect([...pending.querySelectorAll('button')].map((b) => b.textContent?.trim())).not.toContain('通过');
});

test('an opened image or video board shows the media instead of a frame', async () => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const image = { type: 'image' as const, src: 'pages/p/shot.png', file: 'pages/p/shot.png', page: 'p', x: 0, y: 0, w: 390, h: 844 };
  const video = { ...image, type: 'video' as const, src: 'pages/p/flow.webm', file: 'pages/p/flow.webm' };
  const open = (board: typeof image | typeof video) => act(async () => root!.render(createElement(ConfigProvider, { motion, enableCustomFonts: false, children: createElement(PhoneBoard, { id: 'shot', board, src: `about:blank#${board.file}`, siblings: ['shot'], onOpen: () => {}, onClose: () => {} }) })));
  await open(image);
  expect(host.querySelector('[data-phone-board] iframe')).toBeNull();
  expect(host.querySelector('[data-phone-board] img')?.getAttribute('src')).toBe('about:blank#pages/p/shot.png');
  await open(video);
  expect(host.querySelector('[data-phone-board] video')).not.toBeNull();
  expect(host.querySelector('[data-phone-board] [aria-label="播放"]')).not.toBeNull();
});

