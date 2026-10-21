import { useRef, type PointerEvent } from 'react';

const SWIPE = 24;

export function useSheetSwipe(snaps: number[], snap: number, onSnap: (snap: number) => void) {
  const start = useRef<{ id: number; y: number } | null>(null);
  return {
    // FloatingSheet only drags with mouse events, so fingers swipe or tap this handle instead.
    onPointerDown: (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') start.current = { id: event.pointerId, y: event.clientY };
    },
    onPointerUp: (event: PointerEvent) => {
      const from = start.current;
      start.current = null;
      if (!from || from.id !== event.pointerId) return;
      const index = Math.max(0, snaps.indexOf(snap));
      const dy = event.clientY - from.y;
      const next = dy < -SWIPE ? Math.min(index + 1, snaps.length - 1) : dy > SWIPE ? Math.max(index - 1, 0) : index === snaps.length - 1 ? 0 : index + 1;
      onSnap(snaps[next]!);
    },
    onPointerCancel: () => {
      start.current = null;
    },
    style: { touchAction: 'none' as const },
  };
}
