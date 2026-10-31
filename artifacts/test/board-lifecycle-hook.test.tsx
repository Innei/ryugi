// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { BoardSpec } from '../src/shared/types';
import { useBoardLifecycle } from '../src/viewer/hooks/useBoardLifecycle';
import { IDLE_UNLOAD_MS } from '../src/viewer/lib/board-lifecycle';

const boards: [string, BoardSpec][] = [
  ['near', { file: 'pages/near.html', page: 'p', x: 0, y: 0, w: 400, h: 300 }],
  ['far', { file: 'pages/far.html', page: 'p', x: 9000, y: 0, w: 400, h: 300 }],
];
const versions = { 'pages/near.html': 1, 'pages/far.html': 1 };

let root: Root;
let host: HTMLDivElement;
let state: ReturnType<typeof useBoardLifecycle>;
let now = 0;
const posted: { id: string; message: unknown }[] = [];
const frames = new Map<string, { contentWindow: { postMessage: (message: unknown) => void } }>();

function Harness({ active = new Set<string>() }: { active?: ReadonlySet<string> }) {
  state = useBoardLifecycle({
    boards,
    versions,
    pending: new Set(),
    view: { x: 0, y: 0, k: 1 },
    viewport: { width: 1000, height: 800 },
    active,
    gesturing: false,
  });
  return null;
}

function attach(id: string) {
  const frame = {
    contentWindow: { postMessage: (message: unknown) => posted.push({ id, message }) },
  };
  frames.set(id, frame);
  act(() => state.frameRef(id)(frame as unknown as HTMLIFrameElement));
  return frame;
}

const send = (id: string, data: unknown) =>
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', { data, source: frames.get(id)!.contentWindow as never }),
    );
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:far', revokeObjectURL: () => undefined }),
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(createElement(Harness)));
  attach('near');
  attach('far');
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  posted.length = 0;
  frames.clear();
  now = 0;
});

const idle = () => {
  now += IDLE_UNLOAD_MS;
  act(() => vi.advanceTimersByTime(IDLE_UNLOAD_MS));
  act(() => vi.advanceTimersByTime(100));
};

test('starts with every board mounted', () => {
  expect(state.phases.get('near')).toBe('mounted');
  expect(state.phases.get('far')).toBe('mounted');
});

test('asks an idle off-screen board for a capture', () => {
  idle();
  expect(state.phases.get('far')).toBe('capturing');
  expect(posted).toEqual([
    { id: 'far', message: expect.objectContaining({ type: 'ryugi:board:capture' }) },
  ]);
});

test('the capture is asked for only once the board has been laid out for it', () => {
  now += IDLE_UNLOAD_MS;
  act(() => vi.advanceTimersByTime(IDLE_UNLOAD_MS));
  expect(state.phases.get('far')).toBe('capturing');
  expect(posted).toEqual([]);
  act(() => vi.advanceTimersByTime(100));
  expect(posted).toHaveLength(1);
});

test('a returned capture unloads the board and exposes its image', () => {
  idle();
  const { request } = posted[0]!.message as { request: number };
  send('far', {
    type: 'ryugi:board:snapshot',
    request,
    blob: new Blob(['x']),
    width: 400,
    height: 300,
  });
  expect(state.phases.get('far')).toBe('unloaded');
  expect(state.images.get('far')).toBe('blob:far');
});

test('a capture error keeps the board mounted and marks it uncapturable', () => {
  idle();
  const { request } = posted[0]!.message as { request: number };
  send('far', { type: 'ryugi:board:snapshot', request, error: 'unsupported: video' });
  expect(state.phases.get('far')).toBe('mounted');
  expect(state.counts.uncapturable).toBe(1);
});

test('interacting with a board restarts its idle time', () => {
  now += IDLE_UNLOAD_MS - 10;
  act(() => vi.advanceTimersByTime(IDLE_UNLOAD_MS - 10));
  send('far', { type: 'ryugi:board:interacted' });
  now += 20;
  act(() => vi.advanceTimersByTime(20));
  expect(posted).toEqual([]);
});

test('messages from unknown windows are ignored', () => {
  idle();
  const { request } = posted[0]!.message as { request: number };
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'ryugi:board:snapshot', request, blob: new Blob(['x']), width: 1, height: 1 },
        source: {} as never,
      }),
    );
  });
  expect(state.phases.get('far')).toBe('capturing');
});
