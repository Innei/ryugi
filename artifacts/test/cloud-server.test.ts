import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createLoroBinding } from '@haklex/rich-collab-loro';
import { $getRoot, $isElementNode, $isTextNode, type LexicalNode, type TextNode } from 'lexical';
import { LoroDoc } from 'loro-crdt';
import { afterEach, describe, expect, test } from 'vitest';
import { startArtifactsServer, type ArtifactsServer } from '../src/server/app';
import { writeCredentials } from '../src/server/credentials';
import { createDocumentHeadlessEditor } from '../src/server/document-headless';
import { listen } from '../src/server/http';
import { tempRoot, writeArtboard, writeDocument, writeHtml } from './helpers';

interface Recorded {
  method: string;
  path: string;
  auth: string | undefined;
  meta?: Record<string, unknown>;
  payload?: Record<string, any>;
  files?: Record<string, string>;
  json?: unknown;
}

interface FakeCloud {
  origin: string;
  requests: Recorded[];
  respond: (req: Recorded) => { status: number; body?: unknown } | undefined;
  close(): Promise<void>;
}

let running: ArtifactsServer[] = [];
let clouds: FakeCloud[] = [];

afterEach(async () => {
  await Promise.all(running.map((s) => s.close()));
  await Promise.all(clouds.map((c) => c.close()));
  running = [];
  clouds = [];
});

async function fakeCloud(): Promise<FakeCloud> {
  let next = 0;
  const cloud: FakeCloud = {
    origin: '',
    requests: [],
    respond: () => undefined,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);
    const recorded: Recorded = { method: req.method ?? '', path: req.url ?? '', auth: req.headers.authorization };
    const type = req.headers['content-type'] ?? '';
    if (type.startsWith('multipart/form-data')) {
      const form = await new Response(body, { headers: { 'content-type': type } }).formData();
      recorded.meta = JSON.parse(String(form.get('meta')));
      recorded.payload = JSON.parse(String(form.get('payload')));
      recorded.files = {};
      for (const [name, value] of form.entries()) {
        if (name.startsWith('file:')) recorded.files[name.slice(5)] = await (value as Blob).text();
      }
    } else if (body.length > 0) {
      recorded.json = JSON.parse(body.toString());
    }
    cloud.requests.push(recorded);
    const custom = cloud.respond(recorded);
    const reply = (status: number, value?: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(value === undefined ? '' : JSON.stringify(value));
    };
    if (custom) return reply(custom.status, custom.body);
    const visibility = (recorded.meta?.visibility ?? (recorded.json as { visibility?: string } | undefined)?.visibility ?? 'private') as string;
    if (req.method === 'POST' && req.url === '/api/artifacts') {
      const id = `cloud${++next}`;
      return reply(200, { id, url: `${cloud.origin}/a/${id}`, visibility, updatedAt: '2026-10-20T08:00:00.000Z' });
    }
    const match = /^\/api\/artifacts\/([^/]+)$/.exec(req.url ?? '');
    if (match && (req.method === 'PUT' || req.method === 'PATCH')) {
      return reply(200, { id: match[1], url: `${cloud.origin}/a/${match[1]}`, visibility, updatedAt: '2026-10-20T09:00:00.000Z' });
    }
    if (match && req.method === 'DELETE') return reply(204);
    if (req.method === 'GET' && req.url === '/api/artifacts') return reply(200, { artifacts: [] });
    if (req.method === 'POST' && req.url === '/auth/cli/token') return reply(200, { token: 'new-token', login: 'innei' });
    if (req.method === 'POST' && req.url === '/api/logout') return reply(204);
    reply(404, { error: 'not found' });
  });
  const port = await listen(server, '127.0.0.1', 0);
  cloud.origin = `http://127.0.0.1:${port}`;
  clouds.push(cloud);
  return cloud;
}

