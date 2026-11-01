import { portList } from './ports';

export interface ServerConfig {
  boardPorts: number[];
  cloudOrigin: string;
  host: string;
  openCmd: string | null;
  ports: number[];
  serverId: string | null;
  urlHost: string;
}

const SERVER_ID_ARG = '--artifacts-server-id=';
const PORT_ARG = '--port=';
const DEFAULT_CLOUD_ORIGIN = 'https://ryugi.innei.dev';

export const isLoopback = (host: string) =>
  host === '127.0.0.1' || host === 'localhost' || host === '::1';

export function parseEnv(
  env: Record<string, string | undefined>,
  argv: string[] = [],
): ServerConfig {
  const host = env.ARTIFACTS_HOST || '127.0.0.1';
  const urlHost = env.ARTIFACTS_URL_HOST || (isLoopback(host) ? 'localhost' : host);
  const serverIdArg = argv.find((arg) => arg.startsWith(SERVER_ID_ARG));
  const portArg = argv.find((arg) => arg.startsWith(PORT_ARG));
  const port = portArg ? Number(portArg.slice(PORT_ARG.length)) : NaN;
  return {
    host,
    urlHost,
    ports: Number.isInteger(port) && port >= 0 && port < 65536 ? [port] : portList(env, 'main'),
    boardPorts: portList(env, 'board'),
    openCmd: env.ARTIFACTS_OPEN_CMD || null,
    serverId: serverIdArg ? serverIdArg.slice(SERVER_ID_ARG.length) : null,
    cloudOrigin: (env.RYUGI_CLOUD_ORIGIN || DEFAULT_CLOUD_ORIGIN).replace(/\/+$/, ''),
  };
}

export function browserLauncher(
  platform: string,
  url: string,
): { bin: string; args: string[] } | null {
  if (platform === 'darwin') return { bin: 'open', args: [url] };
  if (platform === 'win32') return { bin: 'cmd', args: ['/c', 'start', '""', url] };
  if (platform === 'linux' || platform === 'freebsd' || platform === 'openbsd')
    return { bin: 'xdg-open', args: [url] };
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
