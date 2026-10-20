import { blockIdState } from '@haklex/rich-editor';
import { $getRoot, $getState, type LexicalEditor } from 'lexical';
import { useEffect, useState } from 'react';
import type { Thread } from '../../shared/comments';
import { resolveAnchor, shownThreadIds } from './anchor';
import { barLinkStart, blockBar, type Box } from './layoutCards';

export type ThreadAnchor =
  | { threadId: string; top: number; kind: 'text'; range: Range }
  | { threadId: string; top: number; kind: 'block'; element: HTMLElement };

const BAR_HIT = 4;

export function anchorBoxes(anchor: ThreadAnchor): Box[] {
  return anchor.kind === 'text' ? [...anchor.range.getClientRects()] : [blockBar(anchor.element.getBoundingClientRect())];
}

export function anchorLinkStart(anchor: ThreadAnchor): { x: number; y: number } | null {
  const boxes = anchorBoxes(anchor);
  const last = boxes[boxes.length - 1];
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

export function useAnchors(editor: LexicalEditor | null, threads: Thread[], container: HTMLElement | null) {
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
        const key = elements.get(thread.anchor.blockId);
        const element = key ? editor.getElementByKey(key) : null;
        if (!element) continue;
        const at = resolveAnchor(element.textContent ?? '', thread.anchor.quote);
        if (at === 'block') {
          next.push({ threadId: thread.id, top: element.getBoundingClientRect().top - origin, kind: 'block', element });
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
    const text = anchors.filter((a) => a.kind === 'text');
    const normal = text.filter((a) => shown.has(a.threadId) && a.threadId !== activeId).map((a) => a.range);
    const active = text.filter((a) => a.threadId === activeId).map((a) => a.range);
    CSS.highlights.set('ryugi-comment', new Highlight(...normal));
    CSS.highlights.set('ryugi-comment-active', new Highlight(...active));
    return () => {
      CSS.highlights.delete('ryugi-comment');
      CSS.highlights.delete('ryugi-comment-active');
    };
  }, [anchors, threads, activeId]);
}

export function useDraftHighlight(range: Range | null) {
  useEffect(() => {
    if (!range || typeof CSS === 'undefined' || !('highlights' in CSS)) return;
    CSS.highlights.set('ryugi-comment-draft', new Highlight(range));
    return () => {
      CSS.highlights.delete('ryugi-comment-draft');
    };
  }, [range]);
}

export function threadAtPoint(anchors: ThreadAnchor[], x: number, y: number): string | null {
  for (const anchor of anchors) {
    const pad = anchor.kind === 'block' ? BAR_HIT : 0;
    for (const box of anchorBoxes(anchor)) {
      if (x >= box.left - pad && x <= box.right + pad && y >= box.top && y <= box.bottom) return anchor.threadId;
    }
  }
  return null;
}
