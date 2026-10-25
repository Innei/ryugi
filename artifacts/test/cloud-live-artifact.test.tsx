// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true } }
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { CloudLiveArtifact } from '../src/viewer/layouts/CloudLiveLayout';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, props: () => ({}), defineConsts: (value: unknown) => value, defineVars: (value: unknown) => value }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));
vi.mock('../src/viewer/layouts/ArtboardView', () => ({
  ArtboardView: (props: { contentBase: string; canvas: { title?: string } | null; artifact: string | null; actions?: unknown; live?: boolean }) =>
    createElement('div', {
      'data-view': 'artboard',
      'data-base': props.contentBase,
      'data-title': props.canvas?.title ?? 'none',
      'data-artifact': props.artifact ?? 'none',
      'data-menu': String(props.actions !== undefined),
      'data-live': String(props.live),
    }),
}));

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: any[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }
  send(text: string) {
    this.sent.push(JSON.parse(text));
  }
  close() {
    this.readyState = 3;
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const LIVE = 'https://content.example/c1/live/9999999999.owner.sig/';
const PUBLISHED = 'https://content.example/c1/3/1.owner.sig/';
let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  FakeSocket.all = [];
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function mount(artifact: Record<string, unknown>) {
  vi.stubGlobal('WebSocket', FakeSocket);
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(CloudLiveArtifact, { id: 'c1', artifact: { owner: true, liveContentBase: LIVE, ...artifact } as never })));
  const relay = () => FakeSocket.all.find((s) => s.url.includes('/api/relay/a/c1'))!;
  const presence = (online: boolean) => act(async () => relay().receive({ t: 'presence', online, version: '1.14.0' }));
  const answerMeta = async (data: unknown) => {
    const request = [...relay().sent].reverse().find((m) => m.body?.op === 'meta');
    await act(async () => relay().receive({ t: 'reply', rid: request.rid, body: { ok: true, data } }));
  };
  return { host, relay, presence, answerMeta };
}

test('html from the owner computer loads through the live content base while it is online', async () => {
  const { host, presence, answerMeta } = await mount({ type: 'html', title: 'Page', published: true, contentBase: PUBLISHED, payload: { title: 'Page' } });
  await presence(true);
  await answerMeta({ title: 'Page', warnings: [], version: 7, contentBase: '/c/token/html/page/' });
  expect(host.querySelector('iframe')!.getAttribute('src')).toBe(`${LIVE}index.html?v=7`);
});

test('publication status and owner retry use the existing live connection and reject foreign commands', async () => {
  const { relay, presence } = await mount({ type: 'html', title: 'Page', published: false, contentBase: null, payload: null });
  await presence(true);
  expect(relay().sent.some((m) => m.body?.op === 'publication')).toBe(true);
  const command = async (id: string, origin: string) => act(async () => window.dispatchEvent(new MessageEvent('message', { source: window.parent, origin, data: { type: 'ryugi:publish', id } })));
  await command('c1', 'https://untrusted.example');
  await command('other', location.origin);
  expect(relay().sent.some((m) => m.body?.op === 'publish')).toBe(false);
  await command('c1', location.origin);
  expect(relay().sent.filter((m) => m.body?.op === 'publish')).toHaveLength(1);
  expect(FakeSocket.all).toHaveLength(1);
});

test('a change from the computer fetches the html again', async () => {
  const { relay, presence, answerMeta } = await mount({ type: 'html', title: 'Page', published: true, contentBase: PUBLISHED, payload: { title: 'Page' } });
  await presence(true);
  await answerMeta({ title: 'Page', warnings: [], version: 7, contentBase: '/c/token/html/page/' });
  const before = relay().sent.filter((m) => m.body?.op === 'meta').length;
  await act(async () => relay().receive({ t: 'event', body: { type: 'change', artifact: 'html/page', files: ['index.html'] } }));
  expect(relay().sent.filter((m) => m.body?.op === 'meta').length).toBe(before + 1);
});

test('while the computer is offline the published copy shows', async () => {
  const { host, presence } = await mount({ type: 'html', title: 'Page', published: true, contentBase: PUBLISHED, payload: { title: 'Page' } });
  await presence(false);
  expect(host.querySelector('iframe')!.getAttribute('src')).toBe(`${PUBLISHED}index.html`);
});

test('an artifact never published says so while the computer is offline', async () => {
  const { host, presence } = await mount({ type: 'artboard', title: null, published: false, contentBase: null, payload: null });
  await presence(false);
  expect(host.textContent).toContain('Not published yet');
});

test('an artboard renders live with selection but without the publish menu', async () => {
  const { host, presence, answerMeta } = await mount({ type: 'artboard', title: null, published: false, contentBase: null, payload: null });
  await presence(true);
  await answerMeta({ canvas: { title: 'Board', boards: [] }, layout: null, versions: {}, warnings: [], pending: [], contentBase: 'http://127.0.0.1:4100/c/token/artboard/board/' });
  const view = host.querySelector<HTMLElement>('[data-view="artboard"]')!.dataset;
  expect(view).toMatchObject({ title: 'Board', base: 'http://127.0.0.1:4100/c/token/artboard/board/', artifact: 'artboard/c1', menu: 'false', live: 'true' });
});

test('when the computer goes offline after being live, the published copy comes back', async () => {
  const { host, presence, answerMeta } = await mount({ type: 'html', title: 'Page', published: true, contentBase: PUBLISHED, payload: { title: 'Page' } });
  await presence(true);
  await answerMeta({ title: 'Page', warnings: [], version: 7, contentBase: '/c/token/html/page/' });
  await presence(false);
  expect(host.querySelector('iframe')!.getAttribute('src')).toBe(`${PUBLISHED}index.html`);
});

test('a live content grant about to expire is renewed before the frame reloads', async () => {
  const fresh = 'https://content.example/c1/live/9999999999.owner.renewed/';
  const fetched: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    fetched.push(url);
    return Response.json({ owner: true, liveContentBase: fresh });
  });
  const stale = `https://content.example/c1/live/${Math.floor(Date.now() / 1000) + 60}.owner.old/`;
  const { host, presence, answerMeta } = await mount({ type: 'html', title: 'Page', published: true, contentBase: PUBLISHED, payload: { title: 'Page' }, liveContentBase: stale });
  await presence(true);
  await answerMeta({ title: 'Page', warnings: [], version: 8, contentBase: '/c/token/html/page/' });
  await act(async () => {});
  expect(fetched).toEqual(['/api/a/c1']);
  expect(host.querySelector('iframe')!.getAttribute('src')).toBe(`${fresh}index.html?v=8`);
});
