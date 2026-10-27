import { useCallback, useEffect, useRef, useState } from 'react';

import type { InspectorRect } from '../../shared/inspector';
import type { BoardSpec } from '../../shared/types';
import type { Inspector } from './useInspector';

type Phase = 'start' | 'move' | 'end' | 'cancel';
type Frame = { boardId: string; id: number };

export function useMarqueeSelection(
  boards: [string, BoardSpec][],
  inspector: Inspector,
  zoom: number,
  resetOn: unknown[],
) {
  const gesture = useRef<{
    x: number;
    y: number;
    append: boolean;
    moved: boolean;
    frame?: Frame;
  } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [marquee, setMarquee] = useState<InspectorRect | null>(null);
  const { cancelDrag } = inspector;

  const reset = useCallback(() => {
    gesture.current = null;
    setMarquee(null);
    setSelecting(false);
    cancelDrag();
  }, [cancelDrag]);
  useEffect(reset, [reset, ...resetOn]);

  const areasFor = useCallback(
    (rect: InspectorRect) =>
      boards.flatMap(([boardId, board]) => {
        const left = Math.max(rect.x, board.x),
          top = Math.max(rect.y, board.y);
        const right = Math.min(rect.x + rect.width, board.x + board.w),
          bottom = Math.min(rect.y + rect.height, board.y + board.h);
        return right > left && bottom > top
          ? [
              {
                boardId,
                rect: {
                  x: left - board.x,
                  y: top - board.y,
                  width: right - left,
                  height: bottom - top,
                },
              },
            ]
          : [];
      }),
    [boards],
  );

  function drag(phase: Phase, x: number, y: number, append = false, frame?: Frame) {
    if (phase === 'start') {
      gesture.current = { x, y, append, moved: false, frame };
      setMarquee(null);
      setSelecting(true);
      inspector.beginArea();
      return;
    }
    const start = gesture.current;
    if (!start) return;
    const rect = {
      x: Math.min(start.x, x),
      y: Math.min(start.y, y),
      width: Math.abs(x - start.x),
      height: Math.abs(y - start.y),
    };
    if (Math.hypot(rect.width, rect.height) * zoom >= 3) start.moved = true;
    if (phase === 'move') {
      if (start.moved) {
        setMarquee(rect);
        inspector.selectArea(areasFor(rect), start.append, true);
      }
      return;
    }
    gesture.current = null;
    setMarquee(null);
    setSelecting(false);
    if (phase === 'cancel' || !start.moved) inspector.cancelDrag();
    if (phase === 'cancel') return;
    if (!start.moved) {
      if (start.frame) inspector.select(start.frame.boardId, start.frame.id, start.append);
      else if (!start.append) inspector.clearSelection();
      return;
    }
    inspector.selectArea(areasFor(rect), start.append);
    inspector.cancelDrag();
  }

  return { marquee, selecting, dragging: () => gesture.current !== null, drag, reset };
}
