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

test('removing a project forgets it', async () => {
  const h = await hub();
  const one = newProject();
  await h.register(one);
  await h.remove(one);
  expect(h.projects()).toEqual([]);
});
