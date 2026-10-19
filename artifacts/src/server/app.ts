import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import type { ArtifactSummary, ArtifactType, CanvasPayload, HtmlPayload, ServerMessage } from '../shared/types';
import { artifactKeyOf, artifactSignature, listArtifacts, resolveArtifactDir, type ArtifactRef } from './artifacts';
import { readHtml } from './html';
import { injectRuntime } from './inject';
import { listen, parseCookies, randomToken, readPersisted, safeEqual, send, sendFile, sendJson, urlHostForHttp } from './http';
import { resolveBoardFile, resolveHtmlFile, resolveInside } from './paths';
import { readCanvas, writeArtifactState, writeJsonAtomic } from './state';
import { watchTree } from './watch';
import { completeHandshake, handleClientFrames, rejectUpgrade, textFrame } from './ws';

export interface ServerOptions {
  root: string;
  viewerDir: string;
  host: string;
  urlHost: string;
  debounceMs?: number;
}

export type ArtifactPayload = (CanvasPayload | HtmlPayload) & { warnings: string[] };

export interface ArtifactsServer {
  port: number;
  token: string;
  contentToken: string;
  url: string;
  linkFor(type: ArtifactType, id: string): string;
  clientCount(): number;
  onArtifactChange(listener: (ref: ArtifactRef, payload: ArtifactPayload, files: string[]) => void): void;
  onActivity(listener: () => void): void;
  close(): Promise<void>;
}

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

const CONTENT_CSP: Record<ArtifactType, string> = {
  artboard: 'sandbox allow-scripts',
  html: 'sandbox allow-scripts allow-modals allow-forms allow-popups allow-downloads',
};

const SHELL_ROUTE = /^\/(?:(artboard|html)\/([^/]+)\/?)?$/;
const API_ARTIFACT_ROUTE = /^\/api\/artifacts\/([^/]+)\/([^/]+)$/;

const MAX_RUNTIME_MESSAGE = 2048;
const MAX_RUNTIME_WARNINGS = 20;

function readArtifact(dir: string, ref: ArtifactRef, runtime: string[] = []): ArtifactPayload {
  if (ref.type === 'artboard') return readCanvas(dir);
  const payload = readHtml(dir, ref.id);
  return { ...payload, warnings: [...payload.warnings, ...runtime.map((message) => `runtime: ${message}`)] };
}

function titleOf(payload: ArtifactPayload, ref: ArtifactRef) {
  if ('title' in payload) return payload.title;
  return payload.canvas?.title || ref.id;
}

