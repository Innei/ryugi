import type {
  BoardSpec,
  Bounds,
  CanvasLayout,
  CanvasSpec,
  GroupSpec,
  NoteSpec,
  PageLayout,
  Rect,
} from './types';

export const GROUP_PAD = 48;
export const GROUP_TOP = 144;
export const NAME_STRIP_H = 48;
export const TITLE_LINE_HEIGHT = 1.15;
export const DEFAULT_TITLE_SIZE = 96;
export const STICKY_DEFAULT_W = 240;
export const STICKY_FONT_SIZE = 18;
export const STICKY_LINE_H = 27;
export const STICKY_PAD = 16;

const isWide = (code: number) => code >= 0x2e80;

function textWidth(text: string, fontSize: number) {
  let width = 0;
  for (const char of text) width += fontSize * (isWide(char.codePointAt(0)!) ? 1 : 0.56);
  return width;
}

function wrappedLines(text: string, fontSize: number, maxWidth: number) {
  return text
    .split('\n')
    .reduce(
      (lines, paragraph) =>
        lines + Math.max(1, Math.ceil(textWidth(paragraph, fontSize) / maxWidth)),
      0,
    );
}

export function groupFrame(
  group: GroupSpec,
  boards: Record<string, BoardSpec>,
): (Rect & { page: string }) | null {
  const members = group.boards.map((id) => boards[id]).filter((b): b is BoardSpec => Boolean(b));
  const first = members[0];
  if (!first) return null;
  const minX = Math.min(...members.map((b) => b.x));
  const minY = Math.min(...members.map((b) => b.y));
  const maxX = Math.max(...members.map((b) => b.x + b.w));
  const maxY = Math.max(...members.map((b) => b.y + b.h));
  return {
    page: first.page,
    x: minX - GROUP_PAD,
    y: minY - GROUP_TOP,
    w: maxX - minX + GROUP_PAD * 2,
    h: maxY - minY + GROUP_TOP + GROUP_PAD,
  };
}

export function noteRect(note: NoteSpec): Rect {
  if (note.kind === 'sticky') {
    const w = note.w ?? STICKY_DEFAULT_W;
    const lines = wrappedLines(note.text, STICKY_FONT_SIZE, Math.max(1, w - STICKY_PAD * 2));
    return { x: note.x, y: note.y, w, h: lines * STICKY_LINE_H + STICKY_PAD * 2 };
  }
  const size = note.size ?? DEFAULT_TITLE_SIZE;
  const lineH = size * TITLE_LINE_HEIGHT;
  if (note.w === undefined) {
    return { x: note.x, y: note.y, w: textWidth(note.text, size), h: lineH };
  }
  return { x: note.x, y: note.y, w: note.w, h: wrappedLines(note.text, size, note.w) * lineH };
}

function extend(bounds: Bounds | null, rect: Rect): Bounds {
  const next = { minX: rect.x, minY: rect.y, maxX: rect.x + rect.w, maxY: rect.y + rect.h };
  if (!bounds) return next;
  return {
    minX: Math.min(bounds.minX, next.minX),
    minY: Math.min(bounds.minY, next.minY),
    maxX: Math.max(bounds.maxX, next.maxX),
    maxY: Math.max(bounds.maxY, next.maxY),
  };
}

export function computeLayout(canvas: CanvasSpec): CanvasLayout {
  const pages: Record<string, PageLayout> = {};
  const pageOf = (id: string) => (pages[id] ??= { groups: {}, notes: {}, bounds: null });
  for (const page of canvas.pages) pageOf(page.id);

  for (const board of Object.values(canvas.boards)) {
    const layout = pageOf(board.page);
    layout.bounds = extend(layout.bounds, {
      ...board,
      y: board.y - NAME_STRIP_H,
      h: board.h + NAME_STRIP_H,
    });
  }
  for (const [id, group] of Object.entries(canvas.groups ?? {})) {
    const frame = groupFrame(group, canvas.boards);
    if (!frame) continue;
    const { page, ...rect } = frame;
    const layout = pageOf(page);
    layout.groups[id] = rect;
    layout.bounds = extend(layout.bounds, rect);
  }
  for (const [id, note] of Object.entries(canvas.notes ?? {})) {
    const rect = noteRect(note);
    const layout = pageOf(note.page);
    layout.notes[id] = rect;
    layout.bounds = extend(layout.bounds, rect);
  }
  return { pages };
}

export const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
