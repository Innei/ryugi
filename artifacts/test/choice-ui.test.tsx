// @vitest-environment happy-dom
import { ConfigProvider } from '@lobehub/ui';
import { motion } from 'motion/react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { BoardCommentsFile, BoardThread } from '../src/shared/board-comments';
import { computeLayout } from '../src/shared/geometry';
import type { CanvasSpec } from '../src/shared/types';
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
  comments: { comments: { version: 1, threads: [] }, stale: [], listening: false } as {
    comments: BoardCommentsFile;
    stale: string[];
    listening: boolean;
  },
  comment: null as unknown as ReturnType<typeof vi.fn> | undefined,
  canvas: null as unknown as CanvasSpec,
  live: true,
}));

const box = (x: number, y: number) => ({ page: 'p', x, y, w: 600, h: 400 });
state.canvas = {
  version: 1,
  pages: [{ id: 'p', name: 'Page' }],
  boards: {
    'q1-a': { file: 'pages/q1-a.html', ...box(0, 0), title: 'Current' },
    'q1-b': { file: 'pages/q1-b.html', ...box(700, 0), title: 'Subtitle' },
    'q2-a': { file: 'pages/q2-a.html', ...box(0, 800) },
    'q2-b': { file: 'pages/q2-b.html', ...box(700, 800) },
  },
  groups: {
    q1: { title: 'Banner', boards: ['q1-a', 'q1-b'], choose: true, recommend: 'q1-b' },
    q2: { title: 'Copy', boards: ['q2-a', 'q2-b'], choose: true },
  },
  notes: { r1: { page: 'p', kind: 'title', x: 0, y: -400, text: 'Round 1' } },
};

vi.mock('../src/viewer/hooks/useCanvasData', () => ({
  useCanvasData: () => ({
    canvas: state.canvas,
    layout: computeLayout(state.canvas),
    pending: [],
    versions: {
      'pages/q1-a.html': 1,
      'pages/q1-b.html': 1,
      'pages/q2-a.html': 1,
      'pages/q2-b.html': 1,
    },
    contentBase: 'about:blank#',
    warnings: [],
    live: state.live,
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
  state.comments = { comments: { version: 1, threads: [] }, stale: [], listening: false };
  state.comment = vi.fn(async () => state.comments);
  state.live = true;
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
        children: createElement(ArtboardLayout, { id: 'pick' }),
      }),
    ),
  );
  return host;
}

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
const radio = (host: HTMLElement, board: string) =>
  host.querySelector<HTMLButtonElement>(`[data-choice-radio="${board}"]`)!;
const bar = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-submit-bar]');
const button = (scope: HTMLElement, text: string) =>
  [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);

test('clicking a radio records the choice for its group', async () => {
  const view = await mount();
  expect(radio(view, 'q1-a').getAttribute('aria-checked')).toBe('false');
  await act(async () => radio(view, 'q1-a').click());
  expect(state.comment).toHaveBeenCalledWith({
    op: 'create',
    anchor: expect.objectContaining({ page: 'p', group: 'q1', choice: 'q1-a' }),
    text: 'q1-a',
  });
});

test('the submit bar counts choices and names groups taken by recommendation', async () => {
  state.comments.comments.threads = [record({ group: 'q2', choice: 'q2-a' })];
  const view = await mount();
  expect(radio(view, 'q2-a').getAttribute('aria-checked')).toBe('true');
  const text = bar(view)!.textContent!;
  expect(text).toContain('1/2 chosen');
  expect(text).toContain('q1 by recommendation');
  await act(async () => button(bar(view)!, 'Submit')!.click());
  expect(state.comment).toHaveBeenCalledWith({
    op: 'create',
    anchor: expect.objectContaining({ page: 'p', round: 'r1', submit: true }),
    text: 'Submit r1',
  });
});

test('a submitted round locks its radios and offers a withdrawal', async () => {
  state.comments.comments.threads = [record({ round: 'r1', submit: true })];
  const view = await mount();
  expect(radio(view, 'q1-a').disabled).toBe(true);
  expect(bar(view)!.textContent).toContain('Say done in the terminal');
  await act(async () => button(bar(view)!, 'Withdraw')!.click());
  expect(state.comment).toHaveBeenCalledWith({
    op: 'create',
    anchor: expect.objectContaining({ round: 'r1', submit: false }),
    text: 'Withdraw r1',
  });
});

test('a listening watcher changes what the submitted bar says', async () => {
  state.comments.comments.threads = [record({ round: 'r1', submit: true })];
  state.comments.listening = true;
  const view = await mount();
  expect(bar(view)!.textContent).toContain('drawing the next round');
});

test('an artboard without choice groups shows no radios and no bar', async () => {
  const saved = state.canvas;
  state.canvas = {
    ...saved,
    groups: { q1: { title: 'Banner', boards: ['q1-a', 'q1-b'] } },
  };
  const view = await mount();
  expect(radio(view, 'q1-a')).toBeNull();
  expect(bar(view)).toBeNull();
  state.canvas = saved;
});

test('a page that is not live, like a published copy with no server, is read-only', async () => {
  state.live = false;
  const view = await mount();
  expect(radio(view, 'q1-a').disabled).toBe(true);
  expect(button(bar(view)!, 'Submit')).toBeUndefined();
});
