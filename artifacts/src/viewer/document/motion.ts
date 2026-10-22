export const EASE = 'cubic-bezier(.2, 0, 0, 1)';
export const EXIT = 'cubic-bezier(.4, 0, 1, 1)';

export function spring(stiffness: number, damping: number): { easing: string; duration: number } {
  const dt = 1 / 120;
  const samples: number[] = [];
  let x = 0;
  let v = 0;
  for (let i = 0; i < 480; i++) {
    v += (-stiffness * (x - 1) - damping * v) * dt;
    x += v * dt;
    samples.push(x);
    if (Math.abs(1 - x) < 0.001 && Math.abs(v) < 0.01) break;
  }
  const step = Math.max(1, Math.floor(samples.length / 48));
  const points = [0];
  for (let i = step; i < samples.length; i += step) points.push(Number(samples[i]!.toFixed(4)));
  points.push(1);
  return { easing: `linear(${points.join(', ')})`, duration: Math.round(samples.length * dt * 1000) };
}

export const SPRING = spring(380, 34);

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function play(el: Element | null, keyframes: Keyframe[], options: KeyframeAnimationOptions): Promise<void> {
  if (!el || reducedMotion()) return Promise.resolve();
  const animation = el.animate(keyframes, { fill: 'both', ...options });
  return animation.finished.then(
    () => animation.cancel(),
    () => undefined,
  );
}
