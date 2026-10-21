import type { KnownHosts } from './liveConnection';

type HostStorage = Pick<Storage, 'getItem' | 'setItem'>;

const KEY = 'ryugi:known-hosts';
const MAX_HOSTS = 20;
const HINT = /^#ryugi-host=([A-Za-z0-9_-]{16,64})$/;

const browserStorage = (): HostStorage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export function knownHosts(storage: HostStorage | null = browserStorage()): KnownHosts {
  const read = (): string[] => {
    try {
      const saved = JSON.parse(storage?.getItem(KEY) ?? '[]') as unknown;
      return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  };
  return {
    has: (hostId) => read().includes(hostId),
    remember(hostId) {
      const next = [...read().filter((id) => id !== hostId), hostId].slice(-MAX_HOSTS);
      try {
        storage?.setItem(KEY, JSON.stringify(next));
      } catch {}
    },
  };
}

export function takeHostHint(hash: string, known: KnownHosts) {
  const match = HINT.exec(hash);
  if (!match) return null;
  known.remember(match[1]!);
  return '';
}
