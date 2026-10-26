// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { BoardSpec } from '../src/shared/types';
import { useBoardTiers } from '../src/viewer/hooks/useBoardTiers';
import type { BoardRender } from '../src/viewer/lib/board-tiers';
import { createSnapshotStore, snapshotKey, type SnapshotEntry } from '../src/viewer/lib/snapshot-store';

type Params = Parameters<typeof useBoardTiers>[0];
let root: Root;
let result: ReturnType<typeof useBoardTiers>;
let saved: Map<string, SnapshotEntry>;
let store: ReturnType<typeof createSnapshotStore>;

const boards: [string, BoardSpec][] = [
  ['a', { file: 'pages/p/a.html', page: 'p', title: 'First', x: 0, y: 0, w: 400, h: 300 }],
  ['b', { file: 'pages/p/b.html', page: 'p', title: 'Second', x: 450, y: 0, w: 400, h: 300 }],
];
const base: Params = {
  artifact: 'artboard/ideas', boards, versions: { 'pages/p/a.html': 1, 'pages/p/b.html': 1 }, pending: new Set(),
  view: { x: 0, y: 0, k: 1 }, scaling: false, viewport: { width: 1000, height: 800 }, pinned: new Set(), hovered: null, hoverPromotes: false,
  persistable: () => true, store: undefined as never,
};
let params: Params;

function Harness() {
  result = useBoardTiers(params);
  return null;
}

const render = async (patch: Partial<Params> = {}) => {
  params = { ...params, ...patch };
  await act(async () => root.render(createElement(Harness)));
};
const state = (id: string): BoardRender => result.renders.get(id)!;
const key = (id: 'a' | 'b') => snapshotKey({ artifact: 'artboard/ideas', file: `pages/p/${id}.html`, version: 1, scheme: 'light', w: 400, h: 300 });

function frame(id: string) {
  const window_ = { postMessage: vi.fn() };
  act(() => result.frameRef(id)({ contentWindow: window_ } as unknown as HTMLIFrameElement));
  const post = async (data: Record<string, unknown>) => {
    await act(async () => { window.dispatchEvent(new MessageEvent('message', { source: window_ as unknown as Window, data })); });
  };
  return { posted: window_.postMessage, post };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('devicePixelRatio', 2);
  vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: false }));
  saved = new Map();
  store = createSnapshotStore({
    persistence: { get: async (k) => saved.get(k), put: async (k, v) => { saved.set(k, v); } },
    resize: async (blob) => blob,
    createUrl: (blob) => `blob:${(blob as Blob & { label?: string }).label ?? 'x'}`,
    revokeUrl: () => {},
  });
  params = { ...base, store };
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const blob = (label: string) => Object.assign(new Blob([label], { type: 'image/png' }), { label });

test('a board that reports ready is captured at the pixel ratio and its snapshot is kept for later', async () => {
  await render();
  expect(state('a')).toMatchObject({ tier: 'live', mounted: true, overlay: true });
  expect(state('a').image).toMatch(/^data:image\/svg\+xml/);
  const a = frame('a');
  await a.post({ type: 'ryugi:board:ready' });
  expect(a.posted).toHaveBeenCalledWith({ type: 'ryugi:board:capture', request: expect.any(Number), scale: 2 }, '*');
  const { request } = a.posted.mock.calls[0]![0] as { request: number };
  await a.post({ type: 'ryugi:board:snapshot', request, blob: blob('shot-a'), width: 400, height: 300 });
  expect(saved.has(key('a'))).toBe(true);
  expect(state('a')).toMatchObject({ mounted: true, overlay: false, hidden: false });
});

test('while zooming, a ready board with a snapshot hides its frame under the snapshot', async () => {
  await render();
  const a = frame('a');
  await a.post({ type: 'ryugi:board:ready' });
  const { request } = a.posted.mock.calls[0]![0] as { request: number };
  await a.post({ type: 'ryugi:board:snapshot', request, blob: blob('shot-a'), width: 400, height: 300 });
  await render({ scaling: true, view: { x: 0, y: 0, k: 1.1 } });
  await act(async () => {});
  expect(state('a')).toMatchObject({ mounted: true, overlay: true, hidden: true, image: 'blob:shot-a' });
});

test('a capture with no answer within 3 s marks the board unsupported and it is not asked again', async () => {
  vi.useFakeTimers();
  await render();
  const a = frame('a');
  await a.post({ type: 'ryugi:board:ready' });
  await act(async () => { vi.advanceTimersByTime(3000); });
  expect(store.isUnsupported(key('a'))).toBe(true);
  await a.post({ type: 'ryugi:board:changed' });
  expect(a.posted).toHaveBeenCalledTimes(1);
});

test('one capture runs at a time, and a change while zooming waits until the zoom ends', async () => {
  await render();
  const a = frame('a');
  const b = frame('b');
  await a.post({ type: 'ryugi:board:ready' });
  await b.post({ type: 'ryugi:board:ready' });
  expect(b.posted).not.toHaveBeenCalled();
  const first = (a.posted.mock.calls[0]![0] as { request: number }).request;
  await a.post({ type: 'ryugi:board:snapshot', request: first, error: 'unsupported: video' });
  expect(store.isUnsupported(key('a'))).toBe(true);
  expect(b.posted).toHaveBeenCalledTimes(1);
  const second = (b.posted.mock.calls[0]![0] as { request: number }).request;
  await b.post({ type: 'ryugi:board:snapshot', request: second, blob: blob('shot-b'), width: 400, height: 300 });
  await render({ scaling: true, view: { x: 0, y: 0, k: 1.1 } });
  await b.post({ type: 'ryugi:board:changed' });
  expect(b.posted).toHaveBeenCalledTimes(1);
  await render({ scaling: false });
  expect(b.posted).toHaveBeenCalledTimes(2);
});

