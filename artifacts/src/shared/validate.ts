import { groupFrame, intersects, noteRect } from './geometry';
import { BOARD_TYPES, isMediaBoard, type BoardSpec, type CanvasSpec } from './types';

const BOARD_NUMBERS = ['x', 'y', 'w', 'h'] as const;
const BOARD_REQUIRED = ['file', 'page', ...BOARD_NUMBERS] as const;
const MEDIA_REQUIRED = ['src', 'page', ...BOARD_NUMBERS] as const;
const fileOf = (board: BoardSpec) => (isMediaBoard(board) ? (board.src ?? '') : board.file);
const fileField = (board: BoardSpec) => (isMediaBoard(board) ? 'src' : 'file');

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function structuralWarnings(raw: unknown): string[] {
  if (!isObject(raw)) return ['canvas.json must be a JSON object'];
  const warnings: string[] = [];
  if (!Array.isArray(raw.pages)) warnings.push('"pages" must be an array');
  if (!isObject(raw.boards)) warnings.push('"boards" must be an object');
  if (raw.groups !== undefined && !isObject(raw.groups))
    warnings.push('"groups" must be an object');
  if (raw.notes !== undefined && !isObject(raw.notes)) warnings.push('"notes" must be an object');
  if (raw.focus !== undefined && (!isObject(raw.focus) || typeof raw.focus.target !== 'string')) {
    warnings.push('"focus" must be { "target": <id>, "at": <time> }');
  }
  if (raw.building !== undefined && typeof raw.building !== 'boolean') {
    warnings.push('"building" must be a boolean');
  }
  if (raw.writing !== undefined && (typeof raw.writing !== 'string' || !raw.writing)) {
    warnings.push('"writing" must be a board id');
  }
  if (isObject(raw.notes)) {
    for (const [id, note] of Object.entries(raw.notes)) {
      if (
        isObject(note) &&
        note.color !== undefined &&
        (typeof note.color !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(note.color))
      ) {
        warnings.push(`note "${id}" color must be #RGB or #RRGGBB`);
      }
    }
  }
  if (isObject(raw.boards)) {
    for (const [id, board] of Object.entries(raw.boards)) {
      if (
        isObject(board) &&
        board.interactive !== undefined &&
        typeof board.interactive !== 'boolean'
      ) {
        warnings.push(`board "${id}" field "interactive" must be a boolean`);
      }
      if (
        isObject(board) &&
        board.type !== undefined &&
        !(BOARD_TYPES as readonly unknown[]).includes(board.type)
      ) {
        warnings.push(`board "${id}" field "type" must be "html", "image" or "video"`);
      }
    }
  }
  if (isObject(raw.groups)) {
    for (const [id, group] of Object.entries(raw.groups)) {
      if (isObject(group) && group.verify !== undefined && typeof group.verify !== 'boolean') {
        warnings.push(`group "${id}" field "verify" must be a boolean`);
      }
    }
  }
  if (warnings.length > 0) return warnings;

  (raw.pages as unknown[]).forEach((page, index) => {
    if (!isObject(page) || typeof page.id !== 'string' || typeof page.name !== 'string') {
      warnings.push(`pages[${index}] needs string "id" and "name"`);
    }
  });

  for (const [id, board] of Object.entries(raw.boards as Record<string, unknown>)) {
    if (!isObject(board)) {
      warnings.push(`board "${id}" must be an object`);
      continue;
    }
    for (const key of isMediaBoard(board) ? MEDIA_REQUIRED : BOARD_REQUIRED) {
      if (board[key] === undefined) warnings.push(`board "${id}" is missing "${key}"`);
    }
    for (const key of BOARD_NUMBERS) {
      if (board[key] !== undefined && typeof board[key] !== 'number') {
        warnings.push(`board "${id}" field "${key}" must be a number`);
      }
    }
    for (const key of ['file', 'src', 'page'] as const) {
      if (board[key] !== undefined && typeof board[key] !== 'string') {
        warnings.push(`board "${id}" field "${key}" must be a string`);
      }
    }
  }
  for (const [id, group] of Object.entries((raw.groups ?? {}) as Record<string, unknown>)) {
    if (
      !isObject(group) ||
      !Array.isArray(group.boards) ||
      group.boards.some((b) => typeof b !== 'string')
    ) {
      warnings.push(`group "${id}" needs a "boards" array`);
    }
  }
  for (const [id, note] of Object.entries((raw.notes ?? {}) as Record<string, unknown>)) {
    if (!isObject(note) || (note.kind !== 'title' && note.kind !== 'sticky')) {
      warnings.push(`note "${id}" needs "kind" "title" or "sticky"`);
    } else if (
      typeof note.x !== 'number' ||
      typeof note.y !== 'number' ||
      typeof note.text !== 'string' ||
      typeof note.page !== 'string'
    ) {
      warnings.push(`note "${id}" needs numeric "x", "y" and string "text", "page"`);
    }
  }
  return warnings;
}

