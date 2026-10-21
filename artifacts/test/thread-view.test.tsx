// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import type { Thread } from '../src/shared/comments';
import { ThreadView, type ThreadActions } from '../src/viewer/comments/ThreadView';

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
  vi.clearAllMocks();
});

const thread: Thread<{ page: string }> = {
  id: 't1',
  anchor: { page: 'p' },
  status: 'open',
  statusAt: '2026-10-22T10:00:00.000Z',
  messages: [
    { id: 'm1', author: 'human', name: 'innei', text: '开关离右边多了 18px', at: '2026-10-22T10:00:00.000Z' },
    { id: 'm2', author: 'agent', name: 'Codex', text: '去掉了多出来的 margin', at: '2026-10-22T10:05:00.000Z' },
  ],
};

const actions: ThreadActions = { reply: vi.fn(), edit: vi.fn(), remove: vi.fn(), resolve: vi.fn(), reopen: vi.fn() };

async function render(props: Partial<Parameters<typeof ThreadView>[0]> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(ThreadView, { thread, actions, label: 'notify-after · 91%, 45%', agent: 'Codex', ...props })));
  return host;
}

const button = (host: HTMLElement, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === text || b.title === text)!;

test('shows the anchor label, every message and who it waits on', async () => {
  const host = await render();
  expect(host.textContent).toContain('notify-after · 91%, 45%');
  expect(host.textContent).toContain('开关离右边多了 18px');
  expect(host.textContent).toContain('去掉了多出来的 margin');
  expect(host.textContent).toContain('等你回复');
});

test('only human messages can be edited or deleted', async () => {
  const host = await render();
  expect([...host.querySelectorAll('button')].filter((b) => b.textContent === '删除')).toHaveLength(1);
  await act(async () => button(host, '删除').click());
  expect(actions.remove).toHaveBeenCalledWith('t1', 'm1');
});

test('the reply box sends with ⌘↵', async () => {
  const host = await render();
  const reply = host.querySelector<HTMLTextAreaElement>('textarea[placeholder="回复…"]')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(reply, '再往左一点');
    reply.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => reply.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true })));
  expect(actions.reply).toHaveBeenCalledWith('t1', '再往左一点');
});

test('resolve and reopen follow the thread status, and a resolved thread takes no reply', async () => {
  const host = await render();
  await act(async () => button(host, '标为已解决').click());
  expect(actions.resolve).toHaveBeenCalledWith('t1');
  const resolved = await render({ thread: { ...thread, status: 'resolved' } });
  expect(resolved.querySelector('textarea[placeholder="回复…"]')).toBeNull();
  await act(async () => button(resolved, '重新打开').click());
  expect(actions.reopen).toHaveBeenCalledWith('t1');
});

test('without actions the thread is read-only', async () => {
  const host = await render({ actions: undefined });
  expect(host.querySelector('textarea')).toBeNull();
  expect(host.querySelectorAll('button')).toHaveLength(0);
});

test('close is offered when the caller can close it', async () => {
  const onClose = vi.fn();
  const host = await render({ onClose });
  await act(async () => button(host, '关闭').click());
  expect(onClose).toHaveBeenCalled();
});
