import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import { ARTIFACT_TYPES, type ArtifactSummary, type ArtifactType, type CanvasPayload, type DocumentPayload, type HtmlPayload, type ServerMessage } from '../shared/types';
import { artifactKeyOf, artifactSignature, listArtifacts, resolveArtifactDir, type ArtifactRef } from './artifacts';
import { readDocument } from './document';
import { asHumanOp } from './document-comments';
import { createDocumentRegistry, type DocumentTiming } from './documents';
import { readHtml } from './html';
import { injectRuntime } from './inject';
import { listen, parseCookies, randomToken, readPersisted, safeEqual, send, sendFile, sendJson, urlHostForHttp } from './http';
import { resolveBoardFile, resolveDocumentAsset, resolveHtmlFile, resolveInside } from './paths';
import { createDynamicBlocks } from './dynamic-blocks';
import { readCanvas, writeArtifactState, writeJsonAtomic } from './state';
import { watchTree } from './watch';
import { completeHandshake, handleClientFrames, rejectUpgrade, textFrame } from './ws';

export interface ServerOptions {
  root: string;
  viewerDir: string;
  runtimeDir?: string;
  host: string;
  urlHost: string;
  debounceMs?: number;
  documentTiming?: DocumentTiming;
}

export type ArtifactPayload = (CanvasPayload | HtmlPayload | DocumentPayload) & { warnings: string[] };

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
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const CONTENT_CSP: Record<ArtifactType, string> = {
  artboard: 'sandbox allow-scripts',
  document: "sandbox; default-src 'none'",
  html: 'sandbox allow-scripts allow-modals allow-forms allow-popups allow-downloads',
};

const SHELL_ROUTE = new RegExp(`^/(?:(${ARTIFACT_TYPES.join('|')})/([^/]+)/?)?$`);
const API_ARTIFACT_ROUTE = /^\/api\/artifacts\/([^/]+)\/([^/]+)$/;
const API_DOCUMENT_ROUTE = /^\/api\/document\/([^/]+)\/(state|update|comments)$/;
const MAX_COMMENT_OP = 64 * 1024;
const MAX_DOCUMENT_UPDATE = 8 * 1024 * 1024;

const MAX_RUNTIME_MESSAGE = 2048;
const MAX_RUNTIME_WARNINGS = 20;

