import type { View } from './view';

export const CULL_MARGIN = 240;

interface Box {
  h: number;
  id: string;
  w: number;
  x: number;
  y: number;
}

export function culledBoards(
  boards: Box[],
  view: View,
  viewport: { width: number; height: number },
  margin = CULL_MARGIN,
): Set<string> {
  const culled = new Set<string>();
  for (const board of boards) {
    const left = view.x + board.x * view.k;
    const top = view.y + board.y * view.k;
    const right = left + board.w * view.k;
    const bottom = top + board.h * view.k;
    if (
      right < -margin ||
      bottom < -margin ||
      left > viewport.width + margin ||
      top > viewport.height + margin
    )
      culled.add(board.id);
  }
  return culled;
}
