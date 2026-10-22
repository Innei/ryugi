import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { spring } from '../document/motion';
import { lockAxis, rubber, settle, velocityTracker } from '../lib/gesture';

const SPRING = spring(380, 34);
const SCRIM = 0.28;

const styles = stylex.create({
  root: { position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' },
  scrim: { position: 'absolute', inset: 0, backgroundColor: '#18181b' },
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
    boxShadow: '0 -8px 30px rgba(24, 24, 27, 0.12), 0 0 0 1px rgba(24, 24, 27, 0.05)',
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
    pointerEvents: 'auto',
    willChange: 'transform',
  },
  head: { flexShrink: 0, touchAction: 'none', userSelect: 'none' },
  handle: { display: 'grid', placeItems: 'center', width: '100%', height: 18, padding: 0, borderWidth: 0, backgroundColor: 'transparent', cursor: 'grab' },
  bar: { width: 36, height: 4, borderRadius: 2, backgroundColor: cssVar.colorFill },
  body: { flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' },
});

interface Props {
  snaps: number[];
  snap: number;
  onSnap: (snap: number) => void;
  header: ReactNode;
  children: ReactNode;
  onScrim?: () => void;
  className?: string;
}

const heightOf = (snap: number, container: number) => (snap <= 1 ? snap * container : snap);
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const INTERACTIVE = 'button, a, input, textarea, select, [contenteditable="true"]';

export function BottomSheet({ snaps, snap, onSnap, header, children, onScrim, className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const gesture = useRef<{ id: number; y: number; from: number; locked: boolean; track: ReturnType<typeof velocityTracker> } | null>(null);
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

  const heights = snaps.map((s) => heightOf(s, container));
  const index = Math.max(0, snaps.indexOf(snap));
  const lowest = heights[0] ?? 0;
  const highest = heights.at(-1) ?? 0;
  const resting = heights[index] ?? lowest;
  const height = drag ?? resting;
  const progress = highest > lowest ? Math.min(1, Math.max(0, (height - lowest) / (highest - lowest))) : 0;
  const transition = drag !== null || reducedMotion() ? 'none' : `transform ${SPRING.duration}ms ${SPRING.easing}`;
  const step = () => onSnap(snaps[index === snaps.length - 1 ? 0 : index + 1]!);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const now = performance.now();
    const track = velocityTracker();
    track.add(event.clientX, event.clientY, now);
    gesture.current = { id: event.pointerId, y: event.clientY, from: height, locked: false, track };
    dragged.current = false;
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
    if (!g.locked) return;
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
          style={{ opacity: SCRIM * progress, pointerEvents: drag === null && index === snaps.length - 1 ? 'auto' : 'none', transition: transition.replace('transform', 'opacity') }}
        />
      ) : null}
      <section
        data-sheet
        data-snap={String(snap)}
        className={[stylex.props(styles.sheet).className, className].filter(Boolean).join(' ') || undefined}
        style={{ ...stylex.props(styles.sheet).style, height: highest, transform: `translateY(${highest - height}px)`, transition }}
      >
        <div
          data-sheet-head
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            gesture.current = null;
            setDrag(null);
          }}
          onClickCapture={(event) => {
            if (dragged.current) event.stopPropagation();
          }}
          onClick={onClick}
          {...stylex.props(styles.head)}
        >
          <button type="button" aria-label={index === snaps.length - 1 ? '收起' : '展开'} onClick={step} {...stylex.props(styles.handle)}>
            <span {...stylex.props(styles.bar)} />
          </button>
          {header}
        </div>
        <div {...stylex.props(styles.body)} style={{ paddingBottom: highest - resting }}>
          {children}
        </div>
      </section>
    </div>
  );
}
