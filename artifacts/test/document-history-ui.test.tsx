// @vitest-environment happy-dom
import { createLoroBinding } from '@haklex/rich-collab-loro';
import { allHeadlessNodes } from '@haklex/rich-headless';
import { createHeadlessEditor } from '@lexical/headless';
import { $createHeadingNode } from '@lexical/rich-text';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { LoroDoc } from 'loro-crdt';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

import { createChannel } from '../src/viewer/document/channel';
import {
  type DocumentHistoryOptions,
  useDocumentHistory,
} from '../src/viewer/document/DocumentHistory';
import { DocumentView } from '../src/viewer/document/DocumentView';
import type { DocumentTransport } from '../src/viewer/document/transport';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  props: () => ({}),
  keyframes: () => 'k',
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({
  cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
}));
vi.mock('../src/viewer/components/PublishMenu', () => ({ PublishMenu: () => null }));
vi.mock('@haklex/rich-ext-excalidraw', async () => {
  const { allHeadlessNodes } = await import('@haklex/rich-headless');
  return {
    ExcalidrawEditNode: allHeadlessNodes.find((node) => node.getType() === 'excalidraw'),
    ExcalidrawPlugin: () => null,
  };
});
vi.mock('@haklex/rich-ext-excalidraw/static', async () => {
  const { allHeadlessNodes } = await import('@haklex/rich-headless');
  return { ExcalidrawNode: allHeadlessNodes.find((node) => node.getType() === 'excalidraw') };
});

let root: Root | null = null;
const cleanup: (() => void)[] = [];
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  cleanup.splice(0).forEach((fn) => fn());
  document.body.innerHTML = '';
  viewport(1024);
});

function viewport(width: number) {
  (
    window as unknown as {
      happyDOM: { setViewport: (size: { width: number; height: number }) => void };
    }
  ).happyDOM.setViewport({ width, height: 900 });
}

function History(props: Omit<DocumentHistoryOptions, 'open' | 'onClose'>) {
  const view = useDocumentHistory({ ...props, open: true, onClose: () => {} });
  return createElement('div', null, view?.content, view?.panel);
}

function fixture() {
  const doc = new LoroDoc();
  doc.setChangeMergeInterval(0);
  const editor = createHeadlessEditor({ nodes: allHeadlessNodes });
  const binding = createLoroBinding(editor, doc, { commitMessage: 'human' });
  let timestamp = 100;
  const update = (text: string) => {
    doc.setNextCommitOptions({ timestamp });
    timestamp += 100;
    editor.update(
      () =>
        $getRoot()
          .clear()
          .append($createParagraphNode().append($createTextNode(text))),
      { discrete: true },
    );
  };
  update('Earlier content');
  update('Current content');
  cleanup.push(() => {
    binding.dispose();
    doc.free();
  });
  return { doc, update, editor };
}

async function mount(element: ReturnType<typeof createElement>) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  return host;
}

function button(host: HTMLElement, text: string) {
  const found = [...host.querySelectorAll('button')].find((item) =>
    item.textContent?.includes(text),
  );
  expect(found, `button ${text}`).toBeDefined();
  return found!;
}
async function historyReady(host: HTMLElement, text?: string) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const content = host.querySelector('[aria-label="Diff"]');
    expect(content).not.toBeNull();
    if (text) expect(content?.textContent).toContain(text);
  });
}

test('the document title is displayed once when it is part of the rich content', async () => {
  const { doc, editor } = fixture();
  editor.update(
    () =>
      $getRoot()
        .getFirstChildOrThrow()
        .insertBefore($createHeadingNode('h1').append($createTextNode('Document'))),
    { discrete: true },
  );
  const host = await mount(
    createElement(History, {
      doc,
      nodes: allHeadlessNodes,
      streaming: false,
      theme: 'light',
      title: 'Document',
    }),
  );
  await historyReady(host);
  expect(host.querySelectorAll('[aria-label="Diff"] h1')).toHaveLength(1);
});

test('real rich history renders read-only and navigating it never writes to the live CRDT', async () => {
  const { doc } = fixture();
  const count = doc.opCount();
  const version = doc.frontiers();
  const host = await mount(
    createElement(History, {
      doc,
      nodes: allHeadlessNodes,
      streaming: false,
      theme: 'light',
      title: 'Test',
    }),
  );
  await historyReady(host, 'content');
  expect(host.querySelector('[contenteditable="true"]')).toBeNull();
  await act(async () => button(host, 'Changes only').click());
  await act(async () => button(host, 'tap to change').click());
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Show raw commits"]')!.click(),
  );
  expect(doc.frontiers()).toEqual(version);
  expect(doc.opCount()).toBe(count);
});

test('incoming edits keep the comparison fixed until the human partner refreshes it', async () => {
  const { doc, update } = fixture();
  const host = await mount(
    createElement(History, {
      doc,
      nodes: allHeadlessNodes,
      streaming: false,
      theme: 'light',
      title: 'Test',
    }),
  );
  await historyReady(host);
  await act(async () => update('Newest revision'));
  expect(host.querySelector('[aria-label="Diff"]')?.textContent).not.toContain('Newest');
  await act(async () => button(host, 'Update comparison').click());
  await historyReady(host, 'Newest');
});

