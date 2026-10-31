import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type PointerEvent, useLayoutEffect, useRef, useState } from 'react';

import { type BoardSpec, isMediaBoard } from '../../shared/types';
import { EASE, EXIT, play, reducedMotion, SPRING } from '../document/motion';
import { usePanZoom } from '../hooks/usePanZoom';
import { t } from '../i18n';
import { type Axis, FLICK, lockAxis, velocityTracker } from '../lib/gesture';
import { color } from '../tokens.stylex';
import { ghostStyles } from './ghost';
import { MediaBoard } from './MediaBoard';

const DISMISS = 120;
const DISMISS_SPEED = 0.5;
const PAGE = 110;
const PAGE_SPEED = 0.4;
const EDGE = 0.25;

export interface Rect {
  h: number;
  w: number;
  x: number;
  y: number;
}

const styles = stylex.create({
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 30,
    display: 'flex',
    flexDirection: 'column',
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
  },
  backdrop: { position: 'absolute', inset: 0, backgroundColor: cssVar.colorBgLayout },
  head: {
    position: 'relative',
    flexShrink: 0,
    height: 52,
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    paddingInlineStart: 4,
    paddingInlineEnd: 16,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: cssVar.colorBorderSecondary,
    backgroundColor: cssVar.colorBgContainer,
  },
  heading: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 },
  title: {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    fontSize: 15,
    fontWeight: 600,
  },
  id: {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    color: cssVar.colorTextTertiary,
    fontFamily: cssVar.fontFamilyCode,
    fontSize: 11,
  },
  count: {
    flexShrink: 0,
    color: cssVar.colorTextSecondary,
    fontSize: 13,
    fontVariantNumeric: 'tabular-nums',
  },
  body: { position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', touchAction: 'none' },
  stage: { position: 'absolute', inset: 0, transformOrigin: '0 0' },
  world: { position: 'absolute', left: 0, top: 0, transformOrigin: '0 0' },
  frame: { display: 'block', borderWidth: 0, backgroundColor: color.white },
  foot: {
    position: 'relative',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    paddingInline: 8,
    paddingTop: 4,
    paddingBottom: 'calc(4px + env(safe-area-inset-bottom))',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: cssVar.colorBorderSecondary,
    backgroundColor: cssVar.colorBgContainer,
  },
  dots: { flex: 1, display: 'flex', justifyContent: 'center', gap: 6 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: cssVar.colorFill,
    transitionProperty: 'width, background-color',
    transitionDuration: '200ms',
  },
  dotCurrent: { width: 18, backgroundColor: cssVar.colorText },
});

interface Props {
  board: BoardSpec;
  id: string;
  onClose: () => void;
  onOpen: (id: string) => void;
  origin?: Rect;
  sandbox?: string;
  siblings: string[];
  src: string;
}

function hold(el: Element | null, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
  if (!el || reducedMotion()) return { done: Promise.resolve(), cancel: () => {} };
  const animation = el.animate(keyframes, { fill: 'forwards', ...options });
  return {
    done: animation.finished.then(
      () => undefined,
      () => undefined,
    ),
    cancel: () => animation.cancel(),
  };
}

