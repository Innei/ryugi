import type { CanvasLayout, CanvasSpec, Rect } from './types';

export interface TitleRect {
  id: string;
  rect: Rect;
  text: string;
}

export interface RoundInfo {
  closed: boolean;
  groups: string[];
  id: string;
  page: string;
  title: string | null;
}

export function pageTitles(canvas: CanvasSpec, layout: CanvasLayout, page: string): TitleRect[] {
  const notes = layout.pages[page]?.notes ?? {};
  return Object.entries(canvas.notes ?? {})
    .filter(([id, note]) => note.page === page && note.kind === 'title' && notes[id])
    .map(([id, note]) => ({ id, text: note.text, rect: notes[id]! }));
}

export function titleAbove(titles: TitleRect[], minY: number): TitleRect | undefined {
  return titles
    .filter((title) => title.rect.y + title.rect.h <= minY)
    .sort((a, b) => b.rect.y - a.rect.y)[0];
}

export function choiceRounds(canvas: CanvasSpec, layout: CanvasLayout): RoundInfo[] {
  const rounds: RoundInfo[] = [];
  for (const { id: page } of canvas.pages) {
    const pageLayout = layout.pages[page];
    if (!pageLayout) continue;
    const titles = pageTitles(canvas, layout, page);
    const byTitle = new Map<string | null, { title: TitleRect | undefined; choices: string[] }>();
    const placed = Object.entries(canvas.groups ?? {})
      .map(([id, group]) => ({ id, group, rect: pageLayout.groups[id] }))
      .filter(
        (entry): entry is typeof entry & { rect: Rect } =>
          !!entry.rect && entry.group.boards.some((board) => canvas.boards[board]?.page === page),
      )
      .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
    for (const { id, group, rect } of placed) {
      const title = titleAbove(titles, rect.y);
      const key = title?.id ?? null;
      const entry = byTitle.get(key) ?? { title, choices: [] };
      if (group.choose === true) entry.choices.push(id);
      byTitle.set(key, entry);
    }
    const titleY = (title: TitleRect | undefined) => title?.rect.y ?? -Infinity;
    const lowest = Math.max(...[...byTitle.values()].map((entry) => titleY(entry.title)));
    const entries = [...byTitle.entries()]
      .filter(([, entry]) => entry.choices.length > 0)
      .sort(([, a], [, b]) => titleY(a.title) - titleY(b.title));
    for (const [key, entry] of entries) {
      rounds.push({
        id: key ?? `page:${page}`,
        page,
        title: entry.title?.text ?? null,
        groups: entry.choices,
        closed: titleY(entry.title) < lowest,
      });
    }
  }
  return rounds;
}

export const roundOfGroup = (rounds: RoundInfo[], group: string) =>
  rounds.find((round) => round.groups.includes(group));
