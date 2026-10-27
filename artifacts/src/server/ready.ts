import type { CanvasPayload, CanvasSpec } from '../shared/types';

const pageOfGroup = (canvas: CanvasSpec, ids: string[]) =>
  ids.map((id) => canvas.boards[id]?.page).find((page): page is string => Boolean(page));

export function openReady(payload: CanvasPayload): boolean {
  const canvas = payload.canvas;
  if (!canvas || payload.warnings.length > 0) return false;

  const boards = Object.entries(canvas.boards);
  if (boards.length === 0) return false;
  if (canvas.building === true) return true;

  const pending = new Set(payload.pending);
  const ready = (id: string) => {
    const board = canvas.boards[id];
    if (!board) return false;
    return (payload.versions[board.file] ?? 0) > 0 && !pending.has(id);
  };
  if (boards.every(([id]) => ready(id))) return true;

  const focus = canvas.focus?.target;
  const focusBoard = focus && canvas.boards[focus] ? focus : undefined;
  const focusGroupId = focus
    ? canvas.groups?.[focus]
      ? focus
      : focusBoard
        ? Object.entries(canvas.groups ?? {}).find(([, group]) =>
            group.boards.includes(focusBoard),
          )?.[0]
        : undefined
    : undefined;
  const focusGroup = focusGroupId ? canvas.groups?.[focusGroupId] : undefined;
  if (focusGroup && focusGroup.boards.length > 0) return focusGroup.boards.every(ready);
  const targetPage =
    (focusBoard ? canvas.boards[focusBoard]!.page : undefined) ??
    (focusGroup ? pageOfGroup(canvas, focusGroup.boards) : undefined) ??
    canvas.activePage ??
    canvas.pages[0]?.id;
  if (!targetPage) return false;

  const groups = Object.entries(canvas.groups ?? {}).filter(([, group]) =>
    group.boards.some((id) => canvas.boards[id]?.page === targetPage),
  );
  for (const [, group] of groups) {
    if (group.boards.length > 0 && group.boards.every(ready)) return true;
  }

  if (groups.length > 0) return false;
  const pageBoards = boards.filter(([, board]) => board.page === targetPage);
  if (pageBoards.length === 1) return ready(pageBoards[0]![0]);
  return pageBoards.filter(([id]) => ready(id)).length >= 2;
}
