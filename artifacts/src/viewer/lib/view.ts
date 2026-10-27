import { NAME_STRIP_H } from '../../shared/geometry';
import type { Bounds, CanvasLayout, CanvasSpec, Rect } from '../../shared/types';

export interface View {
  k: number;
  x: number;
  y: number;
}

export interface Insets {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 4;
export const LABEL_MIN_WIDTH = 48;
const FIT_MARGIN = 0.9;

const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

const toBounds = (r: Rect): Bounds => ({ minX: r.x, minY: r.y, maxX: r.x + r.w, maxY: r.y + r.h });

export function fitView(
  bounds: Bounds,
  viewport: { width: number; height: number },
  insets: Insets,
): View {
  const availW = Math.max(1, viewport.width - insets.left - insets.right);
  const availH = Math.max(1, viewport.height - insets.top - insets.bottom);
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const k = clampZoom(Math.min(1, Math.min(availW / bw, availH / bh) * FIT_MARGIN));
  return {
    k,
    x: insets.left + (availW - bw * k) / 2 - bounds.minX * k,
    y: insets.top + (availH - bh * k) / 2 - bounds.minY * k,
  };
}

export function zoomAround(view: View, factor: number, cx: number, cy: number): View {
  const k = clampZoom(view.k * factor);
  const ratio = k / view.k;
  return { k, x: cx - (cx - view.x) * ratio, y: cy - (cy - view.y) * ratio };
}

export interface Point {
  x: number;
  y: number;
}

export function pinchView(view: View, from: [Point, Point], to: [Point, Point]): View {
  const distance = ([a, b]: [Point, Point]) => Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
  const mid = ([a, b]: [Point, Point]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const k = clampZoom(view.k * (distance(to) / distance(from)));
  const ratio = k / view.k;
  const start = mid(from);
  const end = mid(to);
  return { k, x: end.x - (start.x - view.x) * ratio, y: end.y - (start.y - view.y) * ratio };
}

export function zoomTo(view: View, k: number, cx: number, cy: number): View {
  return zoomAround(view, k / view.k, cx, cy);
}

export function resolveFocus(
  canvas: CanvasSpec,
  layout: CanvasLayout,
  target: string,
): { page: string; bounds: Bounds } | null {
  const board = canvas.boards[target];
  if (board) {
    return {
      page: board.page,
      bounds: toBounds({ ...board, y: board.y - NAME_STRIP_H, h: board.h + NAME_STRIP_H }),
    };
  }
  for (const [page, pageLayout] of Object.entries(layout.pages)) {
    const rect = pageLayout.groups[target] ?? pageLayout.notes[target];
    if (rect) return { page, bounds: toBounds(rect) };
  }
  return null;
}

export function labelRect(board: { x: number; y: number; w: number }, view: View) {
  const width = board.w * view.k;
  if (width < LABEL_MIN_WIDTH) return null;
  return { left: view.x + board.x * view.k, top: view.y + board.y * view.k, width };
}

export interface LabelRule {
  base: number;
  cap: boolean;
  follow: number;
  hideBelow: number;
  min: number;
}

export const GROUP_LABEL_RULE: LabelRule = {
  base: 27,
  follow: 0.7,
  min: 4,
  hideBelow: 0.05,
  cap: true,
};
export const BOARD_LABEL_RULE: LabelRule = {
  base: 23,
  follow: 0.85,
  min: 0,
  hideBelow: 0.11,
  cap: true,
};
const TITLE_RULE: Omit<LabelRule, 'base'> = { follow: 1, min: 24, hideBelow: 0, cap: false };

export function labelSize(rule: LabelRule, k: number) {
  if (k < rule.hideBelow) return null;
  const size = rule.base * k ** rule.follow;
  return Math.max(rule.cap ? Math.min(size, rule.base) : size, rule.min);
}

export const titleScale = (size: number, k: number) =>
  labelSize({ ...TITLE_RULE, base: size }, k)! / (size * k);

export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (t: number, a: number, b: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
  const slope = (t: number, a: number, b: number) =>
    3 * a * (1 - t) ** 2 + 6 * (b - a) * t * (1 - t) + 3 * (1 - b) * t ** 2;
  return (x: number) => {
    if (x <= 0 || x >= 1) return Math.min(1, Math.max(0, x));
    let t = x;
    for (let i = 0; i < 8; i++) {
      const d = slope(t, x1, x2);
      if (Math.abs(d) < 1e-6) break;
      t = Math.min(1, Math.max(0, t - (at(t, x1, x2) - x) / d));
    }
    return at(t, y1, y2);
  };
}

export const tweenView = (from: View, to: View, p: number): View => ({
  x: from.x + (to.x - from.x) * p,
  y: from.y + (to.y - from.y) * p,
  k: from.k + (to.k - from.k) * p,
});
