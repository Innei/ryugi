import fs from 'node:fs';

const REGISTRY_URL = 'https://registry.npmjs.org/ryugi-artifacts/latest';
const DAY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 5000;

interface Cached {
  checkedAt: number;
  version: string;
}

export function newerVersion(candidate: string, current: string) {
  const a = candidate.split(/[.-]/).slice(0, 3).map(Number);
  const b = current.split(/[.-]/).slice(0, 3).map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff) return diff > 0;
  }
  return false;
}

function readCache(file: string): Cached | null {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as Cached;
    return typeof value.version === 'string' && Number.isFinite(value.checkedAt) ? value : null;
  } catch {
    return null;
  }
}

export function createUpdateCheck(options: {
  cacheFile: string;
  current: string;
  fetch?: typeof fetch;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const fetcher = options.fetch ?? fetch;
  let cached = readCache(options.cacheFile);
  const releaseRunning = /^\d+\.\d+\.\d+/.test(options.current);

  return {
    latest(): string | null {
      if (!releaseRunning || !cached) return null;
      return newerVersion(cached.version, options.current) ? cached.version : null;
    },
    async refresh() {
      if (!releaseRunning) return;
      if (cached && now() - cached.checkedAt < DAY_MS) return;
      try {
        const res = await fetcher(REGISTRY_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        const { version } = (await res.json()) as { version?: unknown };
        if (typeof version !== 'string') return;
        cached = { version, checkedAt: now() };
        fs.writeFileSync(options.cacheFile, `${JSON.stringify(cached)}\n`, { mode: 0o600 });
      } catch {}
    },
  };
}
