import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { AGENT_MARKERS } from '../src/server/agent';
import { closeAll, fakeCloud } from './fake-cloud';
import { get, waitFor } from './helpers';

const cli = path.resolve(__dirname, '../../skills/artifacts/app/cli.cjs');

const withoutAgent = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !AGENT_MARKERS.includes(key)));

const run = (args: string[], env: NodeJS.ProcessEnv = {}) => {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    timeout: 15000,
    env: { ...withoutAgent(), ARTIFACTS_OPEN: '0', ...env },
  });
  return { code: result.status, out: JSON.parse(result.stdout.trim().split('\n').pop()!) };
};

let projects: string[] = [];

afterEach(async () => {
  await closeAll();
  for (const project of projects) spawnSync(process.execPath, [cli, 'stop', '--project-dir', project], { timeout: 15000 });
  projects = [];
});

function newProject() {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-project-'));
  projects.push(project);
  return project;
}

const stateOf = (project: string) => path.join(project, '.ryugi', 'artifacts', '.state');

describe('ryugi-artifacts start', () => {
  test('starts a server for the project and prints its url as one JSON line', async () => {
    const project = newProject();
    const { code, out } = run(['start', '--project-dir', project]);
    expect(code).toBe(0);
    expect(out.type).toBe('server-started');
    expect(out.root).toBe(fs.realpathSync(path.join(project, '.ryugi', 'artifacts')));
    expect(out.url).toMatch(/^http:\/\/localhost:\d+\/\?key=/);
    expect((await get(out.url.replace('localhost', '127.0.0.1'))).status).toBe(200);
    expect((fs.statSync(path.join(stateOf(project), 'server-info')).mode & 0o077)).toBe(0);
  });

  test('records the agent of each start, and a start outside any agent keeps the last one', () => {
    const project = newProject();
    const agentFile = path.join(stateOf(project), 'agent');
    run(['start', '--project-dir', project], { AI_AGENT: 'claude-code_2-1-304_agent', CLAUDECODE: '1' });
    expect(JSON.parse(fs.readFileSync(agentFile, 'utf8'))).toEqual({ AI_AGENT: 'claude-code_2-1-304_agent', CLAUDECODE: '1' });
    expect(run(['start', '--project-dir', project], { CODEX_THREAD_ID: 't1' }).out.reused).toBe(true);
    expect(JSON.parse(fs.readFileSync(agentFile, 'utf8'))).toEqual({ CODEX_THREAD_ID: 't1' });
    run(['start', '--project-dir', project]);
    expect(JSON.parse(fs.readFileSync(agentFile, 'utf8'))).toEqual({ CODEX_THREAD_ID: 't1' });
  }, 30000);

  test('reuses the running server for the same project', () => {
    const project = newProject();
    const first = run(['start', '--project-dir', project]).out;
    const second = run(['start', '--project-dir', project]).out;
    expect(second.url).toBe(first.url);
    expect(second.reused).toBe(true);
  }, 30000);

  test('concurrent starts share one server that stop then stops', async () => {
    const project = newProject();
    const runAsync = () =>
      new Promise<{ port: number }>((resolve) => {
        const child = spawn(process.execPath, [cli, 'start', '--project-dir', project], { env: { ...process.env, ARTIFACTS_OPEN: '0' } });
        let out = '';
        child.stdout.on('data', (chunk) => (out += chunk));
        child.on('close', () => resolve(JSON.parse(out.trim().split('\n').pop()!)));
      });
    const [a, b] = await Promise.all([runAsync(), runAsync()]);
    expect(a.port).toBe(b.port);
    const pid = Number(fs.readFileSync(path.join(stateOf(project), 'server.pid'), 'utf8'));
    expect(run(['stop', '--project-dir', project]).out.status).toBe('stopped');
    expect(() => process.kill(pid, 0)).toThrow();
  }, 30000);

  test('registers the owner once, keeps live owners and drops dead ones', () => {
    const project = newProject();
    const owners = path.join(stateOf(project), 'owners');
    fs.mkdirSync(path.dirname(owners), { recursive: true });
    fs.writeFileSync(owners, `2147483646\n${process.pid}\n`);
    run(['start', '--project-dir', project], { RYUGI_ARTIFACTS_OWNER: String(process.ppid) });
    run(['start', '--project-dir', project], { RYUGI_ARTIFACTS_OWNER: String(process.ppid) });
    const lines = fs.readFileSync(owners, 'utf8').trim().split('\n');
    expect(lines.sort()).toEqual([String(process.pid), String(process.ppid)].sort());
  }, 30000);

  test('opens the requested artifact once it is ready, by default', async () => {
    const project = newProject();
    const artboard = path.join(project, '.ryugi', 'artifacts', 'artboard', 'header');
    fs.mkdirSync(path.join(artboard, 'pages', 'p'), { recursive: true });
    fs.writeFileSync(path.join(artboard, 'canvas.json'), JSON.stringify({ version: 1, pages: [{ id: 'p', name: 'P' }], boards: { a: { file: 'pages/p/a.html', page: 'p', x: 0, y: 0, w: 640, h: 400 } } }));
    fs.writeFileSync(path.join(artboard, 'pages', 'p', 'a.html'), '<p>ready</p>');
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-open-bin-'));
    const log = path.join(bin, 'opened.log');
    const open = path.join(bin, 'open');
    fs.writeFileSync(open, `#!/bin/sh\nprintf '%s\\n' "$1" >> ${JSON.stringify(log)}\n`, { mode: 0o755 });
    const env: NodeJS.ProcessEnv = { ...process.env, ARTIFACTS_OPEN_CMD: open };
    delete env.ARTIFACTS_OPEN;
    const result = spawnSync(process.execPath, [cli, 'start', '--project-dir', project, '--artifact', 'artboard/header'], { encoding: 'utf8', env, timeout: 15000 });
    expect(JSON.parse(result.stdout.trim().split('\n').pop()!).type).toBe('server-started');
    await waitFor(() => fs.existsSync(log), 5000);
    expect(fs.readFileSync(log, 'utf8')).toMatch(/\/artboard\/[a-f0-9]{32}\?key=/);
  }, 15000);

  test('prints a link for an artifact, on start and on reuse', () => {
    const project = newProject();
    const first = run(['start', '--project-dir', project, '--artifact', 'html/arrow-tuner']).out;
    const key = first.url.split('key=')[1];
    expect(new URL(first.link).pathname).toMatch(/^\/html\/[a-f0-9]{32}$/);
    expect(new URL(first.link).searchParams.get('key')).toBe(key);
    expect(run(['start', '--project-dir', project, '--artifact', 'html/arrow-tuner']).out.link).toBe(first.link);
    const second = run(['start', '--project-dir', project, '--artifact', 'artboard/header']).out;
    expect(second.reused).toBe(true);
    expect(new URL(second.link).pathname).toMatch(/^\/artboard\/[a-f0-9]{32}$/);
    expect(new URL(second.link).origin).toBe(`http://localhost:${first.port}`);
    expect(new URL(second.link).searchParams.get('key')).toBe(key);
  }, 30000);

  test('rejects an invalid artifact name and unknown arguments with exit code 1', () => {
    const bad = run(['start', '--project-dir', newProject(), '--artifact', 'html/../x']);
    expect(bad.code).toBe(1);
    expect(bad.out.error).toMatch(/--artifact must be/);
    expect(run(['start', '--project-dir', newProject(), '--artifact', 'slides/x']).out.error).toMatch(/--artifact must be/);
    const unknown = run(['start', '--nope']);
    expect(unknown.code).toBe(1);
    expect(unknown.out.error).toMatch(/Unknown argument/);
  });

  test('detects its running server even where ps has no -o option', () => {
    const project = newProject();
    const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-ps-'));
    fs.writeFileSync(path.join(shim, 'ps'), '#!/bin/bash\nfor a in "$@"; do [[ "$a" == "-o" ]] && exit 1; done\nexec /bin/ps "$@"\n', { mode: 0o755 });
    const env = { PATH: `${shim}:${process.env.PATH}` };
    const first = run(['start', '--project-dir', project], env).out;
    const second = run(['start', '--project-dir', project], env).out;
    expect(second.reused).toBe(true);
    expect(second.url).toBe(first.url);
    expect(run(['stop', '--project-dir', project], env).out.status).toBe('stopped');
  }, 30000);

  test('a managed start replaces a running server from another release, keeping its link', () => {
    const project = newProject();
    const first = run(['start', '--project-dir', project], { RYUGI_ARTIFACTS_VERSION: '9.9.9' }).out;
    const oldPid = Number(fs.readFileSync(path.join(stateOf(project), 'server.pid'), 'utf8'));
    expect(run(['start', '--project-dir', project], { RYUGI_ARTIFACTS_VERSION: '9.9.9' }).out.reused).toBe(true);
    expect(run(['start', '--project-dir', project]).out.reused).toBe(true);
    const second = run(['start', '--project-dir', project], { RYUGI_ARTIFACTS_VERSION: '9.9.8' }).out;
    expect(second.type).toBe('server-started');
    expect(second.reused).toBeUndefined();
    expect(second.url).toBe(first.url);
    expect(() => process.kill(oldPid, 0)).toThrow();
  }, 30000);

  test('a foreground start passes the server through and stops with it, leaving another start’s lock alone', async () => {
    const project = newProject();
    const state = stateOf(project);
    const child = spawn(process.execPath, [cli, 'start', '--project-dir', project, '--foreground', '--artifact', 'html/x'], { env: { ...process.env, ARTIFACTS_OPEN: '0' } });
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    const exited = new Promise((resolve) => child.on('close', resolve));
    while (!fs.existsSync(path.join(state, 'server-info'))) await new Promise((resolve) => setTimeout(resolve, 50));
    await waitFor(() => out.includes('server-started'));
    expect(JSON.parse(out.trim().split('\n')[0]!).link).toMatch(/\/html\/[a-f0-9]{32}\?key=/);
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.mkdirSync(path.join(state, 'start.lock'));
    process.kill(Number(fs.readFileSync(path.join(state, 'server.pid'), 'utf8')), 'SIGTERM');
    await exited;
    expect(fs.existsSync(path.join(state, 'start.lock'))).toBe(true);
  }, 30000);
});

