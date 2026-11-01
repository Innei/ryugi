export interface BoardLabelMetrics {
  actions: number;
  id: number;
  lead: number;
  tail: number;
  title: number;
}

export const BOARD_LABEL_HEIGHT = { 1: 24, 2: 40 } as const;

const ACTIONS_GAP = 8;
const ID_GAP = 6;

export function boardLabelLayout(metrics: BoardLabelMetrics, screenWidth: number, scale: number) {
  const width = screenWidth / scale;
  const room = width - metrics.lead - (metrics.actions ? metrics.actions + ACTIONS_GAP : 0);
  const text = metrics.title + metrics.tail;
  const lines: 1 | 2 = text <= room ? 1 : 2;
  return { lines, showId: text + ID_GAP + metrics.id <= room * lines };
}
