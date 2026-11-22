'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const repo = path.resolve(__dirname, '../..');
const watcher = path.join(repo, 'hooks/watch-comments.cjs');
const { command } = require(path.join(repo, 'skills/artifacts/app/hub-channel.cjs'));

const until = async (check, ms = 10000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

function fakeHub(t) {
  const socketPath = path.join(fs.mkdtempSync('/tmp/cwt-'), 'hub.sock');
  const received = [];
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk;
      for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
        const message = JSON.parse(buffer.slice(0, at));
        buffer = buffer.slice(at + 1);
        received.push(message);
        if (message.t === 'hello')
          socket.write(`${JSON.stringify({ t: 'welcome', version: '9.9.9' })}\n`);
      }
    });
    socket.on('close', () => sockets.delete(socket));
  });
  server.listen(socketPath);
  t.after(
    () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(resolve);
      }),
  );
  return {
    socketPath,
    received,
    send: (message) => {
      for (const socket of sockets) socket.write(`${JSON.stringify(message)}\n`);
    },
  };
}

function project(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-comment-watch-')));
  fs.mkdirSync(path.join(dir, '.ryugi', 'artifacts'), { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const stoppedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cwt-home-'));
fs.writeFileSync(path.join(stoppedHome, 'server-stopped'), JSON.stringify({ reason: 'stop' }));

function run(t, cwd, env) {
  const child = spawn(process.execPath, [watcher, cwd], {
    cwd,
    env: {
      ...process.env,
      CLAUDE_CODE_SESSION_ID: undefined,
      RYUGI_SERVER_HOME: stoppedHome,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const state = { output: '', exit: null };
  child.stdout.on('data', (chunk) => (state.output += chunk));
  child.on('exit', (code) => (state.exit = code));
  t.after(() => child.kill());
  return state;
}

const comments = (dir, threads) => ({
  type: 'ryugi-comments',
  project: dir,
  artifact: 'document/plan',
  unread: threads.length,
  threads,
});

test('the plugin monitor starts only once the artifacts skill runs', () => {
  const entries = JSON.parse(fs.readFileSync(path.join(repo, 'monitors/monitors.json'), 'utf8'));
  const entry = entries.find((item) => item.name === 'artifact-comments');
  assert.equal(entry.when, 'on-skill-invoke:ryugi:artifacts');
});

test('a hub event becomes one notification and is acknowledged', async (t) => {
  const hub = fakeHub(t);
  const dir = project(t);
  const watching = run(t, dir, {
    CLAUDE_CODE_SESSION_ID: '11111111-1111-4111-8111-111111111111',
    RYUGI_HUB_SOCKET: hub.socketPath,
  });
  await until(() => hub.received.some((m) => m.t === 'hello'));
  assert.equal(hub.received[0].session, '11111111-1111-4111-8111-111111111111');
  assert.equal(hub.received[0].agent, 'Claude Code');
  hub.send({
    t: 'event',
    id: 3,
    event: comments(dir, [
      {
        thread: 't1',
        status: 'open',
        block: 'b1',
        messages: [
          { id: 'm1', at: '2026-10-30T10:00:01.000Z', name: 'Innei', text: 'Please change this' },
        ],
      },
    ]),
  });
  await until(() => watching.output.includes('--artifact document/plan'));
  const lines = watching.output.trim().split('\n');
  assert.match(
    lines[0],
    /^Ryugi comments document\/plan \(1 unread\)\. t1 \[open\] b1 · m1 Innei \d\d:\d\d: Please change this\./,
  );
  await until(() => hub.received.some((m) => m.t === 'delivered'));
  assert.deepEqual(
    hub.received.find((m) => m.t === 'delivered'),
    { t: 'delivered', id: 3 },
  );
});

test('every notification line stays within the 500-character limit', async (t) => {
  const hub = fakeHub(t);
  const dir = project(t);
  const watching = run(t, dir, {
    CLAUDE_CODE_SESSION_ID: '11111111-1111-4111-8111-111111111111',
    RYUGI_HUB_SOCKET: hub.socketPath,
  });
  await until(() => hub.received.some((m) => m.t === 'hello'));
  const threads = Array.from({ length: 25 }, (_, n) => ({
    thread: `t${n}`,
    status: 'open',
    messages: [
      { id: `m${n}`, at: '2026-10-30T10:00:01.000Z', name: 'human', text: 'x'.repeat(200) },
    ],
  }));
  hub.send({ t: 'event', id: 1, event: comments(dir, threads) });
  await until(() => watching.output.includes('--artifact document/plan'));
  const lines = watching.output.trim().split('\n');
  for (const line of lines) assert.ok(line.length <= 500, `${line.length}: ${line}`);
  assert.ok(lines.at(-1).endsWith('--artifact document/plan'), lines.at(-1));
});

test('without a session id the watcher exits quietly', async (t) => {
  const dir = project(t);
  const watching = run(t, dir, {});
  await until(() => watching.exit !== null);
  assert.equal(watching.exit, 0);
  assert.equal(watching.output, '');
});

test('notification commands preserve paths with spaces, apostrophes and shell substitutions', (t) => {
  const base = project(t);
  const dir = path.join(base, "a b'$(touch WRONG)");
  fs.mkdirSync(dir);
  const args = execFileSync(
    'bash',
    ['-c', `set -- ${command(dir, 'document/plan')}; printf '%s\\0' "$@"`],
    {
      cwd: base,
      encoding: 'utf8',
    },
  ).split('\0');
  assert.equal(args[args.indexOf('--project-dir') + 1], dir);
  assert.ok(!fs.existsSync(path.join(base, 'WRONG')));
});
