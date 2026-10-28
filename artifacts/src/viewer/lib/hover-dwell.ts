export const HOVER_DWELL_MS = 150;
const STILL_PX = 4;

interface Point {
  x: number;
  y: number;
}

export function createHoverDwell({
  dwellMs,
  schedule,
  cancel,
  onChange,
}: {
  dwellMs: number;
  schedule: (fn: () => void, ms: number) => number;
  cancel: (id: number) => void;
  onChange: () => void;
}) {
  let anchor: (Point & { board: string }) | null = null;
  let hovered: string | null = null;
  let scaling = false;
  let timer: number | undefined;

  const stop = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  };
  const set = (next: string | null) => {
    if (next === hovered) return;
    hovered = next;
    onChange();
  };
  const arm = () => {
    stop();
    if (!anchor || scaling || hovered === anchor.board) return;
    const board = anchor.board;
    timer = schedule(() => {
      timer = undefined;
      set(board);
    }, dwellMs);
  };

  return {
    move(board: string | null, point: Point) {
      if (board !== hovered) set(null);
      if (!board) {
        anchor = null;
        stop();
        return;
      }
      if (anchor?.board === board && Math.hypot(point.x - anchor.x, point.y - anchor.y) < STILL_PX)
        return;
      anchor = { board, ...point };
      arm();
    },
    setScaling(next: boolean) {
      if (next === scaling) return;
      scaling = next;
      if (scaling) stop();
      else arm();
    },
    current: () => hovered,
    dispose: stop,
  };
}

export type HoverDwell = ReturnType<typeof createHoverDwell>;
