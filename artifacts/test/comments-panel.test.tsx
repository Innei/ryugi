// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import type { BoardThread } from '../src/shared/board-comments';
import { CommentsPanel } from '../src/viewer/comments/CommentsPanel';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, props: () => ({}) }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));

let root: Root | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const thread = (id: string, fields: Partial<BoardThread> = {}): BoardThread => ({
  id,
  anchor: { page: 'p', board: 'after', x: 1, y: 1, nodes: [{ board: 'after', path: 'body > img' }], offset: { x: 0.91, y: 0.45 } },
  status: 'open',
  statusAt: '2026-10-22T10:00:00.000Z',
  messages: [{ id: `${id}-m`, author: 'human', name: 'Innei', text: `${id} 开关离右边多了 18px`, at: '2026-10-22T10:00:00.000Z' }],
  ...fields,
});

const threads = [
  thread('t1', { messages: [{ id: 'a', author: 'human', name: 'Innei', text: 't1 开关', at: '2026-10-22T10:00:00.000Z' }, { id: 'b', author: 'agent', name: 'Codex', text: '改了', at: '2026-10-22T10:05:00.000Z' }] }),
  thread('t2', { anchor: { page: 'p', x: -40, y: 1200 } }),
  thread('t3', { status: 'resolved' }),
  thread('t4', { anchor: { page: 'other', x: 0, y: 0 } }),
];

async function render(props: Partial<Parameters<typeof CommentsPanel>[0]> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const all = {
    threads,
    page: 'p',
    stale: new Set(['t1']),
    numbers: new Map([['t1', 1], ['t2', 2], ['t3', 3], ['t4', 4]]),
    openId: null,
    tab: 'open' as const,
    onTab: vi.fn(),
    onOpen: vi.fn(),
    onClose: vi.fn(),
    ...props,
  };
  await act(async () => root!.render(createElement(CommentsPanel, all)));
  return { host, props: all };
}

const rows = (host: HTMLElement) => [...host.querySelectorAll('[data-thread]')].map((row) => row.getAttribute('data-thread'));

test('Open lists the open threads on this page with their count', async () => {
  const { host } = await render();
  expect(rows(host)).toEqual(['t1', 't2']);
  expect(host.textContent).toContain('Comments');
  expect(host.textContent).toContain('Open 2');
  expect(host.textContent).toContain('All 3');
});

test('All adds the resolved ones', async () => {
  const { host } = await render({ tab: 'all' });
  expect(rows(host)).toEqual(['t1', 't2', 't3']);
});

test('a row shows where it is, the first message, the reply count, and a stale anchor', async () => {
  const { host } = await render();
  const first = host.querySelector('[data-thread="t1"]')!;
  expect(first.textContent).toContain('after · body > img · 91%, 45%');
  expect(first.textContent).toContain('Anchor no longer matches');
  expect(first.textContent).toContain('t1 开关');
  expect(first.textContent).toContain('1 reply');
  expect(host.querySelector('[data-thread="t2"]')!.textContent).toContain('Page p');
});

test('clicking a row opens that thread, and the tabs and close report back', async () => {
  const { host, props } = await render();
  await act(async () => host.querySelector<HTMLElement>('[data-thread="t2"]')!.click());
  expect(props.onOpen).toHaveBeenCalledWith('t2');
  await act(async () => [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith('All'))!.click());
  expect(props.onTab).toHaveBeenCalledWith('all');
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Close comments"]')!.click());
  expect(props.onClose).toHaveBeenCalled();
});

test('an empty page says how to add one', async () => {
  const { host } = await render({ threads: [] });
  expect(host.textContent).toContain('Click anywhere on the canvas to add a comment');
});
