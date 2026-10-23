import * as stylex from '@stylexjs/stylex';
import { useLayoutEffect, useRef } from 'react';
import { cursorPath, type CursorPose } from '../lib/cursorMotion';
import { brand } from '../tokens.stylex';

const ARROW = 'M6.2 3.6C5 2.7 3.4 3.6 3.6 5.1L6 22.7C6.2 24.3 8.2 24.8 9.1 23.5L13 18.3C13.4 17.8 14 17.5 14.6 17.5L21.1 17.3C22.7 17.2 23.4 15.2 22.2 14.3Z';
const TRAIL = [{ distance: 26, size: 7, opacity: 0.5 }, { distance: 34, size: 5, opacity: 0.3 }, { distance: 41, size: 3.5, opacity: 0.15 }];

const styles = stylex.create({
  cursor: { position: 'absolute', left: 0, top: 0, zIndex: 5, pointerEvents: 'none', transformOrigin: '0 0' },
  trail: { position: 'absolute', left: 0, top: 0, transitionProperty: 'opacity', transitionDuration: '200ms' },
  dot: { position: 'absolute', left: 0, top: 0, borderRadius: '50%', backgroundColor: brand.accent },
  arrow: {
    display: 'block', transformOrigin: '4px 4px',
    filter: 'drop-shadow(0 1.5px 2px rgba(0,0,0,0.22))',
  },
  fill: { fill: brand.accent },
  label: {
    position: 'absolute', left: 16, top: 20, display: 'flex', alignItems: 'center', gap: 4,
    paddingBlock: 3, paddingInlineStart: 7, paddingInlineEnd: 10,
    borderRadius: 999, backgroundColor: brand.accentStrong, color: '#fff',
    fontSize: 12, fontWeight: 700, lineHeight: '16px', whiteSpace: 'nowrap',
    boxShadow: '0 2px 6px rgba(0,0,0,0.14), 0 0 0 2px #fff',
  },
});

export function WritingCursor({ x, y, zoom, agent, title }: { x: number; y: number; zoom: number; agent: string; title: string }) {
  const cursor = useRef<HTMLDivElement>(null);
  const arrow = useRef<SVGSVGElement>(null);
  const trail = useRef<HTMLDivElement>(null);
  const pose = useRef<CursorPose | null>(null);
  const moving = useRef(false);
  const scale = useRef(zoom);
  const transform = (p: CursorPose) => `translate(${p.x}px, ${p.y}px) scale(${1 / scale.current})`;
  const rotation = (angle: number) => `translate(-4px, -4px) rotate(${angle}deg)`;
  const paint = (p: CursorPose) => {
    pose.current = p;
    if (cursor.current) cursor.current.style.transform = transform(p);
    if (arrow.current) arrow.current.style.transform = rotation(p.angle);
    if (!trail.current) return;
    trail.current.style.opacity = moving.current ? '1' : '0';
    const heading = (p.angle - 135) * Math.PI / 180;
    TRAIL.forEach(({ distance, size }, i) => {
      const dot = trail.current!.children[i] as HTMLElement;
      dot.style.transform = `translate(${-Math.cos(heading) * distance - size / 2}px, ${-Math.sin(heading) * distance - size / 2}px)`;
    });
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
        moving.current = t < 1;
        paint(next);
        frame = t < 1 ? requestAnimationFrame(tick) : 0;
      };
      frame = requestAnimationFrame(tick);
    }
    const preferenceChanged = () => { if (media.matches) snap(); };
    media.addEventListener('change', preferenceChanged);
    return () => { cancelAnimationFrame(frame); media.removeEventListener('change', preferenceChanged); };
  }, [x, y]);

  const initial = pose.current ?? { x, y, angle: 0 };
  return (
    <div ref={cursor} role="status" aria-label={`${agent} last worked on ${title}`} {...stylex.props(styles.cursor)} style={{ transform: transform(initial) }}>
      <div ref={trail} data-trail="" aria-hidden="true" {...stylex.props(styles.trail)} style={{ opacity: 0 }}>
        {TRAIL.map(({ size, opacity }) => <div key={size} {...stylex.props(styles.dot)} style={{ width: size, height: size, opacity }} />)}
      </div>
      <svg ref={arrow} width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" {...stylex.props(styles.arrow)} style={{ transform: rotation(initial.angle) }}>
        <path d={ARROW} fill="none" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
        <path d={ARROW} {...stylex.props(styles.fill)} />
      </svg>
      <span {...stylex.props(styles.label)}>
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1Q6.8 5.2 11 6Q6.8 6.8 6 11Q5.2 6.8 1 6Q5.2 5.2 6 1Z" fill="#fff" /></svg>
        {agent}
      </span>
    </div>
  );
}
