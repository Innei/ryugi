import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';
import type { Duplex } from 'node:stream';

import type { CanvasPayload, DocumentPayload, HtmlPayload, ServerMessage } from '../shared/types';
import { accessPolicy, isLoopbackHost } from './access';
import { artifactPath, resolveArtifactAddress } from './artifact-address';
import {
  artifactKeyOf,
  type ArtifactRef,
  artifactSignature,
  isArtifactLocator,
  resolveArtifactDir,
} from './artifacts';
import { createAutoPublisher } from './auto-publish';
import { createAvatars } from './avatars';
import { type asBoardHumanOp, createBoardCommentRegistry } from './board-comments';
import { originsFor } from './board-port';
import { type CloudOptions, createCloudRoutes } from './cloud';
import { commentNames } from './comment-names';
import { ensureConfig, readConfig } from './config';
import { createDirectRelay } from './direct-relay';
import { readDocument } from './document';
import { createDocumentRegistry, type DocumentTiming } from './documents';
import { createDynamicBlocks } from './dynamic-blocks';
import { readHtml } from './html';
import { parseCookies, randomToken, readPersisted, safeEqual } from './http';
import { MAX_RUNTIME_WARNINGS } from './limits';
import { publishPayload } from './publish-payload';
import type { createRelayClient } from './relay';
import { dropRelayViewer, handleRelay } from './relay-requests';
import { createSelectionStore } from './selection';
import { readCanvas, writeArtifactState } from './state';
import { createVerifyRecordings } from './verify-recordings';
import { textFrame } from './ws';

export interface ServerOptions {
  cloud?: CloudOptions;
  configFile?: string;
  debounceMs?: number;
  documentTiming?: DocumentTiming;
  fetch?: typeof fetch;
  host: string;
  mount?: MountSettings;
  relay?: { url: string; version: string; pollMs?: number; heartbeatMs?: number };
  root: string;
  runtimeDir?: string;
  urlHost: string;
  viewerDir: string;
}

export interface MountSettings {
  boardPort: number;
  port: number;
  token: string;
  version: string;
}

export type ArtifactPayload = (CanvasPayload | HtmlPayload | DocumentPayload) & {
  warnings: string[];
};

export type ChangeListener = (ref: ArtifactRef, payload: ArtifactPayload, files: string[]) => void;

type RelayEmitter = Pick<ReturnType<typeof createRelayClient>, 'emit' | 'close'>;

