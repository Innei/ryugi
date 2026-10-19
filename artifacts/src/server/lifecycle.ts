export interface ServerConfig {
  boardDir: string;
  host: string;
  urlHost: string;
  ownerPid: number | null;
  idleTimeoutMs: number;
  lifecycleCheckMs: number;
  open: boolean;
  openCmd: string | null;
  serverId: string | null;
}

const DEFAULT_IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000;
const DEFAULT_LIFECYCLE_CHECK_MS = 60 * 1000;

const positive = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const isLoopback = (host: string) => host === '127.0.0.1' || host === 'localhost' || host === '::1';

export function parseEnv(env: Record<string, string | undefined>, argv: string[] = []): ServerConfig {
  const boardDir = env.ARTBOARD_DIR;
  if (!boardDir) throw new Error('ARTBOARD_DIR is required');
  const host = env.ARTBOARD_HOST || '127.0.0.1';
  const urlHost = env.ARTBOARD_URL_HOST || (isLoopback(host) ? 'localhost' : host);
  const ownerPid = Number(env.ARTBOARD_OWNER_PID);
  const serverIdArg = argv.find((arg) => arg.startsWith('--artboard-server-id='));
  return {
    boardDir,
    host,
    urlHost,
    ownerPid: Number.isInteger(ownerPid) && ownerPid > 1 ? ownerPid : null,
    idleTimeoutMs: positive(env.ARTBOARD_IDLE_TIMEOUT_MS, DEFAULT_IDLE_TIMEOUT_MS),
    lifecycleCheckMs: positive(env.ARTBOARD_LIFECYCLE_CHECK_MS, DEFAULT_LIFECYCLE_CHECK_MS),
    open: env.ARTBOARD_OPEN === '1',
    openCmd: env.ARTBOARD_OPEN_CMD || null,
    serverId: serverIdArg ? serverIdArg.slice('--artboard-server-id='.length) : null,
  };
}

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
  ownerAlive: boolean;
}): string | null {
  if (!state.ownerAlive) return 'owner process exited';
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
