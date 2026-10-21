import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { get } from './helpers';

const appDir = path.resolve(__dirname, '../../skills/artifacts/app');
const launcherName = 'ryugi-artifacts.cjs';
const version = '9.9.9';
const DAY_MS = 24 * 60 * 60 * 1000;

const STUBBORN_SERVER = [
  "const on = process.on.bind(process);",
  "on('SIGTERM', () => {});",
  "process.on = (event, listener) => (event === 'SIGTERM' ? process : on(event, listener));",
  "require('./real.cjs');",
].join(' ');

let cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function installedCopy() {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-app-'));
  fs.copyFileSync(path.join(appDir, launcherName), path.join(app, launcherName));
  return app;
}

function fakeNpm({ installExit = 0, before = '' } = {}) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-npm-'));
  const log = path.join(bin, 'calls.log');
  const latest = path.join(bin, 'latest');
  const offline = path.join(bin, 'offline');
  const installFails = path.join(bin, 'install-fails');
  const stubborn = path.join(bin, 'stubborn');
  fs.writeFileSync(latest, version);
  fs.writeFileSync(path.join(bin, 'npm'), [
    '#!/bin/bash',
    `echo "$*" >> ${JSON.stringify(log)}`,
    `if [[ "$1" == "view" ]]; then [[ -f ${JSON.stringify(offline)} ]] && exit 1; cat ${JSON.stringify(latest)}; exit 0; fi`,
    `[[ ${installExit} -eq 0 ]] || exit ${installExit}`,
    `[[ -f ${JSON.stringify(installFails)} ]] && exit 1`,
    'while [[ $# -gt 0 ]]; do [[ "$1" == "--prefix" ]] && prefix="$2"; shift; done',
    before,
    'dist="$prefix/node_modules/ryugi-artifacts/dist"',
    'mkdir -p "$dist"',
    `cp ${JSON.stringify(path.join(appDir, 'cli.cjs'))} "$dist/cli.cjs"`,
    `cp ${JSON.stringify(path.join(appDir, 'server.cjs'))} "$dist/server.cjs"`,
    `cp -R ${JSON.stringify(path.join(appDir, 'viewer'))} "$dist/viewer"`,
    `if [[ -f ${JSON.stringify(stubborn)} ]]; then mv "$dist/server.cjs" "$dist/real.cjs"; printf '%s' ${JSON.stringify(STUBBORN_SERVER)} > "$dist/server.cjs"; fi`,
  ].join('\n'), { mode: 0o755 });
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []);
  return {
    bin,
    views: () => calls().filter((c) => c.startsWith('view')),
    installs: () => calls().filter((c) => c.startsWith('install')),
    publish: (next: string) => fs.writeFileSync(latest, next),
    goOffline: () => fs.writeFileSync(offline, ''),
    failInstalls: () => fs.writeFileSync(installFails, ''),
    installStubbornServers: () => fs.writeFileSync(stubborn, ''),
  };
}

function setup(npmOptions?: Parameters<typeof fakeNpm>[0]) {
  const app = installedCopy();
  const npm = fakeNpm(npmOptions);
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-cache-'));
  const env = { ...process.env, PATH: `${npm.bin}:${process.env.PATH}`, XDG_CACHE_HOME: cache, ARTIFACTS_OPEN: '0' };
  const launch = (args: string[]) => {
    const result = spawnSync(process.execPath, [path.join(app, launcherName), ...args], { encoding: 'utf8', env, timeout: 20000 });
    return { code: result.status, out: JSON.parse(result.stdout.trim().split('\n').pop()!) };
  };
  const project = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-project-'));
    cleanups.push(() => launch(['stop', '--project-dir', dir]));
    return dir;
  };
  return { app, npm, cache, env, launch, project };
}

const releases = (cache: string) => fs.readdirSync(path.join(cache, 'ryugi', 'artifacts')).filter((name) => name !== 'latest.json');
const pidOf = (project: string) => Number(fs.readFileSync(path.join(project, '.ryugi', 'artifacts', '.state', 'server.pid'), 'utf8'));

