// @vitest-environment happy-dom
// @vitest-environment-options {"happyDOM":{"settings":{"navigator":{"userAgent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"}}}}
import { $createMermaidNode } from '@haklex/rich-editor/nodes';
import { $createLinkNode } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ConfigProvider, ModalHost } from '@lobehub/ui';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type LexicalEditor,
  type ParagraphNode,
} from 'lexical';
import { LoroDoc } from 'loro-crdt';
import { motion, MotionGlobalConfig } from 'motion/react';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

import { createChannel } from '../src/viewer/document/channel';
import { DocumentEditor } from '../src/viewer/document/DocumentEditor';
import { createLocalTransport } from '../src/viewer/document/transport';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  props: () => ({}),
  keyframes: () => 'k',
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({
  cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
}));
vi.mock('@haklex/rich-ext-excalidraw', async () => {
  const { DecoratorNode } = await import('lexical');
  class ExcalidrawEditNode extends DecoratorNode<null> {
    static getType() {
      return 'excalidraw';
    }
    static clone(node: ExcalidrawEditNode) {
      return new ExcalidrawEditNode(node.__key);
    }
    createDOM() {
      return document.createElement('div');
    }
    updateDOM() {
      return false;
    }
    decorate() {
      return null;
    }
  }
  return { ExcalidrawEditNode, ExcalidrawPlugin: () => null };
});
vi.mock('../src/viewer/document/LoroSync', () => ({
  LoroSync: () => {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
      editor.update(
        () => {
          const link = $createLinkNode('https://example.com/').append($createTextNode('Example'));
          $getRoot()
            .clear()
            .append(
              $createParagraphNode().append(link),
              $createMermaidNode('flowchart LR\n  A --> B'),
            );
        },
        { discrete: true },
      );
    }, [editor]);
    return null;
  },
}));

let root: Root | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  MotionGlobalConfig.skipAnimations = true;
});
afterEach(async () => {
  const close = document.querySelector<HTMLElement>('[role="dialog"] [aria-label="Close"]');
  if (close) await act(async () => close.click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

let editor: LexicalEditor | null = null;

async function renderEditor() {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const page = createElement(
    'div',
    null,
    createElement(DocumentEditor, {
      transport: createLocalTransport({ id: 'draft', channel: createChannel(), send: () => {} }),
      doc: new LoroDoc(),
      theme: 'light',
      onAgentSection: () => {},
      onOffline: () => {},
      onEditorReady: (ready) => {
        editor = ready;
      },
    }),
    createElement(ModalHost),
  );
  await act(async () =>
    root!.render(
      createElement(ConfigProvider, { motion, enableCustomFonts: false, children: page }),
    ),
  );
  return host;
}

test('a modifier click opens a link while the document is editable', async () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  const host = await renderEditor();

  const anchor = host.querySelector<HTMLAnchorElement>(
    '[contenteditable="true"] a[href="https://example.com/"]',
  );
  expect(anchor).not.toBeNull();
  anchor!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  expect(open).not.toHaveBeenCalled();
  anchor!.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }),
  );
  expect(open).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
});

test('a mermaid block renders as a diagram that opens the enlarged viewer', async () => {
  const host = await renderEditor();
  const trigger = host.querySelector(
    '[contenteditable="true"] [aria-label="Enlarge Mermaid diagram"]',
  );
  expect(trigger).toBeInstanceOf(HTMLElement);
  expect(trigger!.querySelector('img[alt="Mermaid diagram"]')).toBeInstanceOf(HTMLImageElement);
});

test('pressing Enter on a focused diagram opens the viewer without editing the document', async () => {
  const host = await renderEditor();
  await act(async () =>
    editor!.update(
      () => {
        $getRoot().getFirstChildOrThrow<ParagraphNode>().select(2, 2);
      },
      { discrete: true },
    ),
  );
  const before = editor!.getEditorState().read(() => $getRoot().getTextContent());
  const trigger = host.querySelector<HTMLElement>('[aria-label="Enlarge Mermaid diagram"]')!;
  trigger.focus();
  await act(async () =>
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    ),
  );
  expect(document.querySelector('[role="dialog"]')).toBeInstanceOf(HTMLElement);
  expect(editor!.getEditorState().read(() => $getRoot().getTextContent())).toBe(before);
});