export function PhoneBoard({
  id,
  board,
  sandbox = 'allow-scripts',
  src,
  siblings,
  origin,
  onOpen,
  onClose,
}: Props) {
  const { viewportRef, view, place, handlers } = usePanZoom('hand');
  const stage = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ axis: Axis; dx: number; dy: number } | null>(null);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    mode: 'pending' | 'pan' | 'dismiss' | 'swipe';
    track: ReturnType<typeof velocityTracker>;
  } | null>(null);
  const placed = useRef(view);
  placed.current = view;
  const opened = useRef(false);
  const entering = useRef<{ dir: number; leaving: () => void } | null>(null);
  const busy = useRef(false);
  const index = siblings.indexOf(id);
  const previous = index > 0 ? siblings[index - 1] : undefined;
  const next = index >= 0 ? siblings[index + 1] : undefined;

  const size = () => ({
    width: viewportRef.current?.clientWidth ?? board.w,
    height: viewportRef.current?.clientHeight ?? board.h,
  });
  const toward = (rect: Rect | undefined) => {
    const v = placed.current;
    const box = viewportRef.current?.getBoundingClientRect();
    if (!rect || !box) return null;
    const s = rect.w / (board.w * v.k);
    return `translate(${rect.x - box.left - s * v.x}px, ${rect.y - box.top - s * v.y}px) scale(${s})`;
  };
  const chrome = () => [head.current, foot.current];

  useLayoutEffect(() => {
    const { width, height } = size();
    const k = board.interactive
      ? Math.min(1, width / board.w, height / board.h)
      : Math.min(1, width / board.w);
    const v = { k, x: (width - board.w * k) / 2, y: 0 };
    place(v);
    placed.current = v;
    if (!opened.current) {
      opened.current = true;
      const from = toward(origin);
      if (from)
        void play(stage.current, [{ transform: from }, { transform: 'none' }], {
          duration: SPRING.duration,
          easing: SPRING.easing,
        });
      void play(backdrop.current, [{ opacity: 0 }, { opacity: 1 }], {
        duration: 200,
        easing: EASE,
      });
      chrome().forEach(
        (el, i) =>
          void play(
            el,
            [
              { opacity: 0, transform: `translateY(${i ? 12 : -8}px)` },
              { opacity: 1, transform: 'none' },
            ],
            { duration: 180, delay: 90, easing: EASE },
          ),
      );
    } else if (entering.current) {
      const { dir, leaving } = entering.current;
      entering.current = null;
      leaving();
      void play(
        stage.current,
        [
          { transform: `translateX(${dir * width * 0.35}px)`, opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: SPRING.duration, easing: SPRING.easing },
      );
    }
  }, [id, board.w, board.h, board.interactive, place, viewportRef]);

  const settleBack = () => {
    const from = stage.current?.style.transform || 'none';
    setDrag(null);
    void play(stage.current, [{ transform: from }, { transform: 'none' }], {
      duration: SPRING.duration,
      easing: SPRING.easing,
    });
    [backdrop.current, ...chrome()].forEach(
      (el) =>
        void play(el, [{ opacity: Number(el?.style.opacity || 1) }, { opacity: 1 }], {
          duration: 200,
          easing: EASE,
        }),
    );
  };

  const close = async () => {
    if (busy.current) return;
    busy.current = true;
    const from = stage.current?.style.transform || 'none';
    const to = toward(origin);
    const fade = { duration: 100, easing: EXIT };
    await Promise.all([
      to
        ? hold(stage.current, [{ transform: from }, { transform: to }], {
            duration: 240,
            easing: EXIT,
          }).done
        : hold(stage.current, [{ opacity: 1 }, { opacity: 0 }], fade).done,
      hold(
        backdrop.current,
        [{ opacity: Number(backdrop.current?.style.opacity || 1) }, { opacity: 0 }],
        { duration: 240, easing: EXIT },
      ).done,
      ...chrome().map(
        (el) => hold(el, [{ opacity: Number(el?.style.opacity || 1) }, { opacity: 0 }], fade).done,
      ),
    ]);
    onClose();
  };

  const go = async (dir: 1 | -1, target: string | undefined) => {
    if (!target || busy.current) return;
    busy.current = true;
    const from = stage.current?.style.transform || 'none';
    const exit = hold(
      stage.current,
      [
        { transform: from, opacity: 1 },
        { transform: `translateX(${-dir * size().width}px)`, opacity: 0 },
      ],
      { duration: 180, easing: EXIT },
    );
    await exit.done;
    entering.current = { dir, leaving: exit.cancel };
    busy.current = false;
    setDrag(null);
    onOpen(target);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (busy.current || g?.mode === 'dismiss' || g?.mode === 'swipe') return;
    if (g) g.mode = 'pan';
    handlers.onPointerDown(event);
    if (g) return;
    [stage.current, backdrop.current, ...chrome()].forEach((el) =>
      el?.getAnimations().forEach((animation) => animation.cancel()),
    );
    const track = velocityTracker();
    track.add(event.clientX, event.clientY, performance.now());
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      mode: 'pending',
      track,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return handlers.onPointerMove(event);
    g.track.add(event.clientX, event.clientY, performance.now());
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (g.mode === 'pending') {
      const axis = lockAxis(dx, dy);
      if (!axis) return;
      const fits = board.w * view.k <= size().width + 1;
      g.mode =
        axis === 'y' && dy > 0 && view.y >= -0.5
          ? 'dismiss'
          : axis === 'x' && fits && siblings.length > 1
            ? 'swipe'
            : 'pan';
      if (g.mode !== 'pan') handlers.onPointerUp(event);
    }
    if (g.mode === 'pan') handlers.onPointerMove(event);
    else setDrag({ axis: g.mode === 'dismiss' ? 'y' : 'x', dx, dy });
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return handlers.onPointerUp(event);
    gesture.current = null;
    if (g.mode === 'pan' || g.mode === 'pending') return handlers.onPointerUp(event);
    const velocity = g.track.velocity(performance.now());
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (g.mode === 'dismiss')
      return (dy > DISMISS && velocity.y > -FLICK) || velocity.y > DISMISS_SPEED
        ? void close()
        : settleBack();
    const flick = velocity.x < -PAGE_SPEED ? 1 : velocity.x > PAGE_SPEED ? -1 : 0;
    const far = dx < -PAGE ? 1 : dx > PAGE ? -1 : 0;
    const dir = flick === 0 ? far : far === 0 || far === flick ? flick : 0;
    const target = dir === 1 ? next : dir === -1 ? previous : undefined;
    if (target && dir) void go(dir, target);
    else settleBack();
  };

  const { width, height } = size();
  let stageTransform: string | undefined;
  let fade = 1;
  let chromeFade = 1;
  if (drag?.axis === 'y') {
    const pull = Math.max(0, drag.dy);
    const s = 1 - Math.min(pull / 900, 0.3);
    stageTransform = `translate(${drag.dx * 0.6 + ((1 - s) * width) / 2}px, ${pull + ((1 - s) * height) / 2}px) scale(${s})`;
    fade = 1 - Math.min(pull / 420, 0.85);
    chromeFade = Math.max(0, 1 - pull / DISMISS);
  } else if (drag?.axis === 'x') {
    const edge = (drag.dx > 0 && !previous) || (drag.dx < 0 && !next);
    stageTransform = `translateX(${edge ? drag.dx * EDGE : drag.dx}px)`;
  }

  return (
    <div data-phone-board {...stylex.props(styles.overlay)}>
      <div
        ref={backdrop}
        {...stylex.props(styles.backdrop)}
        style={drag ? { opacity: fade } : undefined}
      />
      <header
        ref={head}
        {...stylex.props(styles.head)}
        style={drag ? { opacity: chromeFade } : undefined}
      >
        <button
          aria-label={t('phone.backToCanvas')}
          type="button"
          onClick={() => void close()}
          {...stylex.props(ghostStyles.ghost)}
        >
          <ChevronLeft size={22} />
        </button>
        <span {...stylex.props(styles.heading)}>
          <span {...stylex.props(styles.title)}>{board.title ?? id}</span>
          <code {...stylex.props(styles.id)}>{id}</code>
        </span>
        {siblings.length > 1 ? (
          <span {...stylex.props(styles.count)}>
            {index + 1} / {siblings.length}
          </span>
        ) : null}
      </header>
      <div
        data-board-body
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(event) => {
          const g = gesture.current;
          if (g?.id === event.pointerId) {
            if (g.mode === 'dismiss' || g.mode === 'swipe') settleBack();
            gesture.current = null;
          }
          handlers.onPointerCancel(event);
        }}
        {...stylex.props(styles.body)}
      >
        <div
          data-board-stage
          ref={stage}
          {...stylex.props(styles.stage)}
          style={stageTransform ? { transform: stageTransform } : undefined}
        >
          <div
            {...stylex.props(styles.world)}
            style={{
              width: board.w,
              height: board.h,
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
            }}
          >
            {isMediaBoard(board) ? (
              <MediaBoard board={board} id={id} key={id} src={src} zoom={view.k} />
            ) : (
              <iframe
                key={id}
                sandbox={sandbox}
                src={src}
                title={board.title ?? id}
                {...stylex.props(styles.frame)}
                style={{
                  width: board.w,
                  height: board.h,
                  pointerEvents: board.interactive ? 'auto' : 'none',
                }}
              />
            )}
          </div>
        </div>
      </div>
      {siblings.length > 1 ? (
        <div
          ref={foot}
          {...stylex.props(styles.foot)}
          style={drag ? { opacity: chromeFade } : undefined}
        >
          <button
            aria-label={t('phone.previousBoard')}
            disabled={!previous}
            type="button"
            onClick={() => void go(-1, previous)}
            {...stylex.props(ghostStyles.ghost)}
          >
            <ChevronLeft size={20} />
          </button>
          <span {...stylex.props(styles.dots)}>
            {siblings.map((sibling, i) => (
              <span
                data-dot={i === index ? 'current' : ''}
                key={sibling}
                {...stylex.props(styles.dot, i === index && styles.dotCurrent)}
              />
            ))}
          </span>
          <button
            aria-label={t('phone.nextBoard')}
            disabled={!next}
            type="button"
            onClick={() => void go(1, next)}
            {...stylex.props(ghostStyles.ghost)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