function ageLatestCheck(cache: string, ms: number, next?: string) {
  const file = path.join(cache, 'ryugi', 'artifacts', 'latest.json');
  const latest = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...latest, ...(next ? { version: next } : {}), checkedAt: Date.now() - ms }));
}

describe('launcher with a local build', () => {
  test('runs the CLI beside it without asking npm', () => {
    const npm = fakeNpm();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-project-'));
    const env = { ...process.env, PATH: `${npm.bin}:${process.env.PATH}`, ARTIFACTS_OPEN: '0' };
    const launch = (args: string[]) => JSON.parse(spawnSync(process.execPath, [path.join(appDir, launcherName), ...args], { encoding: 'utf8', env, timeout: 20000 }).stdout.trim().split('\n').pop()!);
    cleanups.push(() => launch(['stop', '--project-dir', dir]));
    expect(launch(['start', '--project-dir', dir, '--json']).type).toBe('server-started');
    expect(npm.views()).toHaveLength(0);
    const owners = fs.readFileSync(path.join(dir, '.ryugi', 'artifacts', '.state', 'owners'), 'utf8').trim().split('\n');
    expect(owners).toEqual([String(process.ppid)]);
  });

  test('keeps an owner it was handed instead of guessing one', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-project-'));
    const env = { ...process.env, ARTIFACTS_OPEN: '0', RYUGI_ARTIFACTS_OWNER: String(process.pid) };
    const launch = (args: string[]) => JSON.parse(spawnSync(process.execPath, [path.join(appDir, launcherName), ...args], { encoding: 'utf8', env, timeout: 20000 }).stdout.trim().split('\n').pop()!);
    cleanups.push(() => launch(['stop', '--project-dir', dir]));
    expect(launch(['start', '--project-dir', dir, '--json']).type).toBe('server-started');
    const owners = fs.readFileSync(path.join(dir, '.ryugi', 'artifacts', '.state', 'owners'), 'utf8').trim().split('\n');
    expect(owners).toEqual([String(process.pid)]);
  });
});

