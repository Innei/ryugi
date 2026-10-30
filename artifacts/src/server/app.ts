import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Duplex } from 'node:stream';

import { ownLink } from '../shared/cloud';
import { DOCUMENT_FEATURES_HEADER } from '../shared/document-features';
import { ARTIFACT_LOCATOR_SOURCE } from '../shared/ids';
import { parseAcceptLanguage, resolveLocale } from '../shared/locale';
import { renderThumbnail } from '../shared/thumbnail';
import { typeFaviconHref } from '../shared/type-icons';
import {
  ARTIFACT_TYPES,
  type ArtifactSummary,
  type ArtifactType,
  type CanvasPayload,
  type DocumentPayload,
  type HtmlPayload,
  type ServerMessage,
} from '../shared/types';
import { artifactPath, resolveArtifactAddress } from './artifact-address';
import { readArtifactFile } from './artifact-file';
import {
  artifactKeyOf,
  type ArtifactRef,
  artifactSignature,
  isArtifactLocator,
  listArtifacts,
  resolveArtifactDir,
} from './artifacts';
import { createAutoPublisher } from './auto-publish';
import { AVATAR_ROUTE, createAvatars } from './avatars';
import {
  agentAddOnBoard,
  asBoardAgentOp,
  asBoardHumanOp,
  boardFiles,
  boardSpecs,
  createBoardCommentRegistry,
} from './board-comments';
import { type CloudOptions, createCloudRoutes } from './cloud';
import { commentNames } from './comment-names';
import { ensureConfig, readConfig } from './config';
import { readCredentials } from './credentials';
import { createDirectRelay } from './direct-relay';
import { readDocument } from './document';
import { parseDocument } from './document-codec';
import { asAgentOp, asHumanOp } from './document-comments';
import { OutdatedClient } from './document-session';
import { createDocumentRegistry, type DocumentTiming } from './documents';
import { createDynamicBlocks } from './dynamic-blocks';
import { hostIdFor } from './host-id';
import { latestMtime, readHtml } from './html';
import {
  listen,
  parseCookies,
  randomToken,
  readPersisted,
  safeEqual,
  send,
  sendFile,
  sendJson,
  urlHostForHttp,
} from './http';
import { injectRuntime } from './inject';
import { serverText } from './locales';
import { resolveBoardFile, resolveDocumentAsset, resolveHtmlFile, resolveInside } from './paths';
import { CLOUD_RUNTIME_URL, publishPayload } from './publish-payload';
import { createRelayClient } from './relay';
import { createSelectionStore } from './selection';
import { readCanvas, writeArtifactState, writeJsonAtomic } from './state';
import { createVerifyRecordings } from './verify-recordings';
import { allowInlineScripts, viewerPage } from './viewer-page';
import { watchTree } from './watch';
import { completeHandshake, handleClientFrames, rejectUpgrade, textFrame } from './ws';

export interface ServerOptions {
  cloud?: CloudOptions;
  configFile?: string;
  debounceMs?: number;
  documentTiming?: DocumentTiming;
  fetch?: typeof fetch;
  host: string;
  relay?: { url: string; version: string; pollMs?: number; heartbeatMs?: number };
  root: string;
  runtimeDir?: string;
  urlHost: string;
  viewerDir: string;
}

export type ArtifactPayload = (CanvasPayload | HtmlPayload | DocumentPayload) & {
  warnings: string[];
};

