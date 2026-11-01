// @vitest-environment happy-dom
import { ConfigProvider } from '@lobehub/ui';
import { motion } from 'motion/react';
import { act, createElement } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { BoardThread } from '../src/shared/board-comments';
import { ArtboardView } from '../src/viewer/layouts/ArtboardView';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  defineConsts: (value: unknown) => value,
  defineVars: (value: unknown) => value,
  keyframes: (value: unknown) => value,
  props: () => ({}),
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({
  cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
}));
vi.mock('@lobehub/ui', async (original) => ({
  ...(await original<object>()),
  DropdownMenu: (props: {
    items: { key: string; label: string; onClick: () => void }[];
    children: unknown;
  }) =>
    createElement(
      'div',
      { 'data-menu': '' },
      props.children as never,
      createPortal(
        props.items.map((item) =>
          createElement(
            'button',
            { 'key': item.key, 'data-menu-item': item.key, 'onClick': item.onClick },
            item.label,
          ),
        ),
        document.body,
      ),
    ),
}));

const board = (page: string, x: number, y: number, title?: string) => ({
  file: `pages/${page}/${x}-${y}.html`,
  page,
  x,
  y,
  w: 390,
  h: 844,
  ...(title ? { title } : {}),
});
const canvas = {
  version: 1,
  title: 'mobile-comments',
  focus: { target: 'q2', at: '2026-10-21T10:00:00Z' },
  pages: [
    { id: 'p', name: '手机上的文档' },
    { id: 'q', name: '另一页' },
  ],
  boards: {
    'q1-a': board('p', 0, 0, '底部抽屉'),
    'q2-a': board('p', 0, 1100, '选中文字'),
    'q2-b': board('p', 470, 1100, '长按段落'),
    'q3-a': board('p', 0, 2600),
    'other-a': board('q', 0, 0),
  },
  groups: {
    q1: { title: '评论放在哪里', boards: ['q1-a'] },
    q2: { title: '怎么开始一条评论', boards: ['q2-a', 'q2-b'] },
    q3: { title: '离线', boards: ['q3-a'] },
    other: { title: '另一页的问题', boards: ['other-a'] },
  },
  notes: {
    r1: { page: 'p', kind: 'title', x: 0, y: -340, text: '第 1 轮' },
    r2: { page: 'p', kind: 'title', x: 0, y: 2200, text: '第 2 轮' },
  },
};
const layout = {
  pages: {
    p: {
      groups: {
        q1: { x: -48, y: -144, w: 486, h: 1036 },
        q2: { x: -48, y: 956, w: 956, h: 1036 },
        q3: { x: -48, y: 2456, w: 486, h: 1036 },
      },
      notes: { r1: { x: 0, y: -340, w: 300, h: 110 }, r2: { x: 0, y: 2200, w: 300, h: 110 } },
      bounds: { minX: -48, minY: -340, maxX: 908, maxY: 3492 },
    },
    q: {
      groups: { other: { x: -48, y: -144, w: 486, h: 1036 } },
      notes: {},
      bounds: { minX: -48, minY: -144, maxX: 438, maxY: 892 },
    },
  },
};

let root: Root | undefined;
let host: HTMLDivElement | undefined;
beforeEach(() => {
  history.replaceState(null, '', '/artboard/mobile-comments');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ signedIn: false, artifacts: {} }) }),
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('640px'),
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(844);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(spec: object = canvas, specLayout: object = layout, extra: object = {}) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const specVersions = Object.fromEntries(
    Object.values((spec as typeof canvas).boards).map((b) => [b.file, 1]),
  );
  const view = createElement(ArtboardView, {
    id: 'mobile-comments',
    artifact: null,
    canvas: spec,
    layout: specLayout,
    warnings: [],
    pending: [],
    contentBase: 'about:blank#',
    versions: specVersions,
    loaded: true,
    ...extra,
  } as never);
  await act(async () =>
    root!.render(
      createElement(ConfigProvider, { motion, enableCustomFonts: false, children: view }),
    ),
  );
  return host;
}

const choiceCanvas = {
  ...canvas,
  groups: { ...canvas.groups, q2: { ...canvas.groups.q2, choose: true, recommend: 'q2-b' } },
  notes: { r1: canvas.notes.r1 },
};
const choiceLayout = {
  pages: {
    ...layout.pages,
    p: { ...layout.pages.p, notes: { r1: layout.pages.p.notes.r1 } },
  },
};

let clock = 0;
const record = (anchor: Partial<BoardThread['anchor']>): BoardThread => {
  clock += 1;
  const at = `2026-11-01T08:00:${String(clock).padStart(2, '0')}.000Z`;
  return {
    id: `r${clock}`,
    anchor: { page: 'p', x: 0, y: 0, ...anchor },
    status: 'resolved',
    statusAt: at,
    messages: [{ id: `m${clock}`, author: 'human', text: 'x', at }],
  };
};
const state = (threads: BoardThread[]) => ({
  comments: { version: 1 as const, threads },
  stale: [],
  listening: false,
});

async function openBoard(id: string) {
  const slot = host!.querySelector(`[data-board="${id}"]`) as HTMLElement;
  const [x, y, k] = slot
    .parentElement!.style.transform.match(
      /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/,
    )!
    .slice(1)
    .map(Number) as [number, number, number];
  const spec = choiceCanvas.boards[id as keyof typeof choiceCanvas.boards];
  const at = { clientX: x + (spec.x + 195) * k, clientY: y + (spec.y + 422) * k };
  const viewport = slot.parentElement!.parentElement!;
  viewport.setPointerCapture = vi.fn();
  for (const type of ['pointerdown', 'pointerup'])
    await act(async () =>
      viewport.dispatchEvent(
        new PointerEvent(type, { bubbles: true, pointerId: 9, pointerType: 'touch', ...at }),
      ),
    );
  return host!.querySelector<HTMLButtonElement>('[data-choose-board]');
}

test('a full-screen board offers Choose this and records the choice', async () => {
  const comment = vi.fn(async () => state([]));
  await mount(choiceCanvas, choiceLayout, { comments: state([]), comment, live: true });
  const choose = await openBoard('q2-a');
  expect(choose?.textContent).toContain('Choose this');
  await act(async () => choose!.click());
  expect(comment).toHaveBeenCalledWith({
    op: 'create',
    anchor: expect.objectContaining({ group: 'q2', choice: 'q2-a' }),
    text: 'q2-a',
  });
});

test('the sheet names the choice of the current question', async () => {
  const threads = [record({ group: 'q2', choice: 'q2-a' })];
  await mount(choiceCanvas, choiceLayout, {
    comments: state(threads),
    comment: vi.fn(async () => state(threads)),
    live: true,
  });
  expect(host!.querySelector('[data-question-bar]')!.textContent).toContain('chose q2-a');
  expect(host!.querySelector('[data-submit-bar]')).not.toBeNull();
});

test('a submitted round disables Choose this', async () => {
  const threads = [record({ round: 'r1', submit: true })];
  await mount(choiceCanvas, choiceLayout, {
    comments: state(threads),
    comment: vi.fn(async () => state(threads)),
    live: true,
  });
  const choose = await openBoard('q2-a');
  expect(choose?.disabled).toBe(true);
});
