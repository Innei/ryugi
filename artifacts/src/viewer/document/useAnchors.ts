import { blockIdState } from '@haklex/rich-editor';
import { $getRoot, $getState, type LexicalEditor } from 'lexical';
import { useEffect, useState } from 'react';

import { anchorBlockIds, type Thread } from '../../shared/comments';
import { resolveAnchor, shownThreadIds } from './anchor';
import { barLinkStart, blockBar, type Box } from './layoutCards';

export type ThreadAnchor =
  | {
      threadId: string;
      top: number;
      kind: 'text';
      range: Range;
      ranges?: Range[];
      blocks?: BlockAnchor[];
    }
  | {
      threadId: string;
      top: number;
      kind: 'block';
      element: HTMLElement;
      blocks?: BlockAnchor[];
    };

interface BlockAnchor {
  element: HTMLElement;
  id: string;
}

export const anchorBlocks = (anchor: ThreadAnchor): BlockAnchor[] =>
  anchor.blocks ??
  (anchor.kind === 'block' ? [{ id: anchor.threadId, element: anchor.element }] : []);

const anchorRanges = (anchor: ThreadAnchor): Range[] =>
  anchor.kind === 'text' ? (anchor.ranges ?? [anchor.range]) : [];

const BAR_HIT = 4;

export function anchorBoxes(anchor: ThreadAnchor): Box[] {
  return [
    ...anchorRanges(anchor).flatMap((range) => [...range.getClientRects()]),
    ...anchorBlocks(anchor).map((block) => blockBar(block.element.getBoundingClientRect())),
  ].sort((a, b) => a.top - b.top || a.left - b.left);
}

export function anchorLinkStart(anchor: ThreadAnchor): { x: number; y: number } | null {
  const boxes = anchorBoxes(anchor);
  const last = boxes.at(-1);
  if (!last) return null;
  return anchor.kind === 'text' ? { x: last.right, y: last.bottom } : barLinkStart(last);
}

function rangeAt(element: HTMLElement, start: number, end: number): Range {
  const range = document.createRange();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let startSet = false;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const next = offset + node.length;
    if (!startSet && start <= next) {
      range.setStart(node, start - offset);
      startSet = true;
    }
    if (startSet && end <= next) {
      range.setEnd(node, end - offset);
      return range;
    }
    offset = next;
  }
  range.selectNodeContents(element);
  return range;
}

export function useAnchors(
  editor: LexicalEditor | null,
  threads: Thread[],
  container: HTMLElement | null,
) {
  const [anchors, setAnchors] = useState<ThreadAnchor[]>([]);

  useEffect(() => {
    if (!editor || !container) return;
    const compute = () => {
      const elements = editor.getEditorState().read(() => {
        const byId = new Map<string, string>();
        for (const block of $getRoot().getChildren()) {
          const id = $getState(block, blockIdState);
          if (id) byId.set(id, block.getKey());
        }
        return byId;
      });
      const origin = container.getBoundingClientRect().top - container.scrollTop;
      const next: ThreadAnchor[] = [];
      for (const thread of threads) {
        const blocks = anchorBlockIds(thread.anchor).flatMap((id) => {
          const key = elements.get(id);
          const element = key ? editor.getElementByKey(key) : null;
          return element ? [{ id, element }] : [];
        });
        const element = blocks[0]?.element;
        if (!element) continue;
        if (thread.anchor.textRanges) {
          const segments = new Map(thread.anchor.textRanges.map((part) => [part.blockId, part]));
          const ranges: Range[] = [];
          const fallback: BlockAnchor[] = [];
          let top: number | undefined;
          for (const block of blocks) {
            const part = segments.get(block.id);
            const at = part
              ? resolveAnchor(block.element.textContent ?? '', part.quote, part.start)
              : 'block';
            if (at === 'block') {
              fallback.push(block);
              top ??= block.element.getBoundingClientRect().top - origin;
            } else {
              const range = rangeAt(block.element, at.start, at.end);
              ranges.push(range);
              const rect = range.getClientRects()[0] ?? block.element.getBoundingClientRect();
              top ??= rect.top - origin;
            }
          }
          if (ranges.length)
            next.push({
              threadId: thread.id,
              top: top!,
              kind: 'text',
              range: ranges[0]!,
              ranges,
              blocks: fallback,
            });
          else
            next.push({ threadId: thread.id, top: top!, kind: 'block', element, blocks: fallback });
          continue;
        }
        const at = thread.anchor.blockIds
          ? 'block'
          : resolveAnchor(element.textContent ?? '', thread.anchor.quote);
        if (at === 'block') {
          next.push({
            threadId: thread.id,
            top: element.getBoundingClientRect().top - origin,
            kind: 'block',
            element,
            blocks,
          });
          continue;
        }
        const range = rangeAt(element, at.start, at.end);
        const rect = range.getClientRects()[0] ?? element.getBoundingClientRect();
        next.push({ threadId: thread.id, top: rect.top - origin, kind: 'text', range });
      }
      setAnchors(next);
    };
    compute();
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(compute);
    };
    const unregister = editor.registerUpdateListener(schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(container);
    const root = editor.getRootElement();
    if (root) resize.observe(root);
    return () => {
      cancelAnimationFrame(frame);
      unregister();
      resize.disconnect();
    };
  }, [editor, threads, container]);

  return anchors;
}

export function useHighlights(anchors: ThreadAnchor[], threads: Thread[], activeId: string | null) {
  useEffect(() => {
    if (typeof CSS === 'undefined' || !('highlights' in CSS)) return;
    const shown = shownThreadIds(threads, activeId);
    const normal = anchors
      .filter((a) => shown.has(a.threadId) && a.threadId !== activeId)
      .flatMap(anchorRanges);
    const active = anchors.filter((a) => a.threadId === activeId).flatMap(anchorRanges);
    CSS.highlights.set('ryugi-comment', new Highlight(...normal));
    CSS.highlights.set('ryugi-comment-active', new Highlight(...active));
    return () => {
      CSS.highlights.delete('ryugi-comment');
      CSS.highlights.delete('ryugi-comment-active');
    };
  }, [anchors, threads, activeId]);
}

export function useDraftHighlight(range: Range | null, elements?: HTMLElement[]) {
  useEffect(() => {
    if (elements?.length) {
      for (const element of elements) element.setAttribute('data-comment-draft', '');
      return () => {
        for (const element of elements) element.removeAttribute('data-comment-draft');
      };
    }
    if (!range || typeof CSS === 'undefined' || !('highlights' in CSS)) return;
    CSS.highlights.set('ryugi-comment-draft', new Highlight(range));
    return () => {
      CSS.highlights.delete('ryugi-comment-draft');
    };
  }, [range, elements]);
}

export function threadAtPoint(anchors: ThreadAnchor[], x: number, y: number): string | null {
  for (const anchor of anchors) {
    const pad = anchor.kind === 'block' || anchorBlocks(anchor).length ? BAR_HIT : 0;
    for (const box of anchorBoxes(anchor)) {
      if (x >= box.left - pad && x <= box.right + pad && y >= box.top && y <= box.bottom)
        return anchor.threadId;
    }
  }
  return null;
}
