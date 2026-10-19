import fs from 'node:fs';
import path from 'node:path';

export function resolveInside(root: string, relative: string): string | null {
  const target = path.resolve(root, `.${path.sep}${relative}`);
  if (!target.startsWith(root + path.sep)) return null;
  const first = path.relative(root, target).split(path.sep)[0];
  if (first?.toLowerCase() === 'state') return null;
  return target;
}

// Case-insensitive on purpose: macOS and Windows filesystems resolve "State/" to "state/".
const isWithin = (child: string, parent: string) =>
  child.toLowerCase().startsWith(`${parent.toLowerCase()}${path.sep}`);

export function resolveBoardFile(boardDir: string, relative: string): string | null {
  const target = resolveInside(boardDir, relative);
  if (!target) return null;
  let real: string;
  let pagesReal: string;
  try {
    real = fs.realpathSync(target);
    pagesReal = fs.realpathSync(path.join(boardDir, 'pages'));
  } catch {
    return null;
  }
  if (!isWithin(real, pagesReal)) return null;
  return fs.statSync(real).isFile() ? real : null;
}
