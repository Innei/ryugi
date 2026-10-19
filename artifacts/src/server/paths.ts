import fs from 'node:fs';
import path from 'node:path';

export function resolveInside(root: string, relative: string): string | null {
  const target = path.resolve(root, `.${path.sep}${relative}`);
  if (!target.startsWith(root + path.sep)) return null;
  if (path.relative(root, target).split(path.sep).some((segment) => segment.startsWith('.'))) return null;
  return target;
}

// Case-insensitive on purpose: macOS and Windows filesystems resolve "State/" to "state/".
const isWithin = (child: string, parent: string) =>
  child.toLowerCase().startsWith(`${parent.toLowerCase()}${path.sep}`);

function resolveFileWithin(root: string, relative: string, allowedDir: string): string | null {
  const target = resolveInside(root, relative);
  if (!target) return null;
  let real: string;
  let allowedReal: string;
  try {
    real = fs.realpathSync(target);
    allowedReal = fs.realpathSync(allowedDir);
  } catch {
    return null;
  }
  if (!isWithin(real, allowedReal)) return null;
  return fs.statSync(real).isFile() ? real : null;
}

export const resolveBoardFile = (boardDir: string, relative: string) =>
  resolveFileWithin(boardDir, relative, path.join(boardDir, 'pages'));

export const resolveDocumentAsset = (artifactDir: string, relative: string) =>
  resolveFileWithin(artifactDir, relative, path.join(artifactDir, 'assets'));

export const resolveHtmlFile = (artifactDir: string, relative: string) =>
  resolveFileWithin(artifactDir, relative, artifactDir);
