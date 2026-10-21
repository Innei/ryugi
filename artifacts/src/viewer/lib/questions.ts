import type { Bounds, CanvasLayout, CanvasSpec, Rect } from '../../shared/types';

export interface Question {
  id: string;
  title: string;
  boards: string[];
  bounds: Bounds;
}

export interface Round {
  id: string | null;
  title: string;
  questions: Question[];
}

const toBounds = (r: Rect): Bounds => ({ minX: r.x, minY: r.y, maxX: r.x + r.w, maxY: r.y + r.h });

export function roundsOf(canvas: CanvasSpec, layout: CanvasLayout, page: string): Round[] {
  const pageLayout = layout.pages[page];
  if (!pageLayout) return [];
  const grouped = new Set<string>();
  const questions: Question[] = [];
  for (const [id, group] of Object.entries(canvas.groups ?? {})) {
    const rect = pageLayout.groups[id];
    const boards = group.boards.filter((boardId) => canvas.boards[boardId]?.page === page);
    if (!rect || boards.length === 0) continue;
    for (const boardId of group.boards) grouped.add(boardId);
    questions.push({ id, title: group.title ?? id, boards, bounds: toBounds(rect) });
  }
  for (const [id, board] of Object.entries(canvas.boards)) {
    if (board.page !== page || grouped.has(id)) continue;
    questions.push({ id, title: board.title ?? id, boards: [id], bounds: toBounds(board) });
  }
  questions.sort((a, b) => a.bounds.minY - b.bounds.minY || a.bounds.minX - b.bounds.minX);

  const titles = Object.entries(canvas.notes ?? {})
    .filter(([id, note]) => note.page === page && note.kind === 'title' && pageLayout.notes[id])
    .map(([id, note]) => ({ id, text: note.text, rect: pageLayout.notes[id]! }));
  const rounds = new Map<string | null, Round>();
  for (const question of questions) {
    const above = titles
      .filter((title) => title.rect.y + title.rect.h <= question.bounds.minY)
      .sort((a, b) => b.rect.y - a.rect.y)[0];
    const key = above?.id ?? null;
    if (!rounds.has(key)) rounds.set(key, { id: key, title: above?.text ?? '其他', questions: [] });
    rounds.get(key)!.questions.push(question);
  }
  const titleY = (id: string | null) => titles.find((title) => title.id === id)?.rect.y ?? -Infinity;
  return [...rounds.values()].sort((a, b) => titleY(b.id) - titleY(a.id));
}

export const questionList = (rounds: Round[]) => rounds.flatMap((round) => round.questions);

export function openingQuestion(rounds: Round[], target: string | undefined): Question | null {
  const list = questionList(rounds);
  if (target) {
    const round = rounds.find((r) => r.id === target);
    const found = round?.questions[0] ?? list.find((q) => q.id === target) ?? list.find((q) => q.boards.includes(target));
    if (found) return found;
  }
  return list[0] ?? null;
}

export function stepQuestion(list: Question[], current: string, direction: 1 | -1): Question | null {
  const index = list.findIndex((q) => q.id === current);
  return index === -1 ? null : (list[index + direction] ?? null);
}
