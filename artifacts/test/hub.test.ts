import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, test } from 'vitest';

import { type Hub, startHub } from '../src/server/hub';
import { machinePaths, readProjects, registerProject } from '../src/server/machine';
import { get, openWs, tempRoot, writeArtboard } from './helpers';

const canvas = (title: string) => ({
  version: 1,
  title,
  pages: [{ id: 'p', name: 'P' }],
  boards: { a: { file: 'pages/p/a.html', page: 'p', x: 0, y: 0, w: 640, h: 400 } },
});

const hubs: Hub[] = [];
afterEach(async () => {
  for (const hub of hubs.splice(0)) await hub.close();
});

function newProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-hub-project-')));
  fs.mkdirSync(path.join(dir, '.ryugi', 'artifacts'), { recursive: true });
  return dir;
}
const rootOf = (project: string) => path.join(project, '.ryugi', 'artifacts');

async function hub(home = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-hub-home-'))) {
  const temp = tempRoot();
  const started = await startHub({
    host: '127.0.0.1',
    urlHost: 'localhost',
    viewerDir: temp.viewer,
    runtimeDir: temp.runtime,
    ports: [0],
    boardPorts: [0],
    paths: machinePaths({ RYUGI_SERVER_HOME: home }),
    token: 't'.repeat(48),
    version: '9.9.9',
  });
  hubs.push(started);
  return started;
}

const api = (h: Hub, rel: string, headers: Record<string, string> = {}) =>
  get(`http://127.0.0.1:${h.port}${rel}`, headers);

const post = (h: Hub, rel: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`http://127.0.0.1:${h.port}${rel}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

test('each artifact address reaches the project that owns it', async () => {
  const h = await hub();
  const one = newProject();
  const two = newProject();
  writeArtboard(rootOf(one), 'flow', canvas('First flow'));
  writeArtboard(rootOf(two), 'flow', canvas('Second flow'));
  await h.register(one);
  await h.register(two);
  const linkOne = await h.linkFor(one, 'artboard', 'flow');
  const linkTwo = await h.linkFor(two, 'artboard', 'flow');
  expect(linkOne).not.toBe(linkTwo);
  const addressOne = linkOne.split('/').pop()!;
  const addressTwo = linkTwo.split('/').pop()!;
  expect((await api(h, `/artboard/${addressOne}`)).body).toContain('First flow');
  expect((await api(h, `/artboard/${addressTwo}`)).body).toContain('Second flow');
});

test('a slug shared by two projects follows the project header from the CLI', async () => {
  const h = await hub();
  const one = newProject();
  const two = newProject();
  writeArtboard(rootOf(one), 'flow', canvas('First flow'));
  writeArtboard(rootOf(two), 'flow', canvas('Second flow'));
  await h.register(one);
  await h.register(two);
  const res = await api(h, '/api/artifacts/artboard/flow', { 'X-Ryugi-Project': one });
  expect(res.body).toContain('First flow');
});

test('the project header is URI-encoded, so a path outside ASCII still names its project', async () => {
  const h = await hub();
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-hub-')));
  const one = path.join(parent, '设计稿');
  fs.mkdirSync(path.join(one, '.ryugi', 'artifacts'), { recursive: true });
  const two = newProject();
  writeArtboard(rootOf(one), 'flow', canvas('First flow'));
  writeArtboard(rootOf(two), 'flow', canvas('Second flow'));
  await h.register(one);
  await h.register(two);
  const res = await api(h, '/api/artifacts/artboard/flow', {
    'X-Ryugi-Project': encodeURIComponent(one),
  });
  expect(res.body).toContain('First flow');
});

test('a browser request cannot pick a project with the header', async () => {
  const h = await hub();
  const one = newProject();
  const two = newProject();
  writeArtboard(rootOf(one), 'flow', canvas('First flow'));
  writeArtboard(rootOf(two), 'flow', canvas('Second flow'));
  await h.register(one);
  await h.register(two);
  const res = await api(h, '/api/artifacts/artboard/flow', {
    'X-Ryugi-Project': one,
    'Origin': `http://localhost:${h.port}`,
  });
  expect(res.body).toContain('Second flow');
});

