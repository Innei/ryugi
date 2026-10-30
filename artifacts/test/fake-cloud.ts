import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { type ArtifactsServer, startArtifactsServer } from '../src/server/app';
import { writeCredentials } from '../src/server/credentials';
import { listen } from '../src/server/http';
import { tempRoot } from './helpers';

export interface Recorded {
  auth: string | undefined;
  body?: string;
  json?: any;
  method: string;
  path: string;
}

export interface StoredArtifact {
  blobs: Map<string, string>;
  versions: {
    title: string;
    payload: Record<string, any>;
    files: { path: string; hash: string }[];
  }[];
  visibility: string;
}

export interface FakeCloud {
  close: () => Promise<void>;
  gate: (req: Recorded) => Promise<void> | undefined;
  origin: string;
  requests: Recorded[];
  respond: (req: Recorded) => { status: number; body?: unknown } | undefined;
  store: Map<string, StoredArtifact>;
}

let running: ArtifactsServer[] = [];
let clouds: FakeCloud[] = [];

export async function closeAll() {
  await Promise.all(running.map((s) => s.close()));
  await Promise.all(clouds.map((c) => c.close()));
  running = [];
  clouds = [];
}

export const sha256 = (data: Buffer | string) =>
  crypto.createHash('sha256').update(data).digest('hex');

export async function fakeCloud(): Promise<FakeCloud> {
  let next = 0;
  const cloud: FakeCloud = {
    origin: '',
    requests: [],
    store: new Map(),
    respond: () => undefined,
    gate: () => undefined,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
  const server = http.createServer((req, res) => {
    handle(req, res).catch((err: Error) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `fake cloud: ${err.message}` }));
    });
  });
  const handle = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);
    const recorded: Recorded = {
      method: req.method ?? '',
      path: req.url ?? '',
      auth: req.headers.authorization,
    };
    if ((req.headers['content-type'] ?? '').startsWith('application/json'))
      recorded.json = JSON.parse(body.toString());
    else if (body.length > 0) recorded.body = body.toString();
    cloud.requests.push(recorded);
    await cloud.gate(recorded);
    const custom = cloud.respond(recorded);
    const reply = (status: number, value?: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(value === undefined ? '' : JSON.stringify(value));
    };
    if (custom) return reply(custom.status, custom.body);
    const artifactJson = (id: string) => {
      const stored = cloud.store.get(id)!;
      const version = stored.versions.length;
      return {
        id,
        url: `${cloud.origin}/a/${id}`,
        visibility: stored.visibility,
        version: version || null,
        updatedAt: `2026-10-20T${String(7 + Math.max(version, 1)).padStart(2, '0')}:00:00.000Z`,
      };
    };
    if (req.method === 'POST' && req.url === '/api/artifacts') {
      const id = `cloud${++next}`;
      cloud.store.set(id, { visibility: recorded.json.visibility, blobs: new Map(), versions: [] });
      return reply(200, artifactJson(id));
    }
    const blob = /^\/api\/artifacts\/([^/]+)\/blobs\/([0-9a-f]{64})$/.exec(req.url ?? '');
    if (blob && req.method === 'PUT') {
      const stored = cloud.store.get(blob[1]!);
      if (!stored) return reply(404, { error: 'artifact not found' });
      if (sha256(body) !== blob[2])
        return reply(400, { error: 'the body does not match its hash' });
      stored.blobs.set(blob[2]!, body.toString());
      return reply(204);
    }
    const versions = /^\/api\/artifacts\/([^/]+)\/versions$/.exec(req.url ?? '');
    if (versions && req.method === 'POST') {
      const stored = cloud.store.get(versions[1]!);
      if (!stored) return reply(404, { error: 'artifact not found' });
      const { title, payload, files, visibility } = recorded.json as {
        title: string;
        payload: Record<string, any>;
        files: { path: string; hash: string }[];
        visibility?: string;
      };
      const missing = [...new Set(files.map((f) => f.hash))].filter(
        (hash) => !stored.blobs.has(hash),
      );
      if (missing.length > 0) return reply(409, { error: 'missing files', missing });
      stored.versions.push({ title, payload, files });
      if (visibility) stored.visibility = visibility;
      return reply(200, artifactJson(versions[1]!));
    }
    const match = /^\/api\/artifacts\/([^/]+)$/.exec(req.url ?? '');
    if (match && req.method === 'PATCH') {
      const stored = cloud.store.get(match[1]!);
      if (!stored) return reply(404, { error: 'artifact not found' });
      stored.visibility = recorded.json.visibility;
      return reply(200, artifactJson(match[1]!));
    }
    if (match && req.method === 'DELETE') {
      cloud.store.delete(match[1]!);
      return reply(204);
    }
    if (req.method === 'GET' && req.url === '/api/artifacts') return reply(200, { artifacts: [] });
    if (req.method === 'POST' && req.url === '/auth/cli/token')
      return reply(200, { token: 'new-token', login: 'innei' });
    if (req.method === 'POST' && req.url === '/api/logout') return reply(204);
    reply(404, { error: 'not found' });
  };
  const port = await listen(server, '127.0.0.1', 0);
  cloud.origin = `http://127.0.0.1:${port}`;
  clouds.push(cloud);
  return cloud;
}

export function latest(cloud: FakeCloud, id = 'cloud1') {
  const stored = cloud.store.get(id)!;
  const version = stored.versions.at(-1)!;
  return {
    title: version.title,
    payload: version.payload,
    files: Object.fromEntries(version.files.map((f) => [f.path, stored.blobs.get(f.hash)!])),
  };
}

export const requestLines = (cloud: FakeCloud, from = 0) =>
  cloud.requests.slice(from).map((r) => `${r.method} ${r.path.replace(/[0-9a-f]{64}/, '<hash>')}`);

export async function start({
  signedIn = true,
  writeDelayMs,
  credentialsFile: sharedCredentials,
}: { signedIn?: boolean; writeDelayMs?: number; credentialsFile?: string } = {}) {
  const temp = tempRoot();
  const ryugiDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-dir-'));
  const configFile = path.join(ryugiDir, 'config.json');
  const credentialsFile =
    sharedCredentials ??
    path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-home-')), 'credentials.json');
  const cloud = await fakeCloud();
  if (signedIn)
    writeCredentials(credentialsFile, { origin: cloud.origin, token: 'tok', login: 'innei' });
  const server = await startArtifactsServer({
    root: temp.root,
    viewerDir: temp.viewer,
    runtimeDir: temp.runtime,
    host: '127.0.0.1',
    urlHost: 'localhost',
    configFile,
    cloud: { origin: cloud.origin, credentialsFile },
    ...(writeDelayMs === undefined ? {} : { documentTiming: { stepDelayMs: 0, writeDelayMs } }),
  });
  running.push(server);
  return { server, root: temp.root, configFile, ryugiDir, credentialsFile, cloud };
}

export async function call(
  server: ArtifactsServer,
  method: string,
  rel: string,
  body?: unknown,
  { key = true } = {},
) {
  const sep = rel.includes('?') ? '&' : '?';
  const res = await fetch(
    `http://127.0.0.1:${server.port}${rel}${key ? `${sep}key=${server.token}` : ''}`,
    {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    },
  );
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    json = { text };
  }
  return { status: res.status, json };
}

export const config = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
