// @vitest-environment happy-dom
// @vitest-environment-options {"happyDOM":{"settings":{"disableIframePageLoading":true}}}
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { EmbeddedCanvas } from '../src/viewer/components/EmbeddedCanvas';
import { EMBED_LOST_MS } from '../src/viewer/lib/embed-bridge';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  props: () => ({}),
}));

const SRC = 'http://localhost:4100/embed/artboard/AbCdEfGhIjKlMnOpQrStU';
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

function render(onLost = vi.fn(), onReady = vi.fn()) {
  act(() =>
    root.render(createElement(EmbeddedCanvas, { src: SRC, title: 'Ideas', onLost, onReady })),
  );
  return { onLost, onReady, frame: host.querySelector('iframe')! };
}

test('the local canvas fills one frame that may reach the local network', () => {
  const { frame } = render();
  expect(frame.getAttribute('src')).toBe(SRC);
  expect(frame.getAttribute('title')).toBe('Ideas');
  expect(frame.getAttribute('allow')).toContain('local-network-access');
  expect(frame.hasAttribute('sandbox')).toBe(false);
});

test('a frame that never says hello is reported lost', () => {
  const { onLost } = render();
  act(() => vi.advanceTimersByTime(EMBED_LOST_MS + 100));
  expect(onLost).toHaveBeenCalledTimes(1);
});

test('the hello from the frame at the local origin makes it ready', () => {
  const { onReady, onLost, frame } = render();
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'ryugi:embed:hello' },
        origin: 'http://localhost:4100',
        source: frame.contentWindow,
      }),
    );
  });
  expect(onReady).toHaveBeenCalledTimes(1);
  expect(onLost).not.toHaveBeenCalled();
});

test('an unmounted frame is never reported lost', () => {
  const { onLost } = render();
  act(() => root.unmount());
  root = createRoot(host);
  vi.advanceTimersByTime(EMBED_LOST_MS * 2);
  expect(onLost).not.toHaveBeenCalled();
});
