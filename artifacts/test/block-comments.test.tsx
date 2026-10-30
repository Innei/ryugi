// @vitest-environment happy-dom
import { blockIdState } from '@haklex/rich-editor';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import {
  $createNodeSelection,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $setSelection,
  $setState,
  type LexicalEditor,
} from 'lexical';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

import type { Thread } from '../src/shared/comments';
import { BlockBars } from '../src/viewer/document/BlockBars';
import { DesktopDocument } from '../src/viewer/document/DesktopDocument';
import { type ThreadAnchor, useAnchors } from '../src/viewer/document/useAnchors';
import { useDocumentSelectionSync } from '../src/viewer/document/useDocumentSelectionSync';
import {
  type SelectionTarget,
  useSelectionComment,
} from '../src/viewer/document/useSelectionComment';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  props: () => ({}),
  keyframes: () => 'k',
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({
  cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
}));

let root: Root | null = null;
let editor: LexicalEditor;
let selection: SelectionTarget | null = null;
let clearSelection: () => void;
let located: ThreadAnchor[] = [];
let synced: unknown[] = [];
const sendSelection = (message: unknown) => {
  synced.push(message);
};
const thread: Thread = {
  id: 'thread',
  anchor: { blockId: 'b1', blockIds: ['b1', 'b3'], quote: '' },
  status: 'open',
  statusAt: '2026-10-30T00:00:00Z',
  messages: [],
};
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  selection = null;
  synced = [];
  located = [];
});

async function mount(
  threads: Thread[] = [],
  onCreate?: (target: SelectionTarget, text: string) => Promise<boolean>,
) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  function Surface() {
    [editor] = useLexicalComposerContext();
    const [container, setContainer] = useState<HTMLElement | null>(null);
    [selection, clearSelection] = useSelectionComment(editor, container);
    useDocumentSelectionSync(editor, 'document/test', true, sendSelection);
    const anchors = useAnchors(editor, threads, container);
    located = anchors;
    if (onCreate)
      return createElement(DesktopDocument, {
        editor,
        threads,
        actions: { reply: async () => true, edit() {}, remove() {}, resolve() {}, reopen() {} },
        canComment: true,
        selection,
        clearSelection,
        onCreate,
        onMain: setContainer,
        children: createElement(ContentEditable),
      });
    return createElement(
      'div',
      { ref: setContainer },
      createElement(ContentEditable),
      createElement(BlockBars, { container, anchors, threads, activeId: null }),
      createElement('output', null, anchors.length),
    );
  }
  await act(async () =>
    root!.render(
      createElement(
        LexicalComposer,
        {
          initialConfig: {
            namespace: 'block-comments',
            onError: (error: Error) => {
              throw error;
            },
            editorState: () => {
              for (const [index, text] of ['First', 'Unselected', ''].entries()) {
                const block = $createParagraphNode();
                $setState(block, blockIdState, `b${index + 1}`);
                if (text) block.append($createTextNode(text));
                $getRoot().append(block);
              }
            },
          },
        },
        createElement(Surface),
      ),
    ),
  );
  return host;
}