describe('ryugi-artifacts stop', () => {
  test('stops the server and keeps the state directory', async () => {
    const project = newProject();
    const info = run(['start', '--project-dir', project]).out;
    expect(run(['stop', project]).out.status).toBe('stopped');
    await expect(get(info.url.replace('localhost', '127.0.0.1'))).rejects.toThrow();
    expect(fs.existsSync(stateOf(project))).toBe(true);
    expect(fs.existsSync(path.join(stateOf(project), 'server-info'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(stateOf(project), 'server-stopped'), 'utf8')).reason).toBe('stop');
  });

  test('refuses to signal a pid that is not this project’s server', () => {
    const project = newProject();
    fs.mkdirSync(stateOf(project), { recursive: true });
    const foreign = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
    try {
      fs.writeFileSync(path.join(stateOf(project), 'server.pid'), `${foreign.pid}\n`);
      fs.writeFileSync(path.join(stateOf(project), 'server-instance-id'), `${'a'.repeat(48)}\n`);
      expect(run(['stop', '--project-dir', project]).out.status).toBe('stale_pid');
      expect(() => process.kill(foreign.pid!, 0)).not.toThrow();
    } finally {
      foreign.kill();
    }
  });

  test('reports not_running when nothing was started', () => {
    expect(run(['stop', '--project-dir', newProject()]).out.status).toBe('not_running');
  });
});