test('without a header a shared slug goes to the most recently used project', async () => {
  const h = await hub();
  const one = newProject();
  const two = newProject();
  writeArtboard(rootOf(one), 'flow', canvas('First flow'));
  writeArtboard(rootOf(two), 'flow', canvas('Second flow'));
  await h.register(one);
  await h.register(two);
  expect((await api(h, '/api/artifacts/artboard/flow')).body).toContain('Second flow');
});

test('an artifact of an unregistered project is not found', async () => {
  const h = await hub();
  const outside = newProject();
  writeArtboard(rootOf(outside), 'flow', canvas('Outside'));
  expect((await api(h, '/api/artifacts/artboard/flow')).status).toBe(404);
});

test('projects register over the agent API, not from a page', async () => {
  const h = await hub();
  const one = newProject();
  const fromPage = await post(
    h,
    '/api/hub/projects',
    { dir: one },
    {
      Origin: `http://localhost:${h.port}`,
    },
  );
  expect(fromPage.status).toBe(403);
  const fromAgent = await post(h, '/api/hub/projects', { dir: one });
  expect(fromAgent.status).toBe(200);
  expect(h.projects().map((entry) => entry.dir)).toEqual([one]);
});

test('registered projects are remembered and mounted on first use after a restart', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-hub-home-'));
  const one = newProject();
  writeArtboard(rootOf(one), 'flow', canvas('Remembered'));
  registerProject(machinePaths({ RYUGI_SERVER_HOME: home }).projects, one, 1);
  const h = await hub(home);
  expect((await api(h, '/api/artifacts/artboard/flow')).body).toContain('Remembered');
  expect(readProjects(machinePaths({ RYUGI_SERVER_HOME: home }).projects)[0]!.dir).toBe(one);
});

test('content tokens route to their project', async () => {
  const h = await hub();
  const one = newProject();
  writeArtboard(rootOf(one), 'flow', canvas('Flow'), { 'pages/p/a.html': '<p>inside</p></html>' });
  await h.register(one);
  const info = JSON.parse((await api(h, '/api/artifacts/artboard/flow')).body) as {
    contentBase?: string;
  };
  const base = info.contentBase ?? '';
  expect(base).toMatch(/^\/c\//);
  const res = await api(h, `${base}pages/p/a.html`);
  expect(res.status).toBe(200);
  expect(res.body).toContain('inside');
});

test('the page socket follows the page it was opened from', async () => {
  const h = await hub();
  const one = newProject();
  writeArtboard(rootOf(one), 'flow', canvas('Flow'));
  await h.register(one);
  const link = await h.linkFor(one, 'artboard', 'flow');
  const at = new URL(link).pathname;
  const ws = await openWs(
    h.port,
    {
      Host: `localhost:${h.port}`,
      Origin: `http://localhost:${h.port}`,
    },
    `/ws?at=${encodeURIComponent(at)}`,
  );
  expect(ws.status).toBe(101);
  ws.socket?.destroy();
});

test('a registration that asks to open an artifact opens it once it is ready', async () => {
  const temp = tempRoot();
  const opened: string[] = [];
  const h = await startHub({
    host: '127.0.0.1',
    urlHost: 'localhost',
    viewerDir: temp.viewer,
    runtimeDir: temp.runtime,
    ports: [0],
    boardPorts: [0],
    paths: machinePaths({
      RYUGI_SERVER_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-hub-home-')),
    }),
    token: 't'.repeat(48),
    version: '9.9.9',
    open: async (link) => {
      opened.push(link);
    },
  });
  hubs.push(h);
  const one = newProject();
  writeArtboard(rootOf(one), 'other', canvas('Other'), { 'pages/p/a.html': '<p>o</p></html>' });
  const res = await post(h, '/api/hub/projects', { dir: one, open: 'artboard/flow' });
  expect(res.status).toBe(200);
  writeArtboard(rootOf(one), 'flow', canvas('Signup flow'), {
    'pages/p/a.html': '<p>f</p></html>',
  });
  const until = Date.now() + 5000;
  while (opened.length === 0 && Date.now() < until)
    await new Promise((resolve) => setTimeout(resolve, 50));
  expect(opened).toHaveLength(1);
  expect(opened[0]).toBe(await h.linkFor(one, 'artboard', 'flow'));
  await post(h, '/api/hub/projects', { dir: one });
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(opened).toHaveLength(1);
});

test('lists the artifacts of every project, newest first, with their project', async () => {
  const h = await hub();
  const one = newProject();
  const two = newProject();
  writeArtboard(rootOf(one), 'older', canvas('Older board'));
  const past = new Date(Date.now() - 60_000);
  fs.utimesSync(path.join(rootOf(one), 'artboard', 'older', 'canvas.json'), past, past);
  fs.utimesSync(path.join(rootOf(one), 'artboard', 'older'), past, past);
  writeArtboard(rootOf(two), 'newer', canvas('Newer board'));
  await h.register(one);
  await h.register(two);
  const res = await api(h, '/api/hub/artifacts');
  expect(res.status).toBe(200);
  const body = JSON.parse(res.body) as {
    artifacts: { project: string; title: string; type: string; url: string }[];
    projects: { dir: string; name: string }[];
  };
  expect(body.artifacts.map((a) => [a.title, a.project])).toEqual([
    ['Newer board', two],
    ['Older board', one],
  ]);
  expect(body.artifacts[0]!.url).toMatch(/^\/artboard\/[\w-]{21}$/);
  expect(body.projects.map((p) => p.dir)).toEqual([two, one]);
});

test('the cross-project list refuses another origin', async () => {
  const h = await hub();
  const res = await api(h, '/api/hub/artifacts', { Origin: 'https://evil.example' });
  expect(res.status).toBe(403);
});

test('the home page removes a project from its own origin only', async () => {
  const h = await hub();
  const one = newProject();
  await h.register(one);
  const remove = (origin: string) =>
    fetch(`http://127.0.0.1:${h.port}/api/hub/projects`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Origin': origin },
      body: JSON.stringify({ dir: one }),
    });
  expect((await remove('https://evil.example')).status).toBe(403);
  expect(h.projects().map((entry) => entry.dir)).toEqual([one]);
  expect((await remove(`http://localhost:${h.port}`)).status).toBe(200);
  expect(h.projects()).toEqual([]);
});

