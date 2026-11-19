'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');

const cacheHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-agy-cache-'));
process.env.XDG_CACHE_HOME = cacheHome;
after(() => fs.rmSync(cacheHome, { recursive: true, force: true }));
require('./fake-artifacts-release.cjs').seedFakeRelease(cacheHome);

const repo = path.resolve(__dirname, '../..');
const adapter = path.join(repo, 'skills/artifacts/app/agy-comment-watch.cjs');
const SESSION = '29ba4e4a-2224-4457-947d-c39ebcbc846c';
const at = (n) => `2026-11-18T01:00:${String(n).padStart(2, '0')}.000Z`;

async function until(check, explanation, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return;
    await delay(25);
  }
  assert.fail(typeof explanation === 'function' ? explanation() : explanation);
}

async function initialScan(project, session = SESSION) {
  const file = path.join(project, '.ryugi/artifacts/.state/agy-comment-watch', `${session}.alive`);
  await until(() => fs.existsSync(file), 'agy watcher never wrote a heartbeat');
  const first = fs.readFileSync(file, 'utf8');
  await until(
    () => fs.readFileSync(file, 'utf8') !== first,
    'agy watcher never finished its initial scan',
  );
}

async function lsServer(t, options = {}) {
  const calls = [];
  let failSendAgent = Boolean(options.failSendAgent);
  let failAll = Boolean(options.failAll);
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const parsed = body ? JSON.parse(body) : {};
      calls.push({
        url: req.url,
        csrf: req.headers['x-codeium-csrf-token'],
        body: parsed,
      });
      if (failAll) {
        res.statusCode = 503;
        res.end(JSON.stringify({ code: 'unavailable', message: 'LS busy' }));
        return;
      }
      if (
        failSendAgent &&
        req.url === '/exa.language_server_pb.LanguageServerService/SendAgentMessage'
      ) {
        res.statusCode = 403;
        res.end(JSON.stringify({ code: 'permission_denied', message: 'restricted' }));
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ cascadeId: SESSION }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return {
    address: `127.0.0.1:${server.address().port}`,
    calls,
    setFailAll(v) {
      failAll = v;
    },
    setFailSendAgent(v) {
      failSendAgent = v;
    },
  };
}

