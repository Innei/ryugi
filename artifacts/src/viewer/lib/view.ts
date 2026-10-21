import { NAME_STRIP_H } from '../../shared/geometry';
import type { Bounds, CanvasLayout, CanvasSpec, Rect } from '../../shared/types';

export interface View {
  x: number;
  y: number;
  k: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 4;
export const LABEL_MIN_WIDTH = 48;
const FIT_MARGIN = 0.9;

const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

const toBounds = (r: Rect): Bounds => ({ minX: r.x, minY: r.y, maxX: r.x + r.w, maxY: r.y + r.h });

export function fitView(bounds: Bounds, viewport: { width: number; height: number }, insets: Insets): View {
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
    return { page: board.page, bounds: toBounds({ ...board, y: board.y - NAME_STRIP_H, h: board.h + NAME_STRIP_H }) };
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
  follow: number;
  min: number;
  hideBelow: number;
  cap: boolean;
}

export const GROUP_LABEL_RULE: LabelRule = { base: 27, follow: 0.7, min: 4, hideBelow: 0.05, cap: true };
export const BOARD_LABEL_RULE: LabelRule = { base: 23, follow: 0.85, min: 0, hideBelow: 0.11, cap: true };
const TITLE_RULE: Omit<LabelRule, 'base'> = { follow: 1, min: 24, hideBelow: 0, cap: false };

export function labelSize(rule: LabelRule, k: number) {
  if (k < rule.hideBelow) return null;
  const size = rule.base * k ** rule.follow;
  return Math.max(rule.cap ? Math.min(size, rule.base) : size, rule.min);
}

export const titleScale = (size: number, k: number) => labelSize({ ...TITLE_RULE, base: size }, k)! / (size * k);
