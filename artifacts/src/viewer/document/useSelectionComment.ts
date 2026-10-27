import { blockIdState } from '@haklex/rich-editor';
import { $getNearestNodeFromDOMNode, $getState, type LexicalEditor } from 'lexical';
import { useEffect, useState } from 'react';

export interface SelectionTarget {
  blockId: string;
  quote: string;
  left: number;
  bottom: number;
  top: number;
  right: number;
  range: Range;
}

const SETTLE_MS = 200;

export function useSelectionComment(editor: LexicalEditor | null, container: HTMLElement | null) {
  const [target, setTarget] = useState<SelectionTarget | null>(null);

  useEffect(() => {
    if (!editor || !container) return;
    let timer = 0;
    const update = () => {
      const selection = window.getSelection();
      const root = editor.getRootElement();
      if (
        !selection ||
        selection.isCollapsed ||
        selection.rangeCount === 0 ||
        !root?.contains(selection.anchorNode)
      ) {
        setTarget(null);
        return;
      }
      const quote = selection.toString().trim();
      const blockId = editor.read(() => {
        const start =
          selection.anchorNode &&
          $getNearestNodeFromDOMNode(selection.anchorNode)?.getTopLevelElement();
        const end =
          selection.focusNode &&
          $getNearestNodeFromDOMNode(selection.focusNode)?.getTopLevelElement();
        if (!start || !end || !start.is(end)) return null;
        return $getState(start, blockIdState) || null;
      });
      if (!blockId || !quote) {
        setTarget(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const rects = [...range.getClientRects()];
      const first = rects[0] ?? range.getBoundingClientRect();
      const last = rects.at(-1) ?? first;
      const origin = container.getBoundingClientRect();
      setTarget({
        blockId,
        quote: quote.slice(0, 500),
        left: first.left - origin.left,
        bottom: last.bottom - origin.top,
        top: first.top - origin.top,
        right: last.right - origin.left,
        range: range.cloneRange(),
      });
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
  }, [editor, container]);

  return [target, () => setTarget(null)] as const;
}
