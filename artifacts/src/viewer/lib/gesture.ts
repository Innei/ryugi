export const SLOP = 6;
export const FLICK = 0.4;
const RESISTANCE = 0.25;
const WINDOW = 100;
const REST = 80;

export type Axis = 'x' | 'y';

export const rubber = (value: number, min: number, max: number) =>
  value < min ? min + (value - min) * RESISTANCE : value > max ? max + (value - max) * RESISTANCE : value;

export function settle(heights: number[], height: number, velocity: number) {
  if (Math.abs(velocity) > FLICK) {
    const up = heights.findIndex((h) => h > height);
    const down = heights.findLastIndex((h) => h < height);
    if (velocity > 0) return up === -1 ? heights.length - 1 : up;
    return down === -1 ? 0 : down;
  }
  let best = 0;
  heights.forEach((h, i) => {
    if (Math.abs(h - height) < Math.abs(heights[best]! - height)) best = i;
  });
  return best;
}

export function lockAxis(dx: number, dy: number): Axis | null {
  if (Math.hypot(dx, dy) < SLOP) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

export function velocityTracker() {
  const samples: { x: number; y: number; t: number }[] = [];
  return {
    add(x: number, y: number, t: number) {
      samples.push({ x, y, t });
      while (samples.length > 2 && t - samples[0]!.t > WINDOW) samples.shift();
    },
    velocity(now: number) {
      const first = samples[0];
      const last = samples.at(-1);
      if (!first || !last || last === first || now - last.t > REST) return { x: 0, y: 0 };
      const dt = last.t - first.t || 1;
      return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
    },
  };
}
