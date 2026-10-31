import * as stylex from '@stylexjs/stylex';
import { useId, useLayoutEffect, useRef } from 'react';

import { CURSOR_ARROW } from '../../shared/inspector';
import { cursorPath, type CursorPose } from '../lib/cursorMotion';
import { color } from '../tokens.stylex';

const styles = stylex.create({
  cursor: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 5,
    pointerEvents: 'none',
    transformOrigin: '0 0',
  },
  arrow: {
    display: 'block',
    transformOrigin: '3.43px 3.43px',
    filter: `drop-shadow(0 1.5px 2px ${color.shadowStrong})`,
  },
  label: {
    position: 'absolute',
    left: 14,
    top: 17,
    display: 'flex',
    alignItems: 'center',
    gap: 3.5,
    paddingBlock: 2.5,
    paddingInlineStart: 6,
    paddingInlineEnd: 7,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    borderBottomLeftRadius: 6,
    backgroundImage: `linear-gradient(135deg, ${color.selection}, ${color.agent})`,
    color: color.white,
    fontSize: 11,
    fontWeight: 600,
    lineHeight: '15px',
    whiteSpace: 'nowrap',
    boxShadow: `0 2px 5px ${color.shadow}`,
  },
});

export function WritingCursor({
  x,
  y,
  zoom,
  agent,
  title,
}: {
  x: number;
  y: number;
  zoom: number;
  agent: string;
  title: string;
}) {
  const gradient = `agent-${useId().replaceAll(/[^\w-]/g, '')}`;
  const cursor = useRef<HTMLDivElement>(null);
  const arrow = useRef<SVGSVGElement>(null);
  const pose = useRef<CursorPose | null>(null);
  const moving = useRef(false);
  const scale = useRef(zoom);
  const transform = (p: CursorPose) => `translate(${p.x}px, ${p.y}px) scale(${1 / scale.current})`;
  const rotation = (angle: number) => `translate(-3.43px, -3.43px) rotate(${angle}deg)`;
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
        const turn = ((((next.angle - angle) % 360) + 540) % 360) - 180;
        next.angle = angle + turn * (1 - Math.exp(-(now - previous) / 80));
        previous = now;
        moving.current = t < 1;
        paint(next);
        frame = t < 1 ? requestAnimationFrame(tick) : 0;
      };
      frame = requestAnimationFrame(tick);
    }
    const preferenceChanged = () => {
      if (media.matches) snap();
    };
    media.addEventListener('change', preferenceChanged);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener('change', preferenceChanged);
    };
  }, [x, y]);

  const initial = pose.current ?? { x, y, angle: 0 };
  return (
    <div
      aria-label={`${agent} last worked on ${title}`}
      ref={cursor}
      role="status"
      {...stylex.props(styles.cursor)}
      style={{ transform: transform(initial) }}
    >
      <svg
        aria-hidden="true"
        height="24"
        ref={arrow}
        viewBox="0 0 28 28"
        width="24"
        {...stylex.props(styles.arrow)}
        style={{ transform: rotation(initial.angle) }}
      >
        <path
          d={CURSOR_ARROW}
          fill="none"
          stroke={color.white}
          strokeLinejoin="round"
          strokeWidth="4"
        />
        <defs>
          <linearGradient id={gradient} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor={color.selection} />
            <stop offset="1" stopColor={color.agent} />
          </linearGradient>
        </defs>
        <path d={CURSOR_ARROW} fill={`url(#${gradient})`} />
      </svg>
      <span {...stylex.props(styles.label)}>{agent}</span>
    </div>
  );
}