async function start({ signedIn = true, writeDelayMs }: { signedIn?: boolean; writeDelayMs?: number } = {}) {
  const temp = tempRoot();
  const ryugiDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-dir-'));
  const configFile = path.join(ryugiDir, 'config.json');
  const credentialsFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-home-')), 'credentials.json');
  const cloud = await fakeCloud();
  if (signedIn) writeCredentials(credentialsFile, { origin: cloud.origin, token: 'tok', login: 'innei' });
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

async function call(server: ArtifactsServer, method: string, rel: string, body?: unknown, { key = true } = {}) {
  const sep = rel.includes('?') ? '&' : '?';
  const res = await fetch(`http://127.0.0.1:${server.port}${rel}${key ? `${sep}key=${server.token}` : ''}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { text };
  }
  return { status: res.status, json };
}

const config = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));

function $findText(node: LexicalNode, text: string): TextNode | null {
  if ($isTextNode(node) && node.getTextContent() === text) return node;
  if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      const found = $findText(child, text);
      if (found) return found;
    }
  }
  return null;
}

describe('project config', () => {
  test('starting the server creates config.json and hides it from git', async () => {
    const { configFile, ryugiDir } = await start();
    expect(config(configFile)).toEqual({ version: 1, artifacts: {} });
    expect(fs.readFileSync(path.join(ryugiDir, '.gitignore'), 'utf8')).toBe('config.json\n');
  });
});

describe('cloud sign-in', () => {
  test('status reports signed out when there are no credentials', async () => {
    const { server, cloud } = await start({ signedIn: false });
    const { json } = await call(server, 'GET', '/api/cloud/status');
    expect(json).toMatchObject({ signedIn: false, origin: cloud.origin, artifacts: {} });
  });

  test('login hands out a cloud link whose callback swaps a one-time code for the token', async () => {
    const { server, cloud, credentialsFile } = await start({ signedIn: false });
    const { json } = await call(server, 'POST', '/api/cloud/login');
    const link = new URL(String(json.url));
    expect(`${link.origin}${link.pathname}`).toBe(`${cloud.origin}/auth/cli`);
    expect(link.searchParams.get('port')).toBe(String(server.port));
    const state = link.searchParams.get('state')!;
    const callback = await call(server, 'GET', `/api/cloud/callback?state=${state}&code=one-time`, undefined, { key: false });
    expect(callback.status).toBe(200);
    const swap = cloud.requests.find((r) => r.path === '/auth/cli/token')!.json as { code: string; verifier: string };
    expect(swap.code).toBe('one-time');
    expect(crypto.createHash('sha256').update(swap.verifier).digest('base64url')).toBe(link.searchParams.get('challenge'));
    expect(JSON.parse(fs.readFileSync(credentialsFile, 'utf8'))).toEqual({ origin: cloud.origin, token: 'new-token', login: 'innei' });
    expect((await call(server, 'GET', '/api/cloud/status')).json).toMatchObject({ signedIn: true, login: 'innei' });
  });

  test('a callback with an unknown or reused state is refused', async () => {
    const { server, credentialsFile } = await start({ signedIn: false });
    expect((await call(server, 'GET', '/api/cloud/callback?state=forged&code=c', undefined, { key: false })).status).toBe(400);
    const state = new URL(String((await call(server, 'POST', '/api/cloud/login')).json.url)).searchParams.get('state');
    await call(server, 'GET', `/api/cloud/callback?state=${state}&code=c1`, undefined, { key: false });
    fs.rmSync(credentialsFile);
    expect((await call(server, 'GET', `/api/cloud/callback?state=${state}&code=c2`, undefined, { key: false })).status).toBe(400);
    expect(fs.existsSync(credentialsFile)).toBe(false);
  });

  test('a code the cloud refuses does not sign in', async () => {
    const { server, cloud, credentialsFile } = await start({ signedIn: false });
    cloud.respond = (r) => (r.path === '/auth/cli/token' ? { status: 400, body: { error: 'this sign-in code is invalid or already used' } } : undefined);
    const state = new URL(String((await call(server, 'POST', '/api/cloud/login')).json.url)).searchParams.get('state');
    expect((await call(server, 'GET', `/api/cloud/callback?state=${state}&code=bad`, undefined, { key: false })).status).toBe(400);
    expect(fs.existsSync(credentialsFile)).toBe(false);
  });

  test('logout revokes the token in the cloud and forgets it', async () => {
    const { server, cloud, credentialsFile } = await start();
    expect((await call(server, 'POST', '/api/cloud/logout')).status).toBe(200);
    expect(cloud.requests).toMatchObject([{ method: 'POST', path: '/api/logout', auth: 'Bearer tok' }]);
    expect(fs.existsSync(credentialsFile)).toBe(false);
  });

  test('a wrong key does not let a cross-origin page use the cookie to change cloud state', async () => {
    const { server, root, configFile } = await start();
    writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
    const res = await fetch(`http://127.0.0.1:${server.port}/api/cloud/visibility/html/a?key=wrong`, {
      method: 'POST',
      headers: { Cookie: `ryugi_artifacts_${server.port}=${server.token}`, Origin: 'http://localhost:3000', 'Content-Type': 'text/plain' },
      body: JSON.stringify({ visibility: 'public' }),
    });
    expect(res.status).toBe(403);
    expect(config(configFile).artifacts['html/a']).toBeUndefined();
  });

  test('cloud routes other than the callback still need the session key', async () => {
    const { server } = await start();
    expect((await call(server, 'GET', '/api/cloud/status', undefined, { key: false })).status).toBe(403);
    expect((await call(server, 'POST', '/api/cloud/publish/html/a', undefined, { key: false })).status).toBe(403);
  });
});

