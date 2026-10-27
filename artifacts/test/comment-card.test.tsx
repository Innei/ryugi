// @vitest-environment happy-dom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import type { Thread } from '../src/shared/comments';
import { CommentCard, type ThreadActions } from '../src/viewer/document/CommentCard';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  props: () => ({}),
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({
  cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
}));

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const reduceMotion = (reduce: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce') }));

beforeEach(() => reduceMotion(true));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const thread: Thread = {
  id: 't1',
  anchor: { blockId: 'b1', quote: '按事件粒度推送' },
  status: 'open',
  statusAt: '2026-10-20T10:00:00.000Z',
  messages: [
    {
      id: 'm1',
      author: 'human',
      name: 'innei',
      text: '离线怎么办？',
      at: '2026-10-20T10:00:00.000Z',
    },
  ],
};

const actions: ThreadActions = {
  reply: vi.fn(),
  edit: vi.fn(),
  remove: vi.fn(),
  resolve: vi.fn(),
  reopen: vi.fn(),
};

function Harness() {
  const [active, setActive] = useState(false);
  return createElement(CommentCard, { thread, active, actions, onActivate: () => setActive(true) });
}

async function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(Harness)));
  return host;
}

const textOf = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll('div')].find((el) => el.textContent === text)!;

test('clicking the card opens the reply box with the cursor in it', async () => {
  const host = await mount();
  await act(async () => textOf(host, '离线怎么办？').click());
  const reply = host.querySelector<HTMLTextAreaElement>('textarea[placeholder="Reply…"]');
  expect(reply).not.toBeNull();
  expect(document.activeElement).toBe(reply);
});

test('clicking Edit focuses the edit box, not the reply box', async () => {
  const host = await mount();
  const edit = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Edit')!;
  await act(async () => edit.click());
  const focused = document.activeElement as HTMLTextAreaElement;
  expect(focused.tagName).toBe('TEXTAREA');
  expect(focused.value).toBe('离线怎么办？');
});

async function renderCard(
  props: { thread?: Thread; active?: boolean; agent?: string },
  onActivate = () => {},
) {
  if (!root) {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () =>
    root!.render(
      createElement(CommentCard, {
        thread: props.thread ?? thread,
        active: props.active ?? false,
        agent: props.agent,
        actions,
        onActivate,
      }),
    ),
  );
  return document.body;
}

const buttonOf = (host: HTMLElement, title: string) =>
  host.querySelector<HTMLButtonElement>(`button[title="${title}"]`)!;

test('waiting for a reply names the detected agent in the badge and tooltip', async () => {
  const host = await renderCard({ agent: 'Codex' });
  expect(host.textContent).toContain('Waiting on Codex');
  expect(host.querySelector('[title="Codex reads this next turn"]')).not.toBeNull();
  await renderCard({});
  expect(host.textContent).toContain('Waiting on Agent');
});

test('leaving the card closes the reply box', async () => {
  const host = await renderCard({ active: true });
  expect(host.querySelector('textarea[placeholder="Reply…"]')).not.toBeNull();
  await renderCard({ active: false });
  expect(host.querySelector('textarea[placeholder="Reply…"]')).toBeNull();
});

test('✓ resolves the thread and folds the card to its resolved row right away', async () => {
  const host = await renderCard({ active: true });
  await act(async () => buttonOf(host, 'Mark as resolved').click());
  expect(actions.resolve).toHaveBeenCalledWith('t1');
  expect(host.textContent).toContain('Resolved');
  expect(host.textContent).not.toContain('离线怎么办？');
});

test('a resolved thread unfolds on click and stays unfolded while it reopens', async () => {
  const resolved = { ...thread, status: 'resolved' as const };
  const host = await renderCard({ thread: resolved });
  const row = [...host.querySelectorAll('div')]
    .filter((el) => el.textContent?.trim().startsWith('Resolved'))
    .at(-1)!;
  await act(async () => row.click());
  expect(host.textContent).toContain('离线怎么办？');
  await act(async () => buttonOf(host, 'Reopen').click());
  expect(actions.reopen).toHaveBeenCalledWith('t1');
  expect(host.textContent).toContain('离线怎么办？');
});

