// @vitest-environment happy-dom
import { $createMermaidNode } from '@haklex/rich-editor/nodes';
import { $createLinkNode } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { LoroDoc } from 'loro-crdt';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { createChannel } from '../src/viewer/document/channel';
import { DocumentEditor } from '../src/viewer/document/DocumentEditor';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, props: () => ({}) }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));
vi.mock('@haklex/rich-ext-excalidraw', async () => {
  const { DecoratorNode } = await import('lexical');
  class ExcalidrawEditNode extends DecoratorNode<null> {
    static getType() { return 'excalidraw'; }
    static clone(node: ExcalidrawEditNode) { return new ExcalidrawEditNode(node.__key); }
    createDOM() { return document.createElement('div'); }
    updateDOM() { return false; }
    decorate() { return null; }
  }
  return { ExcalidrawEditNode, ExcalidrawPlugin: () => null };
});
vi.mock('../src/viewer/document/LoroSync', () => ({
  LoroSync: () => {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
      editor.update(() => {
        const link = $createLinkNode('https://example.com/').append($createTextNode('Example'));
        $getRoot().clear().append($createParagraphNode().append(link), $createMermaidNode('flowchart LR\n  A --> B'));
      }, { discrete: true });
    }, [editor]);
    return null;
  },
}));

let root: Root | null = null;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

async function renderEditor() {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(DocumentEditor, {
    id: 'draft',
    doc: new LoroDoc(),
    channel: createChannel(),
    theme: 'light',
    onAgentSection: () => {},
    onOffline: () => {},
    onEditorReady: () => {},
  })));
  return host;
}

test('a modifier click opens a link while the document is editable', async () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  const host = await renderEditor();

  const anchor = host.querySelector<HTMLAnchorElement>('[contenteditable="true"] a[href="https://example.com/"]');
  expect(anchor).not.toBeNull();
  anchor!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  expect(open).not.toHaveBeenCalled();
  anchor!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }));
  expect(open).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
});

test('a mermaid block renders as a diagram that opens the enlarged viewer', async () => {
  const host = await renderEditor();
  const trigger = host.querySelector('[contenteditable="true"] [aria-label="放大查看 Mermaid 图"]');
  expect(trigger).toBeInstanceOf(HTMLElement);
  expect(trigger!.querySelector('img[alt="Mermaid diagram"]')).toBeInstanceOf(HTMLImageElement);
});
