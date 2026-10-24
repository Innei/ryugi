// @vitest-environment happy-dom
import { createLoroBinding, TREE_NAME } from '@haklex/rich-collab-loro';
import { allHeadlessNodes } from '@haklex/rich-headless';
import { createHeadlessEditor } from '@lexical/headless';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { LoroDoc } from 'loro-crdt';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import CloudLiveDocument from '../src/viewer/document/CloudLiveDocument';
import { encodeBase64 } from '../src/viewer/document/transport';
import { VIEWER_VERSION } from '../src/viewer/lib/version';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, props: () => ({}), keyframes: () => 'k' }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));
vi.mock('../src/viewer/components/PublishMenu', () => ({ PublishMenu: () => null }));
vi.mock('@haklex/rich-ext-excalidraw', async () => {
  const { allHeadlessNodes } = await import('@haklex/rich-headless');
  return { ExcalidrawEditNode: allHeadlessNodes.find((node) => node.getType() === 'excalidraw'), ExcalidrawPlugin: () => null };
});
vi.mock('@haklex/rich-ext-excalidraw/static', async () => {
  const { allHeadlessNodes } = await import('@haklex/rich-headless');
  return { ExcalidrawNode: allHeadlessNodes.find((node) => node.getType() === 'excalidraw') };
});

class FakeSocket {
  static all: FakeSocket[] = [];
  sent: { rid: number; body: { op: string } }[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor() {
    FakeSocket.all.push(this);
    queueMicrotask(() => this.onopen?.());
  }
  send(text: string) { this.sent.push(JSON.parse(text)); }
  close() { this.onclose?.(); }
  receive(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
}

let root: Root | null = null;
const cleanup: (() => void)[] = [];
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  cleanup.splice(0).forEach((fn) => fn());
  FakeSocket.all = [];
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function mount(published = true) {
  const doc = new LoroDoc();
  const editor = createHeadlessEditor({ nodes: allHeadlessNodes });
  const binding = createLoroBinding(editor, doc);
  editor.update(() => $getRoot().append($createParagraphNode().append($createTextNode('Keep reading this document'))), { discrete: true });
  const state = editor.getEditorState().toJSON();
  const remote = { snapshot: encodeBase64(doc.export({ mode: 'snapshot' })), lineage: doc.getTree(TREE_NAME).roots()[0]!.id, cursor: null };
  cleanup.push(() => { binding.dispose(); doc.free(); });
  vi.stubGlobal('WebSocket', FakeSocket);
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(CloudLiveDocument, { id: 'c1', state: published ? state : null, contentBase: published ? '/published/' : null, liveContentBase: '/live/' })));
  const socket = FakeSocket.all[0]!;
  const presence = (online: boolean) => act(async () => socket.receive({ t: 'presence', online, version: online ? VIEWER_VERSION : null }));
  const reply = (op: string, data: unknown) => act(async () => {
    const request = socket.sent.find((message) => message.body.op === op)!;
    expect(request).toBeDefined();
    socket.receive({ t: 'reply', rid: request.rid, body: { ok: true, data } });
  });
  const meta = () => reply('meta', { title: 'Cloud document', warnings: [], version: 1, contentBase: '/live/' });
  const ready = () => reply('state', remote);
  return { host, presence, meta, ready };
}

test('the published document stays visible until both live metadata and state arrive', async () => {
  const { host, presence, meta, ready } = await mount();
  expect(host.textContent).toContain('Keep reading this document');
  await presence(true);
  expect(host.textContent).toContain('Keep reading this document');
  expect(host.textContent).not.toContain('Loading…');
  await meta();
  expect(host.textContent).toContain('Keep reading this document');
  expect(host.querySelector('[contenteditable="true"]')).toBeNull();
  await ready();
  const liveEditor = host.querySelector('[contenteditable="true"]');
  expect(liveEditor?.textContent).toContain('Keep reading this document');
  await presence(false);
  expect(liveEditor!.isConnected).toBe(true);
  expect(liveEditor!.getAttribute('contenteditable')).toBe('false');
  await presence(true);
  expect(liveEditor!.isConnected).toBe(true);
  expect(liveEditor!.getAttribute('contenteditable')).toBe('true');
});

test('an unpublished document still loads from the computer without a snapshot', async () => {
  const { host, presence, meta, ready } = await mount(false);
  await presence(true);
  expect(host.textContent).toContain('Loading…');
  await meta();
  await ready();
  expect(host.querySelector('[contenteditable="true"]')?.textContent).toContain('Keep reading this document');
});
