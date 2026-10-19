import fs from 'node:fs';
import path from 'node:path';
import { ARTIFACT_TYPES, type ArtifactType } from '../shared/types';

export interface ArtifactRef {
  type: ArtifactType;
  id: string;
}

export interface ArtifactEntry extends ArtifactRef {
  dir: string;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const isArtifactId = (id: string) => ID_PATTERN.test(id);

export const isArtifactType = (type: string): type is ArtifactType =>
  (ARTIFACT_TYPES as readonly string[]).includes(type);

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
      warnings.push(`unknown artifact type directory: ${type}/ (known: ${ARTIFACT_TYPES.join(', ')})`);
      continue;
    }
    for (const id of subdirectories(path.join(root, type))) {
      if (isArtifactId(id)) artifacts.push({ type, id, dir: path.join(root, type, id) });
      else warnings.push(`invalid artifact id: ${type}/${id} (use lowercase letters, digits and hyphens)`);
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

export function artifactKeyOf(relative: string): ArtifactRef | null {
  const [type, id] = relative.split('/');
  if (!type || !id || !isArtifactType(type) || !isArtifactId(id)) return null;
  return { type, id };
}
