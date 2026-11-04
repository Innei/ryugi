'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const repo = path.resolve(__dirname, '../..');
const SESSION = '01a18caa-a157-7071-ac28-96aa9066af5f';

function codexHooks() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(repo, '.codex-plugin/plugin.json'), 'utf8'),
  );
  return JSON.parse(fs.readFileSync(path.resolve(repo, manifest.hooks), 'utf8')).hooks;
}

function claudeHooks() {
  return JSON.parse(fs.readFileSync(path.join(repo, 'hooks/hooks.json'), 'utf8')).hooks;
}

function commandFor(config, event, pattern = /agent-event|flush|stop/) {
  const entry = (config[event] ?? [])
    .flatMap((group) => group.hooks)
    .find((hook) => pattern.test(hook.command));
  assert.ok(entry, `no ${event} hook reporting agent events`);
  return entry;
}

function project(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-agent-event-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, "project with ' quote");
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'packages/app'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ryugi/artifacts/.state'), { recursive: true });
  return dir;
}

async function hub(t, dir) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      seen.push({
        path: req.url.split('?')[0],
        project: decodeURIComponent(req.headers['x-ryugi-project'] || ''),
        body: body ? JSON.parse(body) : null,
      });
      res.statusCode = 204;
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  fs.writeFileSync(
    path.join(dir, '.ryugi/artifacts/.state/server-info'),
    JSON.stringify({ type: 'server-started', url: `http://localhost:${server.address().port}/` }),
  );
  return seen;
}

function run(command, input, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      env: { ...process.env, PLUGIN_ROOT: repo, CLAUDE_PLUGIN_ROOT: repo, ...env },
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', () => {});
    child.on('exit', (code) => resolve({ code, out }));
    child.stdin.end(JSON.stringify(input));
  });
}

const until = async (check) => {
  const deadline = Date.now() + 5000;
  while (!check() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
};

test('the Codex PreToolUse hook reports apply_patch files as absolute paths', async (t) => {
  const dir = project(t);
  const seen = await hub(t, dir);
  const cwd = path.join(dir, 'packages/app');
  const before = Date.now();
  const result = await run(commandFor(codexHooks(), 'PreToolUse').command, {
    hook_event_name: 'PreToolUse',
    session_id: SESSION,
    cwd,
    tool_name: 'apply_patch',
    tool_input: {
      command:
        '*** Begin Patch\n*** Update File: ../../.ryugi/artifacts/html/page/index.html\n@@\n-a\n+b\n*** Add File: src/new.ts\n+x\n*** End Patch',
    },
  });
  assert.equal(result.code, 0);
  assert.equal(result.out, '');
  await until(() => seen.length === 1);
  assert.equal(seen[0].path, '/api/agent/event');
  assert.equal(seen[0].project, dir);
  assert.deepEqual(
    { ...seen[0].body, at: undefined },
    {
      host: 'codex',
      session: SESSION,
      event: 'PreToolUse',
      at: undefined,
      paths: [
        path.join(dir, '.ryugi/artifacts/html/page/index.html'),
        path.join(cwd, 'src/new.ts'),
      ],
    },
  );
  assert.ok(seen[0].body.at >= before && seen[0].body.at <= Date.now());
});

test('the Claude Code PreToolUse hook reports the edited file', async (t) => {
  const dir = project(t);
  const seen = await hub(t, dir);
  const file = path.join(dir, '.ryugi/artifacts/document/plan/doc.xml');
  const result = await run(
    commandFor(claudeHooks(), 'PreToolUse').command,
    {
      hook_event_name: 'PreToolUse',
      session_id: 's1',
      cwd: dir,
      tool_name: 'Edit',
      tool_input: { file_path: file },
    },
    { CLAUDE_PROJECT_DIR: dir },
  );
  assert.equal(result.code, 0);
  assert.equal(result.out, '');
  await until(() => seen.length === 1);
  assert.deepEqual(
    { ...seen[0].body, at: undefined },
    { host: 'claude', session: 's1', event: 'PreToolUse', at: undefined, paths: [file] },
  );
});

test('every lifecycle event both hosts report is registered', () => {
  for (const event of [
    'UserPromptSubmit',
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'PermissionRequest',
    'PermissionDenied',
    'Stop',
    'SessionEnd',
  ])
    commandFor(claudeHooks(), event);
  for (const event of [
    'UserPromptSubmit',
    'PreToolUse',
    'PostToolUse',
    'PermissionRequest',
    'Interrupt',
    'Stop',
    'SessionEnd',
  ])
    commandFor(codexHooks(), event);
});

test('only the Stop hooks wait; every other agent event hook is async', () => {
  for (const config of [claudeHooks(), codexHooks()])
    for (const [event, groups] of Object.entries(config))
      for (const hook of groups.flatMap((group) => group.hooks))
        if (/agent-event/.test(hook.command))
          assert.equal(hook.async, event !== 'Stop', `${event} async`);
});

test('the Claude Code Stop hook reports the end of the turn and still flushes', async (t) => {
  const dir = project(t);
  const seen = await hub(t, dir);
  const result = await run(
    commandFor(claudeHooks(), 'Stop').command,
    { hook_event_name: 'Stop', session_id: 's1', cwd: dir },
    { CLAUDE_PROJECT_DIR: dir },
  );
  assert.equal(result.code, 0);
  await until(() => seen.length === 2);
  assert.deepEqual(seen.map((r) => r.path).sort(), ['/api/agent/event', '/api/cloud/flush']);
  assert.equal(seen.find((r) => r.path === '/api/agent/event').body.event, 'Stop');
});

test('the Codex Stop hook stays silent without a running server', async (t) => {
  const dir = project(t);
  const started = Date.now();
  const input = { hook_event_name: 'Stop', session_id: SESSION, cwd: dir };
  const command = commandFor(codexHooks(), 'Stop').command;
  assert.deepEqual(await run(command, input), { code: 0, out: '' });
  fs.writeFileSync(
    path.join(dir, '.ryugi/artifacts/.state/server-info'),
    JSON.stringify({ type: 'server-started', url: 'http://localhost:9/' }),
  );
  assert.deepEqual(await run(command, input), { code: 0, out: '' });
  assert.ok(Date.now() - started < 5000);
});

test('the turn-end flush never waits on a stdin that stays open', async (t) => {
  const dir = project(t);
  const seen = await hub(t, dir);
  const child = spawn(process.execPath, [path.join(repo, 'hooks/flush-artifacts.cjs'), dir], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(() => child.kill());
  const started = Date.now();
  const code = await new Promise((resolve) => child.on('exit', resolve));
  assert.equal(code, 0);
  assert.ok(Date.now() - started < 3000, `took ${Date.now() - started} ms`);
  await until(() => seen.some((r) => r.path === '/api/cloud/flush'));
});