function fixture(t, ls) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-agy-watch-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'project');
  const data = path.join(root, 'plugin-data');
  fs.mkdirSync(path.join(project, '.git'), { recursive: true });
  fs.mkdirSync(data, { recursive: true });
  const env = {
    ...process.env,
    PLUGIN_ROOT: repo,
    PLUGIN_DATA: data,
    ANTIGRAVITY_AGENT: '1',
    ANTIGRAVITY_CONVERSATION_ID: SESSION,
    ANTIGRAVITY_LS_ADDRESS: ls.address,
    ANTIGRAVITY_CSRF_TOKEN: 'test-csrf-token',
    RYUGI_NO_UPDATE_CHECK: '1',
  };
  for (const key of [
    'CODEX_THREAD_ID',
    'CODEX_SESSION_ID',
    'CLAUDE_CODE_SESSION_ID',
    'PI_SESSION_ID',
  ])
    delete env[key];
  const children = [];
  t.after(() => {
    for (const child of children) {
      try {
        child.kill('SIGTERM');
      } catch {}
    }
  });
  const subscribe = (artifact, session = SESSION) => {
    const file = path.join(project, '.ryugi/artifacts/.state/agy-comment-watch', `${session}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ artifacts: [artifact], updatedAt: at(0) }));
  };
  const writeComments = (artifact, threads) => {
    const file = path.join(project, '.ryugi/artifacts', artifact, 'comments.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ version: 1, threads }));
  };
  const startWatch = (session = SESSION) => {
    const child = spawn(process.execPath, [adapter, 'watch'], {
      cwd: project,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    children.push(child);
    child.stdin.end(
      JSON.stringify({
        conversationId: session,
        cwd: project,
        hookEventName: 'SessionStart',
      }),
    );
    return child;
  };
  const stopWatch = (session = SESSION) => {
    const res = spawnSync(process.execPath, [adapter, 'stop'], {
      cwd: project,
      env,
      input: JSON.stringify({
        conversationId: session,
        cwd: project,
        hookEventName: 'Stop',
      }),
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, res.stderr);
  };
  return { data, env, project, startWatch, stopWatch, subscribe, writeComments };
}

test('agy-comment-watch delivers unread comments via SendAgentMessage and deduplicates workers', async (t) => {
  const ls = await lsServer(t);
  const f = fixture(t, ls);
  f.subscribe('document/spec');
  f.startWatch();
  await initialScan(f.project);

  // Starting a second watcher while the first is alive is a no-op
  const duplicate = f.startWatch();
  const dupExit = await new Promise((resolve) => duplicate.on('exit', resolve));
  assert.equal(dupExit, 0);

  f.writeComments('document/spec', [
    {
      id: 't1',
      anchor: { blockId: 'b1', quote: ' section ' },
      status: 'open',
      statusAt: at(1),
      statusBy: 'human',
      messages: [{ id: 'm1', author: 'human', text: 'please clarify this', at: at(1) }],
    },
  ]);

  await until(() => ls.calls.length === 1, 'watcher did not send RPC for unread comment');
  assert.equal(ls.calls[0].url, '/exa.language_server_pb.LanguageServerService/SendAgentMessage');
  assert.equal(ls.calls[0].csrf, 'test-csrf-token');
  assert.equal(ls.calls[0].body.recipient, SESSION);
  assert.match(ls.calls[0].body.content, /Ryugi comments document\/spec \(1 unread\)/);
  assert.match(ls.calls[0].body.content, /please clarify this/);

  f.stopWatch();
});

test('agy-comment-watch falls back to SendUserCascadeMessage when SendAgentMessage is rejected and retries on failure', async (t) => {
  const ls = await lsServer(t, { failSendAgent: true, failAll: true });
  const f = fixture(t, ls);
  f.subscribe('document/fallback');
  f.startWatch();
  await initialScan(f.project);

  f.writeComments('document/fallback', [
    {
      id: 't2',
      anchor: { blockId: 'b2', quote: ' fallback ' },
      status: 'open',
      statusAt: at(2),
      statusBy: 'human',
      messages: [{ id: 'm2', author: 'human', text: 'check fallback', at: at(2) }],
    },
  ]);

  await until(() => ls.calls.length >= 1, 'watcher did not attempt initial delivery');
  ls.setFailAll(false);

  await until(
    () =>
      ls.calls.some(
        (c) => c.url === '/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage',
      ),
    'watcher did not fall back to SendUserCascadeMessage after retry',
    6000,
  );
  const cascadeCall = ls.calls.find(
    (c) => c.url === '/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage',
  );
  assert.equal(cascadeCall.body.cascadeId, SESSION);
  assert.equal(cascadeCall.body.items?.[0]?.text !== undefined, true);
  assert.match(cascadeCall.body.items[0].text, /check fallback/);

  f.stopWatch();
});

test('agy-comment-watch supersedes a worker with a stale lsAddress and exits cleanly when stopped or when LS address is missing', async (t) => {
  const ls1 = await lsServer(t);
  const ls2 = await lsServer(t);
  const f = fixture(t, ls1);
  f.subscribe('document/resume');

  // Missing ANTIGRAVITY_LS_ADDRESS exits 0 immediately
  const noLs = spawnSync(process.execPath, [adapter, 'watch'], {
    cwd: f.project,
    env: { ...f.env, ANTIGRAVITY_LS_ADDRESS: '' },
    input: JSON.stringify({
      conversationId: SESSION,
      cwd: f.project,
      hookEventName: 'SessionStart',
    }),
    encoding: 'utf8',
  });
  assert.equal(noLs.status, 0);

  const first = f.startWatch();
  await initialScan(f.project);

  // Resume session on a new LS address: second watcher supersedes the first
  f.env.ANTIGRAVITY_LS_ADDRESS = ls2.address;
  const second = f.startWatch();
  const firstExit = await new Promise((resolve) => first.on('exit', resolve));
  assert.equal(firstExit, 0);

  f.writeComments('document/resume', [
    {
      id: 't3',
      anchor: { blockId: 'b3', quote: ' resume ' },
      status: 'open',
      statusAt: at(3),
      statusBy: 'human',
      messages: [{ id: 'm3', author: 'human', text: 'resumed comment', at: at(3) }],
    },
  ]);

  await until(() => ls2.calls.length === 1, 'new watcher did not deliver to new LS address');
  assert.equal(ls1.calls.length, 0);

  f.stopWatch();
  const secondExit = await new Promise((resolve) => second.on('exit', resolve));
  assert.equal(secondExit, 0);
});

test('ensureWatch launches a detached watcher and skips respawning while healthy', async (t) => {
  const { ensureWatch } = require(adapter);
  const ls = await lsServer(t);
  const f = fixture(t, ls);
  f.subscribe('document/launcher');

  assert.equal(ensureWatch(f.project, f.env), true);
  await initialScan(f.project);

  // Calling ensureWatch again while healthy is a fast no-op
  assert.equal(ensureWatch(f.project, f.env), false);

  f.writeComments('document/launcher', [
    {
      id: 't4',
      anchor: { blockId: 'b4', quote: ' launcher ' },
      status: 'open',
      statusAt: at(4),
      statusBy: 'human',
      messages: [{ id: 'm4', author: 'human', text: 'woken from launcher', at: at(4) }],
    },
  ]);

  await until(
    () => ls.calls.length === 1,
    'watcher spawned by ensureWatch did not deliver comment',
  );
  assert.match(ls.calls[0].body.content, /woken from launcher/);

  f.stopWatch();
});
