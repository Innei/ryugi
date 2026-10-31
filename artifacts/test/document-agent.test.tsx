// @vitest-environment happy-dom
import { createLoroBinding } from '@haklex/rich-collab-loro';
import { allHeadlessNodes } from '@haklex/rich-headless';
import type { AgentStreamPluginProps } from '@haklex/rich-plugin-agent-stream';
import { createHeadlessEditor } from '@lexical/headless';
import { $createHeadingNode } from '@lexical/rich-text';
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from 'lexical';
import { LoroDoc } from 'loro-crdt';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

import type { AgentActivity } from '../src/viewer/document/agentActivity';
import { createChannel } from '../src/viewer/document/channel';
import { DocumentView } from '../src/viewer/document/DocumentView';
import { TopBar } from '../src/viewer/document/TopBar';
import type { DocumentTransport } from '../src/viewer/document/transport';

const stream = vi.hoisted(() => ({
  props: null as AgentStreamPluginProps | null,
  editor: null as LexicalEditor | null,
}));

vi.mock('@haklex/rich-plugin-agent-stream', async () => {
  const { useLexicalComposerContext } = await import('@lexical/react/LexicalComposerContext');
  return {
    AgentStreamPlugin: (props: AgentStreamPluginProps) => {
      [stream.editor] = useLexicalComposerContext();
      stream.props = props;
      return null;
    },
  };
});
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

let root: Root | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  stream.props = null;
  stream.editor = null;
  document.body.innerHTML = '';
});

function documentWithSection() {
  const doc = new LoroDoc();
  const editor = createHeadlessEditor({ nodes: allHeadlessNodes });
  const binding = createLoroBinding(editor, doc);
  editor.update(
    () =>
      $getRoot().append(
        $createHeadingNode('h2').append($createTextNode('2. Plan')),
        $createParagraphNode().append($createTextNode('Working text')),
      ),
    { discrete: true },
  );
  binding.dispose();
  return doc;
}

function transportFor(doc: LoroDoc, agent?: string): DocumentTransport {
  return {
    artifact: 'document/draft',
    channel: createChannel(),
    send: () => {},
    meta: async () => ({
      id: 'draft',
      title: 'Draft',
      contentBase: '',
      warnings: [],
      version: 1,
      ...(agent ? { agent } : {}),
    }),
    state: async () => ({
      snapshot: Buffer.from(doc.export({ mode: 'snapshot' })).toString('base64'),
      lineage: doc.getTree('lexical').roots()[0]!.id,
    }),
    update: async () => {},
    comment: async () => ({ version: 1, threads: [] }),
  };
}

const lastBlockKey = () =>
  stream.editor!.getEditorState().read(() => $getRoot().getLastChildOrThrow().getKey());

test('agent playback drives the editing status and names the section being written', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      createElement(DocumentView, {
        id: 'draft',
        transport: transportFor(documentWithSection(), 'Codex'),
        live: true,
      }),
    ),
  );
  await vi.waitFor(() =>
    expect(stream.editor?.getEditorState().read(() => $getRoot().getChildrenSize())).toBe(2),
  );
  await vi.waitFor(() => expect(stream.props?.agentName).toBe('Codex'));
  const header = () => host.querySelector('header')?.textContent ?? '';
  expect(header()).not.toContain('is editing');

  await act(async () =>
    stream.props!.onPlaybackChange!({ playing: true, blockKey: lastBlockKey() }),
  );
  expect(header()).toContain('Codex is editing §2');

  await act(async () => stream.props!.onPlaybackChange!({ playing: false, blockKey: null }));
  expect(header()).not.toContain('is editing');
});

test('the agent caret and editing status fall back to the same name', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      createElement(DocumentView, {
        id: 'draft',
        transport: transportFor(documentWithSection()),
        live: true,
      }),
    ),
  );
  await vi.waitFor(() => expect(stream.props).not.toBeNull());
  await act(async () => stream.props!.onPlaybackChange!({ playing: true, blockKey: null }));
  expect(stream.props!.agentName).toBe('Agent');
  expect(host.querySelector('header')?.textContent).toContain('Agent is editing');
});

test('between writes the bar says what is left, and turns to a warning once the agent goes quiet', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const render = (activity: AgentActivity) =>
    act(async () =>
      root!.render(
        createElement(TopBar, {
          id: 'draft',
          activity,
          agentSection: null,
          offline: false,
          openComments: 0,
          agent: 'Codex',
        }),
      ),
    );
  await render({ kind: 'working', pending: 3, idleMs: 40_000 });
  expect(host.querySelector('header')?.textContent).toContain(
    'Codex has 3 sections left · updated 40s ago',
  );
  await render({ kind: 'stale', pending: 3, idleMs: 6 * 60_000 });
  expect(host.querySelector('header')?.textContent).toContain(
    "Codex hasn't updated in 6 min · 3 sections left",
  );
  await render({ kind: 'idle' });
  expect(host.querySelector('header')?.textContent).not.toContain('Codex');
});
