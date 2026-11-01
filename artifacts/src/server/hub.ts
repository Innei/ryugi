import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Duplex } from 'node:stream';

import type { HubArtifact, HubArtifactList, HubProjectStatus, HubStatus } from '../shared/hub';
import type { ArtifactType } from '../shared/types';
import { accessPolicy, hostAllowed, isLoopbackHost, originAllowed } from './access';
import { mountArtifactsProject, type MountedProject, type ServerOptions } from './app';
import { artifactPath } from './artifact-address';
import { createArtifactIndex } from './artifact-index';
import { listArtifacts } from './artifacts';
import { routeBoardRequest } from './board-port';
import { readConfig } from './config';
import { readArtifactSource, titleOf } from './context';
import { readCredentials } from './credentials';
import { hostIdFor } from './host-id';
import { latestMtime } from './html';
import { safeEqual, send, sendJson, urlHostForHttp } from './http';
import {
  artifactsRootOf,
  isDormant,
  type MachinePaths,
  type ProjectEntry,
  pruneProjects,
  readProjects,
  registerProject,
  removeProject,
} from './machine';
import { listenFirst } from './ports';
import { openReady } from './ready';
import { createRelayClient } from './relay';
import { writeJsonAtomic } from './state';

export interface HubOptions {
  boardPorts: number[];
  cloud?: ServerOptions['cloud'];
  control?: { relaunch: (upgrade: boolean) => boolean; stop: () => void };
  debounceMs?: number;
  fetch?: typeof fetch;
  host: string;
  latest?: () => string | null;
  open?: (link: string, local: string, openCmd?: string) => Promise<void>;
  paths: MachinePaths;
  ports: number[];
  relay?: ServerOptions['relay'];
  runtimeDir?: string;
  token: string;
  urlHost: string;
  version: string;
  viewerDir: string;
}

export interface OpenRequest {
  artifact: string | null;
  openCmd?: string;
}

export interface Hub {
  boardPort: number;
  close: () => Promise<void>;
  linkFor: (project: string, type: ArtifactType, id: string) => Promise<string>;
  mounted: () => MountedProject[];
  mountOf: (project: string) => Promise<MountedProject>;
  port: number;
  projects: () => ProjectEntry[];
  register: (project: string, open?: OpenRequest) => Promise<ProjectEntry>;
  remove: (project: string) => Promise<void>;
  status: () => HubStatus;
  token: string;
  url: string;
}

const CONTROL_PATH = /^\/api\/hub\/(?:stop|restart|upgrade|log)$/;
const LOG_TAIL_BYTES = 256 * 1024;
const STATUS_SCAN_MS = 10_000;
const LOG_TAIL_LINES = 500;
const ARTIFACT_IN_PATH = /(?:^|\/)(artboard|document|html)\/([\w-]+)/;
const CONTENT_PATH = /^\/c\/([^/]+)\//;
const DIRECT_RELAY_PATH = /^\/relay\/a\/([\w-]{1,64})$/;
const PROJECT_HEADER = 'x-ryugi-project';
const MAX_BODY = 64 * 1024;
const ARTIFACT_KEY = /^(?:artboard|document|html)\/[a-z0-9][a-z0-9-]*$/;
const SEP = '\n';

const realDir = (dir: string) => {
  try {
    return fs.realpathSync(path.resolve(dir));
  } catch {
    return null;
  }
};

function readBody(req: http.IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('body is not JSON'));
      }
    });
    req.on('error', reject);
  });
}

