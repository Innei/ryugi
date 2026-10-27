interface Point {
  x: number;
  y: number;
}
export interface CursorPose extends Point {
  angle: number;
}

function bezier(points: Point[], t: number): Point {
  let level = points;
  while (level.length > 1) {
    level = level.slice(0, -1).map((p, i) => ({
      x: p.x + (level[i + 1]!.x - p.x) * t,
      y: p.y + (level[i + 1]!.y - p.y) * t,
    }));
  }
  return level[0]!;
}

export function cursorPath(from: Point, to: Point, heading?: number) {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  let nx = -dy,
    ny = dx;
  if (nx < 0) {
    nx = -nx;
    ny = -ny;
  }
  const point = (along: number, across: number) => ({
    x: from.x + dx * along + nx * across,
    y: from.y + dy * along + ny * across,
  });
  // One quintic keeps curvature continuous through the wide turn and return.
  const points = [from, point(0.2, 0), point(0.3, -0.5), point(1.55, 1.25), point(1.35, 0.1), to];
  if (heading !== undefined) {
    const radians = ((heading - 135) * Math.PI) / 180;
    const reach = Math.hypot(dx, dy) * 0.2;
    points[1] = { x: from.x + Math.cos(radians) * reach, y: from.y + Math.sin(radians) * reach };
  }
  const tangents = points
    .slice(0, -1)
    .map((p, i) => ({ x: 5 * (points[i + 1]!.x - p.x), y: 5 * (points[i + 1]!.y - p.y) }));
  const lengths = [0];
  let previous = from;
  for (let i = 1; i <= 600; i++) {
    const next = bezier(points, i / 600);
    lengths.push(lengths[i - 1]! + Math.hypot(next.x - previous.x, next.y - previous.y));
    previous = next;
  }
  const length = lengths[600]!;
  return {
    length,
    at(progress: number): CursorPose {
      const distance = Math.max(0, Math.min(1, progress)) * length;
      let low = 0,
        high = 600;
      while (high - low > 1) {
        const mid = (low + high) >> 1;
        if (lengths[mid]! < distance) low = mid;
        else high = mid;
      }
      const span = lengths[high]! - lengths[low]!;
      const t = (low + (span ? (distance - lengths[low]!) / span : 0)) / 600;
      const tangent = bezier(tangents, t);
      return {
        ...bezier(points, t),
        angle: (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI + 135,
      };
    },
  };
}
