import * as stylex from '@stylexjs/stylex';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { HAND_PALM, handPose } from '../lib/handPose';
import { stepSpring, type Spring } from '../lib/spring';

const INK = '#423d38';
const CURL_DELAY_MS = 30;
const HIDE_SYSTEM_CURSOR = '[data-hand-drawn], [data-hand-drawn] * { cursor: none !important; }';

const styles = stylex.create({
  cursor: {
    position: 'fixed',
    left: 0,
    top: 0,
    zIndex: 1000,
    pointerEvents: 'none',
    filter: 'drop-shadow(0 1.5px 2px rgba(0,0,0,0.25))',
  },
});

type Point = { x: number; y: number };

const round = (n: number) => Math.round(n * 100) / 100;
const settled = (spring: Spring, target: number) =>
  Math.abs(spring.value - target) < 5e-4 && Math.abs(spring.velocity) < 5e-3;

interface Props {
  viewport: RefObject<HTMLElement | null>;
  hand: 'open' | 'pinch' | null;
}

export function HandCursor({ viewport, hand }: Props) {
  const seen = useRef<Point | null>(null);
  const shown = useRef(hand !== null);
  const [point, setPoint] = useState<Point | null>(null);
  const [pose, setPose] = useState({ pinch: 0, curl: 0 });
  const springs = useRef({
    pinch: { value: 0, velocity: 0 },
    curl: { value: 0, velocity: 0 },
    goal: 0,
  });
  const target = hand === 'pinch' ? 1 : 0;
  const active = hand !== null && point !== null;

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const see = (next: Point | null) => {
      seen.current = next;
      if (shown.current) setPoint(next);
    };
    const track = (event: PointerEvent) => {
      const outside =
        event.pointerType === 'touch' ||
        (event.target as Element | null)?.closest?.('[data-chrome]');
      see(outside ? null : { x: event.clientX, y: event.clientY });
    };
    // Moves inside a board iframe never reach the canvas, so the last canvas point goes stale there.
    const enter = (event: PointerEvent) => {
      if (event.target instanceof HTMLIFrameElement) see(null);
    };
    const leave = () => see(null);
    el.addEventListener('pointermove', track);
    el.addEventListener('pointerdown', track);
    el.addEventListener('pointerover', enter);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', track);
      el.removeEventListener('pointerdown', track);
      el.removeEventListener('pointerover', enter);
      el.removeEventListener('pointerleave', leave);
    };
  }, [viewport]);

  useLayoutEffect(() => {
    shown.current = hand !== null;
    setPoint(shown.current ? seen.current : null);
  }, [hand]);

  useLayoutEffect(() => {
    viewport.current?.toggleAttribute('data-hand-drawn', active);
  }, [viewport, active]);

  useEffect(() => {
    const state = springs.current;
    const previous = state.goal;
    state.goal = target;
    if (settled(state.pinch, target) && settled(state.curl, target)) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      state.pinch = { value: target, velocity: 0 };
      state.curl = { value: target, velocity: 0 };
      setPose({ pinch: target, curl: target });
      return;
    }
    const changed = performance.now();
    let last = changed;
    let frame = 0;
    const tick = (now: number) => {
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      const curlGoal = now - changed >= CURL_DELAY_MS ? target : previous;
      state.pinch = stepSpring(state.pinch, target, dt);
      state.curl = stepSpring(state.curl, curlGoal, dt);
      if (curlGoal === target && settled(state.pinch, target) && settled(state.curl, target)) {
        state.pinch = { value: target, velocity: 0 };
        state.curl = { value: target, velocity: 0 };
        frame = 0;
      } else {
        frame = requestAnimationFrame(tick);
      }
      setPose({ pinch: state.pinch.value, curl: state.curl.value });
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  if (!active) return null;
  const { index, thumb, fingers, seam } = handPose(pose.pinch, pose.curl);
  const curled = fingers.map((f, i) => (
    <rect
      key={i}
      x={f.x}
      y={f.y}
      width={f.width}
      height={f.height}
      rx={f.radius}
      transform={f.transform}
    />
  ));
  return (
    <>
      <style>{HIDE_SYSTEM_CURSOR}</style>
      <svg
        data-hand-cursor=""
        data-pinch={round(pose.pinch)}
        data-curl={round(pose.curl)}
        width="32"
        height="32"
        viewBox="0 0 32 32"
        aria-hidden="true"
        {...stylex.props(styles.cursor)}
        style={{ transform: `translate(${point.x - 16}px, ${point.y - 16}px)` }}
      >
        <g fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round">
          {curled}
          <path d={HAND_PALM} />
        </g>
        <g fill="none" stroke={INK} strokeLinecap="round">
          <path d={index.d} strokeWidth="5.4" />
          <path d={thumb.d} strokeWidth="5.8" />
        </g>
        <g fill="#fff">
          {curled}
          <path d={HAND_PALM} />
        </g>
        <path d={index.d} fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
        <path
          d={thumb.d}
          fill="none"
          stroke={INK}
          strokeOpacity={seam}
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path d={thumb.d} fill="none" stroke="#fff" strokeWidth="3.8" strokeLinecap="round" />
        {/* Repainting the palm hides the thumb's own outline where it crosses the palm, so only the seam against the index shows. */}
        <path d={HAND_PALM} fill="#fff" />
      </svg>
    </>
  );
}
