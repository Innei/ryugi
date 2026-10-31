// @vitest-environment happy-dom
import { ConfigProvider } from '@lobehub/ui';
import { motion, MotionGlobalConfig } from 'motion/react';
import { act, createElement } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { BoardCommentsFile } from '../src/shared/board-comments';
import { POINTER_CURSOR } from '../src/shared/inspector';
import { ArtboardLayout } from '../src/viewer/layouts/ArtboardLayout';

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

const state = vi.hoisted(() => ({
  video: false,
  activePage: 'p',
  focus: undefined as { target: string; at: string } | undefined,
  comments: { comments: { version: 1, threads: [] }, stale: [] } as {
    comments: BoardCommentsFile;
    stale: string[];
  },
  comment: null as unknown as ReturnType<typeof vi.fn>,
}));
vi.mock('../src/viewer/hooks/useCanvasData', () => ({
  useCanvasData: () => ({
    canvas: {
      version: 1,
      activePage: state.activePage,
      focus: state.focus,
      pages: [
        { id: 'p', name: 'Page' },
        { id: 'q', name: 'Other' },
      ],
      boards: {
        a: {
          ...(state.video ? { type: 'video', src: 'pages/a.html' } : {}),
          page: 'p',
          file: 'pages/a.html',
          x: 0,
          y: 0,
          w: 600,
          h: 400,
        },
        b: { page: 'q', file: 'pages/b.html', x: 0, y: 0, w: 600, h: 400 },
      },
    },
    layout: {
      pages: {
        p: { groups: {}, notes: {}, bounds: { minX: 0, minY: 0, maxX: 600, maxY: 400 } },
        q: { groups: {}, notes: {}, bounds: { minX: 0, minY: 0, maxX: 600, maxY: 400 } },
      },
    },
    pending: [],
    versions: { 'pages/a.html': 1, 'pages/b.html': 1 },
    contentBase: 'about:blank#',
    warnings: [],
    live: true,
    loaded: true,
    send: vi.fn(),
    comments: state.comments,
    comment: state.comment,
  }),
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

beforeEach(() => {
  history.replaceState(null, '', '/artboard/review');
  MotionGlobalConfig.skipAnimations = true;
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
  state.comments = { comments: { version: 1, threads: [] }, stale: [] };
  state.comment = vi.fn(async () => state.comments);
  state.video = false;
  state.activePage = 'p';
  state.focus = undefined;
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      createElement(ConfigProvider, {
        motion,
        enableCustomFonts: false,
        children: createElement(ArtboardLayout, { id: 'review' }),
      }),
    ),
  );
  const frame = host.querySelector('iframe')!;
  const sent: any[] = [];
  vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation((message) => sent.push(message));
  await act(async () => frame.dispatchEvent(new Event('load')));
  const connection = sent.find((message) => message.action === 'enable')!.connection;
  const report = async (type: string, fields: Record<string, unknown>) =>
    act(async () =>
      window.dispatchEvent(
        new MessageEvent('message', {
          source: frame.contentWindow!,
          data: { type: `ryugi:inspect:${type}`, session: 's', connection, ...fields },
        }),
      ),
    );
  await report('tree', {
    nodes: [
      {
        id: 7,
        parentId: null,
        children: [],
        tag: 'img',
        name: 'shot',
        kind: 'Image',
        selector: 'img',
        path: 'body > img',
      },
    ],
    truncated: false,
  });
  return { host, sent, report };
}

const key = (k: string) =>
  act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })));

test('C turns on the comment tool and tells every board', async () => {
  const { host, sent } = await mount();
  await key('c');
  expect(host.querySelector('[aria-label="Comment"]')).not.toBeNull();
  expect(sent.some((message) => message.action === 'mode' && message.mode === 'comment')).toBe(
    true,
  );
});