export interface ArtifactsServer {
  close: () => Promise<void>;
  cloudLinkFor: (type: ArtifactType, id: string) => Promise<string | null>;
  contentToken: string;
  linkFor: (type: ArtifactType, id: string) => string;
  onActivity: (listener: () => void) => void;
  onArtifactChange: (
    listener: (ref: ArtifactRef, payload: ArtifactPayload, files: string[]) => void,
  ) => void;
  port: number;
  token: string;
  url: string;
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

const CLOSE_FLUSH_MS = 5000;
const DIRECT_RELAY_ROUTE = /^\/relay\/a\/([\w-]{1,64})$/;
const SHELL_ROUTE = new RegExp(`^/(?:(${ARTIFACT_TYPES.join('|')})/([^/]+)/?)?$`);
const API_ARTIFACT_ROUTE = /^\/api\/artifacts\/([^/]+)\/([^/]+)$/;
const PREVIEW_ROUTE = new RegExp(
  `^/preview/(artboard|document|html)/${ARTIFACT_LOCATOR_SOURCE}/?$`,
);
const API_PREVIEW_ROUTE = /^\/api\/preview\/([^/]+)\/([^/]+)$/;
const API_THUMBNAIL_ROUTE = /^\/api\/thumbnail\/([^/]+)\/([^/]+)\.svg$/;
const API_DOCUMENT_ROUTE = /^\/api\/document\/([^/]+)\/(state|update|comments)$/;
const MAX_COMMENT_OP = 64 * 1024;
const API_AGENT_COMMENTS_ROUTE = /^\/api\/agent\/document\/([^/]+)\/comments$/;
const API_BOARD_COMMENTS_ROUTE = /^\/api\/artboard\/([^/]+)\/comments$/;
const API_AGENT_BOARD_COMMENTS_ROUTE = /^\/api\/agent\/artboard\/([^/]+)\/comments$/;
const API_AGENT_CHECK_ROUTE = /^\/api\/agent\/([^/]+)\/([^/]+)\/check$/;
const MAX_DOCUMENT_UPDATE = 8 * 1024 * 1024;
const MAX_RELAY_FILE = 8 * 1024 * 1024;

const MAX_RUNTIME_MESSAGE = 2048;
const CHECK_WATCH_WAIT_MS = 2_000;
const CHECK_MERGE_WAIT_MS = 60_000;
const MAX_RUNTIME_WARNINGS = 20;

function readArtifactSource(
  dir: string,
  ref: ArtifactRef,
  runtime: string[] = [],
): ArtifactPayload {
  if (ref.type === 'artboard') return readCanvas(dir);
  if (ref.type === 'document') {
    const payload = readDocument(dir, ref.id);
    return { ...payload, warnings: [...payload.warnings, ...runtime] };
  }
  const payload = readHtml(dir, ref.id);
  return {
    ...payload,
    warnings: [...payload.warnings, ...runtime.map((message) => `runtime: ${message}`)],
  };
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
  if (options.configFile) ensureConfig(options.configFile);

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
  const selections = createSelectionStore(
    stateDir,
    (kind, id) => resolveArtifactDir(root, kind, id) !== null,
  );
  selections.clearAll();
  const changeListeners: ((ref: ArtifactRef, payload: ArtifactPayload, files: string[]) => void)[] =
    [];
  const activityListeners: (() => void)[] = [];
  const startedAt = Date.now();
  let lastActivity = startedAt;
  const touch = () => {
    lastActivity = Date.now();
    activityListeners.forEach((listener) => listener());
  };
  let port = 0;
  let cookieName = '';

  let relay: ReturnType<typeof createRelayClient> | null = null;
  const direct = createDirectRelay({
    version: options.relay?.version ?? '',
    handle: (key, body, conn) => handleRelay(key, body, conn, `http://127.0.0.1:${port}`),
    onActivity: () => touch(),
    onClose: (conn) => dropRelayViewer(conn),
  });
  const broadcast = (message: ServerMessage) => {
    const frame = textFrame(JSON.stringify(message));
    for (const socket of clients) socket.write(frame);
    relay?.emit(message.artifact, message);
    direct.emit(message.artifact, message);
  };
  const avatars = createAvatars(options.fetch);
  const names = commentNames({
    agentFile: path.join(stateDir, 'agent'),
    projectDir: path.resolve(root, '../..'),
    cloud: options.cloud,
  });
  const recordings = createVerifyRecordings({
    stateDir,
    onChange: (id) => {
      const ref: ArtifactRef = { type: 'artboard', id };
      const dir = resolveArtifactDir(root, ref.type, id);
      if (!dir) return;
      const payload = refreshState(ref, dir);
      boardComments.boardsChanged(id);
      const key = `artboard/${id}`;
      broadcast({ type: 'change', artifact: key, files: [] });
      autoPublisher?.changed(key);
      cloud?.changed(key);
      changeListeners.forEach((listener) => listener(ref, payload, []));
    },
  });
  const readArtifact = (dir: string, ref: ArtifactRef, runtime: string[] = []): ArtifactPayload => {
    const payload = readArtifactSource(dir, ref, runtime);
    return ref.type === 'artboard'
      ? recordings.project(ref.id, dir, payload as CanvasPayload)
      : payload;
  };
  const boardComments = createBoardCommentRegistry({
    root,
    stateDir,
    broadcast,
    names,
    evidenceHash: recordings.evidenceHash,
  });
  const documents = createDocumentRegistry({
    root,
    stateDir,
    timing: options.documentTiming,
    broadcast,
    names,
    onWarningsChange: (id) => {
      const dir = resolveArtifactDir(root, 'document', id);
      if (!dir) return;
      writeState({ type: 'document', id }, dir);
      broadcast({ type: 'change', artifact: `document/${id}`, files: [] });
    },
    log: (line) => console.info(JSON.stringify({ type: 'document-log', line })),
  });

  const inspect = async (ref: ArtifactRef) => {
    const dir = resolveArtifactDir(root, ref.type, ref.id);
    if (!dir) return null;
    const session = ref.type === 'document' ? await documents.open(ref.id) : null;
    await session?.flush();
    const payload = readArtifact(dir, ref, runtimeOf(ref, dir));
    const reasons = [...payload.warnings];
    if ('pending' in payload)
      reasons.push(...payload.pending.map((board) => `board ${board} is still being written`));
    if (
      'canvas' in payload &&
      payload.canvas?.writing &&
      !payload.pending.includes(payload.canvas.writing)
    ) {
      reasons.push(`board ${payload.canvas.writing} is still being written`);
    }
    if (session?.streaming()) reasons.push('the document is still being written');
    const title = titleOf(payload, ref);
    let published: Record<string, unknown> | null = null;
    if (reasons.length === 0) {
      try {
        published = publishPayload(
          ref,
          dir,
          title,
          payload,
          ref.type === 'document' ? documents.comments(ref.id) : undefined,
        );
      } catch (err) {
        reasons.push((err as Error).message);
      }
    }
    return {
      dir,
      title,
      reasons,
      payload: published,
      ...('canvas' in payload ? { fileOverrides: recordings.overrides(ref.id, payload) } : {}),
    };
  };
  const cloud =
    options.cloud && options.configFile
      ? createCloudRoutes({
          ...options.cloud,
          configFile: options.configFile,
          project: path.basename(path.resolve(root, '../..')),
          port: () => port,
          inspect,
          onPublication: (key, publication) => {
            broadcast({ type: 'cloud-publication', artifact: key, publication });
          },
        })
      : null;

  const autoPublisher = cloud
    ? createAutoPublisher({
        stateFile: path.join(stateDir, 'auto-publish.json'),
        enabled: cloud.autoPublishEnabled,
        token: cloud.token,
        publish: async (key) => {
          const outcome = await cloud.autoPublish(key);
          if (outcome.kind === 'published') {
            const frame = textFrame(
              JSON.stringify({ type: 'cloud-published', artifact: key } satisfies ServerMessage),
            );
            for (const socket of clients) socket.write(frame);
          }
          return outcome;
        },
      })
    : null;

  const sameOrigin = (req: http.IncomingMessage) => {
    const origin = req.headers.origin;
    const host = req.headers.host ?? '';
    return origin === `http://${host}` || origin === `https://${host}`;
  };

  const readCommentBody = async (req: http.IncomingMessage): Promise<unknown> => {
    const parts: Buffer[] = [];
    let received = 0;
    for await (const chunk of req) {
      received += (chunk as Buffer).length;
      if (received <= MAX_COMMENT_OP) parts.push(chunk as Buffer);
    }
    if (received > MAX_COMMENT_OP) return null;
    try {
      return JSON.parse(Buffer.concat(parts).toString('utf8'));
    } catch {
      return null;
    }
  };

  const documentState = (
    id: string,
    session: NonNullable<Awaited<ReturnType<typeof documents.open>>>,
  ) => ({
    snapshot: Buffer.from(session.snapshot()).toString('base64'),
    lineage: session.lineage(),
    outcome: session.outcome(),
    streaming: session.streaming(),
    agentActiveAt: session.agentActiveAt(),
    now: Date.now(),
    cursor: session.cursor(),
    comments: documents.comments(id),
  });

  const serveDocumentApi = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    id: string,
    action: string,
  ) => {
    if (action !== 'state' && (req.method !== 'POST' || !sameOrigin(req))) {
      send(res, 403, 'Forbidden');
      return;
    }
    if (action === 'comments') {
      if (!resolveArtifactDir(root, 'document', id)) {
        sendJson(res, 404, { error: `document/${id} not found` });
        return;
      }
      const op = asHumanOp(await readCommentBody(req));
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
      sendJson(res, 200, documentState(id, session));
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
    const header = req.headers[DOCUMENT_FEATURES_HEADER];
    const features =
      typeof header === 'string' ? header.split(',').map((feature) => feature.trim()) : [];
    try {
      session.importUpdate(new Uint8Array(Buffer.concat(chunks)), features);
      send(res, 204, '');
    } catch (err) {
      sendJson(res, err instanceof OutdatedClient ? 409 : 400, { error: (err as Error).message });
    }
  };

  const blockIdsOf = async (id: string, dir: string) => {
    await (await documents.open(id))?.flush();
    const state = parseDocument(fs.readFileSync(path.join(dir, 'doc.xml'), 'utf8'));
    return new Set(
      (state.root.children as { $?: { blockId?: string } }[]).flatMap((block) =>
        block.$?.blockId ? [block.$.blockId] : [],
      ),
    );
  };

  const serveAgentComments = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    id: string,
  ) => {
    const dir = resolveArtifactDir(root, 'document', id);
    if (!dir) {
      sendJson(res, 404, { error: `document/${id} not found` });
      return;
    }
    const body = await readCommentBody(req);
    const fields =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const agent =
      typeof fields.agent === 'string' && fields.agent.length > 0 && fields.agent.length <= 100
        ? fields.agent
        : undefined;
    if (fields.op === 'list') {
      sendJson(res, 200, {
        type: 'comments',
        artifact: `document/${id}`,
        threads: documents.listComments(id, agent ?? 'Agent', fields.all === true),
      });
      return;
    }
    const op = asAgentOp(body);
    if (!op) {
      sendJson(res, 400, {
        error:
          'not an agent comment op: use list, add {blockId, text}, reply {threadId, text} or resolve {threadId}; text must not be empty',
      });
      return;
    }
    if (op.op === 'add') {
      let blocks: Set<string>;
      try {
        blocks = await blockIdsOf(id, dir);
      } catch (err) {
        sendJson(res, 400, { error: `doc.xml could not be read: ${(err as Error).message}` });
        return;
      }
      if (!blocks.has(op.blockId)) {
        sendJson(res, 400, { error: `no block ${op.blockId} in document/${id}` });
        return;
      }
    }
    try {
      sendJson(res, 200, documents.applyAgentCommentOp(id, op, agent));
    } catch (err) {
      sendJson(res, 400, { error: (err as Error).message });
    }
  };