describe('cloud link on start', () => {
  const runAsync = (args: string[], env: NodeJS.ProcessEnv) =>
    new Promise<{ out: any }>((resolve) => {
      const child = spawn(process.execPath, [cli, ...args], { env: { ...withoutAgent(), ARTIFACTS_OPEN: '0', ...env } });
      let stdout = '';
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.on('close', () => resolve({ out: JSON.parse(stdout.trim().split('\n').pop()!) }));
    });

  async function signedIn() {
    const cloud = await fakeCloud();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-home-'));
    fs.mkdirSync(path.join(home, 'ryugi'));
    fs.writeFileSync(path.join(home, 'ryugi', 'credentials.json'), JSON.stringify({ origin: cloud.origin, token: 'tok', login: 'innei' }));
    fs.writeFileSync(path.join(home, 'ryugi', 'config.json'), JSON.stringify({ autoPublish: true }));
    return { cloud, env: { RYUGI_CLOUD_ORIGIN: cloud.origin, XDG_CONFIG_HOME: home } };
  }

  test('in Claude Code with auto-publish on, start reserves the cloud link and prints it', async () => {
    const { cloud, env } = await signedIn();
    const project = newProject();
    const { out } = await runAsync(['start', '--project-dir', project, '--artifact', 'html/arrow'], { ...env, CLAUDECODE: '1' });
    expect(out.link).toMatch(/\/html\/[a-f0-9]{32}\?key=/);
    expect(out.cloudLink).toBe(`${cloud.origin}/a/cloud1`);
    expect(JSON.parse(fs.readFileSync(path.join(project, '.ryugi', 'config.json'), 'utf8')).artifacts['html/arrow'].cloud.url).toBe(`${cloud.origin}/a/cloud1`);
    expect((await runAsync(['start', '--project-dir', project, '--artifact', 'html/arrow'], { ...env, CLAUDECODE: '1' })).out).toMatchObject({ reused: true, cloudLink: `${cloud.origin}/a/cloud1` });
    expect(cloud.requests.filter((r) => r.path === '/api/artifacts')).toHaveLength(1);
  }, 30000);

  test('in Claude Code, a plan limit prints the upgrade link instead of a cloud link', async () => {
    const { cloud, env } = await signedIn();
    cloud.respond = (r) => (r.method === 'POST' && r.path === '/api/artifacts' ? { status: 402, body: { error: 'The free plan allows 5 private artifacts and you have 5. Upgrade to Pro for 500.', code: 'plan_limit', plan: 'free', limit: { kind: 'private', used: 5, max: 5 }, upgradeUrl: 'https://cloud.example/billing' } } : undefined);
    const { out } = await runAsync(['start', '--project-dir', newProject(), '--artifact', 'html/arrow'], { ...env, CLAUDECODE: '1' });
    expect(out.cloudLink).toBeUndefined();
    expect(out.cloudLimit).toEqual({ message: 'The free plan allows 5 private artifacts and you have 5. Upgrade to Pro for 500.', upgradeUrl: 'https://cloud.example/billing' });
  }, 30000);

  test('outside Claude Code no cloud link is reserved', async () => {
    const { cloud, env } = await signedIn();
    const { out } = await runAsync(['start', '--project-dir', newProject(), '--artifact', 'html/arrow'], env);
    expect(out.cloudLink).toBeUndefined();
    expect(cloud.requests).toEqual([]);
  }, 30000);

  test('the browser opens the cloud link with this computer marked, once the artifact is ready', async () => {
    const { cloud, env } = await signedIn();
    const project = newProject();
    const artboard = path.join(project, '.ryugi', 'artifacts', 'artboard', 'header');
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-open-bin-'));
    const log = path.join(bin, 'opened.log');
    const open = path.join(bin, 'open');
    fs.writeFileSync(open, `#!/bin/sh\nprintf '%s\\n' "$1" >> ${JSON.stringify(log)}\n`, { mode: 0o755 });
    const { out } = await runAsync(['start', '--project-dir', project, '--artifact', 'artboard/header'], { ...env, CLAUDECODE: '1', ARTIFACTS_OPEN: '1', ARTIFACTS_OPEN_CMD: open });
    expect(out.cloudLink).toBe(`${cloud.origin}/a/cloud1`);
    fs.mkdirSync(path.join(artboard, 'pages', 'p'), { recursive: true });
    fs.writeFileSync(path.join(artboard, 'pages', 'p', 'a.html'), '<p>ready</p>');
    fs.writeFileSync(path.join(artboard, 'canvas.json'), JSON.stringify({ version: 1, pages: [{ id: 'p', name: 'P' }], boards: { a: { file: 'pages/p/a.html', page: 'p', x: 0, y: 0, w: 640, h: 400 } } }));
    await waitFor(() => fs.existsSync(log), 8000);
    const hostId = fs.readFileSync(path.join(env.XDG_CONFIG_HOME, 'ryugi', 'host-id'), 'utf8').trim();
    expect(fs.readFileSync(log, 'utf8').trim()).toBe(`${cloud.origin}/a/cloud1#ryugi-host=${hostId}`);
  }, 20000);
});
