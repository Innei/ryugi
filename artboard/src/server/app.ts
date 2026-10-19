import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import type { CanvasPayload, ServerMessage } from '../shared/types';
import { resolveBoardFile, resolveInside } from './paths';
import { readCanvas, writeJsonAtomic, writeStateFiles } from './state';
import { watchTree } from './watch';
import { completeHandshake, handleClientFrames, rejectUpgrade, textFrame } from './ws';

export interface ServerOptions {
  boardDir: string;
  viewerDir: string;
  host: string;
  urlHost: string;
  debounceMs?: number;
}

export interface ArtboardServer {
  port: number;
  token: string;
  boardToken: string;
  url: string;
  clientCount(): number;
  onBoardChange(listener: (payload: CanvasPayload, files: string[]) => void): void;
  onActivity(listener: () => void): void;
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

const VIEWER_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const BOARD_CSP = 'sandbox allow-scripts';

const randomToken = () => crypto.randomBytes(24).toString('base64url');

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function parseCookies(header: string | undefined) {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return cookies;
}

function readPersisted(file: string) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
}

function listen(server: http.Server, host: string, port: number) {
  return new Promise<number>((resolve, reject) => {
    const onError = (err: Error) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve((server.address() as { port: number }).port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

const urlHostForHttp = (host: string) => (host.includes(':') && !host.startsWith('[') ? `[${host}]` : host);

export async function startArtboardServer(options: ServerOptions): Promise<ArtboardServer> {
  const boardDir = path.resolve(options.boardDir);
  const viewerDir = path.resolve(options.viewerDir);
  const stateDir = path.join(boardDir, 'state');
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });

  const portFile = path.join(stateDir, '.last-port');
  const tokenFile = path.join(stateDir, '.last-token');
  const token = readPersisted(tokenFile) || randomToken();
  fs.writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
  const boardToken = randomToken();

  const clients = new Set<Duplex>();
  const changeListeners: ((payload: CanvasPayload, files: string[]) => void)[] = [];
  const activityListeners: (() => void)[] = [];
  const touch = () => activityListeners.forEach((listener) => listener());
  let port = 0;
  let cookieName = '';

  const send = (res: http.ServerResponse, status: number, body: string | Buffer, headers: Record<string, string> = {}) => {
    res.writeHead(status, { 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', ...headers });
    res.end(body);
  };

  const sendFile = (res: http.ServerResponse, file: string, headers: Record<string, string> = {}) => {
    fs.readFile(file, (err, data) => {
      if (err) send(res, 404, 'Not found');
      else send(res, 200, data, { 'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream', ...headers });
    });
  };

  const isAuthorized = (req: http.IncomingMessage, keyFromQuery: string | null) =>
    (keyFromQuery !== null && safeEqual(keyFromQuery, token)) ||
    safeEqual(parseCookies(req.headers.cookie)[cookieName] ?? '', token);

  const handleRequest = (req: http.IncomingMessage, res: http.ServerResponse) => {
    touch();
    const url = new URL(req.url ?? '/', 'http://artboard.local');
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      send(res, 400, 'Bad request');
      return;
    }

    const boardPrefix = '/b/';
    if (pathname.startsWith(boardPrefix)) {
      const rest = pathname.slice(boardPrefix.length);
      const slash = rest.indexOf('/');
      const given = slash < 0 ? rest : rest.slice(0, slash);
      if (!safeEqual(given, boardToken)) {
        send(res, 404, 'Not found');
        return;
      }
      const relative = rest.slice(slash + 1);
      if (!resolveInside(boardDir, relative)) {
        send(res, 403, 'Forbidden');
        return;
      }
      const target = resolveBoardFile(boardDir, relative);
      if (!target) send(res, 404, 'Not found');
      else sendFile(res, target, { 'Content-Security-Policy': BOARD_CSP });
      return;
    }

    const key = url.searchParams.get('key');
    if (!isAuthorized(req, key)) {
      send(res, 403, 'Forbidden: open the full Artboard URL including ?key=');
      return;
    }

    if (pathname === '/api/canvas') {
      const payload = { ...readCanvas(boardDir), boardBase: `${boardPrefix}${boardToken}/` };
      send(res, 200, JSON.stringify(payload), { 'Content-Type': MIME['.json']! });
      return;
    }

    if (pathname === '/' || pathname === '/index.html') {
      const headers: Record<string, string> = { 'Content-Security-Policy': VIEWER_CSP };
      if (key !== null) headers['Set-Cookie'] = `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/`;
      sendFile(res, path.join(viewerDir, 'index.html'), headers);
      return;
    }

    const target = resolveInside(viewerDir, pathname.slice(1));
    if (!target) send(res, 404, 'Not found');
    else sendFile(res, target, { 'Content-Security-Policy': VIEWER_CSP });
  };

  const server = http.createServer((req, res) => {
    try {
      handleRequest(req, res);
    } catch (err) {
      if (!res.headersSent) send(res, 500, `Artboard error: ${(err as Error).message}`);
    }
  });

  server.on('upgrade', (req: http.IncomingMessage, socket: Duplex) => {
    const url = new URL(req.url ?? '/', 'http://artboard.local');
    const clientKey = req.headers['sec-websocket-key'];
    if (url.pathname !== '/ws' || typeof clientKey !== 'string') {
      rejectUpgrade(socket, 400, 'Bad Request');
      return;
    }
    const origin = req.headers.origin;
    const host = req.headers.host ?? '';
    const sameHost = origin === `http://${host}` || origin === `https://${host}`;
    if (!isAuthorized(req, url.searchParams.get('key')) || !sameHost) {
      rejectUpgrade(socket, 403, 'Forbidden');
      return;
    }
    completeHandshake(socket, clientKey);
    clients.add(socket);
    handleClientFrames(socket);
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
    touch();
  });

  const previousPort = Number(readPersisted(portFile));
  try {
    port = await listen(server, options.host, Number.isInteger(previousPort) && previousPort > 0 ? previousPort : 0);
  } catch {
    port = await listen(server, options.host, 0);
  }
  cookieName = `artboard_${port}`;
  fs.writeFileSync(portFile, `${port}\n`, { mode: 0o600 });

  const url = `http://${urlHostForHttp(options.urlHost)}:${port}/?key=${token}`;
  writeStateFiles(boardDir, readCanvas(boardDir));
  writeJsonAtomic(path.join(stateDir, 'server-info'), { type: 'server-started', url, port, dir: boardDir });

  const watcher = watchTree(
    boardDir,
    (files) => {
      const payload = readCanvas(boardDir);
      try {
        writeStateFiles(boardDir, payload);
      } catch (err) {
        console.error(JSON.stringify({ type: 'state-write-error', error: (err as Error).message }));
      }
      const frame = textFrame(JSON.stringify({ type: 'change', files } satisfies ServerMessage));
      for (const socket of clients) socket.write(frame);
      touch();
      changeListeners.forEach((listener) => listener(payload, files));
    },
    options.debounceMs,
  );

  return {
    port,
    token,
    boardToken,
    url,
    clientCount: () => clients.size,
    onBoardChange: (listener) => changeListeners.push(listener),
    onActivity: (listener) => activityListeners.push(listener),
    close: () =>
      new Promise<void>((resolve) => {
        watcher.close();
        for (const socket of clients) socket.destroy();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