test('C opens a node comment with keyboard focus in the layer tree', async () => {
  const { host, report } = await mount();
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Toggle inspector"]')!.click(),
  );
  const row = host.querySelector<HTMLElement>('[role="treeitem"]')!;
  await report('selection', {
    reason: 'command',
    selection: {
      id: 7,
      name: 'shot',
      tag: 'img',
      selector: 'img',
      rect: { x: 40, y: 60, width: 200, height: 100 },
      html: '<img>',
      css: Object.fromEntries(
        (await import('../src/shared/inspector')).INSPECTOR_PROPERTIES.map((property) => [
          property,
          '0',
        ]),
      ),
      widthMode: 'fixed',
      heightMode: 'fixed',
    },
  });
  await act(async () => {
    row.focus();
    row.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', bubbles: true, cancelable: true }),
    );
  });
  expect(host.querySelector('textarea[placeholder="Add a comment…"]')).not.toBeNull();
  expect(host.textContent).toContain('Anchored to a');
});

test('tool shortcuts reach the canvas from a focused layer without consuming tree navigation', async () => {
  const { host } = await mount();
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Toggle inspector"]')!.click(),
  );
  const row = host.querySelector<HTMLElement>('[role="treeitem"]')!;
  const viewport = host.querySelector('iframe')!.closest('[data-board]')!.parentElement!
    .parentElement!;
  row.focus();
  const press = async (key: string, code: string) => {
    const event = new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true });
    await act(async () => row.dispatchEvent(event));
    return event;
  };
  expect((await press('h', 'KeyH')).defaultPrevented).toBe(true);
  expect(viewport.style.cursor).toBe('grab');
  await press('v', 'KeyV');
  expect(viewport.style.cursor).toBe(POINTER_CURSOR);
  expect((await press('ArrowRight', 'ArrowRight')).defaultPrevented).toBe(true);
  expect(host.querySelector('textarea')).toBeNull();
});

test.each([
  ['active page', 'q', undefined],
  ['focus on another page', 'p', { target: 'b', at: 'new-revision' }],
  ['focus on the current page', 'p', { target: 'a', at: 'new-revision' }],
] as const)('%s updates preserve a draft and the current camera', async (_, activePage, focus) => {
  const { host, report } = await mount();
  await key('c');
  await report('drag', { phase: 'start', id: 7, x: 100, y: 100, append: false });
  await report('drag', { phase: 'cancel', x: 100, y: 100, append: false });
  const box = host.querySelector<HTMLTextAreaElement>('textarea[placeholder="Add a comment…"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      box,
      'Keep my draft',
    );
    box.dispatchEvent(new Event('input', { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '=', ctrlKey: true }));
  });
  const world = host.querySelector('iframe')!.closest('[data-board]')!.parentElement!;
  const camera = world.style.transform;
  state.activePage = activePage;
  state.focus = focus;
  await act(async () =>
    root!.render(
      createElement(ConfigProvider, {
        motion,
        enableCustomFonts: false,
        children: createElement(ArtboardLayout, { id: 'review' }),
      }),
    ),
  );
  expect(host.querySelector('textarea')).toBe(box);
  expect(box.value).toBe('Keep my draft');
  expect(world.style.transform).toBe(camera);
  expect(new URLSearchParams(location.search).get('page')).toBe('p');
});

test('the C that opens a draft never lands in it', async () => {
  const { report } = await mount();
  const css = Object.fromEntries(
    (await import('../src/shared/inspector')).INSPECTOR_PROPERTIES.map((property) => [
      property,
      '0',
    ]),
  );
  await report('selection', {
    reason: 'user',
    selection: {
      id: 7,
      name: 'shot',
      tag: 'img',
      selector: 'img',
      rect: { x: 40, y: 60, width: 200, height: 100 },
      html: '<img>',
      css,
      widthMode: 'fixed',
      heightMode: 'fixed',
    },
  });
  const event = new KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true });
  await act(async () => window.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
});

