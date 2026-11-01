import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Duplex } from 'node:stream';

import type { ArtifactType } from '../shared/types';
import { accessPolicy, hostAllowed, isLoopbackHost } from './access';
import { mountArtifactsProject, type MountedProject, type ServerOptions } from './app';
import { createArtifactIndex } from './artifact-index';
import { routeBoardRequest } from './board-port';
import { safeEqual, send, sendJson, urlHostForHttp } from './http';
import {
  artifactsRootOf,
  type MachinePaths,
  type ProjectEntry,
  pruneProjects,
  readProjects,
  registerProject,
  removeProject,
} from './machine';
import { listenFirst } from './ports';

export interface HubOptions {
  boardPorts: number[];
  cloud?: ServerOptions['cloud'];
  debounceMs?: number;
  fetch?: typeof fetch;
  host: string;
  paths: MachinePaths;
  ports: number[];
  runtimeDir?: string;
  token: string;
  urlHost: string;
  version: string;
  viewerDir: string;
}

export interface Hub {
  boardPort: number;
  close: () => Promise<void>;
  linkFor: (project: string, type: ArtifactType, id: string) => Promise<string>;
  mounted: () => MountedProject[];
  mountOf: (project: string) => Promise<MountedProject>;
  port: number;
  projects: () => ProjectEntry[];
  register: (project: string) => Promise<ProjectEntry>;
  remove: (project: string) => Promise<void>;
  token: string;
  url: string;
}

const ARTIFACT_IN_PATH = /(?:^|\/)(artboard|document|html)\/([\w-]+)/;
const CONTENT_PATH = /^\/c\/([^/]+)\//;
const DIRECT_RELAY_PATH = /^\/relay\/a\/([\w-]{1,64})$/;
const PROJECT_HEADER = 'x-ryugi-project';
const MAX_BODY = 64 * 1024;

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
  const mountOf = (project: string) => {
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
        return mounted;
      });
      pending.catch(() => mounts.delete(project));
      mounts.set(project, pending);
    }
    return pending;
  };

  const keyOk = (url: URL) => {
    const key = url.searchParams.get('key');
    return loopback || (key !== null && safeEqual(key, options.token));
  };
  const fromAgent = (req: http.IncomingMessage, url: URL) =>
    req.headers.origin === undefined && keyOk(url);

  const headerProject = (req: http.IncomingMessage, url: URL) => {
    const value = req.headers[PROJECT_HEADER];
    if (typeof value !== 'string' || !fromAgent(req, url)) return null;
    const dir = realDir(value);
    return dir && registered(dir) ? dir : null;
  };

  const byCloudId = (cloudId: string) => {
    for (const [project, mounted] of ready) if (mounted.served().has(cloudId)) return project;
    return null;
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
    return ordered()[0]?.dir ?? null;
  };

  const decode = (pathname: string) => {
    try {
      return decodeURIComponent(pathname);
    } catch {
      return null;
    }
  };

  const route = async (req: http.IncomingMessage, url: URL, pathname: string) => {
    const project = headerProject(req, url) ?? projectForPath(pathname);
    return project ? mountOf(project) : null;
  };

  const register = async (dir: string) => {
    const real = realDir(dir);
    if (!real) throw new Error(`Project directory not found: ${dir}`);
    fs.mkdirSync(artifactsRootOf(real), { recursive: true });
    const entry = registerProject(projectsFile, real);
    index.rescan();
    await mountOf(real);
    return entry;
  };

  const remove = async (dir: string) => {
    const real = realDir(dir) ?? path.resolve(dir);
    removeProject(projectsFile, real);
    index.rescan();
    const pending = mounts.get(real);
    mounts.delete(real);
    ready.delete(real);
    await (await pending)?.close();
  };

  const handleHubApi = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
  ): Promise<boolean> => {
    if (url.pathname !== '/api/hub/projects') return false;
    if (!fromAgent(req, url)) {
      send(res, 403, 'Forbidden: agent calls need ?key=');
      return true;
    }
    if (req.method === 'GET') {
      sendJson(res, 200, { projects: ordered() });
      return true;
    }
    const body = (await readBody(req)) as { dir?: unknown };
    if (typeof body.dir !== 'string') {
      sendJson(res, 400, { error: 'needs {dir}' });
      return true;
    }
    if (req.method === 'POST') {
      const entry = await register(body.dir);
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
      if (!res.headersSent) send(res, 500, `Artifacts error: ${err.message}`);
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

  const origin = `http://${urlHostForHttp(options.urlHost)}:${port}`;
  return {
    port,
    boardPort,
    token: options.token,
    url: loopback ? `${origin}/` : `${origin}/?key=${options.token}`,
    projects: ordered,
    mounted: () => [...ready.values()],
    mountOf,
    register,
    remove,
    linkFor: async (project, type, id) => (await mountOf(project)).linkFor(type, id),
    close: async () => {
      const all = [...mounts.values()];
      mounts.clear();
      ready.clear();
      await Promise.all(all.map(async (pending) => (await pending.catch(() => null))?.close()));
      for (const server of [front, board]) {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    },
  };
}
