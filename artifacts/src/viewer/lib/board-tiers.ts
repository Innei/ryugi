import type { View } from './view';

export const SNAPSHOT_SCALES = [0.125, 0.25, 0.5, 1, 2] as const;
export type SnapshotScale = (typeof SNAPSHOT_SCALES)[number];
export type BoardTier = 'live' | 'snapshot' | 'placeholder' | 'empty';
export const LIVE_MIN_ZOOM = 0.4;
export const LIVE_MAX = 8;
const VISIBLE_MARGIN = 240;
export const WARM_MIN_WIDTH = 120;

export interface TierBoard {
  h: number;
  id: string;
  w: number;
  x: number;
  y: number;
}
export interface TierInput {
  boards: TierBoard[];
  hovered?: string | null;
  pinned: ReadonlySet<string>;
  snapshots: ReadonlySet<string>;
  view: View;
  viewport: { width: number; height: number };
}
export interface BoardRender {
  hidden: boolean;
  image: string | null;
  mounted: boolean;
  overlay: boolean;
  tier: BoardTier;
}

export const snapshotScale = (k: number, dpr: number): SnapshotScale =>
  SNAPSHOT_SCALES.find((scale) => scale >= k * dpr) ?? SNAPSHOT_SCALES.at(-1)!;

const screenRect = (board: TierBoard, view: View) => {
  const left = view.x + board.x * view.k,
    top = view.y + board.y * view.k;
  return { left, top, right: left + board.w * view.k, bottom: top + board.h * view.k };
};

const visibleArea = (
  { left, top, right, bottom }: ReturnType<typeof screenRect>,
  viewport: TierInput['viewport'],
) =>
  Math.max(0, Math.min(right, viewport.width) - Math.max(left, 0)) *
  Math.max(0, Math.min(bottom, viewport.height) - Math.max(top, 0));

export function chooseTiers({
  boards,
  view,
  viewport,
  pinned,
  snapshots,
  hovered,
}: TierInput): Map<string, BoardTier> {
  const placed = boards.map((board) => {
    const rect = screenRect(board, view);
    const { left, top, right, bottom } = rect;
    const area = visibleArea(rect, viewport);
    const distance = Math.hypot(
      Math.max(0, -right, left - viewport.width),
      Math.max(0, -bottom, top - viewport.height),
    );
    return {
      id: board.id,
      area,
      mostlyVisible:
        area * 2 > Math.min((right - left) * (bottom - top), viewport.width * viewport.height),
      distance,
    };
  });
  const hover =
    hovered && !pinned.has(hovered) && placed.some((board) => board.id === hovered)
      ? [hovered]
      : [];
  const ranked =
    view.k >= LIVE_MIN_ZOOM
      ? placed
          .filter((board) => board.mostlyVisible && !pinned.has(board.id) && board.id !== hovered)
          .sort((a, b) => b.area - a.area)
          .map((board) => board.id)
      : [];
  const reading = new Set([...hover, ...ranked].slice(0, LIVE_MAX));
  return new Map(
    placed.map(({ id, distance }) => {
      if (pinned.has(id) || reading.has(id)) return [id, 'live'];
      if (distance > viewport.width) return [id, 'empty'];
      return [id, snapshots.has(id) ? 'snapshot' : 'placeholder'];
    }),
  );
}

export function visibleRenders({
  boards,
  view,
  viewport,
}: Pick<TierInput, 'boards' | 'view' | 'viewport'>): Map<string, BoardRender> {
  return new Map(
    boards.map((board) => {
      const { left, top, right, bottom } = screenRect(board, view);
      const visible =
        right >= -VISIBLE_MARGIN &&
        bottom >= -VISIBLE_MARGIN &&
        left <= viewport.width + VISIBLE_MARGIN &&
        top <= viewport.height + VISIBLE_MARGIN;
      return [
        board.id,
        {
          tier: visible ? 'live' : 'empty',
          mounted: visible,
          image: null,
          overlay: false,
          hidden: false,
        },
      ];
    }),
  );
}

export function boardsToWarm({
  boards,
  view,
  viewport,
  snapshots,
  skip,
}: Pick<TierInput, 'boards' | 'view' | 'viewport' | 'snapshots'> & { skip: ReadonlySet<string> }) {
  return boards
    .filter(
      (board) =>
        !snapshots.has(board.id) && !skip.has(board.id) && board.w * view.k >= WARM_MIN_WIDTH,
    )
    .map((board) => ({ id: board.id, area: visibleArea(screenRect(board, view), viewport) }))
    .filter((board) => board.area > 0)
    .sort((a, b) => b.area - a.area)
    .map((board) => board.id);
}
