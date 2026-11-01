import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, test } from 'vitest';

import { type Hub, startHub } from '../src/server/hub';
import { machinePaths, registerProject } from '../src/server/machine';
import type { HubStatus } from '../src/shared/hub';
import { get, tempRoot, writeArtboard } from './helpers';

const hubs: Hub[] = [];
afterEach(async () => {
  for (const hub of hubs.splice(0)) await hub.close();
});

function newProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-status-')));
  fs.mkdirSync(path.join(dir, '.ryugi', 'artifacts'), { recursive: true });
  return dir;
}

async function hub(home: string, latest: string | null = null) {
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
    latest: () => latest,
  });
  hubs.push(started);
  return started;
}

const newHome = () => fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-status-home-'));

test('status describes the server, its relay, live pages and projects', async () => {
  const home = newHome();
  const active = newProject();
  const dormant = newProject();
  writeArtboard(path.join(active, '.ryugi', 'artifacts'), 'flow', {
    version: 1,
    pages: [],
    boards: {},
  });
  const file = machinePaths({ RYUGI_SERVER_HOME: home }).projects;
  registerProject(file, dormant, 1);
  const h = await hub(home, '10.0.0');
  await h.register(active);
  const res = await get(`http://127.0.0.1:${h.port}/api/status`);
  expect(res.status).toBe(200);
  const status = JSON.parse(res.body) as HubStatus;
  expect(status).toMatchObject({
    pid: process.pid,
    version: '9.9.9',
    latest: '10.0.0',
    port: h.port,
    url: `http://localhost:${h.port}/`,
    relay: { connected: false, announced: 0 },
    live: { local: 0, relay: 0 },
  });
  expect(typeof status.startedAt).toBe('number');
  expect(status.projects.map((p) => [p.dir, p.name, p.dormant, p.artifacts])).toEqual([
    [active, path.basename(active), false, 1],
    [dormant, path.basename(dormant), true, 0],
  ]);
});

test('status needs the key when the server is not on loopback', async () => {
  const temp = tempRoot();
  const h = await startHub({
    host: '0.0.0.0',
    urlHost: 'localhost',
    viewerDir: temp.viewer,
    ports: [0],
    boardPorts: [0],
    paths: machinePaths({ RYUGI_SERVER_HOME: newHome() }),
    token: 't'.repeat(48),
    version: '9.9.9',
  });
  hubs.push(h);
  expect(
    (await get(`http://127.0.0.1:${h.port}/api/status`, { Host: `localhost:${h.port}` })).status,
  ).toBe(403);
  expect(
    (
      await get(`http://127.0.0.1:${h.port}/api/status?key=${'t'.repeat(48)}`, {
        Host: `localhost:${h.port}`,
      })
    ).status,
  ).toBe(200);
});

test('every registered project gets a server-info pointing at the hub while it runs', async () => {
  const home = newHome();
  const dormant = newProject();
  registerProject(machinePaths({ RYUGI_SERVER_HOME: home }).projects, dormant, 1);
  const h = await hub(home);
  const info = path.join(dormant, '.ryugi', 'artifacts', '.state', 'server-info');
  expect(JSON.parse(fs.readFileSync(info, 'utf8')).url).toBe(`http://localhost:${h.port}/`);
  await h.close();
  hubs.splice(hubs.indexOf(h), 1);
  expect(fs.existsSync(info)).toBe(false);
});
