import type { BoardAnchor, BoardThread } from '../../shared/board-comments';
import type { InspectorRect } from '../../shared/inspector';

interface Point {
  x: number;
  y: number;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const round = (value: number) => Math.round(value * 1000) / 1000;

export function clickAnchor(page: string, board: string | null, point: Point, node?: { rect: InspectorRect; path?: string }): BoardAnchor {
  const x = Math.round(point.x);
  const y = Math.round(point.y);
  if (!board) return { page, x, y };
  if (!node?.path) return { page, board, x, y };
  const anchor: BoardAnchor = { page, board, x, y, nodes: [{ board, path: node.path }] };
  const { rect } = node;
  if (rect.width > 0 && rect.height > 0) anchor.offset = { x: round(clamp((point.x - rect.x) / rect.width)), y: round(clamp((point.y - rect.y) / rect.height)) };
  return anchor;
}

export function selectionAnchor(page: string, targets: { boardId: string; rect: InspectorRect; path?: string }[]): BoardAnchor | null {
  const nodes = targets.flatMap((target) => (target.path ? [{ board: target.boardId, path: target.path, rect: target.rect }] : []));
  const first = nodes[0];
  if (!first) return null;
  return { page, board: first.board, x: Math.round(first.rect.x + first.rect.width), y: Math.round(first.rect.y), nodes: nodes.map(({ board, path }) => ({ board, path })) };
}

export function pinPoint(anchor: BoardAnchor, boards: Record<string, Point>): Point | null {
  if (!anchor.board) return { x: anchor.x, y: anchor.y };
  const board = boards[anchor.board];
  return board ? { x: board.x + anchor.x, y: board.y + anchor.y } : null;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

export function anchorLabel(anchor: BoardAnchor): string {
  if (!anchor.board) return `页面 ${anchor.page}`;
  const nodes = anchor.nodes ?? [];
  if (nodes.length > 1) return `${anchor.board} · ${nodes.length} 个元素`;
  if (!nodes[0]) return anchor.board;
  const offset = anchor.offset ? ` · ${percent(anchor.offset.x)}, ${percent(anchor.offset.y)}` : '';
  return `${anchor.board} · ${nodes[0].path}${offset}`;
}

const openedAt = (thread: BoardThread) => thread.messages[0]?.at ?? thread.statusAt;

export function pinNumbers(threads: BoardThread[]): Map<string, number> {
  const ordered = [...threads].sort((a, b) => (openedAt(a) < openedAt(b) ? -1 : openedAt(a) > openedAt(b) ? 1 : 0));
  return new Map(ordered.map((thread, index) => [thread.id, index + 1]));
}