test('a click on a node opens a draft anchored to it, and sending creates the thread', async () => {
  const { host, report } = await mount();
  await key('c');
  await report('hover', { rect: { x: 100, y: 100, width: 200, height: 100 }, id: 7 });
  await report('drag', { phase: 'start', id: 7, x: 150, y: 125, append: false });
  await report('drag', { phase: 'cancel', x: 150, y: 125, append: false });
  expect(host.textContent).toContain('Anchored to a · body > img · 25%, 25%');
  const box = host.querySelector<HTMLTextAreaElement>('textarea[placeholder="Add a comment…"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      box,
      '开关没对齐',
    );
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true })),
  );
  expect(state.comment).toHaveBeenCalledWith({
    op: 'create',
    anchor: {
      page: 'p',
      board: 'a',
      x: 150,
      y: 125,
      nodes: [{ board: 'a', path: 'body > img' }],
      offset: { x: 0.25, y: 0.25 },
    },
    text: '开关没对齐',
  });
  expect(host.querySelector('textarea[placeholder="Add a comment…"]')).toBeNull();
});

test('pins open their thread, and Esc closes it before leaving the tool', async () => {
  state.comments = {
    comments: {
      version: 1,
      threads: [
        {
          id: 't1',
          anchor: { page: 'p', board: 'a', x: 10, y: 10 },
          status: 'open',
          statusAt: 'x',
          messages: [{ id: 'm1', author: 'human', text: '整体太挤', at: '2026-10-22T10:00:00Z' }],
        },
      ],
    },
    stale: [],
  };
  const { host } = await mount();
  await key('c');
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Comment 1"]')!.click());
  expect(host.textContent).toContain('整体太挤');
  await key('Escape');
  expect(host.querySelector('textarea[placeholder="Reply…"]')).toBeNull();
  expect(host.querySelector('[aria-label="Comment"]')).not.toBeNull();
  await key('Escape');
  expect(host.querySelector('[aria-label="Comment 1"]')).toBeNull();
});

test('a stale thread says its anchor is gone', async () => {
  state.comments = {
    comments: {
      version: 1,
      threads: [
        {
          id: 't1',
          anchor: { page: 'p', board: 'a', x: 10, y: 10 },
          status: 'open',
          statusAt: 'x',
          messages: [{ id: 'm1', author: 'human', text: 'x', at: '2026-10-22T10:00:00Z' }],
        },
      ],
    },
    stale: ['t1'],
  };
  const { host } = await mount();
  await key('c');
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Comment 1"]')!.click());
  expect(host.textContent).toContain('Anchor no longer matches');
});

test('C with nodes selected opens a draft on those nodes, pinned at the first one', async () => {
  const { host, report } = await mount();
  const css = Object.fromEntries(
    (await import('../src/shared/inspector')).INSPECTOR_PROPERTIES.map((property) => [
      property,
      '0',
    ]),
  );
  await report('selection', {
    reason: 'user',
    selection: {
      id: 7,
      name: 'shot',
      tag: 'img',
      selector: 'img',
      rect: { x: 40, y: 60, width: 200, height: 100 },
      html: '<img>',
      css,
      widthMode: 'fixed',
      heightMode: 'fixed',
    },
  });
  await key('c');
  expect(host.textContent).toContain('Anchored to a · body > img');
  const box = host.querySelector<HTMLTextAreaElement>('textarea[placeholder="Add a comment…"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      box,
      '这两行间距不对',
    );
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true })),
  );
  expect(state.comment).toHaveBeenCalledWith({
    op: 'create',
    anchor: { page: 'p', board: 'a', x: 240, y: 60, nodes: [{ board: 'a', path: 'body > img' }] },
    text: '这两行间距不对',
  });
});

