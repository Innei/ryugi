// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { BoardThread } from '../src/shared/board-comments';
import { CommentLayer } from '../src/viewer/components/CommentLayer';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  props: () => ({}),
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({
  cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
}));

const thread: BoardThread = {
  id: 'one',
  anchor: { page: 'p', x: 880, y: 732 },
  status: 'open',
  statusAt: '2026-10-30T07:15:00Z',
  messages: [
    { id: 'm', author: 'human', at: '2026-10-30T07:15:00Z', text: 'Which UI components?' },
  ],
};
let root: Root;
let host: HTMLDivElement;
let measuredHeight: number;
let resize: () => void;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  measuredHeight = 377;
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => measuredHeight);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = () => callback([], this as unknown as ResizeObserver);
      }
      observe() {}
      disconnect() {}
    },
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render({ height = 800, width = 928, y = 0, draft = false } = {}) {
  await act(async () =>
    root.render(
      <CommentLayer
        actions={{ edit() {}, remove() {}, reopen() {}, resolve() {}, reply() {} }}
        boards={{}}
        draft={draft ? thread.anchor : null}
        height={height}
        numbers={new Map([['one', 1]])}
        openId={draft ? null : 'one'}
        page="p"
        showResolved={false}
        stale={new Set()}
        threads={[thread]}
        view={{ x: 0, y, k: 1 }}
        width={width}
        onCancelDraft={() => {}}
        onOpen={() => {}}
        onSubmit={async () => true}
      />,
    ),
  );
  return host.querySelector<HTMLElement>('[data-chrome="comments"] > div')!;
}

test('a thread near the bottom stays inside the canvas instead of being clipped by its layer', async () => {
  const popup = await render();
  expect(popup.style.top).toBe('411px');
  expect(popup.style.left).toBe('566px');
  expect(Number.parseFloat(popup.style.top) + measuredHeight).toBeLessThanOrEqual(788);
  expect(popup.querySelector('textarea')).not.toBeNull();
});

test('a short canvas limits the scrollable thread to its own height, including after a resize', async () => {
  await render();
  const popup = await render({ height: 360, width: 280 });
  expect(popup.style.top).toBe('64px');
  expect(popup.style.maxHeight).toBe('284px');
  expect(popup.style.width).toBe('256px');
  expect(popup.style.left).toBe('12px');
});

test('new replies can grow a thread without pushing its bottom out of the canvas', async () => {
  measuredHeight = 100;
  const popup = await render();
  expect(popup.style.top).toBe('688px');
  measuredHeight = 377;
  await act(async () => resize());
  expect(popup.style.top).toBe('411px');
});

test('panning a draft above the viewport keeps its composer and close action reachable', async () => {
  const popup = await render({ y: -900, draft: true });
  expect(popup.style.top).toBe('64px');
  expect(popup.querySelector('textarea')).not.toBeNull();
});
