'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');
const { fakeHub } = require('./fake-hub.cjs');

const cacheHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-agy-cache-'));
process.env.XDG_CACHE_HOME = cacheHome;
after(() => fs.rmSync(cacheHome, { recursive: true, force: true }));
require('./fake-artifacts-release.cjs').seedFakeRelease(cacheHome);

const { hookBin } = require('./hook-bin.cjs');

const repo = path.resolve(__dirname, '../..');
const hook = hookBin();
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
  const hub = fakeHub(t);
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
    ...hub.env,
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
  let nextId = 0;
  const connected = (count = 1) =>
    until(
      () => hub.hellos().length >= count && hub.sessions.has(SESSION),
      'the watcher never said hello to the hub',
    );
  const push = async (artifact, text) => {
    await connected();
    const sent = ++nextId;
    hub.send(SESSION, {
      t: 'event',
      id: sent,
      event: {
        type: 'ryugi-comments',
        project,
        artifact,
        unread: 1,
        threads: [
          {
            thread: 't1',
            status: 'open',
            block: 'b1',
            messages: [{ id: 'm1', at: at(1), name: 'human', text }],
          },
        ],
      },
    });
    return sent;
  };
  const retract = (artifact) =>
    hub.send(SESSION, { t: 'retract', project, artifact, type: 'ryugi-comments' });
  const startWatch = (session = SESSION) => {
    const child = spawn(hook, ['watch', 'antigravity'], {
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
    const res = spawnSync(hook, ['agy-stop'], {
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
  return { connected, data, env, hub, project, push, retract, startWatch, stopWatch };
}

test('agy-comment-watch delivers hub events via SendAgentMessage, acknowledges them and deduplicates workers', async (t) => {
  const ls = await lsServer(t);
  const f = fixture(t, ls);
  f.startWatch();
  await f.connected();

  const duplicate = f.startWatch();
  const dupExit = await new Promise((resolve) => duplicate.on('exit', resolve));
  assert.equal(dupExit, 0);

  const sent = await f.push('document/spec', 'please clarify this');
  await until(() => ls.calls.length === 1, 'watcher did not send RPC for the event');
  assert.equal(ls.calls[0].url, '/exa.language_server_pb.LanguageServerService/SendAgentMessage');
  assert.equal(ls.calls[0].csrf, 'test-csrf-token');
  assert.equal(ls.calls[0].body.recipient, SESSION);
  assert.match(ls.calls[0].body.content, /Ryugi comments document\/spec \(1 unread\)/);
  assert.match(ls.calls[0].body.content, /\nComment list: document\/spec · fake threads/);
  assert.doesNotMatch(ls.calls[0].body.content, /Run: /);
  await until(() => f.hub.delivered().includes(sent), 'the delivery was never acknowledged');
  assert.equal(f.hub.hellos()[0].agent, 'Antigravity');
  assert.equal(f.hub.hellos()[0].host, 'antigravity');

  f.stopWatch();
});

test('agy-comment-watch falls back to SendUserCascadeMessage when SendAgentMessage is rejected and retries on failure', async (t) => {
  const ls = await lsServer(t, { failSendAgent: true, failAll: true });
  const f = fixture(t, ls);
  f.startWatch();
  const sent = await f.push('document/fallback', 'check fallback');

  await until(() => ls.calls.length >= 1, 'watcher did not attempt initial delivery');
  assert.deepEqual(f.hub.delivered(), []);
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
  assert.match(cascadeCall.body.items[0].text, /Comment list: document\/fallback · fake threads/);
  await until(() => f.hub.delivered().includes(sent), 'the fallback delivery was not acknowledged');

  f.stopWatch();
});

test('a retract drops an event still waiting for the language server', async (t) => {
  const ls = await lsServer(t, { failAll: true });
  const f = fixture(t, ls);
  f.startWatch();
  await f.push('document/retract', 'answered elsewhere');
  await until(() => ls.calls.length >= 1, 'watcher did not attempt delivery');
  f.retract('document/retract');
  await delay(100);
  const attempts = ls.calls.length;
  ls.setFailAll(false);
  await delay(2000);
  assert.equal(ls.calls.length, attempts);
  assert.deepEqual(f.hub.delivered(), []);
  f.stopWatch();
});

test('agy-comment-watch supersedes a worker with a stale lsAddress and exits cleanly when stopped or when LS address is missing', async (t) => {
  const ls1 = await lsServer(t);
  const ls2 = await lsServer(t);
  const f = fixture(t, ls1);

  const noLs = spawnSync(hook, ['watch', 'antigravity'], {
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
  await f.connected();

  f.env.ANTIGRAVITY_LS_ADDRESS = ls2.address;
  const second = f.startWatch();
  const firstExit = await new Promise((resolve) => first.on('exit', resolve));
  assert.equal(firstExit, 0);
  await f.connected(2);

  await f.push('document/resume', 'resumed comment');
  await until(() => ls2.calls.length === 1, 'new watcher did not deliver to new LS address');
  assert.equal(ls1.calls.length, 0);

  f.stopWatch();
  const secondExit = await new Promise((resolve) => second.on('exit', resolve));
  assert.equal(secondExit, 0);
});

test('agy-ensure launches a detached watcher and skips respawning while healthy', async (t) => {
  const ls = await lsServer(t);
  const f = fixture(t, ls);
  const ensureWatch = () => spawnSync(hook, ['agy-ensure', f.project], { env: f.env }).status;

  assert.equal(ensureWatch(), 0);
  await f.connected();
  assert.equal(ensureWatch(), 3);

  await f.push('document/launcher', 'woken from launcher');
  await until(
    () => ls.calls.length === 1,
    'watcher spawned by ensureWatch did not deliver the event',
  );
  assert.match(ls.calls[0].body.content, /Comment list: document\/launcher · fake threads/);

  f.stopWatch();
});