function readArtifact(dir: string, ref: ArtifactRef, runtime: string[] = []): ArtifactPayload {
  if (ref.type === 'artboard') return readCanvas(dir);
  if (ref.type === 'document') {
    const payload = readDocument(dir, ref.id);
    return { ...payload, warnings: [...payload.warnings, ...runtime] };
  }
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
  const runtimeDir = options.runtimeDir ? path.resolve(options.runtimeDir) : null;
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
  const dynamicBlocks = createDynamicBlocks({ maxErrors: MAX_RUNTIME_WARNINGS });
  const runtimeOf = (ref: ArtifactRef, dir: string) =>
    ref.type === 'document'
      ? [...documents.warnings(ref.id), ...dynamicBlocks.state(ref.id, dir).warnings]
      : (runtimeWarnings.get(`${ref.type}/${ref.id}`) ?? []);
  const contentPrefix = `/c/${contentToken}/`;

  const clients = new Set<Duplex>();
  const changeListeners: ((ref: ArtifactRef, payload: ArtifactPayload, files: string[]) => void)[] = [];
  const activityListeners: (() => void)[] = [];
  const touch = () => activityListeners.forEach((listener) => listener());
  let port = 0;
  let cookieName = '';

  const broadcast = (message: ServerMessage) => {
    const frame = textFrame(JSON.stringify(message));
    for (const socket of clients) socket.write(frame);
  };
  const documents = createDocumentRegistry({
    root,
    stateDir,
    timing: options.documentTiming,
    broadcast,
    onWarningsChange: (id) => {
      const dir = resolveArtifactDir(root, 'document', id);
      if (!dir) return;
      writeState({ type: 'document', id }, dir);
      broadcast({ type: 'change', artifact: `document/${id}`, files: [] });
    },
    log: (line) => console.log(JSON.stringify({ type: 'document-log', line })),
  });

  const sameOrigin = (req: http.IncomingMessage) => {
    const origin = req.headers.origin;
    const host = req.headers.host ?? '';
    return origin === `http://${host}` || origin === `https://${host}`;
  };

  const serveDocumentApi = async (req: http.IncomingMessage, res: http.ServerResponse, id: string, action: string) => {
    if (action !== 'state' && (req.method !== 'POST' || !sameOrigin(req))) {
      send(res, 403, 'Forbidden');
      return;
    }
    if (action === 'comments') {
      if (!resolveArtifactDir(root, 'document', id)) {
        sendJson(res, 404, { error: `document/${id} not found` });
        return;
      }
      const parts: Buffer[] = [];
      let received = 0;
      for await (const chunk of req) {
        received += (chunk as Buffer).length;
        if (received <= MAX_COMMENT_OP) parts.push(chunk as Buffer);
      }
      const body = received > MAX_COMMENT_OP ? '' : Buffer.concat(parts).toString('utf8');
      let op = null;
      try {
        op = asHumanOp(JSON.parse(body));
      } catch {
        op = null;
      }
      if (!op) {
        sendJson(res, 400, { error: 'not a comment op' });
        return;
      }
      sendJson(res, 200, { comments: documents.applyCommentOp(id, op) });
      return;
    }
    const session = resolveArtifactDir(root, 'document', id) ? await documents.open(id) : null;
    if (!session) {
      sendJson(res, 404, { error: `document/${id} has no doc.xml` });
      return;
    }
    if (action === 'state') {
      sendJson(res, 200, {
        snapshot: Buffer.from(session.snapshot()).toString('base64'),
        lineage: session.lineage(),
        outcome: session.outcome(),
        streaming: session.streaming(),
        cursor: session.cursor(),
        comments: documents.comments(id),
      });
      return;
    }
    if (Number(req.headers['content-length'] ?? 0) > MAX_DOCUMENT_UPDATE) {
      req.resume();
      send(res, 413, 'Update too large');
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size <= MAX_DOCUMENT_UPDATE) chunks.push(chunk as Buffer);
    }
    if (size > MAX_DOCUMENT_UPDATE) {
      send(res, 413, 'Update too large');
      return;
    }
    try {
      session.importUpdate(new Uint8Array(Buffer.concat(chunks)));
      send(res, 204, '');
    } catch (err) {
      sendJson(res, 400, { error: (err as Error).message });
    }
  };

  const isAuthorized = (req: http.IncomingMessage, keyFromQuery: string | null) =>
    (keyFromQuery !== null && safeEqual(keyFromQuery, token)) ||
    safeEqual(parseCookies(req.headers.cookie)[cookieName] ?? '', token);

  const serveContent = (res: http.ServerResponse, rest: string) => {
    if (rest.startsWith('runtime/')) {
      if (!runtimeDir) {
        send(res, 404, 'Not found');
        return;
      }
      const relative = rest.slice('runtime/'.length);
      const target = resolveInside(runtimeDir, relative);
      if (!target) {
        send(res, 403, 'Forbidden');
        return;
      }
      sendFile(res, target, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' });
      return;
    }
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
    const resolve = { artboard: resolveBoardFile, document: resolveDocumentAsset, html: resolveHtmlFile }[ref.type];
    const target = resolve(dir, relative);
    if (!target) {
      send(res, 404, 'Not found');
      return;
    }
    const page = ref.type === 'html' ? relative === 'index.html' : ref.type === 'document' && relative.endsWith('.html');
    const headers = { 'Content-Security-Policy': CONTENT_CSP[page ? 'html' : ref.type], 'Access-Control-Allow-Origin': '*' };
    if (!page) {
      sendFile(res, target, headers);
      return;
    }
    fs.readFile(target, 'utf8', (err, source) => {
      if (err) send(res, 404, 'Not found');
      else {
        const uiRuntimeUrl = runtimeDir ? `${contentPrefix}runtime/ryugi-ui.js` : undefined;
        send(res, 200, injectRuntime(source, { uiRuntimeUrl, embedded: ref.type === 'document' }), { 'Content-Type': 'text/html; charset=utf-8', ...headers });
      }
    });
  };

  const serveArtifactApi = (res: http.ServerResponse, type: string, id: string) => {
    const dir = resolveArtifactDir(root, type, id);
    if (!dir) {
      sendJson(res, 404, { warnings: [`artifact ${type}/${id} not found`] });
      return;
    }
    const ref = artifactKeyOf(`${type}/${id}`)!;
    sendJson(res, 200, { ...readArtifact(dir, ref, runtimeOf(ref, dir)), contentBase: `${contentPrefix}${type}/${id}/` });
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
    const { type, artifact, message: detail, version, file } = message as Record<string, unknown>;
    if (typeof artifact !== 'string') return;
    const ref = artifactKeyOf(artifact);
    if (!ref || ref.type === 'artboard' || artifact !== `${ref.type}/${ref.id}`) return;
    const dir = resolveArtifactDir(root, ref.type, ref.id);
    if (!dir) return;
    if (ref.type === 'document') {
      if (!dynamicBlocks.accepts(file)) return;
      if (type === 'loaded') {
        if (dynamicBlocks.loaded(ref.id, dir, file)) writeState(ref, dir);
        return;
      }
      if (type !== 'runtime-error' || typeof detail !== 'string') return;
      if (detail.length === 0 || detail.length > MAX_RUNTIME_MESSAGE) return;
      if (!dynamicBlocks.report(ref.id, dir, file, detail)) return;
      writeState(ref, dir);
      broadcast({ type: 'change', artifact, files: [] });
      return;
    }
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

    const documentMatch = API_DOCUMENT_ROUTE.exec(pathname);
    if (documentMatch) {
      void serveDocumentApi(req, res, documentMatch[1]!, documentMatch[2]!).catch((err) => {
        if (!res.headersSent) send(res, 500, `Artifacts error: ${(err as Error).message}`);
      });
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
    if (!isAuthorized(req, url.searchParams.get('key')) || !sameOrigin(req)) {
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
    const payload = readArtifact(dir, ref, runtimeOf(ref, dir));
    const extra =
      ref.type === 'document'
        ? { dynamic: dynamicBlocks.state(ref.id, dir).dynamic }
        : ref.type === 'html' && 'version' in payload
          ? { ran: ranVersions.get(`${ref.type}/${ref.id}`) === payload.version }
          : {};
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

  const initialChanges: { ref: ArtifactRef; payload: ArtifactPayload; files: string[] }[] = [];
  for (const entry of listArtifacts(root).artifacts) {
    const payload = refreshState(entry, entry.dir);
    initialChanges.push({ ref: entry, payload, files: [] });
    if (entry.type === 'document') void documents.open(entry.id);
  }
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
        if (ref.type === 'document' && (changed.includes('doc.xml') || changed.length === 0)) documents.fileChanged(ref.id);
        if (ref.type === 'document' && changed.includes('comments.json')) documents.commentsChanged(ref.id);
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
    onArtifactChange: (listener) => {
      changeListeners.push(listener);
      for (const change of initialChanges) listener(change.ref, change.payload, change.files);
    },
    onActivity: (listener) => activityListeners.push(listener),
    close: () =>
      new Promise<void>((resolve) => {
        watcher.close();
        for (const socket of clients) socket.destroy();
        server.close(() => resolve());
        server.closeAllConnections();
      }).then(() => documents.close().catch(() => undefined)),
  };
}
