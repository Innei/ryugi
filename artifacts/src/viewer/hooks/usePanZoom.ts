import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Bounds } from '../../shared/types';
import { fitView, pinchView, zoomAround, zoomTo, type Insets, type Point, type View } from '../lib/view';

export type Tool = 'select' | 'hand';

const INSETS: Insets = { top: 64, right: 24, bottom: 24, left: 24 };
const WHEEL_ZOOM_SPEED = 0.01;
export interface WheelInput { deltaX: number; deltaY: number; x: number; y: number; zoom: boolean }

export function usePanZoom(tool: Tool) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 0.5 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragging, setDragging] = useState(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const touches = useRef(new Map<number, Point>());

  const panBy = useCallback((x: number, y: number) => setView((v) => ({ ...v, x: v.x + x, y: v.y + y })), []);
  const wheelAt = useCallback((input: WheelInput) => {
    if (input.zoom) setView((v) => zoomAround(v, Math.exp(-input.deltaY * WHEEL_ZOOM_SPEED), input.x, input.y));
    else panBy(-input.deltaX, -input.deltaY);
  }, [panBy]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-chrome]:not([data-chrome="board-label"])')) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      wheelAt({ deltaX: e.deltaX, deltaY: e.deltaY, x: e.clientX - rect.left, y: e.clientY - rect.top, zoom: e.ctrlKey || e.metaKey });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [wheelAt]);

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable], [data-chrome]');
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    const blur = () => setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const panning = tool === 'hand' || spaceHeld;

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const touch = e.pointerType === 'touch';
      const middle = e.button === 1;
      if (!touch && ((!panning && !middle) || (e.button !== 0 && !middle))) return;
      // Portal events bubble through React even when their targets are outside the viewport.
      if (!e.currentTarget.contains(e.target as Node)) return;
      if ((e.target as HTMLElement).closest('[data-chrome]')) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      last.current = { x: e.clientX, y: e.clientY };
      if (touch) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      setDragging(true);
    },
    [panning],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (touches.current.has(e.pointerId)) {
      const before = [...touches.current.values()];
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const after = [...touches.current.values()];
      if (before.length >= 2) {
        setView((v) => pinchView(v, [before[0]!, before[1]!], [after[0]!, after[1]!]));
        return;
      }
    }
    const prev = last.current;
    if (!prev) return;
    last.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y }));
  }, []);

  const onPointerUp = useCallback((e?: { pointerId: number }) => {
    if (e) touches.current.delete(e.pointerId);
    else touches.current.clear();
    const remaining = [...touches.current.values()][0];
    last.current = remaining ? { ...remaining } : null;
    if (!remaining) setDragging(false);
  }, []);

  const center = () => {
    const el = viewportRef.current;
    return { cx: (el?.clientWidth ?? 0) / 2, cy: (el?.clientHeight ?? 0) / 2 };
  };

  const fit = useCallback((bounds: Bounds | null | undefined, insets: Insets = INSETS) => {
    const el = viewportRef.current;
    if (!el || !bounds) return;
    setView(fitView(bounds, { width: el.clientWidth, height: el.clientHeight }, insets));
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const { cx, cy } = center();
    setView((v) => zoomAround(v, factor, cx, cy));
  }, []);

  const zoomToLevel = useCallback((k: number) => {
    const { cx, cy } = center();
    setView((v) => zoomTo(v, k, cx, cy));
  }, []);

  return {
    viewportRef,
    view,
    place: setView,
    fit,
    zoomBy,
    zoomTo: zoomToLevel,
    panBy,
    wheelAt,
    panning,
    setSpaceHeld,
    cursor: dragging ? 'grabbing' : panning ? 'grab' : 'default',
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
