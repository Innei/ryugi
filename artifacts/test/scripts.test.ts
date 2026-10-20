import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { get, waitFor } from './helpers';

const scriptsDir = path.resolve(__dirname, '../../skills/artifacts/app');
const start = path.join(scriptsDir, 'start-server.sh');
const stop = path.join(scriptsDir, 'stop-server.sh');

const run = (script: string, args: string[]) => {
  const result = spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, ARTIFACTS_OPEN: '0' },
  });
  return JSON.parse(result.stdout.trim().split('\n').pop()!);
};

let projects: string[] = [];

afterEach(() => {
  for (const project of projects) {
    try {
      run(stop, [project]);
    } catch {
      // already stopped
    }
  }
  projects = [];
});

function newProject() {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-project-'));
  projects.push(project);
  return project;
}

describe('start-server.sh', () => {
  test('starts a server for the project and prints its url', async () => {
    const project = newProject();
    const info = run(start, ['--project-dir', project]);
    expect(info.type).toBe('server-started');
    expect(info.root).toBe(fs.realpathSync(path.join(project, '.ryugi', 'artifacts')));
    expect(info.url).toMatch(/^http:\/\/localhost:\d+\/\?key=/);
    const res = await get(info.url.replace('localhost', '127.0.0.1'));
    expect(res.status).toBe(200);
  });

  test('reuses the running server for the same project', () => {
    const project = newProject();
    const first = run(start, ['--project-dir', project]);
    const second = run(start, ['--project-dir', project]);
    expect(second.url).toBe(first.url);
    expect(second.reused).toBe(true);
  });

  test('concurrent starts share one server that stop-server then stops', async () => {
    const project = newProject();
    const root = `ARTIFACTS_ROOT=${fs.realpathSync(project)}/.ryugi/artifacts`;
    const serverCount = () =>
      spawnSync('ps', ['eww', '-A', '-o', 'command='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
        .stdout.split('\n')
        .filter((line) => line.includes('server.cjs --artifacts-server-id=') && line.split(' ').includes(root)).length;
    const before = serverCount();
    expect(before).toBe(0);
    const runAsync = () =>
      new Promise<{ port: number }>((resolve) => {
        const child = spawn('bash', [start, '--project-dir', project], {
          env: { ...process.env, ARTIFACTS_OPEN: '0' },
        });
        let out = '';
        child.stdout.on('data', (chunk) => (out += chunk));
        child.on('close', () => resolve(JSON.parse(out.trim().split('\n').pop()!)));
      });
    const [a, b] = await Promise.all([runAsync(), runAsync()]);
    expect(a.port).toBe(b.port);
    expect(serverCount()).toBe(before + 1);
    expect(run(stop, [project]).status).toBe('stopped');
    expect(serverCount()).toBe(before);
  });

  test('registers the calling session once, keeps live owners and drops dead ones', () => {
    const project = newProject();
    const owners = path.join(project, '.ryugi', 'artifacts', '.state', 'owners');
    fs.mkdirSync(path.dirname(owners), { recursive: true });
    fs.writeFileSync(owners, `2147483646\n${process.pid}\n`);
    run(start, ['--project-dir', project]);
    run(start, ['--project-dir', project]);
    const lines = fs.readFileSync(owners, 'utf8').trim().split('\n');
    expect(lines).not.toContain('2147483646');
    expect(lines).toContain(String(process.pid));
    expect(new Set(lines).size).toBe(lines.length);
    expect(lines.length).toBe(2);
  });

  test('opens the requested artifact once it is ready, by default', async () => {
    const project = newProject();
    const artboard = path.join(project, '.ryugi', 'artifacts', 'artboard', 'header');
    fs.mkdirSync(path.join(artboard, 'pages', 'p'), { recursive: true });
    fs.writeFileSync(
      path.join(artboard, 'canvas.json'),
      JSON.stringify({
        version: 1,
        pages: [{ id: 'p', name: 'P' }],
        boards: { a: { file: 'pages/p/a.html', page: 'p', x: 0, y: 0, w: 640, h: 400 } },
      }),
    );
    fs.writeFileSync(path.join(artboard, 'pages', 'p', 'a.html'), '<p>ready</p>');

    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-open-bin-'));
    const log = path.join(bin, 'opened.log');
    const open = path.join(bin, 'open');
    fs.writeFileSync(open, `#!/bin/sh\nprintf '%s\\n' "$1" >> ${JSON.stringify(log)}\n`, { mode: 0o755 });

    const env: NodeJS.ProcessEnv = { ...process.env, ARTIFACTS_OPEN_CMD: open };
    delete env.ARTIFACTS_OPEN;
    const info = JSON.parse(
      spawnSync('bash', [start, '--project-dir', project, '--artifact', 'artboard/header'], {
        encoding: 'utf8',
        env,
        timeout: 15000,
      }).stdout
        .trim()
        .split('\n')
        .pop()!,
    );
    expect(info.type).toBe('server-started');

    await waitFor(() => fs.existsSync(log), 5000);
    expect(fs.readFileSync(log, 'utf8')).toContain('/artboard/header?key=');
  }, 15000);

  test('prints a link for an artifact, on start and on reuse', () => {
    const project = newProject();
    const first = run(start, ['--project-dir', project, '--artifact', 'html/arrow-tuner']);
    const key = first.url.split('key=')[1];
    expect(first.link).toBe(`http://localhost:${first.port}/html/arrow-tuner?key=${key}`);
    const second = run(start, ['--project-dir', project, '--artifact', 'artboard/header']);
    expect(second.reused).toBe(true);
    expect(second.link).toBe(`http://localhost:${first.port}/artboard/header?key=${key}`);
    const third = run(start, ['--project-dir', project, '--artifact', 'document/relay-sync']);
    expect(third.link).toBe(`http://localhost:${first.port}/document/relay-sync?key=${key}`);
  });

  test('rejects an invalid artifact name', () => {
    expect(run(start, ['--project-dir', newProject(), '--artifact', 'slides/x']).error).toMatch(/--artifact must be/);
    expect(run(start, ['--project-dir', newProject(), '--artifact', 'html/../x']).error).toMatch(/--artifact must be/);
  });

  test('detects its running server even where ps has no -o option (Git Bash)', () => {
    const project = newProject();
    const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-ps-'));
    fs.writeFileSync(
      path.join(shim, 'ps'),
      '#!/bin/bash\nfor a in "$@"; do [[ "$a" == "-o" ]] && exit 1; done\nexec /bin/ps "$@"\n',
      { mode: 0o755 },
    );
    const env = { ...process.env, PATH: `${shim}:${process.env.PATH}`, ARTIFACTS_OPEN: '0' };
    const runWith = (script: string, args: string[]) =>
      JSON.parse(spawnSync('bash', [script, ...args], { encoding: 'utf8', env }).stdout.trim().split('\n').pop()!);
    const first = runWith(start, ['--project-dir', project]);
    const second = runWith(start, ['--project-dir', project]);
    expect(second.reused).toBe(true);
    expect(second.url).toBe(first.url);
    expect(runWith(stop, [project]).status).toBe('stopped');
  });

  test('rejects an unknown argument', () => {
    expect(run(start, ['--nope']).error).toMatch(/Unknown argument/);
  });
});

const STUBBORN_SERVER = [
  "const on = process.on.bind(process);",
  "on('SIGTERM', () => {});",
  "process.on = (event, listener) => (event === 'SIGTERM' ? process : on(event, listener));",
  "require('./real.cjs');",
].join(' ');

describe('start-server.sh without a local server build', () => {
  const version = '9.9.9';
  const DAY_MS = 24 * 60 * 60 * 1000;

  function installedCopy() {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-app-'));
    for (const file of ['start-server.sh', 'stop-server.sh']) fs.copyFileSync(path.join(scriptsDir, file), path.join(app, file));
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
    fs.writeFileSync(
      path.join(bin, 'npm'),
      [
        '#!/bin/bash',
        `echo "$*" >> ${JSON.stringify(log)}`,
        `if [[ "$1" == "view" ]]; then [[ -f ${JSON.stringify(offline)} ]] && exit 1; cat ${JSON.stringify(latest)}; exit 0; fi`,
        `[[ ${installExit} -eq 0 ]] || exit ${installExit}`,
        `[[ -f ${JSON.stringify(installFails)} ]] && exit 1`,
        'while [[ $# -gt 0 ]]; do [[ "$1" == "--prefix" ]] && prefix="$2"; shift; done',
        before,
        'dist="$prefix/node_modules/ryugi-artifacts/dist"',
        'mkdir -p "$dist"',
        `cp ${JSON.stringify(path.join(scriptsDir, 'server.cjs'))} "$dist/server.cjs"`,
        `cp -R ${JSON.stringify(path.join(scriptsDir, 'viewer'))} "$dist/viewer"`,
        `if [[ -f ${JSON.stringify(stubborn)} ]]; then mv "$dist/server.cjs" "$dist/real.cjs"; printf '%s' ${JSON.stringify(STUBBORN_SERVER)} > "$dist/server.cjs"; fi`,
      ].join('\n'),
      { mode: 0o755 },
    );
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

  function runIn(app: string, npmBin: string, cache: string, args: string[]) {
    const env = { ...process.env, PATH: `${npmBin}:${process.env.PATH}`, XDG_CACHE_HOME: cache, ARTIFACTS_OPEN: '0' };
    const result = spawnSync('bash', [path.join(app, path.basename(start)), ...args], { encoding: 'utf8', env, timeout: 15000 });
    return JSON.parse(result.stdout.trim().split('\n').pop()!);
  }

  const releases = (cache: string) => fs.readdirSync(path.join(cache, 'ryugi', 'artifacts')).filter((name) => name !== 'latest.json');

  function ageLatestCheck(cache: string, ms: number) {
    const file = path.join(cache, 'ryugi', 'artifacts', 'latest.json');
    const latest = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...latest, checkedAt: Date.now() - ms }));
  }

  test('installs the latest release once and runs its server', async () => {
    const app = installedCopy();
    const npm = fakeNpm();
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-cache-'));
    const project = newProject();

    const info = runIn(app, npm.bin, cache, ['--project-dir', project]);
    expect(info.type).toBe('server-started');
    expect((await get(info.url.replace('localhost', '127.0.0.1'), { Connection: 'close' })).status).toBe(200);
    expect(run(path.join(app, 'stop-server.sh'), [project]).status).toBe('stopped');

    fs.mkdirSync(path.join(project, '.ryugi', 'artifacts', 'document', 'relay'), { recursive: true });
    fs.writeFileSync(path.join(project, '.ryugi', 'artifacts', 'document', 'relay', 'doc.xml'), '<doc><p>one</p></doc>');
    const again = runIn(app, npm.bin, cache, ['--project-dir', project]);
    expect(again.type).toBe('server-started');
    const key = again.url.split('key=')[1];
    const state = await get(`http://127.0.0.1:${again.port}/api/document/relay/state?key=${key}`);
    expect(state.status).toBe(200);
    expect(npm.views()).toHaveLength(1);
    expect(npm.installs()).toHaveLength(1);
    expect(npm.installs()[0]).toContain(`ryugi-artifacts@${version}`);
  }, 30000);

  test('asks npm for the latest release again only after a day', () => {
    const app = installedCopy();
    const npm = fakeNpm();
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-cache-'));
    const project = newProject();
    expect(runIn(app, npm.bin, cache, ['--project-dir', project]).type).toBe('server-started');
    run(path.join(app, 'stop-server.sh'), [project]);

    npm.publish('9.9.10');
    ageLatestCheck(cache, DAY_MS - 60_000);
    expect(runIn(app, npm.bin, cache, ['--project-dir', project]).type).toBe('server-started');
    run(path.join(app, 'stop-server.sh'), [project]);
    expect(npm.views()).toHaveLength(1);

    ageLatestCheck(cache, DAY_MS + 60_000);
    expect(runIn(app, npm.bin, cache, ['--project-dir', project]).type).toBe('server-started');
    expect(npm.views()).toHaveLength(2);
    expect(npm.installs().at(-1)).toContain('ryugi-artifacts@9.9.10');
    expect(releases(cache).sort()).toEqual(['9.9.10', '9.9.9']);
  }, 30000);

  test('offline, it runs the newest release already installed', () => {
    const app = installedCopy();
    const npm = fakeNpm();
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-cache-'));
    const project = newProject();
    expect(runIn(app, npm.bin, cache, ['--project-dir', project]).type).toBe('server-started');
    run(path.join(app, 'stop-server.sh'), [project]);

    npm.goOffline();
    ageLatestCheck(cache, DAY_MS + 60_000);
    expect(runIn(app, npm.bin, cache, ['--project-dir', project]).type).toBe('server-started');
    expect(npm.installs()).toHaveLength(1);
  }, 30000);

  test('offline with nothing installed, it says the first start needs the network', () => {
    const npm = fakeNpm();
    npm.goOffline();
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-cache-'));
    const info = runIn(installedCopy(), npm.bin, cache, ['--project-dir', newProject()]);
    expect(info.error).toContain('ryugi-artifacts');
    expect(info.error).toMatch(/network access/);
    expect(npm.installs()).toHaveLength(0);
  });

  test('reuses a running server that is on the latest release', () => {
    const app = installedCopy();
    const npm = fakeNpm();
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-cache-'));
    const project = newProject();
    const first = runIn(app, npm.bin, cache, ['--project-dir', project]);
    const second = runIn(app, npm.bin, cache, ['--project-dir', project]);
    expect(second.reused).toBe(true);
    expect(second.url).toBe(first.url);
    run(path.join(app, 'stop-server.sh'), [project]);
  }, 30000);

  test('replaces a running server on an older release, keeping its link', () => {
    const app = installedCopy();
    const npm = fakeNpm();
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-cache-'));
    const project = newProject();
    const first = runIn(app, npm.bin, cache, ['--project-dir', project]);
    const oldPid = Number(fs.readFileSync(path.join(project, '.ryugi', 'artifacts', '.state', 'server.pid'), 'utf8'));

    npm.publish('9.9.10');
    ageLatestCheck(cache, DAY_MS + 60_000);
    const second = runIn(app, npm.bin, cache, ['--project-dir', project]);
    expect(second.type).toBe('server-started');
    expect(second.reused).toBeUndefined();
    expect(second.url).toBe(first.url);
    expect(() => process.kill(oldPid, 0)).toThrow();
    run(path.join(app, 'stop-server.sh'), [project]);
  }, 30000);

  test('offline, a failed check is not repeated on every start and gives up quickly', () => {
    const app = installedCopy();
    const npm = fakeNpm();
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-cache-'));
    const project = newProject();
    expect(runIn(app, npm.bin, cache, ['--project-dir', project]).type).toBe('server-started');
    run(path.join(app, 'stop-server.sh'), [project]);

    npm.goOffline();
    ageLatestCheck(cache, DAY_MS + 60_000);
    expect(runIn(app, npm.bin, cache, ['--project-dir', project]).type).toBe('server-started');
    run(path.join(app, 'stop-server.sh'), [project]);
    expect(runIn(app, npm.bin, cache, ['--project-dir', project]).type).toBe('server-started');
    expect(npm.views()).toHaveLength(2);
    expect(npm.views().at(-1)).toContain('--fetch-retries=0');
    run(path.join(app, 'stop-server.sh'), [project]);
  }, 30000);

  test('when the newest release will not install, it runs the one already installed', () => {
    const app = installedCopy();
    const npm = fakeNpm();
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-cache-'));
    const project = newProject();
    expect(runIn(app, npm.bin, cache, ['--project-dir', project]).type).toBe('server-started');
    run(path.join(app, 'stop-server.sh'), [project]);

    npm.publish('9.9.10');
    npm.failInstalls();
    ageLatestCheck(cache, DAY_MS + 60_000);
    expect(runIn(app, npm.bin, cache, ['--project-dir', project]).type).toBe('server-started');
    run(path.join(app, 'stop-server.sh'), [project]);
    expect(runIn(app, npm.bin, cache, ['--project-dir', project]).type).toBe('server-started');
    expect(npm.installs()).toHaveLength(2);
    expect(releases(cache)).toEqual([version]);
    run(path.join(app, 'stop-server.sh'), [project]);
  }, 30000);

  test('an old server that ignores SIGTERM is killed so the new one keeps the link', () => {
    const app = installedCopy();
    const npm = fakeNpm();
    npm.installStubbornServers();
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-cache-'));
    const project = newProject();
    const first = runIn(app, npm.bin, cache, ['--project-dir', project]);
    const oldPid = Number(fs.readFileSync(path.join(project, '.ryugi', 'artifacts', '.state', 'server.pid'), 'utf8'));

    npm.publish('9.9.10');
    ageLatestCheck(cache, DAY_MS + 60_000);
    const second = runIn(app, npm.bin, cache, ['--project-dir', project]);
    expect(second.type).toBe('server-started');
    expect(second.url).toBe(first.url);
    expect(() => process.kill(oldPid, 0)).toThrow();
    const newPid = Number(fs.readFileSync(path.join(project, '.ryugi', 'artifacts', '.state', 'server.pid'), 'utf8'));
    process.kill(newPid, 'SIGKILL');
  }, 30000);

  test('a foreground start that exits leaves another start’s lock alone', async () => {
    const app = installedCopy();
    const npm = fakeNpm();
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-cache-'));
    const project = newProject();
    const state = path.join(project, '.ryugi', 'artifacts', '.state');
    const env = { ...process.env, PATH: `${npm.bin}:${process.env.PATH}`, XDG_CACHE_HOME: cache, ARTIFACTS_OPEN: '0' };
    const child = spawn('bash', [path.join(app, 'start-server.sh'), '--project-dir', project, '--foreground'], { env });
    const exited = new Promise((resolve) => child.on('close', resolve));
    while (!fs.existsSync(path.join(state, 'server-info'))) await new Promise((resolve) => setTimeout(resolve, 50));
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.mkdirSync(path.join(state, 'start.lock'));
    process.kill(Number(fs.readFileSync(path.join(state, 'server.pid'), 'utf8')), 'SIGTERM');
    await exited;
    expect(fs.existsSync(path.join(state, 'start.lock'))).toBe(true);
  }, 30000);

  test('reports the release it could not install', () => {
    const npm = fakeNpm({ installExit: 1 });
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-cache-'));
    const info = runIn(installedCopy(), npm.bin, cache, ['--project-dir', newProject()]);
    expect(info.error).toContain(`ryugi-artifacts@${version}`);
    expect(info.error).toMatch(/network access/);
    expect(releases(cache)).toEqual([]);
  });

  test('keeps an install another start finished first', () => {
    const npm = fakeNpm({
      before: [
        'installed="${prefix%.install.*}/node_modules/ryugi-artifacts/dist"',
        'mkdir -p "$installed"',
        `cp ${JSON.stringify(path.join(scriptsDir, 'server.cjs'))} "$installed/server.cjs"`,
        `cp -R ${JSON.stringify(path.join(scriptsDir, 'viewer'))} "$installed/viewer"`,
        'touch "${prefix%.install.*}/first"',
      ].join('\n'),
    });
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-cache-'));
    expect(runIn(installedCopy(), npm.bin, cache, ['--project-dir', newProject()]).type).toBe('server-started');
    expect(releases(cache)).toEqual([version]);
    expect(fs.existsSync(path.join(cache, 'ryugi', 'artifacts', version, 'first'))).toBe(true);
  }, 30000);

  test('installs without holding the project start lock', async () => {
    const npm = fakeNpm({ before: 'sleep 2' });
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-cache-'));
    const project = newProject();
    const lock = path.join(project, '.ryugi', 'artifacts', '.state', 'start.lock');
    const env = { ...process.env, PATH: `${npm.bin}:${process.env.PATH}`, XDG_CACHE_HOME: cache };
    const child = spawn('bash', [path.join(installedCopy(), 'start-server.sh'), '--project-dir', project], { env });
    const done = new Promise((resolve) => child.on('close', resolve));
    while (npm.installs().length === 0) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fs.existsSync(lock)).toBe(false);
    await done;
  }, 30000);
});

describe('stop-server.sh', () => {
  test('stops the server and keeps the board directory', async () => {
    const project = newProject();
    const info = run(start, ['--project-dir', project]);
    expect(run(stop, [project]).status).toBe('stopped');
    await expect(get(info.url.replace('localhost', '127.0.0.1'))).rejects.toThrow();
    expect(fs.existsSync(path.join(project, '.ryugi', 'artifacts', '.state'))).toBe(true);
  });

  test('refuses to signal a pid that is not this board\'s server', () => {
    const project = newProject();
    const stateDir = path.join(project, '.ryugi', 'artifacts', '.state');
    fs.mkdirSync(stateDir, { recursive: true });
    const foreign = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
    try {
      fs.writeFileSync(path.join(stateDir, 'server.pid'), `${foreign.pid}\n`);
      fs.writeFileSync(path.join(stateDir, 'server-instance-id'), `${'a'.repeat(48)}\n`);
      expect(run(stop, [project]).status).toBe('stale_pid');
      expect(() => process.kill(foreign.pid!, 0)).not.toThrow();
    } finally {
      foreign.kill();
    }
  });

  test('reports not_running when nothing was started', () => {
    expect(run(stop, [newProject()]).status).toBe('not_running');
  });
});