export function readArtifactSource(
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

export function titleOf(payload: ArtifactPayload) {
  if ('title' in payload && typeof payload.title === 'string' && payload.title.trim())
    return payload.title.trim();
  if ('canvas' in payload) {
    const title = payload.canvas?.title;
    if (typeof title === 'string' && title.trim()) return title.trim();
  }
  return 'Untitled artifact';
}

export function createServerContext(options: ServerOptions) {
  const root = path.resolve(options.root);
  const viewerDir = path.resolve(options.viewerDir);
  const runtimeDir = options.runtimeDir ? path.resolve(options.runtimeDir) : null;
  const stateDir = path.join(root, '.state');
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(stateDir, '.gitignore'), '*\n');
  if (options.configFile) ensureConfig(options.configFile);

  const portFile = path.join(stateDir, '.last-port');
  const tokenFile = path.join(stateDir, '.last-token');
  const mount = options.mount;
  const token = mount?.token ?? (readPersisted(tokenFile) || randomToken());
  if (!mount) fs.writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
  const contentToken = randomToken();
  const loopback = isLoopbackHost(options.host);
  const keyOk = (key: string | null) => loopback || (key !== null && safeEqual(key, token));
  const agentOk = (req: http.IncomingMessage, key: string | null) =>
    loopback ? req.headers.origin === undefined : key !== null && safeEqual(key, token);
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
  const changeListeners: ChangeListener[] = [];
  const activityListeners: (() => void)[] = [];
  const startedAt = Date.now();
  const touch = () => {
    ctx.lastActivity = Date.now();
    activityListeners.forEach((listener) => listener());
  };
  const boardOrigins = () => (ctx.boardPort ? originsFor(options.urlHost, ctx.boardPort) : []);

  const relayListeners: ((key: string, message: unknown) => void)[] = [];
  const direct = createDirectRelay({
    version: mount?.version ?? options.relay?.version ?? '',
    handle: (key, body, conn) => handleRelay(ctx, key, body, conn, `http://127.0.0.1:${ctx.port}`),
    onActivity: () => touch(),
    onClose: (conn) => dropRelayViewer(ctx, conn),
  });
  const broadcast = (message: ServerMessage) => {
    const frame = textFrame(JSON.stringify(message));
    for (const socket of clients) socket.write(frame);
    ctx.relay?.emit(message.artifact, message);
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
  const listeningTimer = setInterval(() => boardComments.refreshListening(), 3000);
  listeningTimer.unref();
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
    const title = titleOf(payload);
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
          address: (ref) => artifactPath(root, ref.type, ref.id).split('/').pop()!,
          port: (): number => ctx.port,
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
    comments: documents.comments(id),
  });

  const verdictPreparing = (id: string, op: NonNullable<ReturnType<typeof asBoardHumanOp>>) => {
    if (op.op !== 'create' || !op.anchor.verdict) return false;
    const dir = resolveArtifactDir(root, 'artboard', id);
    if (!dir) return false;
    const payload = readArtifact(dir, { type: 'artboard', id }) as CanvasPayload;
    const members = payload.canvas?.groups?.[op.anchor.group!]?.boards ?? [];
    return members.some((board) => payload.pending.includes(board));
  };

  const isAuthorized = (req: http.IncomingMessage, keyFromQuery: string | null) =>
    loopback ||
    (keyFromQuery !== null && safeEqual(keyFromQuery, token)) ||
    safeEqual(parseCookies(req.headers.cookie)[ctx.cookieName] ?? '', token);

  const artifactMeta = (ref: ArtifactRef, dir: string, contentOrigin = '') => ({
    ...readArtifact(dir, ref, runtimeOf(ref, dir)),
    ...(ref.type !== 'html' ? { agent: names.agent() } : {}),
    ...(ref.type === 'artboard'
      ? {
          comments: boardComments.comments(ref.id),
          staleThreads: boardComments.stale(ref.id),
          listening: boardComments.listening(ref.id),
        }
      : {}),
    contentBase: `${contentOrigin}${contentPrefix}${ref.type}/${ref.id}/`,
  });

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
  const embedTarget = (type: 'artboard' | 'document', id: string): ArtifactRef | null => {
    if (isArtifactLocator(id) && resolveArtifactAddress(root, type, id)) return { type, id };
    const served = artifactKeyOf(servedArtifacts().get(id) ?? '');
    return served?.type === type ? served : null;
  };

  const ctx = {
    options,
    root,
    viewerDir,
    runtimeDir,
    stateDir,
    portFile,
    mount,
    token,
    contentToken,
    contentPrefix,
    loopback,
    policy: accessPolicy({
      host: options.host,
      urlHost: options.urlHost,
      ports: [],
      cloudOrigin: options.cloud?.origin,
    }),
    port: 0,
    boardPort: 0,
    cookieName: '',
    startedAt,
    lastActivity: startedAt,
    relay: null as RelayEmitter | null,
    relayViewers: new Map<string, { key: string; tab: object }>(),
    keyOk,
    agentOk,
    isAuthorized,
    sameOrigin,
    touch,
    boardOrigins,
    runtimeWarnings,
    ranVersions,
    dynamicBlocks,
    runtimeOf,
    clients,
    selections,
    changeListeners,
    activityListeners,
    relayListeners,
    direct,
    broadcast,
    avatars,
    names,
    recordings,
    readArtifact,
    boardComments,
    listeningTimer,
    documents,
    cloud,
    autoPublisher,
    documentState,
    verdictPreparing,
    artifactMeta,
    signatures,
    writeState,
    refreshState,
    servedArtifacts,
    embedTarget,
  };
  return ctx;
}

export type ServerContext = ReturnType<typeof createServerContext>;

export const projectName = (ctx: ServerContext) =>
  path.basename(path.dirname(path.dirname(ctx.root)));
