import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isArtifactAddress, isArtifactId, isArtifactLocator, isArtifactType } from '../shared/ids';
import { ARTIFACT_TYPES, type ArtifactType } from '../shared/types';

export { isArtifactAddress, isArtifactId, isArtifactLocator, isArtifactType };

export interface ArtifactRef {
  id: string;
  type: ArtifactType;
}

export interface ArtifactEntry extends ArtifactRef {
  dir: string;
}

function subdirectories(dir: string) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export function listArtifacts(root: string) {
  const artifacts: ArtifactEntry[] = [];
  const warnings: string[] = [];
  for (const type of subdirectories(root)) {
    if (type.startsWith('.')) continue;
    if (!isArtifactType(type)) {
      warnings.push(
        `unknown artifact type directory: ${type}/ (known: ${ARTIFACT_TYPES.join(', ')})`,
      );
      continue;
    }
    for (const id of subdirectories(path.join(root, type))) {
      if (isArtifactId(id)) artifacts.push({ type, id, dir: path.join(root, type, id) });
      else
        warnings.push(
          `invalid artifact id: ${type}/${id} (use lowercase letters, digits and hyphens)`,
        );
    }
  }
  return { artifacts, warnings };
}

export function resolveArtifactDir(root: string, type: string, id: string): string | null {
  if (!isArtifactType(type) || !isArtifactId(id)) return null;
  const dir = path.join(root, type, id);
  try {
    return fs.statSync(dir).isDirectory() ? dir : null;
  } catch {
    return null;
  }
}

export function artifactKeyOf(
  relative: string,
  isId: (id: string) => boolean = isArtifactId,
): ArtifactRef | null {
  const [type, id] = relative.split('/');
  if (!type || !id || !isArtifactType(type) || !isId(id)) return null;
  return { type, id };
}

export function artifactSignature(dir: string, type?: ArtifactType): string {
  let size = 0;
  let latest = 0;
  const names: string[] = [];
  const walk = (current: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (type === 'artboard' && current === dir && entry.name === 'comments.json') continue;
      const full = path.join(current, entry.name);
      try {
        const stat = fs.statSync(full);
        names.push(path.relative(dir, full));
        latest = Math.max(latest, stat.mtimeMs);
        if (entry.isDirectory()) walk(full);
        else size += stat.size;
      } catch {
        continue;
      }
    }
  };
  walk(dir);
  const hash = crypto.createHash('sha1').update(names.sort().join('\0')).digest('hex').slice(0, 12);
  return `${names.length}:${size}:${latest}:${hash}`;
}
