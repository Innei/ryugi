import fs from 'node:fs';
import path from 'node:path';

import type { ArtifactType } from '../shared/types';

export interface PackedFile {
  data: Buffer;
  path: string;
}

export const MAX_ARTIFACT_BYTES = 20 * 1024 * 1024;

export class ArtifactTooLarge extends Error {}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const excluded = (type: ArtifactType, relative: string) =>
  (type === 'document' || type === 'artboard') && relative === 'comments.json';

export function packArtifact(
  dir: string,
  type: ArtifactType,
  {
    maxBytes = MAX_ARTIFACT_BYTES,
    overrides,
  }: { maxBytes?: number; overrides?: ReadonlyMap<string, Buffer | null> } = {},
): PackedFile[] {
  const rootReal = fs.realpathSync(dir);
  const found: { path: string; real: string }[] = [];
  const visited = new Set<string>([rootReal]);
  let total = 0;
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      let real: string;
      try {
        real = fs.realpathSync(full);
      } catch {
        continue;
      }
      if (!real.startsWith(rootReal + path.sep)) continue;
      const stat = fs.statSync(real);
      if (stat.isDirectory()) {
        if (visited.has(real)) continue;
        visited.add(real);
        walk(full);
        continue;
      }
      if (!stat.isFile()) continue;
      const relative = path.relative(dir, full).split(path.sep).join('/');
      if (excluded(type, relative)) continue;
      if (!overrides?.has(relative)) total += stat.size;
      found.push({ path: relative, real });
    }
  };
  walk(dir);
  for (const data of overrides?.values() ?? []) if (data) total += data.length;
  if (total > maxBytes) {
    throw new ArtifactTooLarge(
      `artifact is ${formatBytes(total)}; the limit is ${formatBytes(maxBytes)}`,
    );
  }
  return [
    ...found
      .filter((file) => !overrides?.has(file.path))
      .map((file) => ({ path: file.path, data: fs.readFileSync(file.real) })),
    ...[...(overrides ?? [])].flatMap(([file, data]) => (data ? [{ path: file, data }] : [])),
  ];
}
