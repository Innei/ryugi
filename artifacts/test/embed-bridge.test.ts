import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import {
  createEmbedChild,
  createEmbedHost,
  EMBED_HEARTBEAT_MS,
  EMBED_LOST_MS,
  startEmbedChild,
} from '../src/viewer/lib/embed-bridge';

const CLOUD = 'https://ryugi.example';
const LOCAL = 'http://127.0.0.1:4100';

type Listener = (event: MessageEvent) => void;

function fakeWindow() {
  const listeners = new Set<Listener>();
  return {
    listeners,
    addEventListener: (_: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
    deliver(data: unknown, source: unknown, origin: string) {
      for (const listener of listeners)
        listener({ data, source, origin } as unknown as MessageEvent);
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('the child greets its parent at the cloud origin and keeps sending heartbeats', () => {
  const posted: [unknown, string][] = [];
  const parent = { postMessage: (data: unknown, origin: string) => posted.push([data, origin]) };
  const win = Object.assign(fakeWindow(), { parent });
  const child = createEmbedChild({ parentOrigin: CLOUD, win: win as never });
  expect(posted).toEqual([[{ type: 'ryugi:embed:hello' }, CLOUD]]);
  vi.advanceTimersByTime(EMBED_HEARTBEAT_MS * 2);
  expect(
    posted.filter(([data]) => (data as { type: string }).type === 'ryugi:embed:heartbeat'),
  ).toHaveLength(2);
  child.close();
  vi.advanceTimersByTime(EMBED_HEARTBEAT_MS * 2);
  expect(posted).toHaveLength(3);
});

function host() {
  const frame = {};
  const win = fakeWindow();
  const onReady = vi.fn();
  const onLost = vi.fn();
  const bridge = createEmbedHost({
    frame: () => frame as Window,
    childOrigin: LOCAL,
    onReady,
    onLost,
    win: win as never,
  });
  return { frame, win, onReady, onLost, bridge };
}

test('the host is ready on the child hello from the right frame and origin only', () => {
  const { frame, win, onReady } = host();
  win.deliver({ type: 'ryugi:embed:hello' }, {}, LOCAL);
  win.deliver({ type: 'ryugi:embed:hello' }, frame, 'https://evil.test');
  expect(onReady).not.toHaveBeenCalled();
  win.deliver({ type: 'ryugi:embed:hello' }, frame, LOCAL);
  expect(onReady).toHaveBeenCalledTimes(1);
});

test('the host reports the embed lost after it goes quiet', () => {
  const { frame, win, onLost } = host();
  win.deliver({ type: 'ryugi:embed:hello' }, frame, LOCAL);
  vi.advanceTimersByTime(EMBED_LOST_MS - 1000);
  win.deliver({ type: 'ryugi:embed:heartbeat' }, frame, LOCAL);
  vi.advanceTimersByTime(EMBED_LOST_MS - 1000);
  expect(onLost).not.toHaveBeenCalled();
  vi.advanceTimersByTime(2000);
  expect(onLost).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(EMBED_LOST_MS * 2);
  expect(onLost).toHaveBeenCalledTimes(1);
});

test('the host reports the embed lost when it never says hello', () => {
  const { onLost } = host();
  vi.advanceTimersByTime(EMBED_LOST_MS + 1000);
  expect(onLost).toHaveBeenCalledTimes(1);
});

test('an embed page greets the parent its server named', () => {
  const posted: [unknown, string][] = [];
  const parent = { postMessage: (data: unknown, origin: string) => posted.push([data, origin]) };
  const win = Object.assign(fakeWindow(), { parent });
  const doc = { documentElement: { dataset: { ryugiEmbedParent: CLOUD } } };
  const child = startEmbedChild(doc as never, win as never);
  expect(posted).toEqual([[{ type: 'ryugi:embed:hello' }, CLOUD]]);
  child?.close();
});

test('a page without an embed parent greets nobody', () => {
  const doc = { documentElement: { dataset: {} } };
  expect(startEmbedChild(doc as never, fakeWindow() as never)).toBeNull();
});

test('closing the host stops listening', () => {
  const { win, bridge, onLost } = host();
  bridge.close();
  expect(win.listeners.size).toBe(0);
  vi.advanceTimersByTime(EMBED_LOST_MS * 2);
  expect(onLost).not.toHaveBeenCalled();
});
