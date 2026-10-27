import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { monitorText } from '../src/cli/monitor';
import { duration, shortPath } from '../src/cli/monitor-view';
import { listServers, safeToStop } from '../src/cli/servers';
import { AGENT_MARKERS } from '../src/server/agent';
import { readEntries, registryDir, writeEntry } from '../src/server/registry';

const cli = path.resolve(__dirname, '../../skills/artifacts/app/cli.cjs');
const env = () => ({
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !AGENT_MARKERS.includes(key)),
  ),
  ARTIFACTS_OPEN: '0',
});
const run = (args: string[]) => {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    timeout: 15000,
    env: env(),
  });
  return { code: result.status, stdout: result.stdout };
};

let projects: string[] = [];
afterEach(() => {
  for (const project of projects) run(['stop', '--project-dir', project]);
  projects = [];
});

const newProject = () => {
  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-monitor-')));
  projects.push(project);
  return project;
};

test('a server is safe to stop once no tab is open and it has been idle for 30 minutes', () => {
  const now = 100 * 60_000;
  expect(safeToStop({ clients: 0, lastActivity: now - 30 * 60_000 }, now)).toBe(true);
  expect(safeToStop({ clients: 0, lastActivity: now - 29 * 60_000 }, now)).toBe(false);
  expect(safeToStop({ clients: 1, lastActivity: 0 }, now)).toBe(false);
  expect(safeToStop(null, now)).toBe(false);
});

test('monitor --json lists every running server with its address and status', () => {
  const [a, b] = [newProject(), newProject()];
  const urls = [a, b].map(
    (project) =>
      JSON.parse(
        run(['start', '--json', '--project-dir', project]).stdout.trim().split('\n').pop()!,
      ).url,
  );
  const { code, stdout } = run(['monitor', '--json']);
  expect(code).toBe(0);
  const out = JSON.parse(stdout.trim());
  expect(out.type).toBe('servers');
  const mine = out.servers.filter((s: { project: string }) => s.project === a || s.project === b);
  expect(mine.map((s: { url: string }) => s.url).sort()).toEqual([...urls].sort());
  for (const server of mine) {
    expect(server).toMatchObject({ clients: 0, safeToStop: false, status: 'ok' });
    expect(server.port).toBe(Number(new URL(server.url).port));
    expect(server.pid).toBeGreaterThan(0);
    expect(server.log).toBe(path.join(server.root, '.state', 'server.log'));
  }
}, 30000);

test('monitor drops registry entries whose server is gone', () => {
  const ghost = newProject();
  writeEntry(registryDir(), {
    project: ghost,
    root: path.join(ghost, '.ryugi', 'artifacts'),
    pid: 2147483646,
    serverId: 'c'.repeat(48),
    startedAt: 1,
  });
  const out = JSON.parse(run(['monitor', '--json']).stdout.trim());
  expect(out.servers.find((s: { project: string }) => s.project === ghost)).toBeUndefined();
  expect(readEntries(registryDir()).find((e) => e.project === ghost)).toBeUndefined();
});

test('durations read as minutes, hours and days', () => {
  expect([0, 59, 60, 61, 24 * 60, 24 * 60 + 61].map((m) => duration(m * 60_000))).toEqual([
    '0m',
    '59m',
    '1h',
    '1h1m',
    '1d',
    '1d1h',
  ]);
});

test('the text list shortens home paths and tags what needs attention', () => {
  const row = {
    project: '/home/a/proj',
    url: 'http://localhost:1/?key=k',
    pid: 7,
    clients: 0,
    lastActivity: 0,
    safeToStop: true,
    oldRelease: true,
    status: 'ok',
  };
  expect(shortPath('/home/a/proj', '/home/a')).toBe('~/proj');
  expect(shortPath('/home/ab', '/home/a')).toBe('/home/ab');
  expect(monitorText({ type: 'servers', servers: [] })).toBe('No artifacts servers are running.');
  expect(monitorText({ type: 'servers', servers: [row] }, 90 * 60_000)).toMatch(
    /http:\/\/localhost:1\/\?key=k {2}pid 7 {2}tabs 0 {2}idle 1h30m {2}\[safe to stop\] {2}\[old release\]$/,
  );
});

const started = (project: string) => {
  const out = JSON.parse(
    run(['start', '--json', '--project-dir', project]).stdout.trim().split('\n').pop()!,
  );
  const state = path.join(project, '.ryugi', 'artifacts', '.state');
  return {
    url: out.url as string,
    pid: Number(fs.readFileSync(path.join(state, 'server.pid'), 'utf8')),
    serverId: fs.readFileSync(path.join(state, 'server-instance-id'), 'utf8').trim(),
  };
};

const pointAt = (project: string, url: string, from: { pid: number; serverId: string }) => {
  const root = path.join(project, '.ryugi', 'artifacts');
  fs.mkdirSync(path.join(root, '.state'), { recursive: true });
  fs.writeFileSync(path.join(root, '.state', 'server-info'), JSON.stringify({ url }));
  writeEntry(registryDir(), {
    project,
    root,
    pid: from.pid,
    serverId: from.serverId,
    startedAt: 1,
  });
};

test('an entry whose address answers with another server is not listed', async () => {
  const [a, c, b] = [newProject(), newProject(), newProject()];
  const first = started(a);
  pointAt(b, started(c).url, first);
  expect((await listServers()).find((s) => s.project === b)).toBeUndefined();
}, 30000);

test('on Windows, where a pid check cannot read the command line, an unreachable server is not listed', async () => {
  const [a, d] = [newProject(), newProject()];
  pointAt(d, 'http://localhost:9/?key=x', started(a));
  expect((await listServers(Date.now(), 'darwin')).find((s) => s.project === d)?.status).toBe(
    'no-status',
  );
  expect((await listServers(Date.now(), 'win32')).find((s) => s.project === d)).toBeUndefined();
}, 30000);
