// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { editableAcross } from '../src/viewer/document/cloudLive';
import CloudLiveDocument from '../src/viewer/document/CloudLiveDocument';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, props: () => ({}), defineConsts: (value: unknown) => value, defineVars: (value: unknown) => value }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));
vi.mock('../src/viewer/document/CloudDocument', () => ({
  default: (props: { offline?: boolean }) => createElement('div', { 'data-view': 'snapshot', 'data-offline': String(Boolean(props.offline)) }),
}));
vi.mock('../src/viewer/document/DocumentPage', () => ({
  DocumentView: (props: { transport: { artifact: string }; cloud: { online: boolean; canEdit: boolean; reason: string | null } }) =>
    createElement('div', {
      'data-view': 'live',
      'data-artifact': props.transport.artifact,
      'data-online': String(props.cloud.online),
      'data-edit': String(props.cloud.canEdit),
      'data-reason': props.cloud.reason ?? 'none',
    }),
}));
vi.mock('../src/viewer/lib/version', () => ({ VIEWER_VERSION: '1.13.2' }));

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send() {}
  close() {
    this.readyState = 3;
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

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

async function mount() {
  vi.stubGlobal('WebSocket', FakeSocket);
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(createElement(CloudLiveDocument, { id: 'c1', state: { root: {} } as never, contentBase: '/content/c1/' })),
  );
  const view = () => host.querySelector<HTMLElement>('[data-view]')!.dataset;
  const presence = (online: boolean, version: string | null) =>
    act(async () => FakeSocket.all.at(-1)!.receive({ t: 'presence', online, version }));
  return { view, presence };
}

test('text editing needs the same major.minor on both sides', () => {
  expect(editableAcross('1.13.2', '1.13.0')).toBe(true);
  expect(editableAcross('1.13.2', '1.14.0')).toBe(false);
  expect(editableAcross('1.13.2', '2.13.2')).toBe(false);
  expect(editableAcross('1.13.2', 'local')).toBe(false);
  expect(editableAcross('1.13.2', null)).toBe(false);
});

test('the snapshot shows until the computer is online, then the live document takes over', async () => {
  const { view, presence } = await mount();
  expect(FakeSocket.all[0]!.url).toMatch(/\/api\/relay\/a\/c1$/);
  expect(view().view).toBe('snapshot');
  await presence(false, null);
  expect(view()).toMatchObject({ view: 'snapshot', offline: 'true' });
  await presence(true, '1.13.0');
  expect(view()).toMatchObject({ view: 'live', artifact: 'document/c1', online: 'true', edit: 'true', reason: 'none' });
});

test('a different host version keeps comments but not text editing', async () => {
  const { view, presence } = await mount();
  await presence(true, '1.12.3');
  expect(view()).toMatchObject({ view: 'live', online: 'true', edit: 'false' });
  expect(view().reason).toContain('1.12.3');
});

test('dropping offline keeps the live document, read-only', async () => {
  const { view, presence } = await mount();
  await presence(true, '1.13.0');
  await presence(false, null);
  expect(view()).toMatchObject({ view: 'live', online: 'false', edit: 'false' });
});
