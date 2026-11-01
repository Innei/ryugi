import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { readText } from '../src/cli/process';
import { AGENT_MARKERS } from '../src/server/agent';
import { machinePaths, readProjects } from '../src/server/machine';
import { registryDir, writeEntry } from '../src/server/registry';
import { closeAll, fakeCloud } from './fake-cloud';
import { get, waitFor } from './helpers';

const cli = path.resolve(__dirname, '../../skills/artifacts/app/cli.cjs');

const withoutAgent = () =>
  Object.fromEntries(Object.entries(process.env).filter(([key]) => !AGENT_MARKERS.includes(key)));

let isolation: NodeJS.ProcessEnv = {};

beforeEach(() => {
  isolation = {
    RYUGI_SERVER_HOME: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-home-')), 's'),
    RYUGI_RUNTIME_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-runtime-')),
    RYUGI_ARTIFACTS_PORTS: '0',
    RYUGI_ARTIFACTS_BOARD_PORTS: '0',
    RYUGI_NO_UPDATE_CHECK: '1',
  };
});

afterEach(async () => {
  await closeAll();
  spawnSync(process.execPath, [cli, 'stop'], {
    timeout: 15000,
    env: { ...process.env, ...isolation },
  });
});

const baseEnv = (env: NodeJS.ProcessEnv = {}) => ({
  ...withoutAgent(),
  ARTIFACTS_OPEN: '0',
  ...isolation,
  ...env,
});

const run = (args: string[], env: NodeJS.ProcessEnv = {}) => {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    timeout: 20000,
    env: baseEnv(env),
  });
  return { code: result.status, out: JSON.parse(result.stdout.trim().split('\n').pop()!) };
};

const runAsync = (args: string[], env: NodeJS.ProcessEnv = {}) =>
  new Promise<{ out: any }>((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], { env: baseEnv(env) });
    let stdout = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.on('close', () => resolve({ out: JSON.parse(stdout.trim().split('\n').pop()!) }));
  });

const machine = () => machinePaths(isolation);
const serverPid = () => Number(fs.readFileSync(machine().pid, 'utf8'));

function newProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-project-'));
}

const stateOf = (project: string) => path.join(project, '.ryugi', 'artifacts', '.state');

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });

function writeReadyArtboard(project: string, id: string) {
  const artboard = path.join(project, '.ryugi', 'artifacts', 'artboard', id);
  fs.mkdirSync(path.join(artboard, 'pages', 'p'), { recursive: true });
  fs.writeFileSync(path.join(artboard, 'pages', 'p', 'a.html'), '<p>ready</p>');
  fs.writeFileSync(
    path.join(artboard, 'canvas.json'),
    JSON.stringify({
      version: 1,
      pages: [{ id: 'p', name: 'P' }],
      boards: { a: { file: 'pages/p/a.html', page: 'p', x: 0, y: 0, w: 640, h: 400 } },
    }),
  );
}

function openRecorder() {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-open-bin-'));
  const log = path.join(bin, 'opened.log');
  const open = path.join(bin, 'open');
  fs.writeFileSync(open, `#!/bin/sh\nprintf '%s\\n' "$1" >> ${JSON.stringify(log)}\n`, {
    mode: 0o755,
  });
  return { log, open };
}