describe('launcher without a local build', () => {
  test('installs the latest release once and runs its server', async () => {
    const { npm, launch, project } = setup();
    const dir = project();
    const info = launch(['start', '--project-dir', dir]).out;
    expect(info.type).toBe('server-started');
    expect((await get(info.url.replace('localhost', '127.0.0.1'), { Connection: 'close' })).status).toBe(200);
    expect(launch(['stop', '--project-dir', dir]).out.status).toBe('stopped');
    expect(launch(['start', '--project-dir', dir]).out.type).toBe('server-started');
    expect(npm.views()).toHaveLength(1);
    expect(npm.installs()).toHaveLength(1);
    expect(npm.installs()[0]).toContain(`ryugi-artifacts@${version}`);
  }, 30000);

  test('asks npm for the latest release again only after a day', () => {
    const { npm, cache, launch, project } = setup();
    const dir = project();
    expect(launch(['start', '--project-dir', dir]).out.type).toBe('server-started');
    launch(['stop', '--project-dir', dir]);
    npm.publish('9.9.10');
    ageLatestCheck(cache, DAY_MS - 60_000);
    expect(launch(['start', '--project-dir', dir]).out.type).toBe('server-started');
    launch(['stop', '--project-dir', dir]);
    expect(npm.views()).toHaveLength(1);
    ageLatestCheck(cache, DAY_MS + 60_000);
    expect(launch(['start', '--project-dir', dir]).out.type).toBe('server-started');
    expect(npm.views()).toHaveLength(2);
    expect(npm.installs().at(-1)).toContain('ryugi-artifacts@9.9.10');
    expect(releases(cache).sort()).toEqual(['9.9.10', '9.9.9']);
  }, 30000);

  test('offline, it runs the newest release already installed and does not retry on every start', () => {
    const { npm, cache, launch, project } = setup();
    const dir = project();
    expect(launch(['start', '--project-dir', dir]).out.type).toBe('server-started');
    launch(['stop', '--project-dir', dir]);
    npm.goOffline();
    ageLatestCheck(cache, DAY_MS + 60_000);
    expect(launch(['start', '--project-dir', dir]).out.type).toBe('server-started');
    launch(['stop', '--project-dir', dir]);
    expect(launch(['start', '--project-dir', dir]).out.type).toBe('server-started');
    expect(npm.installs()).toHaveLength(1);
    expect(npm.views()).toHaveLength(2);
    expect(npm.views().at(-1)).toContain('--fetch-retries=0');
  }, 30000);

  test('offline with nothing installed, it says the first start needs the network', () => {
    const { npm, launch, project } = setup();
    npm.goOffline();
    const { code, out } = launch(['start', '--project-dir', project()]);
    expect(code).toBe(1);
    expect(out.error).toContain('ryugi-artifacts');
    expect(out.error).toMatch(/network access/);
    expect(out.error).toMatch(/rerun outside the sandbox/);
    expect(npm.installs()).toHaveLength(0);
  });

  test('a cache it cannot write to still runs the release already installed', () => {
    const { npm, cache, launch, project } = setup();
    const dir = project();
    expect(launch(['start', '--project-dir', dir]).out.type).toBe('server-started');
    launch(['stop', '--project-dir', dir]);
    npm.goOffline();
    ageLatestCheck(cache, DAY_MS + 60_000);
    const releasesDir = path.join(cache, 'ryugi', 'artifacts');
    fs.chmodSync(releasesDir, 0o555);
    cleanups.push(() => fs.chmodSync(releasesDir, 0o755));
    expect(launch(['start', '--project-dir', dir]).out.type).toBe('server-started');
  }, 30000);

  test('reuses a running server on the latest release and replaces one from another release, keeping its link', () => {
    const { npm, cache, launch, project } = setup();
    const dir = project();
    const first = launch(['start', '--project-dir', dir]).out;
    const oldPid = pidOf(dir);
    expect(launch(['start', '--project-dir', dir]).out.reused).toBe(true);
    npm.publish('9.9.10');
    ageLatestCheck(cache, DAY_MS + 60_000);
    const second = launch(['start', '--project-dir', dir]).out;
    expect(second.type).toBe('server-started');
    expect(second.reused).toBeUndefined();
    expect(second.url).toBe(first.url);
    expect(() => process.kill(oldPid, 0)).toThrow();
  }, 30000);

  test('when the newest release will not install, it runs the one already installed', () => {
    const { npm, cache, launch, project } = setup();
    const dir = project();
    expect(launch(['start', '--project-dir', dir]).out.type).toBe('server-started');
    launch(['stop', '--project-dir', dir]);
    npm.publish('9.9.10');
    npm.failInstalls();
    ageLatestCheck(cache, DAY_MS + 60_000);
    expect(launch(['start', '--project-dir', dir]).out.type).toBe('server-started');
    launch(['stop', '--project-dir', dir]);
    expect(launch(['start', '--project-dir', dir]).out.type).toBe('server-started');
    expect(npm.installs()).toHaveLength(2);
    expect(releases(cache)).toEqual([version]);
  }, 30000);

  test('an old server that ignores SIGTERM is killed so the new one keeps the link', () => {
    const { npm, cache, launch, project } = setup();
    npm.installStubbornServers();
    const dir = project();
    const first = launch(['start', '--project-dir', dir]).out;
    const oldPid = pidOf(dir);
    npm.publish('9.9.10');
    ageLatestCheck(cache, DAY_MS + 60_000);
    const second = launch(['start', '--project-dir', dir]).out;
    expect(second.url).toBe(first.url);
    expect(() => process.kill(oldPid, 0)).toThrow();
    process.kill(pidOf(dir), 'SIGKILL');
  }, 30000);

  test('reports the release it could not install', () => {
    const { cache, launch, project } = setup({ installExit: 1 });
    const { out } = launch(['start', '--project-dir', project()]);
    expect(out.error).toContain(`ryugi-artifacts@${version}`);
    expect(out.error).toMatch(/network access/);
    expect(releases(cache)).toEqual([]);
  });

  test('keeps an install another start finished first', () => {
    const { cache, launch, project } = setup({
      before: [
        'installed="${prefix%.install.*}/node_modules/ryugi-artifacts/dist"',
        'mkdir -p "$installed"',
        `cp ${JSON.stringify(path.join(appDir, 'cli.cjs'))} "$installed/cli.cjs"`,
        `cp ${JSON.stringify(path.join(appDir, 'server.cjs'))} "$installed/server.cjs"`,
        `cp -R ${JSON.stringify(path.join(appDir, 'viewer'))} "$installed/viewer"`,
        'touch "${prefix%.install.*}/first"',
      ].join('\n'),
    });
    expect(launch(['start', '--project-dir', project()]).out.type).toBe('server-started');
    expect(releases(cache)).toEqual([version]);
    expect(fs.existsSync(path.join(cache, 'ryugi', 'artifacts', version, 'first'))).toBe(true);
  }, 30000);

  test('installs without holding the project start lock', async () => {
    const { npm, app, env, project } = setup({ before: 'sleep 2' });
    const dir = project();
    const lock = path.join(dir, '.ryugi', 'artifacts', '.state', 'start.lock');
    const child = spawn(process.execPath, [path.join(app, launcherName), 'start', '--project-dir', dir], { env });
    const done = new Promise((resolve) => child.on('close', resolve));
    while (npm.installs().length === 0) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fs.existsSync(lock)).toBe(false);
    await done;
  }, 30000);

  test('refuses a release older than the first one with the comment command, even when the cache is fresh', () => {
    const { npm, cache, launch, project } = setup();
    npm.publish('1.10.1');
    fs.mkdirSync(path.join(cache, 'ryugi', 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(cache, 'ryugi', 'artifacts', 'latest.json'), JSON.stringify({ version: '1.10.1', checkedAt: Date.now() }));
    const { code, out } = launch(['start', '--project-dir', project()]);
    expect(code).toBe(1);
    expect(out.error).toMatch(/ryugi-artifacts 1\.11\.0 or newer/);
    expect(out.error).toMatch(/retry/);
    expect(npm.views()).toHaveLength(1);
    expect(npm.installs()).toHaveLength(0);
  });

  test('stop and publish use the installed release without asking npm, and pass exit codes through', () => {
    const { app, npm, cache, launch, project } = setup();
    const dir = project();
    expect(launch(['start', '--project-dir', dir]).out.type).toBe('server-started');
    ageLatestCheck(cache, DAY_MS + 60_000);
    npm.goOffline();
    expect(launch(['stop', '--project-dir', dir]).out.status).toBe('stopped');
    const unpublished = launch(['publish', '--project-dir', dir, '--artifact', 'html/x']);
    expect(unpublished.code).toBe(1);
    expect(unpublished.out.error).toContain(`node "${fs.realpathSync(path.join(app, launcherName))}" start`);
    expect(npm.views()).toHaveLength(1);
  }, 30000);
});

describe('npm on Windows', () => {
  const { npmCommand } = createRequire(__filename)(path.join(appDir, launcherName));
  const args = ['install', '--prefix', 'C:\\Users\\Jane Doe\\.cache\\ryugi\\artifacts\\1.9.1.install.42', 'ryugi-artifacts@1.9.1'];

  test('runs through cmd with every argument quoted, so a home folder with a space survives', () => {
    expect(npmCommand(args, true)).toEqual({
      file: 'npm "install" "--prefix" "C:\\Users\\Jane Doe\\.cache\\ryugi\\artifacts\\1.9.1.install.42" "ryugi-artifacts@1.9.1"',
      args: [],
      shell: true,
    });
  });

  test('elsewhere runs npm directly with the arguments as given', () => {
    expect(npmCommand(args, false)).toEqual({ file: 'npm', args, shell: false });
  });
});