async function controlledHub(latest: string | null = null) {
  const temp = tempRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-hub-home-'));
  const calls: string[] = [];
  const h = await startHub({
    host: '127.0.0.1',
    urlHost: 'localhost',
    viewerDir: temp.viewer,
    runtimeDir: temp.runtime,
    ports: [0],
    boardPorts: [0],
    paths: machinePaths({ RYUGI_SERVER_HOME: home }),
    token: 't'.repeat(48),
    version: '1.0.0',
    latest: () => latest,
    control: {
      stop: () => calls.push('stop'),
      relaunch: (upgrade) => {
        calls.push(upgrade ? 'upgrade' : 'restart');
        return true;
      },
    },
  });
  hubs.push(h);
  return { h, calls, home };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

test('the home page stops and restarts the server from its own origin', async () => {
  const { h, calls } = await controlledHub();
  const origin = { Origin: `http://localhost:${h.port}` };
  expect((await post(h, '/api/hub/stop', {}, origin)).status).toBe(202);
  expect((await post(h, '/api/hub/restart', {}, origin)).status).toBe(202);
  await settle();
  expect(calls).toEqual(['stop', 'restart']);
});

test('another origin cannot stop the server', async () => {
  const { h, calls } = await controlledHub();
  expect((await post(h, '/api/hub/stop', {}, { Origin: 'https://evil.example' })).status).toBe(403);
  await settle();
  expect(calls).toEqual([]);
});

test('upgrade needs a newer release', async () => {
  const none = await controlledHub(null);
  expect((await post(none.h, '/api/hub/upgrade', {})).status).toBe(409);
  const newer = await controlledHub('1.1.0');
  expect((await post(newer.h, '/api/hub/upgrade', {})).status).toBe(202);
  await settle();
  expect(newer.calls).toEqual(['upgrade']);
});

test('the log reads the tail of the server log, filtered by project', async () => {
  const { h, home } = await controlledHub();
  fs.writeFileSync(
    path.join(home, 'server.log'),
    ['{"project":"/p/one","msg":"a"}', '{"project":"/p/two","msg":"b"}', 'plain line'].join('\n'),
  );
  const all = JSON.parse((await api(h, '/api/hub/log')).body) as { lines: string[] };
  expect(all.lines).toHaveLength(3);
  const one = JSON.parse(
    (await api(h, `/api/hub/log?project=${encodeURIComponent('/p/one')}`)).body,
  ) as { lines: string[] };
  expect(one.lines).toEqual(['{"project":"/p/one","msg":"a"}']);
  expect((await api(h, '/api/hub/log', { Origin: 'https://evil.example' })).status).toBe(403);
});

test('a sign-in started from one project finishes when the callback reaches another', async () => {
  const temp = tempRoot();
  const h = await startHub({
    host: '127.0.0.1',
    urlHost: 'localhost',
    viewerDir: temp.viewer,
    runtimeDir: temp.runtime,
    ports: [0],
    boardPorts: [0],
    paths: machinePaths({
      RYUGI_SERVER_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-hub-home-')),
    }),
    token: 't'.repeat(48),
    version: '9.9.9',
    cloud: {
      origin: 'http://127.0.0.1:9',
      credentialsFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'creds-')), 'c.json'),
    },
  });
  hubs.push(h);
  const one = newProject();
  const two = newProject();
  await h.register(one);
  await h.register(two);
  const login = await post(h, '/api/cloud/login', {}, { 'X-Ryugi-Project': one });
  const { url } = (await login.json()) as { url: string };
  const state = new URL(url).searchParams.get('state')!;
  const callback = await api(h, `/api/cloud/callback?state=${state}&code=c`);
  expect(callback.status).toBe(502);
});

