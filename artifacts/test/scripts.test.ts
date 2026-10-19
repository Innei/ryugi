import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { get } from './helpers';

const scriptsDir = path.resolve(__dirname, '../../skills/artifacts/app');
const start = path.join(scriptsDir, 'start-server.sh');
const stop = path.join(scriptsDir, 'stop-server.sh');

const run = (script: string, args: string[]) => {
  const result = spawnSync('bash', [script, ...args], { encoding: 'utf8', timeout: 15000 });
  return JSON.parse(result.stdout.trim().split('\n').pop()!);
};

let projects: string[] = [];

beforeAll(() => {
  if (!fs.existsSync(path.join(scriptsDir, 'server.cjs'))) {
    throw new Error('build the server first: pnpm build:server');
  }
});

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
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'artboard-project-'));
  projects.push(project);
  return project;
}

describe('start-server.sh', () => {
  test('starts a server for the project and prints its url', async () => {
    const project = newProject();
    const info = run(start, ['--project-dir', project]);
    expect(info.type).toBe('server-started');
    expect(info.dir).toBe(fs.realpathSync(path.join(project, '.ryugi', 'artboard')));
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

  test('detects its running server even where ps has no -o option (Git Bash)', () => {
    const project = newProject();
    const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'artboard-ps-'));
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

describe('stop-server.sh', () => {
  test('stops the server and keeps the board directory', async () => {
    const project = newProject();
    const info = run(start, ['--project-dir', project]);
    expect(run(stop, [project]).status).toBe('stopped');
    await expect(get(info.url.replace('localhost', '127.0.0.1'))).rejects.toThrow();
    expect(fs.existsSync(path.join(project, '.ryugi', 'artboard', 'state'))).toBe(true);
  });

  test('refuses to signal a pid that is not this board\'s server', () => {
    const project = newProject();
    const stateDir = path.join(project, '.ryugi', 'artboard', 'state');
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
