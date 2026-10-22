import * as stylex from '@stylexjs/stylex';
import { useLayoutEffect, useRef } from 'react';
import { cursorPath, type CursorPose } from '../lib/cursorMotion';
import { brand } from '../tokens.stylex';

const styles = stylex.create({
  cursor: { position: 'absolute', left: 0, top: 0, zIndex: 5, pointerEvents: 'none', transformOrigin: '0 0' },
  arrow: {
    display: 'block', transformOrigin: '4.5px 4px', fill: brand.accent, stroke: '#fff', strokeWidth: 1.6,
    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
  },
  label: {
    position: 'absolute', left: 15, top: 16, paddingBlock: 2, paddingInline: 7,
    borderRadius: 5, backgroundColor: brand.accentStrong, color: '#fff',
    fontSize: 11, fontWeight: 500, lineHeight: '16px', whiteSpace: 'nowrap',
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
  },
});

export function WritingCursor({ x, y, zoom, agent, title }: { x: number; y: number; zoom: number; agent: string; title: string }) {
  const cursor = useRef<HTMLDivElement>(null);
  const arrow = useRef<SVGSVGElement>(null);
  const pose = useRef<CursorPose | null>(null);
  const moving = useRef(false);
  const scale = useRef(zoom);
  const transform = (p: CursorPose) => `translate(${p.x}px, ${p.y}px) scale(${1 / scale.current})`;
  const rotation = (angle: number) => `translate(-4.5px, -4px) rotate(${angle}deg) scale(0.625)`;
  const paint = (p: CursorPose) => {
    pose.current = p;
    if (cursor.current) cursor.current.style.transform = transform(p);
    if (arrow.current) arrow.current.style.transform = rotation(p.angle);
  };

  useLayoutEffect(() => {
    scale.current = zoom;
    if (pose.current) paint(pose.current);
  }, [zoom]);

  useLayoutEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const from = pose.current;
    let frame = 0;
    const snap = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      moving.current = false;
      paint({ x, y, angle: pose.current?.angle ?? 0 });
    };
    if (!from || media.matches || Math.hypot(x - from.x, y - from.y) * scale.current < 2) snap();
    else {
      const path = cursorPath(from, { x, y }, moving.current ? from.angle : undefined);
      const duration = Math.min(1800, 900 + path.length * scale.current * 1.2);
      const start = performance.now();
      let previous = start;
      moving.current = true;
      const tick = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - start) / duration));
        const next = path.at(t ** 3 * (t * (t * 6 - 15) + 10));
        const angle = pose.current!.angle;
        const turn = ((next.angle - angle) % 360 + 540) % 360 - 180;
        next.angle = angle + turn * (1 - Math.exp(-(now - previous) / 80));
        previous = now;
        paint(next);
        if (t < 1) frame = requestAnimationFrame(tick);
        else { frame = 0; moving.current = false; }
      };
      frame = requestAnimationFrame(tick);
    }
    const preferenceChanged = () => { if (media.matches) snap(); };
    media.addEventListener('change', preferenceChanged);
    return () => { cancelAnimationFrame(frame); media.removeEventListener('change', preferenceChanged); };
  }, [x, y]);

  const initial = pose.current ?? { x, y, angle: 0 };
  return (
    <div ref={cursor} role="status" aria-label={`${agent} is drawing ${title}`} {...stylex.props(styles.cursor)} style={{ transform: transform(initial) }}>
      <svg ref={arrow} width="32" height="34" viewBox="0 0 32 34" aria-hidden="true" {...stylex.props(styles.arrow)} style={{ transform: rotation(initial.angle) }}>
        <path d="M6.1 3.4C4.8 2.3 3.5 3.1 3.8 4.8L8.7 28.2C9 29.9 10.8 30.2 11.7 28.8L16.3 21.4C16.6 21 17.2 20.8 17.7 20.9L26.1 22.2C27.9 22.5 28.7 20.5 27.3 19.3Z" />
      </svg>
      <span {...stylex.props(styles.label)}>{agent}</span>
    </div>
  );
}
