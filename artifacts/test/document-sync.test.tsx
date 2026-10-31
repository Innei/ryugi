// @vitest-environment happy-dom
import { createLoroBinding, TREE_NAME } from '@haklex/rich-collab-loro';
import { createHeadlessEditor } from '@lexical/headless';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isTextNode,
  type LexicalEditor,
} from 'lexical';
import { LoroDoc } from 'loro-crdt';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

import { createChannel } from '../src/viewer/document/channel';
import { LoroSync } from '../src/viewer/document/LoroSync';
import { type DocumentState, encodeBase64 } from '../src/viewer/document/transport';

let root: Root | null = null;
let disposeHost: (() => void) | undefined;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  disposeHost?.();
  disposeHost = undefined;
  vi.useRealTimers();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function mount({
  failState = false,
  pendingState,
}: {
  failState?: boolean;
  pendingState?: Promise<DocumentState>;
} = {}) {
  vi.useFakeTimers();
  const hostDoc = new LoroDoc();
  const hostEditor = createHeadlessEditor({
    namespace: 'host',
    onError: (error) => {
      throw error;
    },
  });
  const hostBinding = createLoroBinding(hostEditor, hostDoc);
  disposeHost = () => hostBinding.dispose();
  hostEditor.update(
    () => $getRoot().append($createParagraphNode().append($createTextNode('Original'))),
    { discrete: true },
  );
  const state = (): DocumentState => ({
    snapshot: encodeBase64(hostDoc.export({ mode: 'snapshot' })),
    lineage: hostDoc.getTree(TREE_NAME).roots()[0]!.id,
  });
  const doc = new LoroDoc();
  doc.import(hostDoc.export({ mode: 'snapshot' }));
  const transport = {
    artifact: 'document/plan',
    channel: createChannel(),
    state: vi.fn(async () => state()),
    update: vi.fn(async (bytes: Uint8Array) => {
      hostBinding.import(bytes);
    }),
    meta: vi.fn(),
    comment: vi.fn(),
    send: vi.fn(),
  };
  if (failState) transport.state.mockRejectedValueOnce(new Error('temporary timeout'));
  if (pendingState) transport.state.mockReturnValueOnce(pendingState);
  const onOffline = vi.fn();
  const onState = vi.fn();
  let editor!: LexicalEditor;
  function Sync() {
    [editor] = useLexicalComposerContext();
    return <LoroSync doc={doc} transport={transport} onOffline={onOffline} onState={onState} />;
  }
  root = createRoot(document.createElement('div'));
  await act(async () =>
    root!.render(
      <LexicalComposer
        initialConfig={{
          namespace: 'peer',
          onError: (error) => {
            throw error;
          },
        }}
      >
        <Sync />
      </LexicalComposer>,
    ),
  );
  const edit = (text: string) =>
    act(async () => {
      editor.update(
        () => {
          const node = $getRoot().getFirstDescendant();
          if (!$isTextNode(node)) throw new Error('expected a text node');
          node.setTextContent(text);
        },
        { discrete: true },
      );
      await vi.advanceTimersByTimeAsync(100);
    });
  return {
    transport,
    onOffline,
    onState,
    state,
    edit,
    hostText: () => hostEditor.getEditorState().read(() => $getRoot().getTextContent()),
    peerText: () => editor.getEditorState().read(() => $getRoot().getTextContent()),
  };
}

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

test('a failed initial state read recovers without another edit or connection event', async () => {
  const { onOffline, onState } = await mount({ failState: true });
  expect(onOffline).toHaveBeenLastCalledWith(true);
  await advance(2_000);
  expect(onState).toHaveBeenCalled();
  expect(onOffline).toHaveBeenLastCalledWith(false);
});

test('a failed save reaches the host without another edit or connection event', async () => {
  const { transport, edit, hostText, onOffline } = await mount();
  transport.update.mockRejectedValueOnce(new Error('temporary timeout'));
  await edit('Keep this edit');
  expect(hostText()).toBe('Original');
  expect(onOffline).toHaveBeenLastCalledWith(true);
  await advance(2_000);
  expect(hostText()).toBe('Keep this edit');
  expect(onOffline).toHaveBeenLastCalledWith(false);
});

