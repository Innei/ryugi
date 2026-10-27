import fs from 'node:fs';
import path from 'node:path';

import { computeLayout } from '../shared/geometry';
import { type CanvasPayload, type CanvasSpec, isMediaBoard } from '../shared/types';
import { structuralWarnings, validateCanvas } from '../shared/validate';
import { resolveBoardFile } from './paths';

function readRaw(boardDir: string): { raw?: unknown; warning?: string } {
  let text: string;
  try {
    text = fs.readFileSync(path.join(boardDir, 'canvas.json'), 'utf8');
  } catch {
    return { warning: 'canvas.json not found' };
  }
  try {
    return { raw: JSON.parse(text) };
  } catch (err) {
    return { warning: `canvas.json is not valid JSON: ${(err as Error).message}` };
  }
}

function boardVersions(boardDir: string, canvas: CanvasSpec) {
  const versions: Record<string, number> = {};
  let writing: string | undefined;
  let latestWrite = -Infinity;
  for (const [id, board] of Object.entries(canvas.boards)) {
    const target = resolveBoardFile(boardDir, board.file);
    if (!target) {
      versions[board.file] = 0;
      continue;
    }
    try {
      const stat = fs.statSync(target);
      if (isMediaBoard(board)) {
        versions[board.file] = stat.size > 0 ? stat.mtimeMs : 0;
        continue;
      }
      const html = fs.readFileSync(target, 'utf8');
      // shortcut: fragments have no completion marker, use full HTML documents for streaming.
      const document = /<(?:!doctype|html)\b/i.test(html);
      const ready =
        html.trim().length > 0 && (!document || /<\/html>\s*(?:<!--[\s\S]*?-->\s*)*$/i.test(html));
      versions[board.file] = ready ? stat.mtimeMs : 0;
      if (!ready && stat.mtimeMs >= latestWrite) {
        writing = id;
        latestWrite = stat.mtimeMs;
      }
    } catch {
      versions[board.file] = 0;
    }
  }
  return { versions, writing };
}

export function readCanvas(boardDir: string): CanvasPayload {
  const { raw, warning } = readRaw(boardDir);
  if (warning)
    return { canvas: null, warnings: [warning], pending: [], layout: null, versions: {} };
  try {
    const structural = structuralWarnings(raw);
    if (structural.length > 0)
      return { canvas: null, warnings: structural, pending: [], layout: null, versions: {} };
    const canvas = { ...(raw as CanvasSpec) };
    canvas.boards = Object.fromEntries(
      Object.entries(canvas.boards).map(([id, board]) => [
        id,
        isMediaBoard(board) ? { ...board, file: board.src ?? '' } : board,
      ]),
    );
    const { versions, writing } = boardVersions(boardDir, canvas);
    const pending = new Set<string>();
    for (const [id, board] of Object.entries(canvas.boards)) {
      if (!versions[board.file]) pending.add(id);
    }
    canvas.building = pending.size > 0;
    delete canvas.writing;
    if (writing) canvas.writing = writing;
    const warnings = validateCanvas(canvas, (rel) => resolveBoardFile(boardDir, rel) !== null, {
      pending,
      allowPending: true,
    });
    return {
      canvas,
      warnings,
      pending: [...pending].sort(),
      layout: computeLayout(canvas),
      versions,
    };
  } catch (err) {
    return {
      canvas: null,
      warnings: [`canvas.json could not be checked: ${(err as Error).message}`],
      pending: [],
      layout: null,
      versions: {},
    };
  }
}

export function writeJsonAtomic(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function writeArtifactState(
  stateDir: string,
  ref: { type: string; id: string },
  payload: { warnings: string[]; layout?: CanvasPayload['layout']; pending?: string[] },
  extra: Record<string, unknown> = {},
) {
  const checkedAt = new Date().toISOString();
  const dir = path.join(stateDir, ref.type, ref.id);
  if (ref.type === 'artboard') {
    writeJsonAtomic(path.join(dir, 'layout.json'), {
      checkedAt,
      ...(payload.layout ?? { pages: {} }),
    });
  }
  writeJsonAtomic(path.join(dir, 'warnings.json'), {
    checkedAt,
    warnings: payload.warnings,
    ...(payload.pending ? { pending: payload.pending } : {}),
    ...extra,
  });
}
