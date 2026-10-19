import fs from 'node:fs';

export interface ServerConfig {
  root: string;
  host: string;
  urlHost: string;
  idleTimeoutMs: number;
  lifecycleCheckMs: number;
  open: boolean;
  openCmd: string | null;
  openArtifact: string | null;
  serverId: string | null;
}

const DEFAULT_IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000;
const DEFAULT_LIFECYCLE_CHECK_MS = 60 * 1000;
const SERVER_ID_ARG = '--artifacts-server-id=';

const positive = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const isLoopback = (host: string) => host === '127.0.0.1' || host === 'localhost' || host === '::1';

export function parseEnv(env: Record<string, string | undefined>, argv: string[] = []): ServerConfig {
  const root = env.ARTIFACTS_ROOT;
  if (!root) throw new Error('ARTIFACTS_ROOT is required');
  const host = env.ARTIFACTS_HOST || '127.0.0.1';
  const urlHost = env.ARTIFACTS_URL_HOST || (isLoopback(host) ? 'localhost' : host);
  const serverIdArg = argv.find((arg) => arg.startsWith(SERVER_ID_ARG));
  return {
    root,
    host,
    urlHost,
    idleTimeoutMs: positive(env.ARTIFACTS_IDLE_TIMEOUT_MS, DEFAULT_IDLE_TIMEOUT_MS),
    lifecycleCheckMs: positive(env.ARTIFACTS_LIFECYCLE_CHECK_MS, DEFAULT_LIFECYCLE_CHECK_MS),
    open: env.ARTIFACTS_OPEN !== '0',
    openCmd: env.ARTIFACTS_OPEN_CMD || null,
    openArtifact: env.ARTIFACTS_OPEN_ARTIFACT || null,
    serverId: serverIdArg ? serverIdArg.slice(SERVER_ID_ARG.length) : null,
  };
}

export function readOwners(file: string): number[] {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const pids = text
    .split('\n')
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 1);
  return [...new Set(pids)];
}

export const liveOwners = (pids: number[], alive: (pid: number) => boolean) => pids.filter(alive);

export function browserLauncher(platform: string, url: string): { bin: string; args: string[] } | null {
  if (platform === 'darwin') return { bin: 'open', args: [url] };
  if (platform === 'win32') return { bin: 'cmd', args: ['/c', 'start', '""', url] };
  if (platform === 'linux' || platform === 'freebsd' || platform === 'openbsd') return { bin: 'xdg-open', args: [url] };
  return null;
}

export function shutdownReason(state: {
  now: number;
  lastActivity: number;
  idleTimeoutMs: number;
  ownersAlive: boolean;
}): string | null {
  if (!state.ownersAlive) return 'all owner processes exited';
  if (state.now - state.lastActivity > state.idleTimeoutMs) return 'idle timeout';
  return null;
}

export function processAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}
