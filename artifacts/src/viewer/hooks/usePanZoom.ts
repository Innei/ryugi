import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { COMMENT_CURSOR } from '../../shared/inspector';
import type { Bounds } from '../../shared/types';
import { cubicBezier, fitView, pinchView, tweenView, zoomAround, zoomTo, type Insets, type Point, type View } from '../lib/view';

export type Tool = 'select' | 'hand' | 'comment';

const INSETS: Insets = { top: 64, right: 24, bottom: 24, left: 24 };
const WHEEL_ZOOM_SPEED = 0.01;
const FIT_MS = 420;
const ease = cubicBezier(0.2, 0, 0, 1);
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export interface WheelInput { deltaX: number; deltaY: number; x: number; y: number; zoom: boolean }

export function usePanZoom(tool: Tool) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 0.5 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragging, setDragging] = useState(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const touches = useRef(new Map<number, Point>());
  const current = useRef(view);
  current.current = view;
  const animation = useRef<number | null>(null);
  const stop = useCallback(() => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
  }, []);
  useEffect(() => stop, [stop]);

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
      stop();
      const rect = el.getBoundingClientRect();
      wheelAt({ deltaX: e.deltaX, deltaY: e.deltaY, x: e.clientX - rect.left, y: e.clientY - rect.top, zoom: e.ctrlKey || e.metaKey });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [wheelAt, stop]);

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
      stop();
      e.currentTarget.setPointerCapture(e.pointerId);
      last.current = { x: e.clientX, y: e.clientY };
      if (touch) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      setDragging(true);
    },
    [panning, stop],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' && !touches.current.has(e.pointerId)) return;
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

  const fit = useCallback((bounds: Bounds | null | undefined, insets: Insets = INSETS, options: { animate?: boolean } = {}) => {
    const el = viewportRef.current;
    if (!el || !bounds) return;
    const target = fitView(bounds, { width: el.clientWidth, height: el.clientHeight }, insets);
    stop();
    if (!options.animate || reducedMotion()) {
      setView(target);
      return;
    }
    const from = current.current;
    const start = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / FIT_MS);
      setView(p === 1 ? target : tweenView(from, target, ease(p)));
      animation.current = p === 1 ? null : requestAnimationFrame(tick);
    };
    animation.current = requestAnimationFrame(tick);
  }, [stop]);

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
    cursor: dragging ? 'grabbing' : panning ? 'grab' : tool === 'comment' ? COMMENT_CURSOR : 'default',
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
