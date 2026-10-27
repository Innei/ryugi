import path from 'node:path';
import { readEntries, registryDir, removeEntry } from '../server/registry';
import { hasServerId, readText } from './process';

export interface ServerStatus {
  pid: number;
  clients: number;
  lastActivity: number;
}

export interface ServerRow {
  project: string;
  root: string;
  pid: number;
  url: string | null;
  port: number | null;
  startedAt: number;
  version: string | null;
  oldRelease: boolean;
  clients: number | null;
  lastActivity: number | null;
  safeToStop: boolean;
  status: 'ok' | 'no-status';
  log: string;
}

const SAFE_IDLE_MS = 30 * 60_000;
const STATUS_TIMEOUT_MS = 1000;

export const safeToStop = (
  status: Pick<ServerStatus, 'clients' | 'lastActivity'> | null,
  now: number,
) => !!status && status.clients === 0 && now - status.lastActivity >= SAFE_IDLE_MS;

async function fetchStatus(url: string): Promise<ServerStatus | null> {
  const base = new URL(url);
  if (base.hostname === 'localhost') base.hostname = '127.0.0.1';
  try {
    const res = await fetch(
      `${base.origin}/api/status?key=${encodeURIComponent(base.searchParams.get('key') ?? '')}`,
      { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as Partial<ServerStatus>;
    if (
      typeof json.pid !== 'number' ||
      typeof json.clients !== 'number' ||
      typeof json.lastActivity !== 'number'
    )
      return null;
    return { pid: json.pid, clients: json.clients, lastActivity: json.lastActivity };
  } catch {
    return null;
  }
}

function serverUrl(root: string) {
  try {
    const { url } = JSON.parse(readText(path.join(root, '.state', 'server-info')) ?? '');
    return typeof url === 'string' ? url : null;
  } catch {
    return null;
  }
}

export async function listServers(
  now = Date.now(),
  platform = process.platform,
): Promise<ServerRow[]> {
  const dir = registryDir();
  const current = process.env.RYUGI_ARTIFACTS_VERSION;
  const live = readEntries(dir).filter((entry) => {
    if (hasServerId(entry.pid, entry.serverId)) return true;
    try {
      removeEntry(dir, entry);
    } catch {}
    return false;
  });
  const rows = await Promise.all(
    live.map(async (entry): Promise<ServerRow | null> => {
      const url = serverUrl(entry.root);
      const status = url ? await fetchStatus(url) : null;
      if (status && status.pid !== entry.pid) return null;
      // Windows reuses pids fast and the pid check there only sees node.exe, so only an answering server counts.
      if (!status && platform === 'win32') return null;
      const version = readText(path.join(entry.root, '.state', 'server-version')) || null;
      return {
        project: entry.project,
        root: entry.root,
        pid: entry.pid,
        url,
        port: url ? Number(new URL(url).port) : null,
        startedAt: entry.startedAt,
        version,
        oldRelease: !!current && !!version && version !== current,
        clients: status?.clients ?? null,
        lastActivity: status?.lastActivity ?? null,
        safeToStop: safeToStop(status, now),
        status: status ? 'ok' : 'no-status',
        log: path.join(entry.root, '.state', 'server.log'),
      };
    }),
  );
  return rows
    .filter((row): row is ServerRow => row !== null)
    .sort((a, b) => a.project.localeCompare(b.project));
}