test('a capture taken with tweaks applied stays in memory only', async () => {
  await render({ persistable: (id) => id !== 'a' });
  const a = frame('a');
  await a.post({ type: 'ryugi:board:ready' });
  const { request } = a.posted.mock.calls[0]![0] as { request: number };
  await a.post({ type: 'ryugi:board:snapshot', request, blob: blob('tweaked'), width: 400, height: 300 });
  expect(store.has(key('a'))).toBe(true);
  expect(saved.has(key('a'))).toBe(false);
});

test('at an overview zoom boards without snapshots show their placeholder and far boards show nothing', async () => {
  await render({ view: { x: 0, y: 0, k: 0.1 }, boards: [...boards, ['far', { file: 'pages/p/far.html', page: 'p', x: 90000, y: 0, w: 400, h: 300 }]], versions: { ...base.versions, 'pages/p/far.html': 1 } });
  expect(state('a')).toMatchObject({ tier: 'placeholder', mounted: false });
  expect(decodeURIComponent(state('a').image!)).toContain('First');
  expect(state('far')).toMatchObject({ tier: 'empty', mounted: false, image: null });
});

const shot = { blob: blob('shot-a'), width: 400, height: 300, scale: 2 };

test('a snapshot that fails to load is asked for once more, and a fresh URL replaces it', async () => {
  let calls = 0;
  const url = vi.fn(async () => (++calls === 1 ? 'blob:old' : 'blob:new'));
  await store.put(key('a'), shot, { persist: false });
  await render({ store: { ...store, url }, view: { x: 0, y: 0, k: 0.3 } });
  await act(async () => {});
  expect(state('a')).toMatchObject({ tier: 'snapshot', image: 'blob:old' });
  await act(async () => result.imageFailed('a', 'blob:old'));
  await act(async () => {});
  expect(state('a').image).toBe('blob:new');
});

test('a snapshot whose URL keeps failing falls back to the placeholder card', async () => {
  const url = vi.fn(async () => 'blob:broken');
  await store.put(key('a'), shot, { persist: false });
  await render({ store: { ...store, url }, view: { x: 0, y: 0, k: 0.3 } });
  await act(async () => {});
  await act(async () => result.imageFailed('a', 'blob:broken'));
  await act(async () => {});
  expect(state('a').image).toMatch(/^data:image\/svg\+xml/);
  expect(url).toHaveBeenCalledTimes(2);
});

test('a recapture of a board replaces the snapshot its overlay shows', async () => {
  await render();
  const a = frame('a');
  await a.post({ type: 'ryugi:board:ready' });
  await a.post({ type: 'ryugi:board:snapshot', request: (a.posted.mock.calls[0]![0] as { request: number }).request, blob: blob('shot1'), width: 400, height: 300 });
  await a.post({ type: 'ryugi:board:changed' });
  await a.post({ type: 'ryugi:board:snapshot', request: (a.posted.mock.calls[1]![0] as { request: number }).request, blob: blob('shot2'), width: 400, height: 300 });
  await act(async () => {});
  await render({ scaling: true, view: { x: 0, y: 0, k: 1.1 } });
  await act(async () => {});
  expect(state('a')).toMatchObject({ overlay: true, image: 'blob:shot2' });
});

test('a board whose frame unmounts during its capture is not marked unsupported, and the next board is captured', async () => {
  vi.useFakeTimers();
  await render();
  const a = frame('a');
  const b = frame('b');
  await a.post({ type: 'ryugi:board:ready' });
  await b.post({ type: 'ryugi:board:ready' });
  act(() => result.frameRef('a')(null));
  expect(b.posted).toHaveBeenCalledTimes(1);
  await act(async () => { vi.advanceTimersByTime(3000); });
  expect(store.isUnsupported(key('a'))).toBe(false);
});

test('at a moderate overview a board without a snapshot is mounted under its placeholder, captured, then released', async () => {
  await render({ view: { x: 0, y: 0, k: 0.35 } });
  expect(state('a')).toMatchObject({ tier: 'placeholder', mounted: true, overlay: true, hidden: true });
  expect(state('a').image).toMatch(/^data:image\/svg\+xml/);
  const a = frame('a');
  await a.post({ type: 'ryugi:board:ready' });
  const { request } = a.posted.mock.calls[0]![0] as { request: number };
  await a.post({ type: 'ryugi:board:snapshot', request, blob: blob('warm-a'), width: 400, height: 300 });
  await act(async () => {});
  expect(state('a')).toMatchObject({ tier: 'snapshot', mounted: false, image: 'blob:warm-a' });
});

test('at an extreme overview boards are never mounted just to capture them', async () => {
  await render({ view: { x: 0, y: 0, k: 0.25 } });
  expect(state('a')).toMatchObject({ tier: 'placeholder', mounted: false });
});