  const verdictPreparing = (id: string, op: NonNullable<ReturnType<typeof asBoardHumanOp>>) => {
    if (op.op !== 'create' || !op.anchor.verdict) return false;
    const dir = resolveArtifactDir(root, 'artboard', id);
    if (!dir) return false;
    const payload = readArtifact(dir, { type: 'artboard', id }) as CanvasPayload;
    const members = payload.canvas?.groups?.[op.anchor.group!]?.boards ?? [];
    return members.some((board) => payload.pending.includes(board));
  };

  const serveBoardComments = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    id: string,
  ) => {
    if (req.method !== 'POST' || !sameOrigin(req)) {
      send(res, 403, 'Forbidden');
      return;
    }
    if (!resolveArtifactDir(root, 'artboard', id)) {
      sendJson(res, 404, { error: `artboard/${id} not found` });
      return;
    }
    const op = asBoardHumanOp(await readCommentBody(req));
    if (!op) {
      sendJson(res, 400, { error: 'not a comment op' });
      return;
    }
    if (verdictPreparing(id, op)) {
      sendJson(res, 409, { error: 'The recording evidence is still being prepared' });
      return;
    }
    try {
      sendJson(res, 200, boardComments.apply(id, op));
    } catch (err) {
      sendJson(res, 400, { error: (err as Error).message });
    }
  };

  const serveAgentBoardComments = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    id: string,
  ) => {
    const dir = resolveArtifactDir(root, 'artboard', id);
    if (!dir) {
      sendJson(res, 404, { error: `artboard/${id} not found` });
      return;
    }
    const body = await readCommentBody(req);
    const fields =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const agent =
      typeof fields.agent === 'string' && fields.agent.length > 0 && fields.agent.length <= 100
        ? fields.agent
        : undefined;
    if (fields.op === 'list') {
      const threads = boardComments.list(id, agent ?? 'Agent', fields.all === true);
      sendJson(res, 200, {
        type: 'comments',
        artifact: `artboard/${id}`,
        threads,
        groups: boardComments.groups(id),
      });
      return;
    }
    const shorthand = agentAddOnBoard(body, boardSpecs(dir));
    if (shorthand && 'error' in shorthand) {
      sendJson(res, 400, { error: `${shorthand.error} in artboard/${id}` });
      return;
    }
    const op = shorthand ?? asBoardAgentOp(body);
    if (!op) {
      sendJson(res, 400, {
        error:
          'not an agent comment op: use list, add {anchor: {page, board, x, y}, text}, reply {threadId, text} or resolve {threadId}; text must not be empty',
      });
      return;
    }
    if (op.op === 'add' && op.anchor.board && !(op.anchor.board in boardFiles(dir))) {
      sendJson(res, 400, { error: `no board ${op.anchor.board} in artboard/${id}` });
      return;
    }
    try {
      sendJson(res, 200, boardComments.applyAgent(id, op, agent));
    } catch (err) {
      sendJson(res, 400, { error: (err as Error).message });
    }
  };

  const isAuthorized = (req: http.IncomingMessage, keyFromQuery: string | null) =>
    (keyFromQuery !== null && safeEqual(keyFromQuery, token)) ||
    safeEqual(parseCookies(req.headers.cookie)[cookieName] ?? '', token);

  const serveContent = (res: http.ServerResponse, rest: string, range?: string) => {
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
      sendFile(res, target, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      });
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
    const resolve = {
      artboard: resolveBoardFile,
      document: resolveDocumentAsset,
      html: resolveHtmlFile,
    }[ref.type];
    const target =
      (ref.type === 'artboard' ? recordings.resolve(id, relative) : null) ?? resolve(dir, relative);
    if (!target) {
      send(res, 404, 'Not found');
      return;
    }
    const page = ref.type === 'html' ? relative === 'index.html' : relative.endsWith('.html');
    const headers = {
      'Content-Security-Policy': CONTENT_CSP[page && ref.type === 'document' ? 'html' : ref.type],
      'Access-Control-Allow-Origin': '*',
    };
    if (!page) {
      sendFile(res, target, headers, range);
      return;
    }
    fs.readFile(target, 'utf8', (err, source) => {
      if (err) send(res, 404, 'Not found');
      else {
        const uiRuntimeUrl = runtimeDir ? `${contentPrefix}runtime/ryugi-ui.js` : undefined;
        send(
          res,
          200,
          injectRuntime(source, {
            uiRuntimeUrl,
            embedded: ref.type === 'document',
            inspector: ref.type === 'artboard',
          }),
          { 'Content-Type': 'text/html; charset=utf-8', ...headers },
        );
      }
    });
  };

  const artifactMeta = (ref: ArtifactRef, dir: string, contentOrigin = '') => ({
    ...readArtifact(dir, ref, runtimeOf(ref, dir)),
    ...(ref.type !== 'html' ? { agent: names.agent() } : {}),
    ...(ref.type === 'artboard'
      ? { comments: boardComments.comments(ref.id), staleThreads: boardComments.stale(ref.id) }
      : {}),
    contentBase: `${contentOrigin}${contentPrefix}${ref.type}/${ref.id}/`,
  });

  const serveArtifactApi = (res: http.ServerResponse, type: string, id: string) => {
    const dir = resolveArtifactDir(root, type, id);
    if (!dir) {
      sendJson(res, 404, { warnings: [`artifact ${type}/${id} not found`] });
      return;
    }
    sendJson(res, 200, artifactMeta(artifactKeyOf(`${type}/${id}`)!, dir));
  };

  const serveList = (res: http.ServerResponse) => {
    const { artifacts, warnings } = listArtifacts(root);
    const summaries: ArtifactSummary[] = artifacts.map((entry) => ({
      type: entry.type,
      id: entry.id,
      url: artifactPath(root, entry.type, entry.id),
      title: titleOf(readArtifact(entry.dir, entry), entry),
      updatedAt: latestMtime(entry.dir),
    }));
    sendJson(res, 200, {
      project: path.basename(path.dirname(path.dirname(root))),
      artifacts: summaries,
      warnings,
    });
  };

  function onClientText(socket: Duplex, text: string) {
    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof message !== 'object' || message === null) return;
    if ((message as { type?: unknown }).type === 'selection') {
      selections.accept(socket, message);
      return;
    }
    acceptReport(message as Record<string, unknown>);
  }

  function acceptReport({
    type,
    artifact,
    message: detail,
    version,
    file,
  }: Record<string, unknown>) {
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
    const frame = textFrame(
      JSON.stringify({ type: 'change', artifact, files: [] } satisfies ServerMessage),
    );
    for (const socket of clients) socket.write(frame);
  }

  const handleRequest = (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const url = new URL(req.url ?? '/', 'http://artifacts.local');
    // The monitor polls this; counting it as activity would keep every watched server from ever going idle.
    if (url.pathname === '/api/status') {
      if (!isAuthorized(req, url.searchParams.get('key')))
        send(res, 403, 'Forbidden: agent calls need ?key=');
      else sendJson(res, 200, { pid: process.pid, startedAt, lastActivity, clients: clients.size });
      return;
    }
    touch();
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      send(res, 400, 'Bad request');
      return;
    }

    if (pathname === '/robots.txt') {
      sendFile(res, path.join(viewerDir, 'robots.txt'));
      return;
    }

    if (pathname.startsWith('/c/')) {
      if (!pathname.startsWith(contentPrefix)) send(res, 404, 'Not found');
      else serveContent(res, pathname.slice(contentPrefix.length), req.headers.range);
      return;
    }

    if (cloud && pathname === '/api/cloud/callback') {
      void cloud
        .handleCallback(
          url,
          res,
          resolveLocale(parseAcceptLanguage(req.headers['accept-language'])),
        )
        .catch((err) => {
          if (!res.headersSent) send(res, 500, `Artifacts error: ${(err as Error).message}`);
        });
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

    const avatarMatch = AVATAR_ROUTE.exec(pathname);
    if (avatarMatch) {
      void avatars.load(avatarMatch[1]!, avatarMatch[2]!).then(({ status, type, body }) => {
        if (body && type)
          send(res, status, body, {
            'Content-Type': type,
            'Cache-Control': 'private, max-age=86400',
          });
        else send(res, status, 'No avatar');
      });
      return;
    }

    const previewMatch = API_PREVIEW_ROUTE.exec(pathname);
    if (previewMatch) {
      const [, type = '', id = ''] = previewMatch;
      const dir = resolveArtifactDir(root, type, id);
      const ref = artifactKeyOf(`${type}/${id}`);
      if (!dir || !ref) {
        sendJson(res, 404, { error: 'Artifact not found' });
        return;
      }
      try {
        const payload = readArtifact(dir, ref);
        const title = titleOf(payload, ref);
        sendJson(res, 200, {
          ...publishPayload(ref, dir, title, payload),
          title,
          warnings: payload.warnings,
          contentBase: `${contentPrefix}${type}/${id}/`,
        });
      } catch {
        sendJson(res, 422, { error: 'Preview unavailable' });
      }
      return;
    }

    const thumbnailMatch = API_THUMBNAIL_ROUTE.exec(pathname);
    if (thumbnailMatch) {
      const requested = artifactKeyOf(
        `${thumbnailMatch[1]}/${thumbnailMatch[2]}`,
        isArtifactLocator,
      );
      let resolved: ReturnType<typeof resolveArtifactAddress>;
      try {
        resolved = requested && resolveArtifactAddress(root, requested.type, requested.id);
      } catch {
        resolved = null;
      }
      if (!resolved) {
        send(res, 404, 'Artifact not found');
        return;
      }
      try {
        const ref = { type: resolved.type, id: resolved.id };
        const payload = readArtifact(resolved.dir, ref);
        const title = titleOf(payload, ref);
        const project = path.basename(path.dirname(path.dirname(root)));
        const svg = renderThumbnail(
          { id: ref.id, type: ref.type, title, project },
          ref.type === 'html' ? null : publishPayload(ref, resolved.dir, title, payload),
        );
        send(res, 200, svg, {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'private, max-age=31536000, immutable',
          'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
          'X-Content-Type-Options': 'nosniff',
        });
      } catch {
        send(res, 422, 'Thumbnail unavailable');
      }
      return;
    }

    if (pathname === '/api/cloud/flush') {
      if (req.method !== 'POST' || key === null || !safeEqual(key, token)) {
        send(res, 403, 'Forbidden: agent calls need ?key=');
        return;
      }
      if (!autoPublisher) sendJson(res, 404, { error: 'cloud publishing is not configured' });
      else if (url.searchParams.get('wait') === '1')
        void autoPublisher.flush().then(() => sendJson(res, 200, { flushed: true }));
      else {
        void autoPublisher.flush();
        sendJson(res, 202, { queued: true });
      }
      return;
    }

    const cloudMatch = cloud?.match(pathname);
    if (cloud && cloudMatch) {
      if (req.method !== 'GET' && !(key !== null && safeEqual(key, token)) && !sameOrigin(req)) {
        send(res, 403, 'Forbidden');
        return;
      }
      void cloud.handle(req, res, cloudMatch);
      return;
    }

    const agentCommentsMatch = API_AGENT_COMMENTS_ROUTE.exec(pathname);
    if (agentCommentsMatch) {
      if (req.method !== 'POST' || key === null || !safeEqual(key, token)) {
        send(res, 403, 'Forbidden: agent calls need ?key=');
        return;
      }
      void serveAgentComments(req, res, agentCommentsMatch[1]!).catch((err) => {
        if (!res.headersSent) send(res, 500, `Artifacts error: ${(err as Error).message}`);
      });
      return;
    }

    const agentBoardMatch = API_AGENT_BOARD_COMMENTS_ROUTE.exec(pathname);
    if (agentBoardMatch) {
      if (req.method !== 'POST' || key === null || !safeEqual(key, token)) {
        send(res, 403, 'Forbidden: agent calls need ?key=');
        return;
      }
      void serveAgentBoardComments(req, res, agentBoardMatch[1]!).catch((err) => {
        if (!res.headersSent) send(res, 500, `Artifacts error: ${(err as Error).message}`);
      });
      return;
    }

    const agentCheckMatch = API_AGENT_CHECK_ROUTE.exec(pathname);
    if (agentCheckMatch) {
      if (req.method !== 'POST' || key === null || !safeEqual(key, token)) {
        send(res, 403, 'Forbidden: agent calls need ?key=');
        return;
      }
      void serveAgentCheck(res, agentCheckMatch[1]!, agentCheckMatch[2]!).catch((err) => {
        if (!res.headersSent) send(res, 500, `Artifacts error: ${(err as Error).message}`);
      });
      return;
    }

    const boardCommentsMatch = API_BOARD_COMMENTS_ROUTE.exec(pathname);
    if (boardCommentsMatch) {
      void serveBoardComments(req, res, boardCommentsMatch[1]!).catch((err) => {
        if (!res.headersSent) send(res, 500, `Artifacts error: ${(err as Error).message}`);
      });
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

    if (SHELL_ROUTE.test(pathname) || PREVIEW_ROUTE.test(pathname) || pathname === '/index.html') {
      const requested = artifactKeyOf(
        pathname.replace(/^\/(?:preview\/)?/, '').replace(/\/$/, ''),
        isArtifactLocator,
      );
      const resolved = requested && resolveArtifactAddress(root, requested.type, requested.id);
      const ref = resolved ?? requested;
      const dir = resolved?.dir;
      const project = path.basename(path.dirname(path.dirname(root)));
      const title = ref
        ? dir
          ? titleOf(readArtifact(dir, ref), ref)
          : ref.id
        : `${project} · Artifacts`;
      const locale = resolveLocale(parseAcceptLanguage(req.headers['accept-language']));
      const t = serverText(locale);
      const description = ref
        ? t('meta.artifact', {
            project,
            title,
            type:
              ref.type === 'artboard' ? 'Artboard' : ref.type === 'document' ? 'Document' : 'HTML',
          })
        : t('meta.library', { project });
      const preview = PREVIEW_ROUTE.test(pathname);
      const canonicalPath = ref
        ? dir
          ? artifactPath(root, ref.type, ref.id)
          : `/${ref.type}/${ref.id}`
        : '/';
      const canonical = `http://${urlHostForHttp(options.urlHost)}:${port}${preview ? '/preview' : ''}${canonicalPath}`;
      const csp = preview
        ? VIEWER_CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self'")
        : VIEWER_CSP;
      const headers: Record<string, string> = { 'Content-Type': 'text/html; charset=utf-8' };
      if (key !== null)
        headers['Set-Cookie'] = `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/`;
      const entry =
        preview && fs.existsSync(path.join(viewerDir, 'preview.html'))
          ? 'preview.html'
          : 'index.html';
      void fs.promises
        .readFile(path.join(viewerDir, entry), 'utf8')
        .then((template) => {
          const html = viewerPage(template, {
            title,
            description,
            locale,
            url: canonical,
            icon: ref ? typeFaviconHref(ref.type) : undefined,
            artifactId: resolved?.id,
          });
          send(res, 200, html, {
            ...headers,
            'Content-Security-Policy': allowInlineScripts(csp, html),
          });
        })
        .catch((err: NodeJS.ErrnoException) =>
          send(res, err.code === 'ENOENT' ? 404 : 500, 'Viewer unavailable'),
        );
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
    const directMatch = DIRECT_RELAY_ROUTE.exec(url.pathname);
    if (directMatch && typeof clientKey === 'string') {
      const fromCloud = options.cloud !== undefined && req.headers.origin === options.cloud.origin;
      if (!safeEqual(url.searchParams.get('key') ?? '', token) || !(fromCloud || sameOrigin(req))) {
        rejectUpgrade(socket, 403, 'Forbidden');
        return;
      }
      const key = servedArtifacts().get(directMatch[1]!);
      if (!key) rejectUpgrade(socket, 404, 'Not Found');
      else direct.accept(socket, clientKey, key);
      return;
    }
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
    handleClientFrames(socket, (text) => onClientText(socket, text));
    const forget = () => {
      clients.delete(socket);
      selections.drop(socket);
    };
    socket.on('end', () => {
      forget();
      socket.end();
    });
    socket.on('close', forget);
    socket.on('error', forget);
    touch();
  });

  const previousPort = Number(readPersisted(portFile));
  try {
    port = await listen(
      server,
      options.host,
      Number.isInteger(previousPort) && previousPort > 0 ? previousPort : 0,
    );
  } catch {
    port = await listen(server, options.host, 0);
  }
  cookieName = `ryugi_artifacts_${port}`;
  fs.writeFileSync(portFile, `${port}\n`, { mode: 0o600 });

  const origin = `http://${urlHostForHttp(options.urlHost)}:${port}`;
  const url = `${origin}/?key=${token}`;
  const linkFor = (type: ArtifactType, id: string) =>
    `${origin}${artifactPath(root, type, id)}?key=${token}`;

  const signatures = new Map<string, string>();
  const writeState = (ref: ArtifactRef, dir: string) => {
    const payload = readArtifact(dir, ref, runtimeOf(ref, dir));
    const extra =
      ref.type === 'document'
        ? { dynamic: dynamicBlocks.state(ref.id, dir).dynamic }
        : ref.type === 'html' && 'version' in payload
          ? { ran: ranVersions.get(`${ref.type}/${ref.id}`) === payload.version }
          : 'recordings' in payload
            ? { recordings: payload.recordings }
            : {};
    try {
      writeArtifactState(stateDir, ref, payload, extra);
    } catch (err) {
      console.error(JSON.stringify({ type: 'state-write-error', error: (err as Error).message }));
    }
    return payload;
  };
  const refreshState = (ref: ArtifactRef, dir: string) => {
    signatures.set(`${ref.type}/${ref.id}`, artifactSignature(dir, ref.type));
    return writeState(ref, dir);
  };

  const initialChanges: { ref: ArtifactRef; payload: ArtifactPayload; files: string[] }[] = [];
  for (const entry of listArtifacts(root).artifacts) {
    const payload = refreshState(entry, entry.dir);
    initialChanges.push({ ref: entry, payload, files: [] });
    if (entry.type === 'document') void documents.open(entry.id);
  }
  writeJsonAtomic(path.join(stateDir, 'server-info'), { type: 'server-started', url, port, root });

  const relayViewers = new Map<string, { key: string; tab: object }>();
  const servedArtifacts = () => {
    const served = new Map<string, string>();
    if (!options.configFile) return served;
    for (const [key, entry] of Object.entries(readConfig(options.configFile).config.artifacts)) {
      const ref = artifactKeyOf(key);
      if (entry.cloud && ref && resolveArtifactDir(root, ref.type, ref.id))
        served.set(entry.cloud.id, key);
    }
    return served;
  };
  const dropRelayViewer = (conn: string) => {
    const viewer = relayViewers.get(conn);
    if (!viewer) return;
    selections.drop(viewer.tab);
    relayViewers.delete(conn);
  };
  const handleRelay = async (key: string, body: unknown, conn: string, contentOrigin = '') => {
    const ref = artifactKeyOf(key)!;
    const dir = resolveArtifactDir(root, ref.type, ref.id);
    if (!dir) throw new Error(`${key} not found`);
    const request = (typeof body === 'object' && body !== null ? body : {}) as Record<
      string,
      unknown
    >;
    if (request.op === 'publication' && cloud) return cloud.publication(key);
    if (request.op === 'publish' && cloud) return cloud.publishNow(key);
    if (request.op === 'meta') return artifactMeta(ref, dir, contentOrigin);
    if (request.op === 'file') {
      const file =
        typeof request.path === 'string'
          ? readArtifactFile(
              dir,
              ref.type,
              request.path,
              CLOUD_RUNTIME_URL,
              MAX_RELAY_FILE,
              ref.type === 'artboard' ? recordings.resolve(ref.id, request.path) : null,
            )
          : null;
      if (!file) throw new Error('not found');
      if (file.data.length > MAX_RELAY_FILE) throw new Error('too large');
      return { contentType: file.contentType, data: file.data.toString('base64') };
    }
    if (request.op === 'client') {
      if (typeof request.message === 'object' && request.message !== null)
        acceptReport({ ...(request.message as Record<string, unknown>), artifact: key });
      return null;
    }
    if (request.op === 'comment' && ref.type === 'artboard') {
      const op =
        JSON.stringify(request.comment ?? null).length <= MAX_COMMENT_OP
          ? asBoardHumanOp(request.comment)
          : null;
      if (!op) throw new Error('not a comment op');
      if (verdictPreparing(ref.id, op))
        throw new Error('The recording evidence is still being prepared');
      return boardComments.apply(ref.id, op);
    }
    if (
      (request.op === 'state' || request.op === 'update' || request.op === 'comment') &&
      ref.type !== 'document'
    )
      throw new Error(`${key} is not a document`);
    if (request.op === 'state' || request.op === 'update') {
      const session = await documents.open(ref.id);
      if (!session) throw new Error(`${key} has no doc.xml`);
      if (request.op === 'state') return documentState(ref.id, session);
      const bytes = typeof request.bytes === 'string' ? Buffer.from(request.bytes, 'base64') : null;
      if (!bytes) throw new Error('update needs bytes');
      if (bytes.length > MAX_DOCUMENT_UPDATE) throw new Error('update too large');
      const features = Array.isArray(request.features)
        ? request.features.filter((feature): feature is string => typeof feature === 'string')
        : [];
      session.importUpdate(new Uint8Array(bytes), features);
      return null;
    }
    if (request.op === 'comment') {
      const op =
        JSON.stringify(request.comment ?? null).length <= MAX_COMMENT_OP
          ? asHumanOp(request.comment)
          : null;
      if (!op) throw new Error('not a comment op');
      return { comments: documents.applyCommentOp(ref.id, op) };
    }
    if (request.op === 'selection') {
      if (typeof request.selection !== 'object' || request.selection === null)
        throw new Error('not a selection');
      const viewer = relayViewers.get(conn) ?? { key, tab: {} };
      relayViewers.set(conn, viewer);
      selections.accept(viewer.tab, { ...request.selection, artifact: key });
      return null;
    }
    throw new Error('unknown request');
  };
  relay =
    options.relay && options.cloud
      ? createRelayClient({
          ...options.relay,
          token: () =>
            readCredentials(options.cloud!.credentialsFile, options.cloud!.origin)?.token ?? null,
          served: servedArtifacts,
          local: () => ({ hostId: hostIdFor(options.cloud!.credentialsFile), port, key: token }),
          handle: handleRelay,
          onActivity: touch,
          onWatch: (keys) => {
            for (const [conn, viewer] of relayViewers) {
              if (keys.has(viewer.key) || conn.startsWith('direct:')) continue;
              selections.drop(viewer.tab);
              relayViewers.delete(conn);
            }
          },
        })
      : null;

  // The watcher debounces and its backup poll can lag a second, and a document's warnings arrive only after its merge plays out.
  const serveAgentCheck = async (res: http.ServerResponse, type: string, id: string) => {
    const ref = artifactKeyOf(`${type}/${id}`);
    const dir = ref && resolveArtifactDir(root, ref.type, ref.id);
    if (!ref || !dir) {
      sendJson(res, 404, { error: `${type}/${id} not found in ${root}` });
      return;
    }
    const key = `${ref.type}/${ref.id}`;
    for (
      let waited = 0;
      waited < CHECK_WATCH_WAIT_MS && signatures.get(key) !== artifactSignature(dir, ref.type);
      waited += 50
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    let merging = false;
    if (ref.type === 'document') {
      const session = await documents.open(ref.id);
      const text = await fs.promises.readFile(path.join(dir, 'doc.xml'), 'utf8').catch(() => null);
      if (session && text !== null) {
        session.onFileText(text);
        const timeout = new Promise<'timeout'>((resolve) =>
          setTimeout(() => resolve('timeout'), CHECK_MERGE_WAIT_MS).unref(),
        );
        merging = (await Promise.race([session.settled(), timeout])) === 'timeout';
      }
    }
    writeState(ref, dir);
    const state = JSON.parse(
      await fs.promises.readFile(path.join(stateDir, ref.type, ref.id, 'warnings.json'), 'utf8'),
    );
    sendJson(res, 200, merging ? { ...state, merging: true } : state);
  };

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
          autoPublisher?.removed(key);
          const frame = textFrame(
            JSON.stringify({
              type: 'change',
              artifact: key,
              files: changed,
            } satisfies ServerMessage),
          );
          for (const socket of clients) socket.write(frame);
          continue;
        }
        if (ref.type === 'document' && (changed.includes('doc.xml') || changed.length === 0))
          documents.fileChanged(ref.id);
        if (ref.type === 'document' && changed.includes('comments.json'))
          documents.commentsChanged(ref.id);
        if (ref.type === 'artboard' && changed.includes('comments.json'))
          boardComments.sync(ref.id);
        if (
          ref.type === 'artboard' &&
          (changed.some((file) => file !== 'comments.json') || changed.length === 0)
        )
          boardComments.boardsChanged(ref.id);
        if (signatures.get(key) === artifactSignature(dir, ref.type)) continue;
        autoPublisher?.changed(key);
        runtimeWarnings.delete(key);
        const payload = refreshState(ref, dir);
        const frame = textFrame(
          JSON.stringify({ type: 'change', artifact: key, files: changed } satisfies ServerMessage),
        );
        for (const socket of clients) socket.write(frame);
        relay?.emit(key, { type: 'change', artifact: key, files: changed });
        direct.emit(key, { type: 'change', artifact: key, files: changed });
        cloud?.changed(key);
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
    cloudLinkFor: async (type, id) => {
      if (
        !cloud ||
        !options.cloud ||
        !readCredentials(options.cloud.credentialsFile, options.cloud.origin)
      )
        return null;
      const { url } = await cloud.reserve({ type, id });
      return url ? ownLink(url, hostIdFor(options.cloud.credentialsFile)) : null;
    },
    onArtifactChange: (listener) => {
      changeListeners.push(listener);
      for (const change of initialChanges) listener(change.ref, change.payload, change.files);
    },
    onActivity: (listener) => activityListeners.push(listener),
    close: async () => {
      await recordings.close();
      await Promise.race([
        autoPublisher?.flush(),
        new Promise((resolve) => setTimeout(resolve, CLOSE_FLUSH_MS).unref()),
      ]);
      await new Promise<void>((resolve) => {
        watcher.close();
        autoPublisher?.close();
        relay?.close();
        direct.close();
        selections.clearAll();
        for (const socket of clients) socket.destroy();
        server.close(() => resolve());
        server.closeAllConnections();
      });
      await documents.close().catch(() => undefined);
    },
  };
}