async function select(indices: number[]) {
  await act(async () => {
    editor.update(
      () => {
        const blocks = $getRoot().getChildren();
        const selected = $createNodeSelection();
        for (const index of indices) selected.add(blocks[index]!.getKey());
        $setSelection(selected);
      },
      { discrete: true },
    );
    document.dispatchEvent(new Event('selectionchange'));
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
}

async function selectText(from: number, to: number, backward = false, endAtNextBlock = false) {
  const paragraphs = editor.getRootElement()!.querySelectorAll('p');
  const start = document.createTreeWalker(paragraphs[0]!, NodeFilter.SHOW_TEXT).nextNode()!;
  const end = endAtNextBlock
    ? paragraphs[1]!
    : document.createTreeWalker(paragraphs[1]!, NodeFilter.SHOW_TEXT).nextNode()!;
  await act(async () => {
    const dom = window.getSelection()!;
    dom.removeAllRanges();
    dom.setBaseAndExtent(
      backward ? end : start,
      backward ? to : from,
      backward ? start : end,
      backward ? from : to,
    );
    document.dispatchEvent(new Event('selectionchange'));
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
}

test.each([false, true])(
  'cross-paragraph text selection preserves the exact text at both ends (backward: %s)',
  async (backward) => {
    await mount();
    await selectText(2, 3, backward);
    expect(selection).toMatchObject({
      blockId: 'b1',
      blockIds: ['b1', 'b2'],
      textRanges: [
        { blockId: 'b1', start: 2, quote: 'rst' },
        { blockId: 'b2', start: 0, quote: 'Uns' },
      ],
    });
    expect(selection?.kind).toBeUndefined();
  },
);

test('ending at the start of the next paragraph does not attach that unselected paragraph', async () => {
  await mount();
  await selectText(0, 0, false, true);
  expect(selection).toMatchObject({ blockId: 'b1', quote: 'First' });
  expect(selection?.blockIds).toBeUndefined();
  expect(synced.at(-1)).toMatchObject({ blockIds: ['b1'] });
});

test('starting after the last character of a paragraph does not attach that paragraph', async () => {
  await mount();
  await selectText(5, 3);
  expect(selection).toMatchObject({ blockId: 'b2', quote: 'Uns' });
  expect(selection?.blockIds).toBeUndefined();
  expect(synced.at(-1)).toMatchObject({ blockIds: ['b2'] });
});

test('dragging text across paragraphs exposes the right-side comment button and submits the text ranges', async () => {
  const onCreate = vi.fn(async () => true);
  const host = await mount([], onCreate);
  await selectText(2, 3);
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Comment"]');
  expect(button).not.toBeNull();
  await act(async () => button!.click());
  expect(host.querySelectorAll('[data-comment-draft]')).toHaveLength(0);
  const box = host.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      box,
      'Across paragraphs',
    );
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    host.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!.click(),
  );
  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      blockIds: ['b1', 'b2'],
      textRanges: [
        { blockId: 'b1', start: 2, quote: 'rst' },
        { blockId: 'b2', start: 0, quote: 'Uns' },
      ],
    }),
    'Across paragraphs',
  );
});

test('a saved cross-paragraph comment highlights only the selected text and keeps the remaining range after deletion', async () => {
  const textThread: Thread = {
    ...thread,
    anchor: {
      blockId: 'b1',
      blockIds: ['b1', 'b2'],
      quote: 'rst\nUns',
      textRanges: [
        { blockId: 'b1', start: 2, quote: 'rst' },
        { blockId: 'b2', start: 0, quote: 'Uns' },
      ],
    },
  };
  const host = await mount([textThread]);
  const highlighted = () =>
    located.flatMap((anchor) =>
      anchor.kind === 'text'
        ? (anchor.ranges ?? [anchor.range]).map((range) => range.toString())
        : [],
    );
  expect(highlighted()).toEqual(['rst', 'Uns']);
  expect(host.querySelectorAll('[data-comment-block]')).toHaveLength(0);
  await act(async () =>
    editor.update(() => $getRoot().getFirstChildOrThrow().remove(), { discrete: true }),
  );
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect(highlighted()).toEqual(['Uns']);
});

test('haklex block selections produce one comment target in document order, including empty blocks', async () => {
  await mount();
  await select([2, 0]);
  expect(selection).toMatchObject({
    blockId: 'b1',
    blockIds: ['b1', 'b3'],
    quote: '',
    kind: 'block',
  });
  await act(async () => clearSelection());
  expect(selection).toBeNull();
});

test('one whole block can be commented without a text selection', async () => {
  await mount();
  await select([2]);
  expect(selection).toMatchObject({ blockId: 'b3', quote: '', kind: 'block' });
});

test('selecting an empty block still tells the agent which block is selected', async () => {
  await mount();
  await select([2]);
  expect(synced.at(-1)).toMatchObject({ artifact: 'document/test', blockIds: ['b3'], quote: '' });
});

test('one thread marks every selected block and stays attached if its first block is deleted', async () => {
  const host = await mount([thread]);
  const bars = () => host.querySelectorAll('[data-comment-block]');
  expect(bars()).toHaveLength(2);
  await act(async () =>
    editor.update(() => $getRoot().getFirstChildOrThrow().remove(), { discrete: true }),
  );
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect(bars()).toHaveLength(1);
  expect(host.querySelector('output')!.textContent).toBe('1');
});

test('the block comment button opens one draft for all selected blocks and submits them together', async () => {
  const onCreate = vi.fn(async () => true);
  const host = await mount([], onCreate);
  await select([2, 0]);
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Comment"]');
  expect(button).not.toBeNull();
  await act(async () => button!.click());
  expect(host.textContent).toContain('2 blocks');
  expect(host.querySelectorAll('[data-comment-draft]')).toHaveLength(2);
  const box = host.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      box,
      'Read together',
    );
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    host.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!.click(),
  );
  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({ blockIds: ['b1', 'b3'] }),
    'Read together',
  );
});