test('the reply box opens on the soft spring', async () => {
  reduceMotion(false);
  const animate = vi.spyOn(HTMLElement.prototype, 'animate');
  await renderCard({ active: false });
  await renderCard({ active: true });
  const easings = animate.mock.calls.map(([, options]) =>
    typeof options === 'object' ? options.easing : undefined,
  );
  expect(easings.some((easing) => easing?.startsWith('linear('))).toBe(true);
});

test('resolve, reopen and the resolved row use icons, not text glyphs', async () => {
  const host = await renderCard({ active: true });
  expect(buttonOf(host, 'Mark as resolved').querySelector('svg')).not.toBeNull();
  expect(buttonOf(host, 'Mark as resolved').textContent).toBe('');
  await renderCard({ thread: { ...thread, status: 'resolved' } });
  expect(host.textContent).not.toContain('✓');
  const row = [...host.querySelectorAll('div')]
    .filter((el) => el.textContent?.trim().startsWith('Resolved'))
    .at(-1)!;
  expect(row.querySelector('svg')).not.toBeNull();
  await act(async () => row.click());
  expect(buttonOf(host, 'Reopen').querySelector('svg')).not.toBeNull();
  expect(buttonOf(host, 'Reopen').textContent).toBe('');
});

test('unfolding a resolved thread also makes it the active one', async () => {
  const onActivate = vi.fn();
  const host = await renderCard({ thread: { ...thread, status: 'resolved' } }, onActivate);
  const row = [...host.querySelectorAll('div')]
    .filter((el) => el.textContent?.trim().startsWith('Resolved'))
    .at(-1)!;
  await act(async () => row.click());
  expect(onActivate).toHaveBeenCalled();
});

async function renderReadOnly(props: { thread?: Thread; active?: boolean }, onActivate = vi.fn()) {
  if (!root) {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () =>
    root!.render(
      createElement(CommentCard, {
        thread: props.thread ?? thread,
        active: props.active ?? false,
        onActivate,
      }),
    ),
  );
  return { host: document.body, onActivate };
}

test('without actions the card is read-only: no reply box, buttons or waiting badges', async () => {
  const { host, onActivate } = await renderReadOnly({ active: true });
  expect(host.textContent).toContain('离线怎么办？');
  expect(host.querySelector('textarea')).toBeNull();
  expect(host.querySelectorAll('button')).toHaveLength(0);
  expect(host.textContent).not.toContain('Waiting on ');
  expect(host.textContent).not.toContain('Waiting on you');
  await act(async () => textOf(host, '离线怎么办？').click());
  expect(onActivate).toHaveBeenCalled();
});

test('a read-only resolved thread still folds and unfolds', async () => {
  const { host } = await renderReadOnly({ thread: { ...thread, status: 'resolved' } });
  expect(host.textContent).not.toContain('离线怎么办？');
  const row = [...host.querySelectorAll('div')]
    .filter((el) => el.textContent?.trim().startsWith('Resolved'))
    .at(-1)!;
  await act(async () => row.click());
  expect(host.textContent).toContain('离线怎么办？');
  expect(host.querySelectorAll('button')).toHaveLength(0);
});

test('a reply that did not reach the computer comes back into the box with a note', async () => {
  let settle: (ok: boolean) => void = () => {};
  const failing: ThreadActions = {
    ...actions,
    reply: () => new Promise<boolean>((resolve) => (settle = resolve)),
  };
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      createElement(CommentCard, { thread, active: true, actions: failing, onActivate: () => {} }),
    ),
  );
  const reply = host.querySelector<HTMLTextAreaElement>('textarea[placeholder="Reply…"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      reply,
      '先这样',
    );
    reply.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    host.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!.click(),
  );
  expect(reply.value).toBe('');
  await act(async () => settle(false));
  expect(reply.value).toBe('先这样');
  expect(host.textContent).toContain('Not sent');
});
