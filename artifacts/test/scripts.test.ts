import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { get } from './helpers';

const scriptsDir = path.resolve(__dirname, '../../skills/artifacts/app');
const start = path.join(scriptsDir, 'start-server.sh');
const stop = path.join(scriptsDir, 'stop-server.sh');

const run = (script: string, args: string[]) => {
  const result = spawnSync('bash', [script, ...args], { encoding: 'utf8', timeout: 15000 });
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
        const child = spawn('bash', [start, '--project-dir', project]);
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
    const env = { ...process.env, PATH: `${shim}:${process.env.PATH}` };
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

describe('start-server.sh without a local server build', () => {
  const version = '9.9.9';

  function installedCopy() {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-app-'));
    for (const file of ['start-server.sh', 'stop-server.sh']) fs.copyFileSync(path.join(scriptsDir, file), path.join(app, file));
    fs.writeFileSync(path.join(app, 'version.json'), JSON.stringify({ version }));
    return app;
  }

  function fakeNpm({ exitCode = 0, before = '' } = {}) {
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-npm-'));
    const log = path.join(bin, 'calls.log');
    fs.writeFileSync(
      path.join(bin, 'npm'),
      [
        '#!/bin/bash',
        `echo "$*" >> ${JSON.stringify(log)}`,
        `[[ ${exitCode} -eq 0 ]] || exit ${exitCode}`,
        'while [[ $# -gt 0 ]]; do [[ "$1" == "--prefix" ]] && prefix="$2"; shift; done',
        before,
        'dist="$prefix/node_modules/ryugi-artifacts/dist"',
        'mkdir -p "$dist"',
        `cp ${JSON.stringify(path.join(scriptsDir, 'server.cjs'))} "$dist/server.cjs"`,
        `cp -R ${JSON.stringify(path.join(scriptsDir, 'viewer'))} "$dist/viewer"`,
      ].join('\n'),
      { mode: 0o755 },
    );
    return { bin, calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []) };
  }

  function runIn(app: string, npmBin: string, cache: string, args: string[]) {
    const env = { ...process.env, PATH: `${npmBin}:${process.env.PATH}`, XDG_CACHE_HOME: cache };
    const result = spawnSync('bash', [path.join(app, path.basename(start)), ...args], { encoding: 'utf8', env, timeout: 15000 });
    return JSON.parse(result.stdout.trim().split('\n').pop()!);
  }

  test('installs the pinned release once and runs its server', async () => {
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
    expect(npm.calls()).toHaveLength(1);
    expect(npm.calls()[0]).toContain(`ryugi-artifacts@${version}`);
  }, 30000);

  test('reports the release it could not install', () => {
    const npm = fakeNpm({ exitCode: 1 });
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-cache-'));
    const info = runIn(installedCopy(), npm.bin, cache, ['--project-dir', newProject()]);
    expect(info.error).toContain(`ryugi-artifacts@${version}`);
    expect(info.error).toMatch(/network access/);
    expect(fs.readdirSync(path.join(cache, 'ryugi', 'artifacts'))).toEqual([]);
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
    expect(fs.readdirSync(path.join(cache, 'ryugi', 'artifacts'))).toEqual([version]);
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
    while (npm.calls().length === 0) await new Promise((resolve) => setTimeout(resolve, 50));
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