test('the narrow version picker keeps keyboard focus inside and restores it on close', async () => {
  const { doc } = fixture();
  const host = await mount(
    createElement(History, {
      doc,
      nodes: allHeadlessNodes,
      streaming: false,
      theme: 'light',
      title: 'Test',
    }),
  );
  await historyReady(host);
  const selector = button(host, 'tap to change');
  selector.focus();
  await act(async () => selector.click());
  const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.contains(document.activeElement)).toBe(true);
  const controls = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  controls.at(-1)!.focus();
  await act(async () =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    ),
  );
  expect(document.activeElement).toBe(controls[0]);
  await act(async () => button(dialog, 'Done').click());
  expect(document.activeElement).toBe(selector);
});

test('cloud disconnect closes history while preserving the original editor instance', async () => {
  const { doc } = fixture();
  const updates: Uint8Array[] = [];
  const transport: DocumentTransport = {
    artifact: 'document/test',
    channel: createChannel(),
    send: () => {},
    meta: async () => ({ id: 'test', title: 'Test', contentBase: '', warnings: [], version: 1 }),
    state: async () => ({
      snapshot: Buffer.from(doc.export({ mode: 'snapshot' })).toString('base64'),
      lineage: doc.getTree('lexical').roots()[0]!.id,
    }),
    update: async (bytes) => {
      updates.push(bytes);
    },
    comment: async () => ({ version: 1, threads: [] }),
  };
  const online = { online: true, canEdit: true, reason: null };
  const host = await mount(
    createElement(DocumentView, { id: 'test', transport, live: true, cloud: online }),
  );
  await vi.waitFor(() => expect(host.querySelector('[contenteditable]')).not.toBeNull());
  const editor = host.querySelector('[contenteditable]');
  await act(async () =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window.parent,
        origin: 'https://untrusted.example',
        data: { type: 'ryugi:document-history', id: 'test', action: 'toggle' },
      }),
    ),
  );
  expect(host.querySelector('[aria-label="Diff"]')).toBeNull();
  await act(async () =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window.parent,
        origin: location.origin,
        data: { type: 'ryugi:document-history', id: 'test', action: 'toggle' },
      }),
    ),
  );
  await historyReady(host);
  const baselineUpdates = updates.length;
  await act(async () =>
    root!.render(
      createElement(DocumentView, {
        id: 'test',
        transport,
        live: false,
        cloud: { online: false, canEdit: false, reason: null },
      }),
    ),
  );
  expect(host.querySelector('[aria-label="Diff"]')).toBeNull();
  expect(button(host, 'History').disabled).toBe(true);
  expect(host.querySelector('[contenteditable]')).toBe(editor);
  expect(updates.length).toBe(baselineUpdates);
});

function localTransport(doc: LoroDoc): DocumentTransport {
  return {
    artifact: 'document/test',
    channel: createChannel(),
    send: () => {},
    meta: async () => ({ id: 'test', title: 'Test', contentBase: '', warnings: [], version: 1 }),
    state: async () => ({
      snapshot: Buffer.from(doc.export({ mode: 'snapshot' })).toString('base64'),
      lineage: doc.getTree('lexical').roots()[0]!.id,
    }),
    update: async () => {},
    comment: async () => ({ version: 1, threads: [] }),
  };
}

test('history replaces the comment rail inside the same document layout', async () => {
  viewport(1600);
  const { doc } = fixture();
  const host = await mount(
    createElement(DocumentView, { id: 'test', transport: localTransport(doc), live: true }),
  );
  await vi.waitFor(() => expect(host.querySelector('[contenteditable]')).not.toBeNull());
  const main = host.querySelector('main');
  const editor = host.querySelector('[contenteditable]');
  expect(host.querySelector('aside[aria-label="Comments"]')).not.toBeNull();
  await act(async () => button(host, 'History').click());
  await historyReady(host);
  expect(host.querySelector('main')).toBe(main);
  expect(main!.querySelector('aside[aria-label="History"]')).not.toBeNull();
  expect(host.querySelector('aside[aria-label="Comments"]')).toBeNull();
  expect(main!.querySelector('article [aria-label="Diff"]')).not.toBeNull();
  expect(host.querySelector('[contenteditable]')).toBe(editor);
  await act(async () => button(host, 'Comments').click());
  expect(host.querySelector('[aria-label="Diff"]')).toBeNull();
  expect(host.querySelector('aside[aria-label="Comments"]')).not.toBeNull();
});

test('each change names the edit that made it', async () => {
  const { doc } = fixture();
  const host = await mount(
    createElement(History, {
      doc,
      nodes: allHeadlessNodes,
      streaming: false,
      theme: 'light',
      title: 'Test',
    }),
  );
  await historyReady(host);
  const change = host.querySelector('[data-history-change]');
  expect(change?.textContent).toContain('Changed');
  expect(change?.textContent).toContain('Browser edit');
});
