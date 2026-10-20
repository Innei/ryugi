import { blockIdState } from '@haklex/rich-editor';
import { $getNearestNodeFromDOMNode, $getRoot, $getState, type LexicalEditor } from 'lexical';
import { useEffect, useRef } from 'react';
import { DOCUMENT_SELECTION_LIMITS, type DocumentSelectionMessage, type DocumentSelectionState } from '../../shared/selection';
import { selectionContext } from './selectionContext';

const TAB = crypto.randomUUID();
const SETTLE_MS = 300;
const EMPTY: DocumentSelectionState = { quote: '', blockIds: [], heading: '' };

function readSelection(editor: LexicalEditor): DocumentSelectionState {
  const selection = window.getSelection();
  const root = editor.getRootElement();
  if (!selection || selection.isCollapsed || !root?.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return EMPTY;
  const quote = selection.toString().trim().slice(0, DOCUMENT_SELECTION_LIMITS.quote);
  if (!quote) return EMPTY;
  return editor.read(() => {
    const blocks = $getRoot().getChildren();
    const indexOf = (node: Node | null) => {
      const top = node && $getNearestNodeFromDOMNode(node)?.getTopLevelElement();
      return top ? blocks.findIndex((block) => block.is(top)) : -1;
    };
    const from = indexOf(selection.anchorNode);
    const to = indexOf(selection.focusNode);
    if (from < 0 || to < 0) return { ...EMPTY, quote };
    const summaries = blocks.map((block) => ({ id: $getState(block, blockIdState) || '', heading: block.getType() === 'heading', text: block.getTextContent().slice(0, DOCUMENT_SELECTION_LIMITS.heading) }));
    return { quote, ...selectionContext(summaries, from, to) };
  });
}

export function useDocumentSelectionSync(editor: LexicalEditor | null, artifact: string, live: boolean, send: (message: DocumentSelectionMessage) => void) {
  const last = useRef<DocumentSelectionState>(EMPTY);

  useEffect(() => {
    if (!editor) return;
    let timer = 0;
    const update = () => {
      const next = readSelection(editor);
      if (JSON.stringify(next) === JSON.stringify(last.current)) return;
      last.current = next;
      send({ type: 'selection', artifact, tab: TAB, human: true, ...next });
    };
    const settle = () => {
      clearTimeout(timer);
      timer = window.setTimeout(update, SETTLE_MS);
    };
    document.addEventListener('selectionchange', settle);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', settle);
    };
  }, [editor, artifact, send]);

  useEffect(() => {
    if (live && last.current.quote) send({ type: 'selection', artifact, tab: TAB, human: false, ...last.current });
  }, [live, artifact, send]);
}