export async function startHub(options: HubOptions): Promise<Hub> {
  const loopback = isLoopbackHost(options.host);
  const projectsFile = options.paths.projects;
  pruneProjects(projectsFile);

  const ordered = () => readProjects(projectsFile).sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  const registered = (dir: string) => ordered().some((entry) => entry.dir === dir);
  const index = createArtifactIndex(() => ordered().map((entry) => entry.dir), {
    rescanAfterMs: 0,
  });

  const front = http.createServer();
  const board = http.createServer();
  const port = await listenFirst(front, options.host, options.ports);
  const boardPort = loopback ? await listenFirst(board, options.host, options.boardPorts) : 0;
  const policy = accessPolicy({
    host: options.host,
    urlHost: options.urlHost,
    ports: boardPort ? [port, boardPort] : [port],
    cloudOrigin: options.cloud?.origin,
  });

  const mounts = new Map<string, Promise<MountedProject>>();
  const ready = new Map<string, MountedProject>();
  let closing = false;
  const mountOf = (project: string) => {
    if (closing) return Promise.reject(new Error('Artifacts server is stopping'));
    let pending = mounts.get(project);
    if (!pending) {
      pending = mountArtifactsProject({
        root: artifactsRootOf(project),
        viewerDir: options.viewerDir,
        runtimeDir: options.runtimeDir,
        host: options.host,
        urlHost: options.urlHost,
        configFile: path.join(project, '.ryugi', 'config.json'),
        cloud: options.cloud,
        fetch: options.fetch,
        debounceMs: options.debounceMs,
        mount: { port, boardPort, token: options.token, version: options.version },
      }).then((mounted) => {
        ready.set(project, mounted);
        mounted.onRelayEvent((key, message) => relay?.emit(`${project}${SEP}${key}`, message));
        return mounted;
      });
      pending.catch(() => mounts.delete(project));
      mounts.set(project, pending);
    }
    return pending;
  };

  const configFileOf = (project: string) => path.join(project, '.ryugi', 'config.json');
  const servedBy = (project: string) => {
    const mounted = ready.get(project);
    if (mounted) return mounted.served();
    const served = new Map<string, string>();
    for (const [key, entry] of Object.entries(readConfig(configFileOf(project)).config.artifacts))
      if (entry.cloud) served.set(entry.cloud.id, key);
    return served;
  };
  const servedAll = () => {
    const all = new Map<string, string>();
    for (const entry of ordered())
      for (const [cloudId, key] of servedBy(entry.dir))
        if (!all.has(cloudId)) all.set(cloudId, `${entry.dir}${SEP}${key}`);
    return all;
  };
  const split = (composite: string) => {
    const at = composite.lastIndexOf(SEP);
    return { project: composite.slice(0, at), key: composite.slice(at + 1) };
  };
  const relay =
    options.relay && options.cloud
      ? createRelayClient({
          ...options.relay,
          token: () =>
            readCredentials(options.cloud!.credentialsFile, options.cloud!.origin)?.token ?? null,
          served: servedAll,
          local: () => ({
            hostId: hostIdFor(options.cloud!.credentialsFile),
            port,
            ...(loopback ? { embed: true, embedDocument: true } : { key: options.token }),
          }),
          handle: async (composite, body, conn) => {
            const { project, key } = split(composite);
            return (await mountOf(project)).handleRelay(key, body, conn);
          },
          onActivity: () => {},
          onWatch: (keys) => {
            const byProject = new Map<string, Set<string>>();
            for (const composite of keys) {
              const { project, key } = split(composite);
              byProject.set(project, (byProject.get(project) ?? new Set()).add(key));
            }
            for (const [project, mounted] of ready)
              mounted.relayWatch(byProject.get(project) ?? new Set());
          },
        })
      : null;

  const origin = `http://${urlHostForHttp(options.urlHost)}:${port}`;
  const url = loopback ? `${origin}/` : `${origin}/?key=${options.token}`;
  const infoFileOf = (project: string) =>
    path.join(artifactsRootOf(project), '.state', 'server-info');
  const writeCompatInfo = (project: string) => {
    try {
      fs.mkdirSync(path.dirname(infoFileOf(project)), { recursive: true, mode: 0o700 });
      writeJsonAtomic(infoFileOf(project), {
        type: 'server-started',
        url,
        port,
        boardPort,
        root: artifactsRootOf(project),
      });
    } catch {}
  };
  const startedAt = Date.now();
  let lastActivity = startedAt;

  const projectStatuses = (): HubProjectStatus[] => {
    const counts = new Map<string, number>();
    for (const entry of index.list(STATUS_SCAN_MS))
      counts.set(entry.project, (counts.get(entry.project) ?? 0) + 1);
    return ordered().map((entry) => ({
      dir: entry.dir,
      name: path.basename(entry.dir),
      lastUsedAt: entry.lastUsedAt,
      dormant: isDormant(entry),
      artifacts: counts.get(entry.dir) ?? 0,
    }));
  };

  const artifactList = (): HubArtifactList => {
    const artifacts: HubArtifact[] = [];
    const warnings: string[] = [];
    for (const entry of ordered()) {
      const root = artifactsRootOf(entry.dir);
      const listed = listArtifacts(root);
      for (const warning of listed.warnings)
        warnings.push(`${path.basename(entry.dir)}: ${warning}`);
      for (const artifact of listed.artifacts) {
        try {
          artifacts.push({
            project: entry.dir,
            type: artifact.type,
            id: artifact.id,
            url: artifactPath(root, artifact.type, artifact.id),
            title: titleOf(readArtifactSource(artifact.dir, artifact)),
            updatedAt: latestMtime(artifact.dir),
          });
        } catch {}
      }
    }
    artifacts.sort((a, b) => b.updatedAt - a.updatedAt);
    return { projects: projectStatuses(), artifacts, warnings };
  };

  const status = (): HubStatus => {
    const relayState = relay?.state();
    const local = [...ready.values()].reduce((sum, mounted) => sum + mounted.liveClients(), 0);
    return {
      pid: process.pid,
      version: options.version,
      latest: options.latest?.() ?? null,
      startedAt,
      lastActivity,
      clients: local,
      port,
      boardPort,
      url,
      relay: { connected: relayState?.connected ?? false, announced: relayState?.announced ?? 0 },
      live: { local, relay: relayState?.watched ?? 0 },
      projects: projectStatuses(),
    };
  };

  const keyOk = (url: URL) => {
    const key = url.searchParams.get('key');
    return loopback || (key !== null && safeEqual(key, options.token));
  };
  const authorized = (req: http.IncomingMessage, url: URL) =>
    keyOk(url) ||
    (req.headers.cookie ?? '')
      .split(';')
      .some((part) => safeEqual(part.trim(), `ryugi_artifacts_${port}=${options.token}`));
  const fromAgent = (req: http.IncomingMessage, url: URL) =>
    req.headers.origin === undefined && keyOk(url);

  const headerProject = (req: http.IncomingMessage, url: URL) => {
    const value = req.headers[PROJECT_HEADER];
    if (typeof value !== 'string' || !fromAgent(req, url)) return null;
    const decoded = decode(value);
    const dir = decoded === null ? null : realDir(decoded);
    return dir && registered(dir) ? dir : null;
  };

  const publishedIn = (project: string, cloudId: string) => {
    try {
      const { artifacts } = readConfig(path.join(project, '.ryugi', 'config.json')).config;
      return Object.values(artifacts).some((entry) => entry.cloud?.id === cloudId);
    } catch {
      return false;
    }
  };

  const byCloudId = (cloudId: string) => {
    for (const [project, mounted] of ready) if (mounted.served().has(cloudId)) return project;
    return ordered().find((entry) => publishedIn(entry.dir, cloudId))?.dir ?? null;
  };

  const projectForPath = (pathname: string): string | null => {
    const content = CONTENT_PATH.exec(pathname);
    if (content) {
      for (const [project, mounted] of ready)
        if (mounted.contentToken === content[1]) return project;
      return null;
    }
    const direct = DIRECT_RELAY_PATH.exec(pathname);
    if (direct) return byCloudId(direct[1]!);
    const artifact = ARTIFACT_IN_PATH.exec(pathname);
    if (artifact) {
      const found = index.find(artifact[1] as ArtifactType, artifact[2]!);
      return found?.project ?? byCloudId(artifact[2]!);
    }
    return null;
  };

  const refererProject = (req: http.IncomingMessage) => {
    try {
      const referer = new URL(req.headers.referer ?? '');
      if (referer.host !== req.headers.host) return null;
      const pathname = decode(referer.pathname);
      return pathname === null ? null : projectForPath(pathname);
    } catch {
      return null;
    }
  };

  const decode = (pathname: string) => {
    try {
      return decodeURIComponent(pathname);
    } catch {
      return null;
    }
  };

  const route = async (req: http.IncomingMessage, url: URL, pathname: string) => {
    const project =
      headerProject(req, url) ??
      projectForPath(pathname) ??
      refererProject(req) ??
      ordered()[0]?.dir ??
      null;
    return project ? mountOf(project) : null;
  };

  const openWhenReady = (mounted: MountedProject, request: OpenRequest) => {
    const opener = options.open;
    const { artifact, openCmd } = request;
    if (!opener || !loopback) return;
    let done = false;
    mounted.onArtifactChange((ref, payload) => {
      if (done || (artifact && `${ref.type}/${ref.id}` !== artifact)) return;
      if ('canvas' in payload ? !openReady(payload) : payload.warnings.length > 0) return;
      done = true;
      const local = mounted.linkFor(ref.type, ref.id);
      void mounted
        .cloudLinkFor(ref.type, ref.id)
        .catch(() => null)
        .then((cloudLink) => opener(cloudLink ?? local, local, openCmd))
        .catch(() => undefined);
    });
  };

  const register = async (dir: string, open?: OpenRequest) => {
    const real = realDir(dir);
    if (!real) throw new Error(`Project directory not found: ${dir}`);
    fs.mkdirSync(artifactsRootOf(real), { recursive: true });
    const entry = registerProject(projectsFile, real);
    index.rescan();
    writeCompatInfo(real);
    const mounted = await mountOf(real);
    if (open) openWhenReady(mounted, open);
    relay?.refresh();
    return entry;
  };

  const remove = async (dir: string) => {
    const real = realDir(dir) ?? path.resolve(dir);
    removeProject(projectsFile, real);
    index.rescan();
    fs.rmSync(infoFileOf(real), { force: true });
    const pending = mounts.get(real);
    mounts.delete(real);
    ready.delete(real);
    await (await pending)?.close();
  };

  const logTail = (project: string | null) => {
    try {
      const fd = fs.openSync(options.paths.log, 'r');
      try {
        const size = fs.fstatSync(fd).size;
        const length = Math.min(size, LOG_TAIL_BYTES);
        const buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, size - length);
        const lines = buffer.toString('utf8').split('\n').filter(Boolean);
        if (length < size) lines.shift();
        return lines.filter((line) => !project || line.includes(project)).slice(-LOG_TAIL_LINES);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return [];
    }
  };

  const handleControl = (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => {
    const action = url.pathname.slice('/api/hub/'.length);
    if (action === 'log') {
      if (req.method !== 'GET') send(res, 405, 'Method not allowed');
      else sendJson(res, 200, { lines: logTail(url.searchParams.get('project')) });
      return;
    }
    const control = options.control;
    if (req.method !== 'POST') send(res, 405, 'Method not allowed');
    else if (!control) send(res, 409, 'Not available');
    else if (action === 'stop') {
      sendJson(res, 202, { stopping: true });
      setImmediate(control.stop);
    } else if (action === 'upgrade' && !options.latest?.())
      sendJson(res, 409, { error: 'up to date' });
    else if (control.relaunch(action === 'upgrade')) sendJson(res, 202, { restarting: true });
    else sendJson(res, 409, { error: 'cannot relaunch' });
  };

  const handleHubApi = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
  ): Promise<boolean> => {
    if (url.pathname !== '/api/hub/projects') return false;
    const fromPage =
      req.method === 'DELETE' &&
      req.headers.origin !== undefined &&
      authorized(req, url) &&
      originAllowed(policy, req.headers.origin);
    if (!fromAgent(req, url) && !fromPage) {
      send(res, 403, 'Forbidden: agent calls need ?key=');
      return true;
    }
    if (req.method === 'GET') {
      sendJson(res, 200, { projects: ordered() });
      return true;
    }
    const body = (await readBody(req)) as { dir?: unknown; open?: unknown; openCmd?: unknown };
    if (typeof body.dir !== 'string') {
      sendJson(res, 400, { error: 'needs {dir}' });
      return true;
    }
    if (req.method === 'POST') {
      const openCmd = typeof body.openCmd === 'string' && body.openCmd ? body.openCmd : undefined;
      const open =
        body.open === true
          ? { artifact: null, openCmd }
          : typeof body.open === 'string' && ARTIFACT_KEY.test(body.open)
            ? { artifact: body.open, openCmd }
            : undefined;
      const entry = await register(body.dir, open);
      sendJson(res, 200, { project: entry.dir, root: artifactsRootOf(entry.dir) });
    } else if (req.method === 'DELETE') {
      await remove(body.dir);
      sendJson(res, 200, { removed: true });
    } else send(res, 405, 'Method not allowed');
    return true;
  };

  front.on('request', (req, res) => {
    void (async () => {
      if (!hostAllowed(policy, req.headers.host)) {
        send(res, 403, 'Forbidden host');
        return;
      }
      const url = new URL(req.url ?? '/', 'http://artifacts.local');
      if (url.pathname === '/api/status') {
        if (!authorized(req, url)) send(res, 403, 'Forbidden: agent calls need ?key=');
        else sendJson(res, 200, status());
        return;
      }
      if (CONTROL_PATH.test(url.pathname)) {
        if (!authorized(req, url) || !originAllowed(policy, req.headers.origin))
          send(res, 403, 'Forbidden');
        else handleControl(req, res, url);
        return;
      }
      if (url.pathname === '/api/hub/artifacts') {
        if (!authorized(req, url) || !originAllowed(policy, req.headers.origin))
          send(res, 403, 'Forbidden');
        else sendJson(res, 200, artifactList());
        return;
      }
      lastActivity = Date.now();
      if (await handleHubApi(req, res, url)) return;
      const pathname = decode(url.pathname);
      if (pathname === null) {
        send(res, 400, 'Bad request');
        return;
      }
      const mounted = await route(req, url, pathname);
      if (!mounted) send(res, 404, 'Not found');
      else mounted.handleRequest(req, res);
    })().catch((err: Error) => {
      if (!res.headersSent) send(res, closing ? 503 : 500, `Artifacts error: ${err.message}`);
    });
  });

  front.on('upgrade', (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://artifacts.local');
      const at = url.pathname === '/ws' ? url.searchParams.get('at') : null;
      const pathname = decode(at ?? url.pathname) ?? '/';
      const mounted = await route(req, url, pathname);
      if (!mounted) socket.destroy();
      else mounted.handleUpgrade(req, socket, head);
    })().catch(() => socket.destroy());
  });

  board.on('request', (req, res) => {
    void (async () => {
      const pathname = decode(new URL(req.url ?? '/', 'http://board.local').pathname) ?? '/';
      const boardRoute = routeBoardRequest(req, pathname);
      const project =
        boardRoute.kind === 'board'
          ? (index.find('artboard', boardRoute.address)?.project ?? null)
          : (ordered()[0]?.dir ?? null);
      const mounted = project ? await mountOf(project) : null;
      if (!mounted) send(res, 404, 'Not found');
      else mounted.handleBoardRequest(req, res);
    })().catch((err: Error) => {
      if (!res.headersSent) send(res, 500, err.message);
    });
  });

  for (const entry of ordered()) {
    writeCompatInfo(entry.dir);
    if (!isDormant(entry)) void mountOf(entry.dir).catch(() => undefined);
  }

  return {
    port,
    boardPort,
    token: options.token,
    url,
    status,
    projects: ordered,
    mounted: () => [...ready.values()],
    mountOf,
    register,
    remove,
    linkFor: async (project, type, id) => (await mountOf(project)).linkFor(type, id),
    close: async () => {
      closing = true;
      const stopped = [front, board].map(
        (server) => new Promise((resolve) => server.close(resolve)),
      );
      relay?.close();
      const all = [...mounts.values()];
      mounts.clear();
      ready.clear();
      await Promise.all(all.map(async (pending) => (await pending.catch(() => null))?.close()));
      for (const entry of ordered()) fs.rmSync(infoFileOf(entry.dir), { force: true });
      for (const server of [front, board]) server.closeAllConnections();
      await Promise.all(stopped);
    },
  };
}
