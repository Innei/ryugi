import type http from 'node:http';

import { isArtifactAddress } from '../shared/ids';

export const BOARD_PORT_FILE = '.last-board-port';

const BOARD_ROUTE = /^\/c\/artboard\/([^/]+)\/(.+)$/;
const RUNTIME_ROUTE = /^\/c\/runtime\/(.+)$/;

export const loopbackHosts = (urlHost: string) => [
  ...new Set(['localhost', '127.0.0.1', urlHost.includes(':') ? `[${urlHost}]` : urlHost]),
];

export const originsFor = (urlHost: string, port: number) =>
  loopbackHosts(urlHost).map((host) => `http://${host}:${port}`);

export function boardCsp(urlHost: string, viewerPort: number, cloudOrigin?: string) {
  const ancestors = [...originsFor(urlHost, viewerPort), ...(cloudOrigin ? [cloudOrigin] : [])];
  return `worker-src 'none'; frame-ancestors ${ancestors.join(' ')}`;
}

export type BoardRoute =
  | { kind: 'robots' }
  | { kind: 'runtime'; rest: string }
  | { kind: 'board'; address: string; rest: string }
  | { kind: 'none' };

export function routeBoardRequest(req: http.IncomingMessage, pathname: string): BoardRoute {
  if (req.method !== 'GET' && req.method !== 'HEAD') return { kind: 'none' };
  if (pathname === '/robots.txt') return { kind: 'robots' };
  const runtime = RUNTIME_ROUTE.exec(pathname);
  if (runtime) return { kind: 'runtime', rest: `runtime/${runtime[1]}` };
  const board = BOARD_ROUTE.exec(pathname);
  if (board && isArtifactAddress(board[1]!))
    return { kind: 'board', address: board[1]!, rest: board[2]! };
  return { kind: 'none' };
}
