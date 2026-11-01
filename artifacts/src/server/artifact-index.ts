import fs from 'node:fs';
import path from 'node:path';

import { isArtifactAddress, isArtifactLocator } from '../shared/ids';
import type { ArtifactType } from '../shared/types';
import { listArtifacts } from './artifacts';
import { artifactsRootOf } from './machine';

export interface IndexedArtifact {
  address: string | null;
  id: string;
  mtimeMs: number;
  project: string;
  type: ArtifactType;
}

const readAddress = (dir: string) => {
  try {
    const value = fs.readFileSync(path.join(dir, '.artifact-id'), 'utf8').trim();
    return isArtifactAddress(value) ? value : null;
  } catch {
    return null;
  }
};

const mtimeOf = (dir: string) => {
  try {
    return fs.statSync(dir).mtimeMs;
  } catch {
    return 0;
  }
};

export function createArtifactIndex(
  projects: () => string[],
  options: { rescanAfterMs?: number; now?: () => number } = {},
) {
  const rescanAfterMs = options.rescanAfterMs ?? 1000;
  const now = options.now ?? Date.now;
  let entries: IndexedArtifact[] = [];
  let scannedAt = -Infinity;

  const scan = () => {
    entries = projects().flatMap((project) =>
      listArtifacts(artifactsRootOf(project)).artifacts.map((artifact) => ({
        project,
        type: artifact.type,
        id: artifact.id,
        address: readAddress(artifact.dir),
        mtimeMs: mtimeOf(artifact.dir),
      })),
    );
    scannedAt = now();
  };

  const lookup = (type: ArtifactType, locator: string) => {
    const order = projects();
    const byAddress = entries.find((entry) => entry.type === type && entry.address === locator);
    if (byAddress) return byAddress;
    const bySlug = entries.filter((entry) => entry.type === type && entry.id === locator);
    bySlug.sort((a, b) => order.indexOf(a.project) - order.indexOf(b.project));
    return bySlug[0] ?? null;
  };

  return {
    find(type: ArtifactType, locator: string): { project: string; id: string } | null {
      if (!isArtifactLocator(locator)) return null;
      if (scannedAt === -Infinity) scan();
      let found = lookup(type, locator);
      if (!found && now() - scannedAt >= rescanAfterMs) {
        scan();
        found = lookup(type, locator);
      }
      return found ? { project: found.project, id: found.id } : null;
    },
    list(): IndexedArtifact[] {
      scan();
      return entries;
    },
    rescan: scan,
  };
}
