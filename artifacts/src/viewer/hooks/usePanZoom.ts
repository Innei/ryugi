import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { COMMENT_CURSOR } from '../../shared/inspector';
import type { Bounds } from '../../shared/types';
import {
  cubicBezier,
  fitView,
  type Insets,
  pinchView,
  type Point,
  tweenView,
  type View,
  zoomAround,
  zoomTo,
} from '../lib/view';

export type Tool = 'select' | 'hand' | 'comment';

const INSETS: Insets = { top: 64, right: 24, bottom: 24, left: 24 };
const WHEEL_ZOOM_SPEED = 0.01;
const FIT_MS = 420;
const SCALE_SETTLE_MS = 150;
const ease = cubicBezier(0.2, 0, 0, 1);
const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export interface WheelInput {
  deltaX: number;
  deltaY: number;
  x: number;
  y: number;
  zoom: boolean;
}

// Chrome positioned in canvas space moves with the boards, so a wheel over it belongs to the canvas.
const CANVAS_CHROME = [
  'board-label',
  'group-label',
  'video-controls',
  'comments',
  'reject',
  'parameters',
];
const FIXED_CHROME = `[data-chrome]${CANVAS_CHROME.map((name) => `:not([data-chrome="${name}"])`).join('')}`;

function scrollsItself(target: Element | null, root: Element, dx: number, dy: number) {
  for (let el = target; el && el !== root; el = el.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(el);
    if (dy && /auto|scroll/.test(overflowY) && el.scrollHeight > el.clientHeight) return true;
    if (dx && /auto|scroll/.test(overflowX) && el.scrollWidth > el.clientWidth) return true;
  }
  return false;
}

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
  const [scaling, setScaling] = useState(false);
  const scaledK = useRef(view.k);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // A lone zoom step also re-rasterizes every live frame, so it gets the same cover as a continuous gesture.
  useLayoutEffect(() => {
    if (view.k === scaledK.current) return;
    scaledK.current = view.k;
    setScaling(true);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      settle.current = undefined;
      setScaling(false);
    }, SCALE_SETTLE_MS);
  }, [view.k]);
  useEffect(() => () => clearTimeout(settle.current), []);
  const [size, setSize] = useState(() => ({
    width: typeof innerWidth === 'number' ? innerWidth : 0,
    height: typeof innerHeight === 'number' ? innerHeight : 0,
  }));
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const measure = () =>
      setSize((previous) =>
        previous.width === el.clientWidth && previous.height === el.clientHeight
          ? previous
          : { width: el.clientWidth, height: el.clientHeight },
      );
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const panBy = useCallback(
    (x: number, y: number) => setView((v) => ({ ...v, x: v.x + x, y: v.y + y })),
    [],
  );
  const wheelAt = useCallback(
    (input: WheelInput) => {
      if (input.zoom)
        setView((v) => zoomAround(v, Math.exp(-input.deltaY * WHEEL_ZOOM_SPEED), input.x, input.y));
      else panBy(-input.deltaX, -input.deltaY);
    },
    [panBy],
  );

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const target = e.target as Element | null;
      const zoom = e.ctrlKey || e.metaKey;
      if (
        target?.closest?.(FIXED_CHROME) ||
        (!zoom && scrollsItself(target, el, e.deltaX, e.deltaY))
      )
        return;
      e.preventDefault();
      stop();
      const rect = el.getBoundingClientRect();
      const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      wheelAt({
        deltaX: e.deltaX * factor,
        deltaY: e.deltaY * factor,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        zoom,
      });
    };
    // A trackpad pinch arrives as a ctrl-wheel; left alone over any panel it zooms the whole page.
    const blockPageZoom = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('wheel', blockPageZoom, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('wheel', blockPageZoom);
    };
  }, [wheelAt, stop]);

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) =>
      (e.target as HTMLElement | null)?.closest?.(
        'input, textarea, select, [contenteditable], [data-chrome]',
      );
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

  const fit = useCallback(
    (
      bounds: Bounds | null | undefined,
      insets: Insets = INSETS,
      options: { animate?: boolean } = {},
    ) => {
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
    },
    [stop],
  );

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
    scaling,
    size,
    place: setView,
    fit,
    zoomBy,
    zoomTo: zoomToLevel,
    panBy,
    wheelAt,
    panning,
    setSpaceHeld,
    cursor: dragging
      ? 'grabbing'
      : panning
        ? 'grab'
        : tool === 'comment'
          ? COMMENT_CURSOR
          : 'default',
    hand: dragging ? ('pinch' as const) : panning ? ('open' as const) : null,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
