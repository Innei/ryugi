import fs from 'node:fs';
import path from 'node:path';
import { computeLayout } from '../shared/geometry';
import type { CanvasPayload, CanvasSpec } from '../shared/types';
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
  for (const board of Object.values(canvas.boards)) {
    const target = resolveBoardFile(boardDir, board.file);
    if (!target) continue;
    try {
      versions[board.file] = fs.statSync(target).mtimeMs;
    } catch {
      versions[board.file] = 0;
    }
  }
  return versions;
}

export function readCanvas(boardDir: string): CanvasPayload {
  const { raw, warning } = readRaw(boardDir);
  if (warning) return { canvas: null, warnings: [warning], layout: null, versions: {} };
  try {
    const structural = structuralWarnings(raw);
    if (structural.length > 0) return { canvas: null, warnings: structural, layout: null, versions: {} };
    const canvas = raw as CanvasSpec;
    const warnings = validateCanvas(canvas, (rel) => resolveBoardFile(boardDir, rel) !== null);
    return { canvas, warnings, layout: computeLayout(canvas), versions: boardVersions(boardDir, canvas) };
  } catch (err) {
    return {
      canvas: null,
      warnings: [`canvas.json could not be checked: ${(err as Error).message}`],
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
  payload: { warnings: string[]; layout?: CanvasPayload['layout'] },
  extra: Record<string, unknown> = {},
) {
  const checkedAt = new Date().toISOString();
  const dir = path.join(stateDir, ref.type, ref.id);
  if (ref.type === 'artboard') {
    writeJsonAtomic(path.join(dir, 'layout.json'), { checkedAt, ...(payload.layout ?? { pages: {} }) });
  }
  writeJsonAtomic(path.join(dir, 'warnings.json'), { checkedAt, warnings: payload.warnings, ...extra });
}