describe('ryugi-artifacts start', () => {
  test('starts the machine server, registers the project and prints its url as one JSON line', async () => {
    const project = newProject();
    const { code, out } = run(['start', '--project-dir', project]);
    expect(code).toBe(0);
    expect(out.type).toBe('server-started');
    expect(out.root).toBe(fs.realpathSync(path.join(project, '.ryugi', 'artifacts')));
    expect(out.url).toMatch(/^http:\/\/localhost:\d+\/$/);
    expect((await get(out.url.replace('localhost', '127.0.0.1'))).status).toBe(200);
    expect(readProjects(machine().projects).map((entry) => entry.dir)).toEqual([
      fs.realpathSync(project),
    ]);
    expect(fs.statSync(machine().info).mode & 0o077).toBe(0);
    expect(
      JSON.parse(fs.readFileSync(path.join(stateOf(project), 'server-info'), 'utf8')).url,
    ).toBe(out.url);
  }, 30000);

  test('two projects share one server process and one port', () => {
    const one = newProject();
    const two = newProject();
    const first = run(['start', '--project-dir', one, '--artifact', 'html/a']).out;
    const pid = serverPid();
    const second = run(['start', '--project-dir', two, '--artifact', 'html/b']).out;
    expect(second.reused).toBe(true);
    expect(second.port).toBe(first.port);
    expect(serverPid()).toBe(pid);
    expect(second.root).toBe(fs.realpathSync(path.join(two, '.ryugi', 'artifacts')));
    expect(readProjects(machine().projects)).toHaveLength(2);
  }, 30000);

  test('records the agent of each start, and a start outside any agent keeps the last one', () => {
    const project = newProject();
    const agentFile = path.join(stateOf(project), 'agent');
    run(['start', '--project-dir', project], {
      AI_AGENT: 'claude-code_2-1-304_agent',
      CLAUDECODE: '1',
    });
    expect(JSON.parse(fs.readFileSync(agentFile, 'utf8'))).toEqual({
      AI_AGENT: 'claude-code_2-1-304_agent',
      CLAUDECODE: '1',
    });
    expect(run(['start', '--project-dir', project], { CODEX_THREAD_ID: 't1' }).out.reused).toBe(
      true,
    );
    expect(JSON.parse(fs.readFileSync(agentFile, 'utf8'))).toEqual({ CODEX_THREAD_ID: 't1' });
    run(['start', '--project-dir', project]);
    expect(JSON.parse(fs.readFileSync(agentFile, 'utf8'))).toEqual({ CODEX_THREAD_ID: 't1' });
  }, 30000);

  test('a start from a subdirectory of the repository registers the root', () => {
    const project = newProject();
    fs.mkdirSync(path.join(project, '.git'));
    fs.mkdirSync(path.join(project, 'packages', 'app'), { recursive: true });
    const first = run(['start', '--project-dir', project]).out;
    const second = run(['start', '--project-dir', path.join(project, 'packages', 'app')]).out;
    expect(second.url).toBe(first.url);
    expect(second.reused).toBe(true);
    expect(second.root).toBe(fs.realpathSync(path.join(project, '.ryugi', 'artifacts')));
  }, 30000);

  test('the skill launcher resolves a subdirectory to the repository root', () => {
    const project = newProject();
    fs.mkdirSync(path.join(project, '.git'));
    fs.mkdirSync(path.join(project, 'packages', 'app'), { recursive: true });
    const launcher = path.resolve(__dirname, '../../skills/artifacts/app/ryugi-artifacts.cjs');
    const result = spawnSync(
      process.execPath,
      [launcher, 'start', '--json', '--project-dir', path.join(project, 'packages', 'app')],
      { encoding: 'utf8', timeout: 20000, env: baseEnv() },
    );
    expect(JSON.parse(result.stdout.trim().split('\n').pop()!).root).toBe(
      fs.realpathSync(path.join(project, '.ryugi', 'artifacts')),
    );
  }, 30000);

  test('a start stops servers of the old per-project kind', async () => {
    const project = newProject();
    const id = 'b'.repeat(48);
    const old = spawn(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)', `--artifacts-server-id=${id}`],
      { stdio: 'ignore' },
    );
    const real = fs.realpathSync(project);
    writeEntry(registryDir(isolation), {
      project: real,
      root: path.join(real, '.ryugi', 'artifacts'),
      pid: old.pid!,
      serverId: id,
      startedAt: 1,
    });
    run(['start', '--project-dir', project]);
    await waitFor(() => {
      try {
        process.kill(old.pid!, 0);
        return false;
      } catch {
        return true;
      }
    }, 5000);
  }, 30000);

  test('concurrent starts share one server that stop then stops', async () => {
    const [a, b] = await Promise.all([
      runAsync(['start', '--project-dir', newProject()]),
      runAsync(['start', '--project-dir', newProject()]),
    ]);
    expect(a.out.port).toBe(b.out.port);
    const pid = serverPid();
    expect(run(['stop']).out.status).toBe('stopped');
    expect(() => process.kill(pid, 0)).toThrow();
  }, 30000);

  test('opens the requested artifact once it is ready, by default', async () => {
    const project = newProject();
    writeReadyArtboard(project, 'header');
    const { log, open } = openRecorder();
    const { out } = await runAsync(
      ['start', '--project-dir', project, '--artifact', 'artboard/header'],
      { ARTIFACTS_OPEN: '1', ARTIFACTS_OPEN_CMD: open },
    );
    expect(out.type).toBe('server-started');
    await waitFor(() => fs.existsSync(log), 5000);
    expect(fs.readFileSync(log, 'utf8')).toMatch(/\/artboard\/[A-Za-z0-9]{21}(\s|$)/);
  }, 20000);

  test('a second project on a running server still opens its artifact', async () => {
    run(['start', '--project-dir', newProject()]);
    const project = newProject();
    writeReadyArtboard(project, 'header');
    const { log, open } = openRecorder();
    const { out } = await runAsync(
      ['start', '--project-dir', project, '--artifact', 'artboard/header'],
      { ARTIFACTS_OPEN: '1', ARTIFACTS_OPEN_CMD: open },
    );
    expect(out.reused).toBe(true);
    await waitFor(() => fs.existsSync(log), 5000);
  }, 20000);

  test('prints a link for an artifact, on start and on reuse', () => {
    const project = newProject();
    const first = run(['start', '--project-dir', project, '--artifact', 'html/arrow-tuner']).out;
    expect(new URL(first.link).pathname).toMatch(/^\/html\/[A-Za-z0-9]{21}$/);
    expect(new URL(first.link).searchParams.has('key')).toBe(false);
    expect(
      run(['start', '--project-dir', project, '--artifact', 'html/arrow-tuner']).out.link,
    ).toBe(first.link);
    const second = run(['start', '--project-dir', project, '--artifact', 'artboard/header']).out;
    expect(second.reused).toBe(true);
    expect(new URL(second.link).pathname).toMatch(/^\/artboard\/[A-Za-z0-9]{21}$/);
    expect(new URL(second.link).origin).toBe(`http://localhost:${first.port}`);
  }, 30000);

  test('rejects an invalid artifact name, port and unknown arguments with exit code 1', () => {
    const bad = run(['start', '--project-dir', newProject(), '--artifact', 'html/../x']);
    expect(bad.code).toBe(1);
    expect(bad.out.error).toMatch(/--artifact must be/);
    expect(run(['start', '--project-dir', newProject(), '--port', 'x']).out.error).toMatch(
      /--port/,
    );
    const unknown = run(['start', '--nope']);
    expect(unknown.code).toBe(1);
    expect(unknown.out.error).toMatch(/Unknown argument/);
  });

  test('detects its running server even where ps has no -o option', () => {
    const project = newProject();
    const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-ps-'));
    fs.writeFileSync(
      path.join(shim, 'ps'),
      '#!/bin/bash\nfor a in "$@"; do [[ "$a" == "-o" ]] && exit 1; done\nexec /bin/ps "$@"\n',
      { mode: 0o755 },
    );
    const env = { PATH: `${shim}:${process.env.PATH}` };
    const first = run(['start', '--project-dir', project], env).out;
    const second = run(['start', '--project-dir', project], env).out;
    expect(second.reused).toBe(true);
    expect(second.url).toBe(first.url);
    expect(run(['stop'], env).out.status).toBe('stopped');
  }, 30000);

  test('a restart from the home page comes back on the same port without marking a stop', async () => {
    const port = await freePort();
    isolation.RYUGI_ARTIFACTS_PORTS = String(port);
    const project = newProject();
    run(['start', '--project-dir', project]);
    const oldPid = serverPid();
    const res = await fetch(`http://127.0.0.1:${port}/api/hub/restart`, { method: 'POST' });
    expect(res.status).toBe(202);
    const newPid = () => {
      try {
        return serverPid();
      } catch {
        return oldPid;
      }
    };
    await waitFor(() => newPid() !== oldPid, 15000);
    let status = 0;
    for (let tries = 0; tries < 50 && status !== 200; tries++) {
      status = await get(`http://127.0.0.1:${port}/api/status`)
        .then((r) => r.status)
        .catch(() => 0);
      if (status !== 200) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(status).toBe(200);
    expect(fs.existsSync(machine().stopped)).toBe(false);
    expect(() => process.kill(oldPid, 0)).toThrow();
  }, 40000);

  test('a start while the server is shutting down waits for it instead of starting a second one', async () => {
    const first = await freePort();
    const second = await freePort();
    isolation.RYUGI_ARTIFACTS_PORTS = `${first},${second}`;
    const project = newProject();
    run(['start', '--project-dir', project]);
    const oldPid = serverPid();
    fs.rmSync(machine().info);
    const again = run(['start', '--project-dir', project]).out;
    expect(again.port).toBe(first);
    expect(() => process.kill(oldPid, 0)).toThrow();
  }, 40000);

  test('upgrade from the home page relaunches through the launcher with the newer release', async () => {
    const port = await freePort();
    isolation.RYUGI_ARTIFACTS_PORTS = String(port);
    isolation.XDG_CACHE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-cache-'));
    fs.mkdirSync(isolation.RYUGI_SERVER_HOME!, { recursive: true });
    fs.writeFileSync(
      path.join(isolation.RYUGI_SERVER_HOME!, 'latest.json'),
      JSON.stringify({ version: '99.0.0', checkedAt: Date.now() }),
    );
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-launcher-'));
    const launched = path.join(bin, 'launched');
    const launcher = path.join(bin, 'launcher.cjs');
    fs.writeFileSync(
      launcher,
      `const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const pinned = JSON.parse(fs.readFileSync(path.join(process.env.XDG_CACHE_HOME, 'ryugi', 'artifacts', 'latest.json'), 'utf8')).version;
fs.appendFileSync(${JSON.stringify(launched)}, pinned + '\\n');
const r = spawnSync(process.execPath, [${JSON.stringify(cli)}, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, RYUGI_ARTIFACTS_VERSION: pinned, RYUGI_ARTIFACTS_COMMAND: 'node "' + __filename + '"' },
});
process.exitCode = r.status ?? 1;
`,
    );
    const project = newProject();
    run(['start', '--project-dir', project], {
      RYUGI_ARTIFACTS_COMMAND: `node "${launcher}"`,
      RYUGI_ARTIFACTS_VERSION: '1.50.0',
    });
    const oldPid = serverPid();
    const res = await fetch(`http://127.0.0.1:${port}/api/hub/upgrade`, { method: 'POST' });
    expect(res.status).toBe(202);
    await waitFor(() => fs.existsSync(launched), 15000);
    await waitFor(() => (readText(machine().version) ?? '') === '99.0.0', 15000);
    expect(fs.readFileSync(launched, 'utf8').trim()).toBe('99.0.0');
    expect(serverPid()).not.toBe(oldPid);
  }, 40000);

  test('only a newer release replaces the running server, which comes back on the same port', async () => {
    isolation.RYUGI_ARTIFACTS_PORTS = String(await freePort());
    const project = newProject();
    const first = run(['start', '--project-dir', project], {
      RYUGI_ARTIFACTS_VERSION: '9.9.8',
    }).out;
    const oldPid = serverPid();
    const older = run(['start', '--project-dir', project], { RYUGI_ARTIFACTS_VERSION: '9.9.7' });
    expect(older.out.reused).toBe(true);
    expect(older.out.hint).toMatch(/9\.9\.8/);
    expect(serverPid()).toBe(oldPid);
    const newer = run(['start', '--project-dir', project], {
      RYUGI_ARTIFACTS_VERSION: '9.9.9',
    }).out;
    expect(newer.reused).toBeUndefined();
    expect(newer.url).toBe(first.url);
    expect(() => process.kill(oldPid, 0)).toThrow();
  }, 40000);

  test('a start with another host replaces the running server', () => {
    const project = newProject();
    run(['start', '--project-dir', project]);
    const oldPid = serverPid();
    const replaced = run(['start', '--project-dir', project, '--url-host', '127.0.0.1']).out;
    expect(replaced.reused).toBeUndefined();
    expect(replaced.url).toMatch(/^http:\/\/127\.0\.0\.1:/);
    expect(() => process.kill(oldPid, 0)).toThrow();
  }, 30000);

  test('a hung server is replaced', () => {
    const project = newProject();
    run(['start', '--project-dir', project]);
    const pid = serverPid();
    process.kill(pid, 'SIGSTOP');
    try {
      const out = run(['start', '--project-dir', project]).out;
      expect(out.type).toBe('server-started');
      expect(out.reused).toBeUndefined();
      expect(serverPid()).not.toBe(pid);
    } finally {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
  }, 40000);

  test('a foreground start passes the server through and stops with it', async () => {
    const project = newProject();
    const child = spawn(
      process.execPath,
      [cli, 'start', '--project-dir', project, '--foreground', '--artifact', 'html/x'],
      { env: baseEnv() },
    );
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    const exited = new Promise((resolve) => child.on('close', resolve));
    await waitFor(() => out.includes('"link"'), 10000);
    const started = out
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .find((line) => line.link);
    expect(started.link).toMatch(/\/html\/[A-Za-z0-9]{21}$/);
    process.kill(serverPid(), 'SIGTERM');
    await exited;
  }, 30000);
});

describe('ryugi-artifacts stop', () => {
  test('stops the server, keeps the state directories and clears every server-info', async () => {
    const project = newProject();
    const info = run(['start', '--project-dir', project]).out;
    expect(run(['stop']).out.status).toBe('stopped');
    await expect(get(info.url.replace('localhost', '127.0.0.1'))).rejects.toThrow();
    expect(fs.existsSync(stateOf(project))).toBe(true);
    expect(fs.existsSync(path.join(stateOf(project), 'server-info'))).toBe(false);
    expect(fs.existsSync(machine().info)).toBe(false);
    expect(JSON.parse(fs.readFileSync(machine().stopped, 'utf8')).reason).toBe('stop');
  }, 30000);

  test('accepts and ignores --project-dir', () => {
    run(['start', '--project-dir', newProject()]);
    expect(run(['stop', '--project-dir', newProject()]).out.status).toBe('stopped');
  }, 30000);

  test('refuses to signal a pid that is not the server', () => {
    fs.mkdirSync(machine().home, { recursive: true });
    const foreign = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
    try {
      fs.writeFileSync(machine().pid, `${foreign.pid}\n`);
      fs.writeFileSync(machine().serverId, `${'a'.repeat(48)}\n`);
      expect(run(['stop']).out.status).toBe('stale_pid');
      expect(() => process.kill(foreign.pid!, 0)).not.toThrow();
    } finally {
      foreign.kill();
    }
  });

  test('reports not_running when nothing was started', () => {
    expect(run(['stop']).out.status).toBe('not_running');
  });
});

describe('cloud link on start', () => {
  async function signedIn() {
    const cloud = await fakeCloud();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-home-'));
    fs.mkdirSync(path.join(home, 'ryugi'));
    fs.writeFileSync(
      path.join(home, 'ryugi', 'credentials.json'),
      JSON.stringify({ origin: cloud.origin, token: 'tok', login: 'innei' }),
    );
    fs.writeFileSync(
      path.join(home, 'ryugi', 'config.json'),
      JSON.stringify({ autoPublish: true }),
    );
    return { cloud, env: { RYUGI_CLOUD_ORIGIN: cloud.origin, XDG_CONFIG_HOME: home } };
  }

  test('in Claude Code with auto-publish on, start reserves the cloud link and prints it', async () => {
    const { cloud, env } = await signedIn();
    const project = newProject();
    const { out } = await runAsync(
      ['start', '--project-dir', project, '--artifact', 'html/arrow'],
      { ...env, CLAUDECODE: '1' },
    );
    expect(out.link).toMatch(/\/html\/[A-Za-z0-9]{21}$/);
    expect(out.cloudLink).toBe(`${cloud.origin}/a/cloud1`);
    expect(
      JSON.parse(fs.readFileSync(path.join(project, '.ryugi', 'config.json'), 'utf8')).artifacts[
        'html/arrow'
      ].cloud.url,
    ).toBe(`${cloud.origin}/a/cloud1`);
    expect(
      (
        await runAsync(['start', '--project-dir', project, '--artifact', 'html/arrow'], {
          ...env,
          CLAUDECODE: '1',
        })
      ).out,
    ).toMatchObject({ reused: true, cloudLink: `${cloud.origin}/a/cloud1` });
    expect(cloud.requests.filter((r) => r.path === '/api/artifacts')).toHaveLength(1);
  }, 30000);

  test('the cloud link is reserved in the project the start names, even with a shared slug', async () => {
    const { cloud, env } = await signedIn();
    const one = newProject();
    const two = newProject();
    await runAsync(['start', '--project-dir', one, '--artifact', 'html/arrow'], env);
    await runAsync(['start', '--project-dir', two, '--artifact', 'html/arrow'], env);
    const configOf = (project: string) =>
      JSON.parse(fs.readFileSync(path.join(project, '.ryugi', 'config.json'), 'utf8'));
    expect(configOf(one).artifacts['html/arrow'].cloud.id).not.toBe(
      configOf(two).artifacts['html/arrow'].cloud.id,
    );
    expect(cloud.requests.filter((r) => r.path === '/api/artifacts')).toHaveLength(2);
  }, 30000);

  test('in Claude Code, a plan limit prints the upgrade link instead of a cloud link', async () => {
    const { cloud, env } = await signedIn();
    cloud.respond = (r) =>
      r.method === 'POST' && r.path === '/api/artifacts'
        ? {
            status: 402,
            body: {
              error:
                'The free plan allows 5 private artifacts and you have 5. Upgrade to Pro for 500.',
              code: 'plan_limit',
              plan: 'free',
              limit: { kind: 'private', used: 5, max: 5 },
              upgradeUrl: 'https://cloud.example/billing',
            },
          }
        : undefined;
    const { out } = await runAsync(
      ['start', '--project-dir', newProject(), '--artifact', 'html/arrow'],
      { ...env, CLAUDECODE: '1' },
    );
    expect(out.cloudLink).toBeUndefined();
    expect(out.cloudLimit).toEqual({
      message: 'The free plan allows 5 private artifacts and you have 5. Upgrade to Pro for 500.',
      upgradeUrl: 'https://cloud.example/billing',
    });
  }, 30000);

  test('auto-publish off does not reserve a cloud link', async () => {
    const { cloud, env } = await signedIn();
    fs.writeFileSync(
      path.join(env.XDG_CONFIG_HOME, 'ryugi', 'config.json'),
      JSON.stringify({ autoPublish: false }),
    );
    const { out } = await runAsync(
      ['start', '--project-dir', newProject(), '--artifact', 'html/arrow'],
      { ...env, CODEX_THREAD_ID: 'canvas-discussion' },
    );
    expect(out.cloudLink).toBeUndefined();
    expect(cloud.requests).toEqual([]);
  }, 30000);

  test('terminal output prefers the reserved cloud link', async () => {
    const { cloud, env } = await signedIn();
    const project = newProject();
    const output = await new Promise<string>((resolve, reject) => {
      const script = `process.stdout.isTTY = true; process.argv.splice(1, 0, ${JSON.stringify(cli)}); require(${JSON.stringify(cli)});`;
      const child = spawn(
        process.execPath,
        ['-e', script, 'start', '--project-dir', project, '--artifact', 'html/arrow'],
        { env: baseEnv(env) },
      );
      let stdout = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve(stdout) : reject(new Error(stdout))));
    });
    expect(output.trim()).toBe(`${cloud.origin}/a/cloud1`);
  }, 30000);

  test('the browser opens the cloud link with this computer marked, once the artifact is ready', async () => {
    const { cloud, env } = await signedIn();
    const project = newProject();
    const { log, open } = openRecorder();
    const { out } = await runAsync(
      ['start', '--project-dir', project, '--artifact', 'artboard/header'],
      { ...env, CLAUDECODE: '1', ARTIFACTS_OPEN: '1', ARTIFACTS_OPEN_CMD: open },
    );
    expect(out.cloudLink).toBe(`${cloud.origin}/a/cloud1`);
    writeReadyArtboard(project, 'header');
    await waitFor(() => fs.existsSync(log), 8000);
    const hostId = fs
      .readFileSync(path.join(env.XDG_CONFIG_HOME, 'ryugi', 'host-id'), 'utf8')
      .trim();
    expect(fs.readFileSync(log, 'utf8').trim()).toBe(
      `${cloud.origin}/a/cloud1#ryugi-host=${hostId}`,
    );
  }, 20000);
});