describe('publishing', () => {
  test('publishing while signed out returns 401 with a login link', async () => {
    const { server, root, cloud } = await start({ signedIn: false });
    writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
    const { status, json } = await call(server, 'POST', '/api/cloud/publish/html/a');
    expect(status).toBe(401);
    expect(String(json.loginUrl)).toContain(`${cloud.origin}/auth/cli`);
    expect(cloud.requests).toEqual([]);
  });

  test('first publish uploads the files privately and records the link', async () => {
    const { server, root, cloud, configFile } = await start();
    writeHtml(root, 'a', { 'index.html': '<title>Arrow</title>', 'img/x.svg': '<svg/>', '.DS_Store': 'x' });
    const { status, json } = await call(server, 'POST', '/api/cloud/publish/html/a');
    expect(status).toBe(200);
    expect(json).toMatchObject({ id: 'cloud1', url: `${cloud.origin}/a/cloud1`, visibility: 'private' });
    expect(cloud.requests[0]).toMatchObject({
      method: 'POST',
      path: '/api/artifacts',
      auth: 'Bearer tok',
      meta: { type: 'html', title: 'Arrow', visibility: 'private' },
    });
    expect(Object.keys(cloud.requests[0]!.files!).sort()).toEqual(['img/x.svg', 'index.html']);
    expect(cloud.requests[0]!.files!['img/x.svg']).toBe('<svg/>');
    expect(config(configFile).artifacts['html/a']).toEqual({
      visibility: 'private',
      cloud: { id: 'cloud1', url: `${cloud.origin}/a/cloud1`, publishedAt: '2026-10-20T08:00:00.000Z', visibility: 'private' },
    });
  });

  test('an html page is uploaded with the viewer runtime pointing at the cloud copy of it', async () => {
    const { server, root, cloud } = await start();
    writeHtml(root, 'a', { 'index.html': '<!doctype html><html><head><title>A</title></head><body><ryugi-slider></ryugi-slider></body></html>' });
    await call(server, 'POST', '/api/cloud/publish/html/a');
    const page = cloud.requests[0]!.files!['index.html']!;
    expect(page).toContain('<script defer src="/_ryugi/runtime/ryugi-ui.js"></script>');
    expect(page).toContain('ryugi:error');
    expect(cloud.requests[0]!.payload).toEqual({ title: 'A' });
  });

  test('an artboard is uploaded with the canvas and its computed layout', async () => {
    const { server, root, cloud } = await start();
    const canvas = { version: 1, title: 'Board', pages: [{ id: 'p', name: 'P' }], boards: { a: { file: 'pages/p/a.html', page: 'p', x: 0, y: 0, w: 640, h: 400 } } };
    writeArtboard(root, 'b', canvas, { 'pages/p/a.html': '<p>a</p>' });
    await call(server, 'POST', '/api/cloud/publish/artboard/b');
    const payload = cloud.requests[0]!.payload!;
    expect(payload.canvas).toEqual(canvas);
    expect(payload.layout.pages.p).toBeDefined();
    expect(Object.keys(payload.versions)).toEqual(['pages/p/a.html']);
    expect(cloud.requests[0]!.files!['pages/p/a.html']).toContain('<p>a</p>');
  });

  test('a document is uploaded with its editor state parsed from doc.xml, without comments', async () => {
    const { server, root, cloud } = await start();
    writeDocument(root, 'd', { 'doc.xml': '<doc><h1>Design</h1><p>Hello</p></doc>', 'comments.json': '{"threads":[]}' });
    await call(server, 'POST', '/api/cloud/publish/document/d');
    const { payload, files } = cloud.requests[0]!;
    expect(payload!.title).toBe('Design');
    expect(JSON.stringify(payload!.state.root)).toContain('Hello');
    expect(Object.keys(files!)).toEqual(['doc.xml']);
  });

  test('publishing again replaces the same cloud artifact', async () => {
    const { server, root, cloud, configFile } = await start();
    writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
    await call(server, 'POST', '/api/cloud/publish/html/a');
    const { json } = await call(server, 'POST', '/api/cloud/publish/html/a');
    expect(cloud.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /api/artifacts', 'PUT /api/artifacts/cloud1']);
    expect(json.url).toBe(`${cloud.origin}/a/cloud1`);
    expect(config(configFile).artifacts['html/a'].cloud.publishedAt).toBe('2026-10-20T09:00:00.000Z');
  });

  test('publishing again after the cloud copy was deleted creates a new link', async () => {
    const { server, root, cloud, configFile } = await start();
    writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
    await call(server, 'POST', '/api/cloud/publish/html/a');
    cloud.respond = (r) => (r.method === 'PUT' ? { status: 404, body: { error: 'not found' } } : undefined);
    const { json } = await call(server, 'POST', '/api/cloud/publish/html/a');
    expect(json.id).toBe('cloud2');
    expect(config(configFile).artifacts['html/a'].cloud.id).toBe('cloud2');
  });

  test('the visibility chosen in config is what gets published', async () => {
    const { server, root, cloud, configFile } = await start();
    writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
    fs.writeFileSync(configFile, JSON.stringify({ version: 1, artifacts: { 'html/a': { visibility: 'public' } } }));
    await call(server, 'POST', '/api/cloud/publish/html/a');
    expect(cloud.requests[0]!.meta!.visibility).toBe('public');
  });

  test('a visibility sent with a refused publish leaves the cloud copy as it was', async () => {
    const { server, root, cloud, configFile } = await start();
    writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
    await call(server, 'POST', '/api/cloud/publish/html/a');
    fs.rmSync(path.join(root, 'html', 'a', 'index.html'));
    expect((await call(server, 'POST', '/api/cloud/publish/html/a', { visibility: 'public' })).status).toBe(409);
    expect(cloud.requests.map((r) => r.method)).toEqual(['POST']);
    expect(config(configFile).artifacts['html/a'].cloud.visibility).toBe('private');
  });

  test('a visibility sent with a publish is uploaded with it', async () => {
    const { server, root, cloud, configFile } = await start();
    writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
    const { json } = await call(server, 'POST', '/api/cloud/publish/html/a', { visibility: 'public' });
    expect(json.visibility).toBe('public');
    expect(cloud.requests[0]!.meta!.visibility).toBe('public');
    expect(config(configFile).artifacts['html/a'].cloud.visibility).toBe('public');
  });

  test('an edit made in the viewer but not yet saved is part of the upload', async () => {
    const { server, root, cloud } = await start({ writeDelayMs: 60_000 });
    writeDocument(root, 'd', { 'doc.xml': '<doc><h1>Doc</h1><p>one</p></doc>' });
    const docFile = path.join(root, 'document', 'd', 'doc.xml');
    const state = (await call(server, 'GET', '/api/document/d/state')).json as { snapshot: string };
    const peer = new LoroDoc();
    peer.import(Buffer.from(state.snapshot, 'base64'));
    const editor = createDocumentHeadlessEditor();
    const binding = createLoroBinding(editor, peer);
    const from = peer.oplogVersion();
    editor.update(() => $findText($getRoot(), 'one')!.setTextContent('one, by hand'), { discrete: true });
    const update = await fetch(`http://127.0.0.1:${server.port}/api/document/d/update?key=${server.token}`, {
      method: 'POST',
      headers: { Origin: `http://127.0.0.1:${server.port}` },
      body: Buffer.from(peer.export({ mode: 'update', from })),
    });
    binding.dispose();
    expect(update.status).toBe(204);
    expect(fs.readFileSync(docFile, 'utf8')).not.toContain('one, by hand');
    await call(server, 'POST', '/api/cloud/publish/document/d');
    expect(cloud.requests[0]!.files!['doc.xml']).toContain('one, by hand');
    expect(JSON.stringify(cloud.requests[0]!.payload!.state)).toContain('one, by hand');
  });

  test('an artifact with warnings is not published', async () => {
    const { server, root, cloud } = await start();
    writeHtml(root, 'a', { 'notes.txt': 'no index' });
    const { status, json } = await call(server, 'POST', '/api/cloud/publish/html/a');
    expect(status).toBe(409);
    expect(json.reasons).toEqual(['index.html not found']);
    expect(cloud.requests).toEqual([]);
  });

  test('an unknown artifact is a 404', async () => {
    const { server } = await start();
    expect((await call(server, 'POST', '/api/cloud/publish/html/missing')).status).toBe(404);
  });

  test('a token the cloud rejects asks for a new sign-in', async () => {
    const { server, root, cloud } = await start();
    writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
    cloud.respond = () => ({ status: 401, body: { error: 'bad token' } });
    const { status, json } = await call(server, 'POST', '/api/cloud/publish/html/a');
    expect(status).toBe(401);
    expect(String(json.loginUrl)).toContain('/auth/cli');
  });

  test('a cloud error is passed back with its message', async () => {
    const { server, root, cloud } = await start();
    writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
    cloud.respond = () => ({ status: 403, body: { error: 'limit of 100 published artifacts reached' } });
    const { status, json } = await call(server, 'POST', '/api/cloud/publish/html/a');
    expect(status).toBe(502);
    expect(json.error).toContain('limit of 100 published artifacts reached');
  });
});

describe('visibility and unpublishing', () => {
  test('changing visibility of a published artifact updates the cloud at once', async () => {
    const { server, root, cloud, configFile } = await start();
    writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
    await call(server, 'POST', '/api/cloud/publish/html/a');
    const { status } = await call(server, 'POST', '/api/cloud/visibility/html/a', { visibility: 'public' });
    expect(status).toBe(200);
    expect(cloud.requests[1]).toMatchObject({ method: 'PATCH', path: '/api/artifacts/cloud1', json: { visibility: 'public' } });
    expect(config(configFile).artifacts['html/a'].visibility).toBe('public');
    expect(config(configFile).artifacts['html/a'].cloud.visibility).toBe('public');
  });

  test('changing visibility before publishing only records it locally', async () => {
    const { server, root, cloud, configFile } = await start();
    writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
    await call(server, 'POST', '/api/cloud/visibility/html/a', { visibility: 'public' });
    expect(cloud.requests).toEqual([]);
    expect(config(configFile).artifacts['html/a']).toEqual({ visibility: 'public' });
  });

  test('an invalid visibility is rejected', async () => {
    const { server, root } = await start();
    writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
    expect((await call(server, 'POST', '/api/cloud/visibility/html/a', { visibility: 'secret' })).status).toBe(400);
  });

  test('unpublishing deletes the cloud copy and forgets the link', async () => {
    const { server, root, cloud, configFile } = await start();
    writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
    await call(server, 'POST', '/api/cloud/publish/html/a');
    expect((await call(server, 'DELETE', '/api/cloud/publish/html/a')).status).toBe(200);
    expect(cloud.requests[1]).toMatchObject({ method: 'DELETE', path: '/api/artifacts/cloud1' });
    expect(config(configFile).artifacts['html/a']).toEqual({ visibility: 'private' });
  });

  test('listing returns every cloud artifact of the account', async () => {
    const { server, cloud } = await start();
    cloud.respond = (r) => (r.method === 'GET' ? { status: 200, body: { artifacts: [{ id: 'old1' }] } } : undefined);
    expect((await call(server, 'GET', '/api/cloud/artifacts')).json).toEqual({ artifacts: [{ id: 'old1' }] });
  });

  test('deleting by cloud id also clears a local record that points at it', async () => {
    const { server, root, cloud, configFile } = await start();
    writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
    await call(server, 'POST', '/api/cloud/publish/html/a');
    expect((await call(server, 'DELETE', '/api/cloud/artifacts/cloud1')).status).toBe(200);
    expect(cloud.requests[1]).toMatchObject({ method: 'DELETE', path: '/api/artifacts/cloud1' });
    expect(config(configFile).artifacts['html/a'].cloud).toBeUndefined();
  });
});
