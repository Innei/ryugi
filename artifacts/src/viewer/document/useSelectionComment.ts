import { blockIdState } from '@haklex/rich-editor';
import {
  $getRoot,
  $getSelection,
  $getState,
  $isNodeSelection,
  $setSelection,
  type LexicalEditor,
} from 'lexical';
import { useCallback, useEffect, useState } from 'react';

import type { Anchor } from '../../shared/comments';
import { $getSelectedTextRanges } from './textSelection';

export interface SelectionTarget extends Anchor {
  bottom: number;
  elements?: HTMLElement[];
  kind?: 'block';
  left: number;
  range: Range;
  right: number;
  top: number;
}

const SETTLE_MS = 200;

export function useSelectionComment(editor: LexicalEditor | null, container: HTMLElement | null) {
  const [target, setTarget] = useState<SelectionTarget | null>(null);

  useEffect(() => {
    if (!editor || !container) return;
    let timer = 0;
    const update = () => {
      const selected = editor.read(() => {
        const selection = $getSelection();
        if (!$isNodeSelection(selection)) return [];
        return $getRoot()
          .getChildren()
          .flatMap((block) => {
            if (!selection.has(block.getKey())) return [];
            const id = $getState(block, blockIdState);
            const element = editor.getElementByKey(block.getKey());
            return id && element ? [{ id, element }] : [];
          });
      });
      if (selected.length) {
        const elements = selected.map((block) => block.element);
        const rects = elements.map((element) => element.getBoundingClientRect());
        const origin = container.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(elements[0]!);
        setTarget({
          kind: 'block',
          blockId: selected[0]!.id,
          ...(selected.length > 1 ? { blockIds: selected.map((block) => block.id) } : {}),
          quote: '',
          elements,
          range,
          left: Math.min(...rects.map((rect) => rect.left)) - origin.left,
          right: Math.max(...rects.map((rect) => rect.right)) - origin.left,
          top: rects[0]!.top - origin.top,
          bottom: rects.at(-1)!.bottom - origin.top,
        });
        return;
      }
      const selection = window.getSelection();
      const root = editor.getRootElement();
      if (
        !selection ||
        selection.isCollapsed ||
        selection.rangeCount === 0 ||
        !root?.contains(selection.anchorNode) ||
        !root.contains(selection.focusNode)
      ) {
        setTarget(null);
        return;
      }
      const quote = selection.toString().trim();
      const range = selection.getRangeAt(0);
      const textRanges = editor.read(() => $getSelectedTextRanges(editor, range));
      if (!textRanges.length || !quote) {
        setTarget(null);
        return;
      }
      const rects = [...range.getClientRects()];
      const first = rects[0] ?? range.getBoundingClientRect();
      const last = rects.at(-1) ?? first;
      const origin = container.getBoundingClientRect();
      setTarget({
        blockId: textRanges[0]!.blockId,
        ...(textRanges.length > 1
          ? { blockIds: textRanges.map((part) => part.blockId), textRanges }
          : {}),
        quote: quote.slice(0, 500),
        left: first.left - origin.left,
        bottom: last.bottom - origin.top,
        top: first.top - origin.top,
        right: Math.max(...rects.map((rect) => rect.right), last.right) - origin.left,
        range: range.cloneRange(),
      });
    };
    const settle = () => {
      clearTimeout(timer);
      timer = window.setTimeout(update, SETTLE_MS);
    };
    document.addEventListener('selectionchange', settle);
    const unregister = editor.registerUpdateListener(settle);
    window.addEventListener('scroll', settle, true);
    window.addEventListener('resize', settle);
    const resize = new ResizeObserver(settle);
    if (editor.getRootElement()) resize.observe(editor.getRootElement()!);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', settle);
      unregister();
      window.removeEventListener('scroll', settle, true);
      window.removeEventListener('resize', settle);
      resize.disconnect();
    };
  }, [editor, container]);

  const clear = useCallback(() => {
    setTarget(null);
    if (editor?.read(() => $isNodeSelection($getSelection())))
      editor.update(() => $setSelection(null));
  }, [editor]);
  return [target, clear] as const;
}