test('Esc in the reply box closes the thread', async () => {
  state.comments = {
    comments: {
      version: 1,
      threads: [
        {
          id: 't1',
          anchor: { page: 'p', board: 'a', x: 10, y: 10 },
          status: 'open',
          statusAt: 'x',
          messages: [{ id: 'm1', author: 'human', text: '整体太挤', at: '2026-10-22T10:00:00Z' }],
        },
      ],
    },
    stale: [],
  };
  const { host } = await mount();
  await key('c');
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Comment 1"]')!.click());
  const reply = host.querySelector<HTMLTextAreaElement>('textarea[placeholder="Reply…"]')!;
  await act(async () =>
    reply.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(host.querySelector('textarea[placeholder="Reply…"]')).toBeNull();
});

test('Esc that ends an IME composition in the reply box keeps the thread open', async () => {
  state.comments = {
    comments: {
      version: 1,
      threads: [
        {
          id: 't1',
          anchor: { page: 'p', board: 'a', x: 10, y: 10 },
          status: 'open',
          statusAt: 'x',
          messages: [{ id: 'm1', author: 'human', text: '整体太挤', at: '2026-10-22T10:00:00Z' }],
        },
      ],
    },
    stale: [],
  };
  const { host } = await mount();
  await key('c');
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Comment 1"]')!.click());
  const reply = host.querySelector<HTMLTextAreaElement>('textarea[placeholder="Reply…"]')!;
  await act(async () =>
    reply.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }),
    ),
  );
  await act(async () =>
    reply.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 229, bubbles: true }),
    ),
  );
  expect(host.querySelector('textarea[placeholder="Reply…"]')).not.toBeNull();
});

test('the comment tool swaps the right panel for the thread list, and a row opens its thread', async () => {
  state.comments = {
    comments: {
      version: 1,
      threads: [
        {
          id: 't1',
          anchor: { page: 'p', board: 'a', x: 10, y: 10 },
          status: 'open',
          statusAt: 'x',
          messages: [{ id: 'm1', author: 'human', text: '整体太挤', at: '2026-10-22T10:00:00Z' }],
        },
        {
          id: 't2',
          anchor: { page: 'p', board: 'a', x: 20, y: 20 },
          status: 'resolved',
          statusAt: 'x',
          messages: [{ id: 'm2', author: 'human', text: '已经改好', at: '2026-10-22T10:01:00Z' }],
        },
      ],
    },
    stale: [],
  };
  const { host } = await mount();
  expect(host.querySelector('aside[aria-label="Comments"]')).toBeNull();
  await key('c');
  const panel = host.querySelector('aside[aria-label="Comments"]')!;
  expect(panel.textContent).toContain('Open 1');
  expect(host.querySelector('[aria-label="Comment 2"]')).toBeNull();
  await act(async () =>
    [...panel.querySelectorAll('button')].find((b) => b.textContent?.startsWith('All'))!.click(),
  );
  expect(host.querySelector('[aria-label="Comment 2"]')).not.toBeNull();
  await act(async () => panel.querySelector<HTMLElement>('[data-thread="t1"]')!.click());
  expect(host.querySelector('textarea[placeholder="Reply…"]')).not.toBeNull();
  await act(async () =>
    panel.querySelector<HTMLButtonElement>('[aria-label="Close comments"]')!.click(),
  );
  expect(host.querySelector('aside[aria-label="Comments"]')).toBeNull();
  expect(host.querySelector('[aria-label="Comment 1"]')).toBeNull();
});

const pointerDown = (target: Element) =>
  act(async () =>
    target.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerType: 'mouse',
        clientX: 300,
        clientY: 300,
      }),
    ),
  );

async function draftOnNode(report: Awaited<ReturnType<typeof mount>>['report']) {
  await report('hover', { rect: { x: 100, y: 100, width: 200, height: 100 }, id: 7 });
  await report('drag', { phase: 'start', id: 7, x: 150, y: 125, append: false });
  await report('drag', { phase: 'cancel', x: 150, y: 125, append: false });
}

test('a click inside a menu that portals out of the canvas opens no draft', async () => {
  await mount();
  await key('c');
  await pointerDown(document.querySelector('[data-menu-item="q"]')!);
  expect(document.querySelector('textarea[placeholder="Add a comment…"]')).toBeNull();
});

test('switching page drops the draft', async () => {
  const { report } = await mount();
  await key('c');
  await draftOnNode(report);
  expect(document.querySelector('textarea[placeholder="Add a comment…"]')).not.toBeNull();
  await act(async () => document.querySelector<HTMLElement>('[data-menu-item="q"]')!.click());
  expect(document.querySelector('textarea[placeholder="Add a comment…"]')).toBeNull();
});