export async function startArtifactsServer(options: ServerOptions): Promise<ArtifactsServer> {
  const root = path.resolve(options.root);
  const viewerDir = path.resolve(options.viewerDir);
  const stateDir = path.join(root, '.state');
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(stateDir, '.gitignore'), '*\n');

  const portFile = path.join(stateDir, '.last-port');
  const tokenFile = path.join(stateDir, '.last-token');
  const token = readPersisted(tokenFile) || randomToken();
  fs.writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
  const contentToken = randomToken();
  const runtimeWarnings = new Map<string, string[]>();
  const ranVersions = new Map<string, number>();
  const runtimeOf = (ref: ArtifactRef) => runtimeWarnings.get(`${ref.type}/${ref.id}`) ?? [];
  const contentPrefix = `/c/${contentToken}/`;

  const clients = new Set<Duplex>();
  const changeListeners: ((ref: ArtifactRef, payload: ArtifactPayload, files: string[]) => void)[] = [];
  const activityListeners: (() => void)[] = [];
  const touch = () => activityListeners.forEach((listener) => listener());
  let port = 0;
  let cookieName = '';

  const isAuthorized = (req: http.IncomingMessage, keyFromQuery: string | null) =>
    (keyFromQuery !== null && safeEqual(keyFromQuery, token)) ||
    safeEqual(parseCookies(req.headers.cookie)[cookieName] ?? '', token);

  const serveContent = (res: http.ServerResponse, rest: string) => {
    const [type = '', id = '', ...parts] = rest.split('/');
    const dir = resolveArtifactDir(root, type, id);
    if (!dir) {
      send(res, 404, 'Not found');
      return;
    }
    const ref = artifactKeyOf(`${type}/${id}`)!;
    const relative = parts.join('/');
    if (!resolveInside(dir, relative)) {
      send(res, 403, 'Forbidden');
      return;
    }
    const target = ref.type === 'artboard' ? resolveBoardFile(dir, relative) : resolveHtmlFile(dir, relative);
    if (!target) {
      send(res, 404, 'Not found');
      return;
    }
    const headers = { 'Content-Security-Policy': CONTENT_CSP[ref.type], 'Access-Control-Allow-Origin': '*' };
    if (ref.type !== 'html' || relative !== 'index.html') {
      sendFile(res, target, headers);
      return;
    }
    fs.readFile(target, 'utf8', (err, source) => {
      if (err) send(res, 404, 'Not found');
      else send(res, 200, injectRuntime(source), { 'Content-Type': 'text/html; charset=utf-8', ...headers });
    });
  };

  const serveArtifactApi = (res: http.ServerResponse, type: string, id: string) => {
    const dir = resolveArtifactDir(root, type, id);
    if (!dir) {
      sendJson(res, 404, { warnings: [`artifact ${type}/${id} not found`] });
      return;
    }
    const ref = artifactKeyOf(`${type}/${id}`)!;
    sendJson(res, 200, { ...readArtifact(dir, ref, runtimeOf(ref)), contentBase: `${contentPrefix}${type}/${id}/` });
  };

  const serveList = (res: http.ServerResponse) => {
    const { artifacts, warnings } = listArtifacts(root);
    const summaries: ArtifactSummary[] = artifacts.map((entry) => ({
      type: entry.type,
      id: entry.id,
      title: titleOf(readArtifact(entry.dir, entry), entry),
    }));
    sendJson(res, 200, { artifacts: summaries, warnings });
  };

  function onClientText(text: string) {
    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof message !== 'object' || message === null) return;
    const { type, artifact, message: detail, version } = message as Record<string, unknown>;
    if (typeof artifact !== 'string') return;
    const ref = artifactKeyOf(artifact);
    if (!ref || ref.type !== 'html' || artifact !== `${ref.type}/${ref.id}`) return;
    const dir = resolveArtifactDir(root, ref.type, ref.id);
    if (!dir) return;
    if (type === 'loaded') {
      if (typeof version !== 'number' || version !== readHtml(dir, ref.id).version) return;
      ranVersions.set(artifact, version);
      writeState(ref, dir);
      return;
    }
    if (type !== 'runtime-error' || typeof detail !== 'string') return;
    if (detail.length === 0 || detail.length > MAX_RUNTIME_MESSAGE) return;
    const list = runtimeWarnings.get(artifact) ?? [];
    if (list.includes(detail) || list.length >= MAX_RUNTIME_WARNINGS) return;
    runtimeWarnings.set(artifact, [...list, detail]);
    writeState(ref, dir);
    const frame = textFrame(JSON.stringify({ type: 'change', artifact, files: [] } satisfies ServerMessage));
    for (const socket of clients) socket.write(frame);
  }

  const handleRequest = (req: http.IncomingMessage, res: http.ServerResponse) => {
    touch();
    const url = new URL(req.url ?? '/', 'http://artifacts.local');
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      send(res, 400, 'Bad request');
      return;
    }

    if (pathname.startsWith('/c/')) {
      if (!pathname.startsWith(contentPrefix)) send(res, 404, 'Not found');
      else serveContent(res, pathname.slice(contentPrefix.length));
      return;
    }

    const key = url.searchParams.get('key');
    if (!isAuthorized(req, key)) {
      send(res, 403, 'Forbidden: open the full artifact link including ?key=');
      return;
    }

    if (pathname === '/api/artifacts') {
      serveList(res);
      return;
    }

    const apiMatch = API_ARTIFACT_ROUTE.exec(pathname);
    if (apiMatch) {
      serveArtifactApi(res, apiMatch[1]!, apiMatch[2]!);
      return;
    }

    if (SHELL_ROUTE.test(pathname) || pathname === '/index.html') {
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
      if (!res.headersSent) send(res, 500, `Artifacts error: ${(err as Error).message}`);
    }
  });

  server.on('upgrade', (req: http.IncomingMessage, socket: Duplex) => {
    const url = new URL(req.url ?? '/', 'http://artifacts.local');
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
    handleClientFrames(socket, onClientText);
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
  cookieName = `ryugi_artifacts_${port}`;
  fs.writeFileSync(portFile, `${port}\n`, { mode: 0o600 });

  const origin = `http://${urlHostForHttp(options.urlHost)}:${port}`;
  const url = `${origin}/?key=${token}`;
  const linkFor = (type: ArtifactType, id: string) => `${origin}/${type}/${id}?key=${token}`;

  const signatures = new Map<string, string>();
  const writeState = (ref: ArtifactRef, dir: string) => {
    const payload = readArtifact(dir, ref, runtimeOf(ref));
    const extra = 'version' in payload ? { ran: ranVersions.get(`${ref.type}/${ref.id}`) === payload.version } : {};
    try {
      writeArtifactState(stateDir, ref, payload, extra);
    } catch (err) {
      console.error(JSON.stringify({ type: 'state-write-error', error: (err as Error).message }));
    }
    return payload;
  };
  const refreshState = (ref: ArtifactRef, dir: string) => {
    signatures.set(`${ref.type}/${ref.id}`, artifactSignature(dir));
    return writeState(ref, dir);
  };

  for (const entry of listArtifacts(root).artifacts) refreshState(entry, entry.dir);
  writeJsonAtomic(path.join(stateDir, 'server-info'), { type: 'server-started', url, port, root });

  const watcher = watchTree(
    root,
    (files) => {
      const byArtifact = new Map<string, { ref: ArtifactRef; files: string[] }>();
      for (const file of files) {
        const ref = artifactKeyOf(file);
        if (!ref) continue;
        const key = `${ref.type}/${ref.id}`;
        const entry = byArtifact.get(key) ?? { ref, files: [] };
        const inner = file.slice(key.length + 1);
        if (inner) entry.files.push(inner);
        byArtifact.set(key, entry);
      }
      for (const [key, { ref, files: changed }] of byArtifact) {
        const dir = resolveArtifactDir(root, ref.type, ref.id);
        if (!dir) {
          signatures.delete(key);
          continue;
        }
        if (signatures.get(key) === artifactSignature(dir)) continue;
        runtimeWarnings.delete(key);
        const payload = refreshState(ref, dir);
        const frame = textFrame(JSON.stringify({ type: 'change', artifact: key, files: changed } satisfies ServerMessage));
        for (const socket of clients) socket.write(frame);
        changeListeners.forEach((listener) => listener(ref, payload, changed));
      }
      touch();
    },
    options.debounceMs,
  );

  return {
    port,
    token,
    contentToken,
    url,
    linkFor,
    clientCount: () => clients.size,
    onArtifactChange: (listener) => changeListeners.push(listener),
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
