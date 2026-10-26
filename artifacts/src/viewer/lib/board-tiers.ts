import type { View } from './view';

export const SNAPSHOT_SCALES = [0.125, 0.25, 0.5, 1, 2] as const;
export type SnapshotScale = (typeof SNAPSHOT_SCALES)[number];
export type BoardTier = 'live' | 'snapshot' | 'placeholder' | 'empty';
export const LIVE_MIN_ZOOM = 0.4;
export const LIVE_MAX = 4;
const VISIBLE_MARGIN = 240;

export interface TierBoard { id: string; x: number; y: number; w: number; h: number }
export interface TierInput {
  boards: TierBoard[];
  view: View;
  viewport: { width: number; height: number };
  pinned: ReadonlySet<string>;
  snapshots: ReadonlySet<string>;
}
export interface BoardRender { tier: BoardTier; mounted: boolean; image: string | null; overlay: boolean; hidden: boolean }

export const snapshotScale = (k: number, dpr: number): SnapshotScale =>
  SNAPSHOT_SCALES.find((scale) => scale >= k * dpr) ?? SNAPSHOT_SCALES[SNAPSHOT_SCALES.length - 1]!;

const screenRect = (board: TierBoard, view: View) => {
  const left = view.x + board.x * view.k, top = view.y + board.y * view.k;
  return { left, top, right: left + board.w * view.k, bottom: top + board.h * view.k };
};

export function chooseTiers({ boards, view, viewport, pinned, snapshots }: TierInput): Map<string, BoardTier> {
  const placed = boards.map((board) => {
    const { left, top, right, bottom } = screenRect(board, view);
    const area = Math.max(0, Math.min(right, viewport.width) - Math.max(left, 0)) * Math.max(0, Math.min(bottom, viewport.height) - Math.max(top, 0));
    const distance = Math.hypot(Math.max(0, -right, left - viewport.width), Math.max(0, -bottom, top - viewport.height));
    return { id: board.id, area, distance };
  });
  const reading = view.k >= LIVE_MIN_ZOOM
    ? new Set(placed.filter((board) => board.area > 0).sort((a, b) => b.area - a.area).slice(0, LIVE_MAX).map((board) => board.id))
    : new Set<string>();
  return new Map(placed.map(({ id, distance }) => {
    if (pinned.has(id) || reading.has(id)) return [id, 'live'];
    if (distance > viewport.width) return [id, 'empty'];
    return [id, snapshots.has(id) ? 'snapshot' : 'placeholder'];
  }));
}

export function visibleRenders({ boards, view, viewport }: Pick<TierInput, 'boards' | 'view' | 'viewport'>): Map<string, BoardRender> {
  return new Map(boards.map((board) => {
    const { left, top, right, bottom } = screenRect(board, view);
    const visible = right >= -VISIBLE_MARGIN && bottom >= -VISIBLE_MARGIN && left <= viewport.width + VISIBLE_MARGIN && top <= viewport.height + VISIBLE_MARGIN;
    return [board.id, { tier: visible ? 'live' : 'empty', mounted: visible, image: null, overlay: false, hidden: false }];
  }));
}