test('a closing hub mounts nothing new and leaves no server-info behind', async () => {
  const h = await hub();
  const one = newProject();
  await h.register(one);
  const closing = h.close();
  const late = h.mountOf(one);
  await expect(late).rejects.toThrow();
  await closing;
  hubs.splice(hubs.indexOf(h), 1);
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(fs.existsSync(path.join(rootOf(one), '.state', 'server-info'))).toBe(false);
});

test('a published artifact of a project not mounted yet still answers on its cloud id', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-hub-home-'));
  const one = newProject();
  writeArtboard(rootOf(one), 'flow', canvas('Dormant flow'));
  fs.writeFileSync(
    path.join(one, '.ryugi', 'config.json'),
    JSON.stringify({
      version: 1,
      artifacts: {
        'artboard/flow': {
          cloud: { id: 'c1', url: 'u', publishedAt: 't', visibility: 'private' },
        },
      },
    }),
  );
  registerProject(machinePaths({ RYUGI_SERVER_HOME: home }).projects, one, 1);
  const h = await hub(home);
  expect(h.mounted()).toHaveLength(0);
  const ws = await openWs(
    h.port,
    { Host: `localhost:${h.port}`, Origin: `http://localhost:${h.port}` },
    '/relay/a/c1',
  );
  expect(ws.status).toBe(101);
  ws.socket?.destroy();
});

test('a page call without an artifact in its path reaches the project of the page', async () => {
  const h = await hub();
  const one = newProject();
  const two = newProject();
  writeArtboard(rootOf(one), 'flow', canvas('First flow'));
  writeArtboard(rootOf(two), 'flow', canvas('Second flow'));
  await h.register(one);
  await h.register(two);
  const page = await h.linkFor(one, 'artboard', 'flow');
  const viewer = await api(h, new URL(page).pathname, { Host: `localhost:${h.port}` });
  expect(viewer.headers['referrer-policy']).toBe('same-origin');
  const res = await api(h, '/api/artifacts', {
    Host: `localhost:${h.port}`,
    Referer: page,
  });
  expect((JSON.parse(res.body) as { project: string }).project).toBe(path.basename(one));
});

test('removing a project forgets it', async () => {
  const h = await hub();
  const one = newProject();
  await h.register(one);
  await h.remove(one);
  expect(h.projects()).toEqual([]);
});
