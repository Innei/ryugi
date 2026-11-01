import fs from 'node:fs';
import path from 'node:path';

const HOSTS = ['claude', 'codex'];
const FRESH_MS = 10_000;

function readSubscription(file: string): string[] {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as { artifacts?: unknown };
    return Array.isArray(value.artifacts)
      ? value.artifacts.filter((a): a is string => typeof a === 'string')
      : [];
  } catch {
    return [];
  }
}

function beatAt(file: string): number | null {
  try {
    const stamp = Number(fs.readFileSync(file, 'utf8'));
    return Number.isFinite(stamp) ? stamp : null;
  } catch {
    return null;
  }
}

export function listeningOn(stateDir: string, artifact: string, now = Date.now()): boolean {
  for (const host of HOSTS) {
    const dir = path.join(stateDir, `${host}-comment-watch`);
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const artifacts = readSubscription(path.join(dir, name));
      if (!artifacts.includes('*') && !artifacts.includes(artifact)) continue;
      const beat = beatAt(path.join(dir, name.replace(/\.json$/, '.alive')));
      if (beat !== null && now - beat < FRESH_MS) return true;
    }
  }
  return false;
}