test('a thread whose board is gone still opens from the list', async () => {
  state.comments = {
    comments: {
      version: 1,
      threads: [
        {
          id: 't1',
          anchor: { page: 'p', board: 'gone', x: 10, y: 10 },
          status: 'open',
          statusAt: 'x',
          messages: [
            { id: 'm1', author: 'human', text: '删掉这个', at: '2026-10-22T10:00:00Z' },
            { id: 'm2', author: 'agent', text: '已删除 board', at: '2026-10-22T10:01:00Z' },
          ],
        },
      ],
    },
    stale: ['t1'],
  };
  const { host } = await mount();
  await key('c');
  await act(async () =>
    host.querySelector<HTMLElement>('aside[aria-label="Comments"] [data-thread="t1"]')!.click(),
  );
  expect(host.querySelector('textarea[placeholder="Reply…"]')).not.toBeNull();
  expect(host.textContent).toContain('已删除 board');
});

test('a thread with every message deleted leaves no pin', async () => {
  state.comments = {
    comments: {
      version: 1,
      threads: [
        {
          id: 't1',
          anchor: { page: 'p', board: 'a', x: 10, y: 10 },
          status: 'open',
          statusAt: 'x',
          messages: [
            { id: 'm1', author: 'human', text: 'x', at: '2026-10-22T10:00:00Z', deleted: true },
          ],
        },
      ],
    },
    stale: [],
  };
  const { host } = await mount();
  await key('c');
  expect(host.querySelector('[aria-label^="Comment "]')).toBeNull();
});

test('pressing empty canvas in the comment tool keeps focus on the new draft', async () => {
  const { host } = await mount();
  await key('c');
  const viewport = host.querySelector('iframe')!.closest('[style*="cursor"]')!;
  const event = new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    pointerType: 'mouse',
    clientX: 900,
    clientY: 700,
  });
  await act(async () => viewport.dispatchEvent(event));
  expect(host.querySelector('textarea[placeholder="Add a comment…"]')).not.toBeNull();
  expect(event.defaultPrevented).toBe(true);
});

test('video clicks reach playback while Hand and Comment keep their canvas gestures', async () => {
  state.video = true;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(900);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  await act(async () =>
    root!.render(
      createElement(ConfigProvider, {
        motion,
        enableCustomFonts: false,
        children: createElement(ArtboardLayout, { id: 'review' }),
      }),
    ),
  );
  const surface = host.querySelector<HTMLButtonElement>('[aria-label="Play a"]');
  expect(surface).not.toBeNull();
  const viewport = host.querySelector('[data-board="a"]')!.parentElement!.parentElement!;
  const capture = vi.fn();
  viewport.setPointerCapture = capture;
  await act(async () =>
    surface!.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }),
    ),
  );
  expect(capture).not.toHaveBeenCalled();
  await act(async () => surface!.click());
  expect(host.querySelector('video')!.paused).toBe(false);
  await key('h');
  await act(async () =>
    surface!.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 2 }),
    ),
  );
  expect(capture).toHaveBeenCalledWith(2);
  await key('c');
  await act(async () => {
    surface!.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 3 }),
    );
    surface!.click();
  });
  expect(host.querySelector('textarea[placeholder="Add a comment…"]')).not.toBeNull();
  expect(host.querySelector('video')!.paused).toBe(false);
  await act(async () => host!.querySelector<HTMLButtonElement>('[aria-label="Expand a"]')!.click());
  const expandedSurface = host.querySelector<HTMLButtonElement>(
    '[data-chrome] [data-video-surface]',
  )!;
  await act(async () => expandedSurface.click());
  expect(expandedSurface.previousElementSibling!.tagName).toBe('VIDEO');
  expect((expandedSurface.previousElementSibling as HTMLVideoElement).paused).toBe(false);
});
