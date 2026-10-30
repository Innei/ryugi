import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import {
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { reducedMotion, SPRING } from '../document/motion';
import { t } from '../i18n';
import { lockAxis, rubber, settle, velocityTracker } from '../lib/gesture';
import { color } from '../tokens.stylex';

const SCRIM = 0.28;

const styles = stylex.create({
  root: { position: 'absolute', inset: 0, overflow: 'clip', pointerEvents: 'none' },
  scrim: { position: 'absolute', inset: 0, backgroundColor: color.overlay },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: 'env(safe-area-inset-bottom)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: cssVar.colorBgContainer,
    boxShadow: `0 -8px 30px ${color.overlayShadowSoft}, 0 0 0 1px ${color.overlayShadowHair}`,
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
    pointerEvents: 'auto',
    willChange: 'transform',
  },
  head: { flexShrink: 0, touchAction: 'none', userSelect: 'none' },
  handle: {
    display: 'grid',
    placeItems: 'center',
    width: '100%',
    height: 18,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    cursor: 'grab',
  },
  bar: { width: 36, height: 4, borderRadius: 2, backgroundColor: cssVar.colorFill },
  body: { flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' },
});

interface Props {
  children: ReactNode;
  className?: string;
  header: ReactNode;
  onScrim?: () => void;
  onSnap: (snap: number) => void;
  snap: number;
  snaps: number[];
}

export const sheetHeight = (snap: number, container: number) =>
  snap <= 1 ? snap * container : snap;
const shiftOf = (transform: string) =>
  Number(
    transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,\s*([-\d.]+)\)/)?.[1] ??
      transform.match(/translateY\(([-\d.]+)px\)/)?.[1] ??
      0,
  );
const INTERACTIVE = 'button, a, input, textarea, select, [contenteditable="true"]';

export function BottomSheet({ snaps, snap, onSnap, header, children, onScrim, className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const [container, setContainer] = useState(0);
  const [ready, setReady] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const gesture = useRef<{
    id: number;
    y: number;
    from: number;
    locked: boolean;
    track: ReturnType<typeof velocityTracker>;
  } | null>(null);
  const dragged = useRef(false);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    setContainer(el.clientHeight);
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(() => setContainer(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const heights = snaps.map((s) => sheetHeight(s, container));
  const index = Math.max(0, snaps.indexOf(snap));
  const lowest = heights[0] ?? 0;
  const highest = heights.at(-1) ?? 0;
  const resting = heights[index] ?? lowest;
  const height = drag ?? resting;
  const progress =
    highest > lowest ? Math.min(1, Math.max(0, (height - lowest) / (highest - lowest))) : 0;
  const transition =
    !ready || drag !== null || reducedMotion()
      ? 'none'
      : `transform ${SPRING.duration}ms ${SPRING.easing}`;
  const step = () => onSnap(snaps[index === snaps.length - 1 ? 0 : index + 1]!);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || gesture.current) return;
    const now = performance.now();
    const track = velocityTracker();
    track.add(event.clientX, event.clientY, now);
    const onScreen = sheetRef.current
      ? highest - shiftOf(getComputedStyle(sheetRef.current).transform)
      : height;
    const caught = Math.abs(onScreen - height) > 1;
    gesture.current = {
      id: event.pointerId,
      y: event.clientY,
      from: caught ? onScreen : height,
      locked: false,
      track,
    };
    dragged.current = false;
    if (caught) setDrag(onScreen);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    g.track.add(event.clientX, event.clientY, performance.now());
    const dy = event.clientY - g.y;
    if (!g.locked) {
      const axis = lockAxis(0, dy);
      if (!axis) return;
      g.locked = true;
      dragged.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setDrag(rubber(g.from - dy, lowest, highest));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    gesture.current = null;
    if (!g.locked) return setDrag(null);
    const released = rubber(g.from - (event.clientY - g.y), lowest, highest);
    const next = settle(heights, released, -g.track.velocity(performance.now()).y);
    setDrag(null);
    onSnap(snaps[next]!);
    setTimeout(() => {
      dragged.current = false;
    });
  };
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest(INTERACTIVE)) return;
    step();
  };

  return (
    <div ref={rootRef} {...stylex.props(styles.root)}>
      {onScrim ? (
        <div
          data-scrim
          onClick={onScrim}
          {...stylex.props(styles.scrim)}
          style={{
            opacity: SCRIM * progress,
            pointerEvents: drag === null && index === snaps.length - 1 ? 'auto' : 'none',
            transition: transition.replace('transform', 'opacity'),
          }}
        />
      ) : null}
      <section
        data-sheet
        data-snap={String(snap)}
        ref={sheetRef}
        className={
          [stylex.props(styles.sheet).className, className].filter(Boolean).join(' ') || undefined
        }
        style={{
          ...stylex.props(styles.sheet).style,
          height: highest,
          transform: `translateY(${highest - height}px)`,
          transition,
        }}
      >
        <div
          data-sheet-head
          onClick={onClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClickCapture={(event) => {
            if (dragged.current) event.stopPropagation();
          }}
          onPointerCancel={(event) => {
            if (gesture.current?.id !== event.pointerId) return;
            gesture.current = null;
            setDrag(null);
          }}
          {...stylex.props(styles.head)}
        >
          <button
            aria-label={index === snaps.length - 1 ? t('common.collapse') : t('common.expand')}
            type="button"
            onClick={step}
            {...stylex.props(styles.handle)}
          >
            <span {...stylex.props(styles.bar)} />
          </button>
          {header}
        </div>
        <div
          data-sheet-body
          {...stylex.props(styles.body)}
          style={{ paddingBottom: highest - resting }}
        >
          {children}
        </div>
      </section>
    </div>
  );
}