test('recovery preserves edits made while waiting to retry', async () => {
  const { transport, edit, hostText, peerText, onOffline } = await mount();
  transport.update.mockRejectedValueOnce(new Error('temporary timeout'));
  await edit('First edit');
  expect(hostText()).toBe('Original');
  expect(onOffline).toHaveBeenLastCalledWith(true);
  await edit('First edit, plus more');
  await advance(2_000);
  expect(hostText()).toBe('First edit, plus more');
  expect(peerText()).toBe('First edit, plus more');
  expect(onOffline).toHaveBeenLastCalledWith(false);
});

test('repeated save failures back off even when state reads succeed and editing continues', async () => {
  const { transport, edit, hostText, onOffline } = await mount();
  const update = transport.update.getMockImplementation()!;
  transport.update.mockRejectedValue(new Error('temporarily unavailable'));
  await edit('First edit');
  await advance(1_100);
  expect(transport.update).toHaveBeenCalledTimes(2);
  await edit('Still editing');
  await advance(1_000);
  expect(transport.update).toHaveBeenCalledTimes(2);
  expect(hostText()).toBe('Original');
  expect(onOffline).toHaveBeenLastCalledWith(true);
  transport.update.mockImplementation(update);
  await advance(1_100);
  expect(hostText()).toBe('Still editing');
  expect(onOffline).toHaveBeenLastCalledWith(false);
});

test('an older resync timeout cannot mark a newer successful connection as unsynced', async () => {
  const { transport, onOffline } = await mount();
  const older = deferred<DocumentState>();
  transport.state.mockReturnValueOnce(older.promise);
  await act(async () => {
    transport.channel.emit({ type: 'open' });
    transport.channel.emit({ type: 'open' });
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(onOffline).toHaveBeenLastCalledWith(false);
  await act(async () => older.reject(new Error('old connection timed out')));
  expect(onOffline).toHaveBeenLastCalledWith(false);
});

test('an older resync result cannot replace the current document status', async () => {
  const { transport, state, onState } = await mount();
  const older = deferred<DocumentState>();
  transport.state.mockReturnValueOnce(older.promise);
  transport.state.mockResolvedValueOnce({ ...state(), agentActiveAt: 200 });
  await act(async () => {
    transport.channel.emit({ type: 'open' });
    transport.channel.emit({ type: 'open' });
    await vi.advanceTimersByTimeAsync(100);
  });
  await act(async () => older.resolve({ ...state(), agentActiveAt: 100 }));
  expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ agentActiveAt: 200 }));
});

test('a reconnect resends local edits without waiting for an old save to time out', async () => {
  const { transport, edit, hostText, onOffline } = await mount();
  const older = deferred<void>();
  transport.update.mockReturnValueOnce(older.promise);
  await edit('Keep this edit');
  await act(async () => {
    transport.channel.emit({ type: 'open' });
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(hostText()).toBe('Keep this edit');
  await act(async () => older.reject(new Error('old save timed out')));
  expect(onOffline).toHaveBeenLastCalledWith(false);
  await edit('Keep this edit and the next one');
  expect(hostText()).toBe('Keep this edit and the next one');
});

test('edits made during a save are sent after its acknowledgement', async () => {
  const { transport, edit, hostText } = await mount();
  const first = deferred<void>();
  const update = transport.update.getMockImplementation()!;
  transport.update.mockImplementationOnce(async (bytes) => {
    await first.promise;
    await update(bytes);
  });
  await edit('First');
  await edit('First and second');
  expect(hostText()).toBe('Original');
  await act(async () => first.resolve());
  await advance(100);
  expect(hostText()).toBe('First and second');
});

test('a state failure after unmount does not report an error or start a retry', async () => {
  const pending = deferred<DocumentState>();
  const { transport, onOffline } = await mount({ pendingState: pending.promise });
  act(() => root!.unmount());
  root = null;
  await act(async () => pending.reject(new Error('late timeout')));
  await advance(60_000);
  expect(onOffline).not.toHaveBeenCalled();
  expect(transport.state).toHaveBeenCalledTimes(1);
});

test('unmount cancels a scheduled recovery', async () => {
  const { transport } = await mount({ failState: true });
  act(() => root!.unmount());
  root = null;
  await advance(60_000);
  expect(transport.state).toHaveBeenCalledTimes(1);
});
