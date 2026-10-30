import { blockIdState } from '@haklex/rich-editor';
import { $getRoot, $getSelection, $getState, $isNodeSelection, type LexicalEditor } from 'lexical';
import { useEffect, useRef } from 'react';

import {
  DOCUMENT_SELECTION_LIMITS,
  type DocumentSelectionMessage,
  type DocumentSelectionState,
} from '../../shared/selection';
import { selectionContext } from './selectionContext';
import { $getSelectedTextRanges } from './textSelection';

const TAB = crypto.randomUUID();
const SETTLE_MS = 300;
const EMPTY: DocumentSelectionState = { quote: '', blockIds: [], heading: '' };

function readSelection(editor: LexicalEditor): DocumentSelectionState {
  const blockSelection = editor.read(() => {
    const selection = $getSelection();
    if (!$isNodeSelection(selection)) return null;
    const blocks = $getRoot().getChildren();
    const selected = blocks.filter((block) => selection.has(block.getKey()));
    if (!selected.length) return null;
    const first = blocks.indexOf(selected[0]!);
    const { heading } = selectionContext(
      blocks.map((block) => ({
        id: $getState(block, blockIdState),
        heading: block.getType() === 'heading',
        text: block.getTextContent(),
      })),
      first,
      first,
    );
    return {
      heading: heading.slice(0, DOCUMENT_SELECTION_LIMITS.heading),
      blockIds: selected
        .map((block) => $getState(block, blockIdState))
        .filter(Boolean)
        .slice(0, DOCUMENT_SELECTION_LIMITS.blockIds),
      quote: selected
        .map((block) => block.getTextContent())
        .join('\n\n')
        .slice(0, DOCUMENT_SELECTION_LIMITS.quote),
    };
  });
  if (blockSelection) return blockSelection;
  const selection = window.getSelection();
  const root = editor.getRootElement();
  if (
    !selection ||
    selection.isCollapsed ||
    !root?.contains(selection.anchorNode) ||
    !root.contains(selection.focusNode)
  )
    return EMPTY;
  const quote = selection.toString().trim().slice(0, DOCUMENT_SELECTION_LIMITS.quote);
  if (!quote) return EMPTY;
  return editor.read(() => {
    const blocks = $getRoot().getChildren();
    const selected = $getSelectedTextRanges(editor, selection.getRangeAt(0));
    if (!selected.length) return { ...EMPTY, quote };
    const from = blocks.findIndex(
      (block) => $getState(block, blockIdState) === selected[0]!.blockId,
    );
    const summaries = blocks.map((block) => ({
      id: $getState(block, blockIdState) || '',
      heading: block.getType() === 'heading',
      text: block.getTextContent().slice(0, DOCUMENT_SELECTION_LIMITS.heading),
    }));
    const { heading } = selectionContext(summaries, from, from);
    return {
      quote,
      heading,
      blockIds: selected.map((part) => part.blockId).slice(0, DOCUMENT_SELECTION_LIMITS.blockIds),
    };
  });
}

export function useDocumentSelectionSync(
  editor: LexicalEditor | null,
  artifact: string,
  live: boolean,
  send: (message: DocumentSelectionMessage) => void,
) {
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
    const unregister = editor.registerUpdateListener(settle);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', settle);
      unregister();
    };
  }, [editor, artifact, send]);

  useEffect(() => {
    if (live && (last.current.quote || last.current.blockIds.length))
      send({ type: 'selection', artifact, tab: TAB, human: false, ...last.current });
  }, [live, artifact, send]);
}