export function validateCanvas(
  raw: unknown,
  fileExists: (file: string) => boolean,
  options: { pending?: Set<string>; allowPending?: boolean } = {},
): string[] {
  const structural = structuralWarnings(raw);
  if (structural.length > 0) return structural;

  const canvas = raw as unknown as CanvasSpec;
  const warnings: string[] = [];
  const pages = new Set(canvas.pages.map((p) => p.id));
  const boards = Object.entries(canvas.boards);
  const groups = Object.entries(canvas.groups ?? {});
  const notes = Object.entries(canvas.notes ?? {});

  for (const [id, board] of boards) {
    if (!pages.has(board.page)) warnings.push(`board "${id}" uses unknown page "${board.page}"`);
    const file = fileOf(board);
    if (!file.startsWith('pages/'))
      warnings.push(`board "${id}" ${fileField(board)} must start with "pages/": ${file}`);
    else if (!fileExists(file)) {
      options.pending?.add(id);
      if (!options.allowPending) warnings.push(`board "${id}" file not found: ${file}`);
    }
  }

  for (let i = 0; i < boards.length; i++) {
    for (let j = i + 1; j < boards.length; j++) {
      const [ia, a] = boards[i]!;
      const [ib, b] = boards[j]!;
      if (a.page === b.page && intersects(a, b))
        warnings.push(`boards "${ia}" and "${ib}" overlap`);
    }
  }

  const frames: [string, ReturnType<typeof groupFrame>][] = [];
  for (const [id, group] of groups) {
    for (const member of group.boards) {
      if (!canvas.boards[member])
        warnings.push(`group "${id}" references unknown board "${member}"`);
    }
    const memberPages = new Set(group.boards.map((m) => canvas.boards[m]?.page).filter(Boolean));
    if (memberPages.size > 1) warnings.push(`group "${id}" spans several pages`);
    else frames.push([id, groupFrame(group, canvas.boards)]);
  }

  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      const [ia, a] = frames[i]!;
      const [ib, b] = frames[j]!;
      if (a && b && a.page === b.page && intersects(a, b))
        warnings.push(`groups "${ia}" and "${ib}" overlap`);
    }
  }

  for (const [id, note] of notes) {
    if (!pages.has(note.page)) {
      warnings.push(`note "${id}" uses unknown page "${note.page}"`);
      continue;
    }
    const rect = noteRect(note);
    if (note.kind === 'title') {
      for (const [gid, frame] of frames) {
        if (frame && frame.page === note.page && intersects(rect, frame)) {
          warnings.push(`title "${id}" overlaps group "${gid}"`);
        }
      }
    } else {
      for (const [bid, board] of boards) {
        if (board.page === note.page && intersects(rect, board))
          warnings.push(`sticky "${id}" covers board "${bid}"`);
      }
    }
  }

  if (canvas.activePage !== undefined && !pages.has(canvas.activePage)) {
    warnings.push(`activePage "${canvas.activePage}" is not a page`);
  }
  const target = canvas.focus?.target;
  if (canvas.writing !== undefined && !canvas.boards[canvas.writing]) {
    warnings.push(`writing target "${canvas.writing}" is not a board`);
  }
  if (
    target !== undefined &&
    !canvas.boards[target] &&
    !canvas.groups?.[target] &&
    !canvas.notes?.[target]
  ) {
    warnings.push(`focus target "${target}" is not a board, group or note`);
  }
  return warnings;
}
