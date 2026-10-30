// @vitest-environment happy-dom
import { ConfigProvider } from '@lobehub/ui';
import { motion } from 'motion/react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { BoardCommentsFile, BoardThread } from '../src/shared/board-comments';
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

const state = vi.hoisted(() => ({
  comments: { comments: { version: 1, threads: [] }, stale: [] } as {
    comments: BoardCommentsFile;
    stale: string[];
  },
  comment: null as unknown as ReturnType<typeof vi.fn> | undefined,
}));
vi.mock('../src/viewer/hooks/useCanvasData', () => ({
  useCanvasData: () => ({
    canvas: {
      version: 1,
      pages: [{ id: 'p', name: 'Page' }],
      boards: {
        a: { page: 'p', file: 'pages/a.html', x: 0, y: 0, w: 600, h: 400 },
        b: {
          page: 'p',
          type: 'image',
          src: 'pages/b.png',
          file: 'pages/b.png',
          x: 700,
          y: 0,
          w: 600,
          h: 400,
        },
        c: { page: 'p', file: 'pages/c.html', x: 0, y: 800, w: 600, h: 400 },
        d: { page: 'p', file: 'pages/d.html', x: 0, y: 1600, w: 600, h: 400 },
      },
      groups: {
        notify: { title: '通知设置', boards: ['a', 'b'], verify: true },
        digest: { title: '摘要', boards: ['c'], verify: true },
        ideas: { title: '想法', boards: ['d'] },
      },
    },
    layout: {
      pages: { p: { groups: {}, notes: {}, bounds: { minX: 0, minY: 0, maxX: 1300, maxY: 2000 } } },
    },
    pending: [],
    versions: {
      'pages/a.html': 1,
      'pages/b.png': Date.parse('2026-10-22T08:52:00Z'),
      'pages/c.html': 1,
      'pages/d.html': 1,
    },
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
  state.comments = { comments: { version: 1, threads: [] }, stale: [] };
  state.comment = vi.fn(async () => state.comments);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1400);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(900);
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
  return host;
}

const verdictThread = (
  id: string,
  group: string,
  verdict: 'pass' | 'reject',
  at: string,
  fields: Partial<BoardThread> = {},
): BoardThread => ({
  id,
  anchor: { page: 'p', group, verdict, x: 1300, y: 0 },
  status: verdict === 'pass' ? 'resolved' : 'open',
  statusAt: at,
  messages: [
    { id: `${id}-m`, author: 'human', text: verdict === 'pass' ? '通过' : '字号小了一号', at },
  ],
  ...fields,
});
const label = (host: HTMLElement, group: string) =>
  host.querySelector<HTMLElement>(`[data-group-label="${group}"]`)!;
const button = (scope: HTMLElement, text: string) =>
  [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);

test('a verify group shows its state and the two verdict buttons; other groups show neither', async () => {
  const host = await mount();
  expect(label(host, 'notify').textContent).toContain('Awaiting review');
  expect(button(label(host, 'notify'), 'Pass')).toBeDefined();
  expect(button(label(host, 'notify'), 'Reject')).toBeDefined();
  expect(label(host, 'ideas').textContent).not.toContain('Awaiting review');
  expect(host.textContent).toContain('Verified 0 / 2');
});

test('Pass sends a pass on the group, anchored at its top-right', async () => {
  const host = await mount();
  await act(async () => button(label(host, 'notify'), 'Pass')!.click());
  expect(state.comment).toHaveBeenCalledWith({
    op: 'create',
    anchor: { page: 'p', group: 'notify', verdict: 'pass', x: 1300, y: 0 },
    text: 'Pass',
  });
});

test('Reject asks for a reason before sending the reject', async () => {
  const host = await mount();
  await act(async () => button(label(host, 'notify'), 'Reject')!.click());
  const box = host.querySelector<HTMLTextAreaElement>(
    'textarea[placeholder="Why are you rejecting this?"]',
  )!;
  expect(host.textContent).toContain('Reason required');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      box,
      '两行说明文字都小了一号',
    );
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true })),
  );
  expect(state.comment).toHaveBeenCalledWith({
    op: 'create',
    anchor: { page: 'p', group: 'notify', verdict: 'reject', x: 1300, y: 0 },
    text: '两行说明文字都小了一号',
  });
  expect(host.querySelector('textarea[placeholder="Why are you rejecting this?"]')).toBeNull();
});

test('passed and rejected groups say so, hide the buttons, and count toward progress', async () => {
  state.comments = {
    comments: {
      version: 1,
      threads: [
        verdictThread('p1', 'notify', 'pass', '2026-10-22T08:40:00Z'),
        verdictThread('r1', 'digest', 'reject', '2026-10-22T08:45:00Z'),
      ],
    },
    stale: [],
  };
  const host = await mount();
  expect(label(host, 'notify').textContent).toContain('Passed');
  expect(button(label(host, 'notify'), 'Pass')).toBeUndefined();
  expect(label(host, 'digest').textContent).toContain('Rejected');
  expect(label(host, 'digest').textContent).toContain('Waiting for the agent to fix · 1 thread');
  expect(button(label(host, 'digest'), 'Reject')).toBeUndefined();
  expect(host.textContent).toContain('Verified 1 / 2');
});

test('new evidence after a reject brings the buttons back with the update time', async () => {
  state.comments = {
    comments: {
      version: 1,
      threads: [verdictThread('r1', 'notify', 'reject', '2026-10-22T08:45:00Z')],
    },
    stale: ['r1'],
  };
  const host = await mount();
  expect(label(host, 'notify').textContent).toContain('Awaiting review');
  expect(label(host, 'notify').textContent).toMatch(/Evidence updated \d\d:\d\d/);
  expect(button(label(host, 'notify'), 'Pass')).toBeDefined();
});

test('a reject gets a red pin and a sidebar row; a pass gets neither', async () => {
  state.comments = {
    comments: {
      version: 1,
      threads: [
        verdictThread('p1', 'notify', 'pass', '2026-10-22T08:40:00Z'),
        verdictThread('r1', 'digest', 'reject', '2026-10-22T08:45:00Z'),
      ],
    },
    stale: [],
  };
  const host = await mount();
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true })),
  );
  expect(
    [...host.querySelectorAll('[aria-label^="Comment "]')].map((pin) =>
      pin.getAttribute('aria-label'),
    ),
  ).toEqual(['Comment 1']);
  expect(host.querySelector('[aria-label="Comment 1"]')!.getAttribute('data-verdict')).toBe(
    'reject',
  );
  const rows = [...host.querySelectorAll('aside[aria-label="Comments"] [data-thread]')].map((row) =>
    row.getAttribute('data-thread'),
  );
  expect(rows).toEqual(['r1']);
});

test('without comment access the state shows but the buttons do not', async () => {
  state.comment = undefined;
  const host = await mount();
  expect(label(host, 'notify').textContent).toContain('Awaiting review');
  expect(button(label(host, 'notify'), 'Pass')).toBeUndefined();
});

test('a pass can be undone from the label', async () => {
  state.comments = {
    comments: {
      version: 1,
      threads: [verdictThread('p1', 'notify', 'pass', '2026-10-22T08:40:00Z')],
    },
    stale: [],
  };
  const host = await mount();
  await act(async () => button(label(host, 'notify'), 'Undo')!.click());
  expect(state.comment).toHaveBeenCalledWith({ op: 'delete', threadId: 'p1', messageId: 'p1-m' });
});
