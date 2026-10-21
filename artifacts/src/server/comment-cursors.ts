import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from './state';

export const cursorsFile = (stateDir: string, id: string, type = 'document') => path.join(stateDir, type, id, 'comment-cursors.json');

function read(file: string): Record<string, string> {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch {
    return {};
  }
}

export function createCommentCursors(stateDir: string, type = 'document') {
  return {
    get: (id: string, agent: string): string | null => read(cursorsFile(stateDir, id, type))[agent] ?? null,
    set: (id: string, agent: string, stamp: string) => {
      const file = cursorsFile(stateDir, id, type);
      const all = read(file);
      if (all[agent] === stamp) return;
      writeJsonAtomic(file, { ...all, [agent]: stamp });
    },
  };
}
