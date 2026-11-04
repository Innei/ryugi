'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const repo = path.resolve(__dirname, '../..');

function stopHook() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(repo, '.codex-plugin/plugin.json'), 'utf8'),
  );
  const config = JSON.parse(fs.readFileSync(path.resolve(repo, manifest.hooks), 'utf8')).hooks;
  return config.Stop?.[0]?.hooks?.[0];
}

function project(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-codex-stop-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, "project with ' quote");
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'packages/app'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ryugi/artifacts/.state'), { recursive: true });
  return dir;
}

function run(entry, cwd) {
  return new Promise((resolve) => {
    const child = spawn(entry.command, {
      env: { ...process.env, PLUGIN_ROOT: repo },
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', () => {});
    child.on('exit', (code) => resolve({ code, out }));
    child.stdin.end(
      JSON.stringify({
        hook_event_name: 'Stop',
        session_id: '01a18caa-a157-7071-ac28-96aa9066af5f',
        turn_id: 't1',
        cwd,
        stop_hook_active: false,
        transcript_path: null,
        last_assistant_message: 'done',
        model: 'gpt',
        permission_mode: 'default',
      }),
    );
  });
}

test('the shipped Codex Stop hook tells the project server the turn ended', async (t) => {
  const entry = stopHook();
  assert.ok(entry, 'the Codex plugin has no Stop hook');
  const dir = project(t);
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({
      method: req.method,
      path: req.url.split('?')[0],
      project: decodeURIComponent(req.headers['x-ryugi-project'] || ''),
    });
    res.statusCode = 204;
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  fs.writeFileSync(
    path.join(dir, '.ryugi/artifacts/.state/server-info'),
    JSON.stringify({ type: 'server-started', url: `http://localhost:${server.address().port}/` }),
  );
  const result = await run(entry, path.join(dir, 'packages/app'));
  assert.equal(result.code, 0);
  assert.equal(result.out, '');
  assert.deepEqual(seen, [{ method: 'POST', path: '/api/agent/stop', project: dir }]);
});

test('the Codex Stop hook stays silent without a running server', async (t) => {
  const entry = stopHook();
  assert.ok(entry, 'the Codex plugin has no Stop hook');
  const dir = project(t);
  const started = Date.now();
  const result = await run(entry, dir);
  assert.equal(result.code, 0);
  assert.equal(result.out, '');
  fs.writeFileSync(
    path.join(dir, '.ryugi/artifacts/.state/server-info'),
    JSON.stringify({ type: 'server-started', url: 'http://localhost:9/' }),
  );
  const gone = await run(entry, dir);
  assert.equal(gone.code, 0);
  assert.equal(gone.out, '');
  assert.ok(Date.now() - started < 5000);
});
