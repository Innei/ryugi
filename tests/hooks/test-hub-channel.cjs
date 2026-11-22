'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { mock, test } = require('node:test');

const { hubSocketPath, openHubChannel } = require('../../skills/artifacts/app/hub-channel.cjs');

const until = async (check, ms = 5000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const turns = async (check, max = 5000) => {
  for (let turn = 0; turn < max && !check(); turn++)
    await new Promise((resolve) => setImmediate(resolve));
  return check();
};

function fakeHub(socketPath, { refuse = false, drop = false } = {}) {
  const received = [];
  const sockets = new Set();
  let connections = 0;
  const server = net.createServer((socket) => {
    connections++;
    if (drop) return socket.destroy();
    sockets.add(socket);
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk;
      for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
        const message = JSON.parse(buffer.slice(0, at));
        buffer = buffer.slice(at + 1);
        received.push(message);
        if (message.t === 'hello') {
          if (refuse) {
            socket.end(`${JSON.stringify({ t: 'refuse', reason: 'version' })}\n`);
            continue;
          }
          socket.write(`${JSON.stringify({ t: 'welcome', version: '9.9.9' })}\n`);
        }
      }
    });
    socket.on('close', () => sockets.delete(socket));
  });
  return new Promise((resolve) =>
    server.listen(socketPath, () =>
      resolve({
        received,
        connections: () => connections,
        send: (message) => {
          for (const socket of sockets) socket.write(`${JSON.stringify(message)}\n`);
        },
        close: () =>
          new Promise((done) => {
            for (const socket of sockets) socket.destroy();
            server.close(done);
          }),
      }),
    ),
  );
}

function setup({ ryugiProject = true, stopped } = {}) {
  const dir = fs.mkdtempSync('/tmp/hcw-');
  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hcw-project-')));
  if (ryugiProject) fs.mkdirSync(path.join(project, '.ryugi', 'artifacts'), { recursive: true });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hcw-home-'));
  if (stopped)
    fs.writeFileSync(path.join(home, 'server-stopped'), JSON.stringify({ reason: stopped }));
  return {
    project,
    socket: path.join(dir, 'hub.sock'),
    env: { ...process.env, RYUGI_HUB_SOCKET: path.join(dir, 'hub.sock'), RYUGI_SERVER_HOME: home },
  };
}

const channels = [];
const openChannel = (options) => {
  const channel = openHubChannel({
    host: 'claude',
    session: 's1',
    agent: 'Claude Code',
    retryMs: 20,
    ...options,
  });
  channels.push(channel);
  return channel;
};

test.afterEach(() => {
  for (const channel of channels.splice(0)) channel.close();
});

test('the socket path follows the hub', () => {
  assert.equal(hubSocketPath({ RYUGI_RUNTIME_DIR: '/r' }, 'darwin'), '/r/hub.sock');
  assert.equal(hubSocketPath({ RYUGI_HUB_SOCKET: '/x.sock' }, 'darwin'), '/x.sock');
});

test('a hub on its own server home is dialled on its own socket, the one that hub opens', () => {
  assert.equal(
    hubSocketPath({ RYUGI_RUNTIME_DIR: '/r', RYUGI_SERVER_HOME: '/x/home' }, 'darwin'),
    '/r/hub-b63c9bef6031.sock',
  );
  assert.equal(
    hubSocketPath(
      { RYUGI_RUNTIME_DIR: '/r', RYUGI_SERVER_HOME: path.join(os.homedir(), '.ryugi', 'server') },
      'darwin',
    ),
    '/r/hub.sock',
  );
});

test('an event naming an unsafe artifact or a relative project is dropped unacknowledged', async () => {
  const env = setup();
  const hub = await fakeHub(env.socket);
  const events = [];
  const channel = openChannel({
    project: env.project,
    env: env.env,
    onEvent: (event, id) => {
      events.push(event);
      channel.delivered(id);
    },
  });
  await until(() => hub.received.length > 0);
  hub.send({
    t: 'event',
    id: 1,
    event: {
      type: 'ryugi-comments',
      project: env.project,
      artifact: 'document/plan; touch WRONG',
      unread: 1,
      threads: [],
    },
  });
  hub.send({
    t: 'event',
    id: 2,
    event: {
      type: 'ryugi-comments',
      project: 'relative/dir',
      artifact: 'document/plan',
      unread: 1,
      threads: [],
    },
  });
  hub.send({
    t: 'event',
    id: 3,
    event: {
      type: 'ryugi-comments',
      project: env.project,
      artifact: 'document/plan',
      unread: 1,
      threads: [],
    },
  });
  await until(() => events.length === 1);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(events.length, 1);
  assert.equal(events[0].artifact, 'document/plan');
  assert.deepEqual(
    hub.received.filter((m) => m.t === 'delivered').map((m) => m.id),
    [3],
  );
  await hub.close();
});

test('a socket in a directory other users can write to is not dialled', async () => {
  const env = setup();
  fs.chmodSync(path.dirname(env.socket), 0o777);
  const hub = await fakeHub(env.socket);
  const waiting = [];
  const starts = [];
  openChannel({
    project: env.project,
    env: env.env,
    onEvent: () => {},
    startHub: async (p) => starts.push(p),
    onWaiting: (why) => waiting.push(why),
  });
  await until(() => waiting.length > 0);
  assert.equal(waiting[0], 'unsafe-socket-dir');
  assert.deepEqual(hub.received, []);
  assert.deepEqual(starts, []);
  await hub.close();
});

test('a hello names the session and events arrive with the commands to read them', async () => {
  const env = setup();
  const hub = await fakeHub(env.socket);
  const events = [];
  const channel = openChannel({
    project: env.project,
    env: env.env,
    onEvent: (event, id) => events.push({ event, id }),
  });
  await until(() => hub.received.length > 0);
  assert.deepEqual(hub.received[0], {
    t: 'hello',
    protocol: 1,
    version: hub.received[0].version,
    host: 'claude',
    session: 's1',
    agent: 'Claude Code',
  });
  hub.send({
    t: 'event',
    id: 7,
    event: {
      type: 'ryugi-comments',
      project: env.project,
      artifact: 'document/plan',
      unread: 1,
      threads: [],
    },
  });
  await until(() => events.length === 1);
  assert.equal(events[0].id, 7);
  assert.match(
    events[0].event.command,
    /comment list --section threads --detail --format brief --project-dir .+ --artifact document\/plan$/,
  );
  assert.equal(events[0].event.argv, undefined);
  hub.send({
    t: 'event',
    id: 8,
    event: { type: 'ryugi-answers', project: env.project, artifact: 'document/plan', submit: 's1' },
  });
  await until(() => events.length === 2);
  assert.deepEqual(events[1].event.argv.slice(-2), ['--artifact', 'document/plan']);
  assert.ok(events[1].event.argv.includes('asks'));
  channel.delivered(7);
  await until(() => hub.received.some((m) => m.t === 'delivered'));
  assert.deepEqual(hub.received.at(-1), { t: 'delivered', id: 7 });
  await hub.close();
});

test('after the hub restarts the channel says hello again', async () => {
  const env = setup();
  const first = await fakeHub(env.socket);
  openChannel({ project: env.project, env: env.env, onEvent: () => {}, startHub: async () => {} });
  await until(() => first.received.length === 1);
  await first.close();
  const second = await fakeHub(env.socket);
  await until(() => second.received.some((m) => m.t === 'hello'), 10000);
  await second.close();
});

test('a hub that is down is started in a Ryugi project', async () => {
  const env = setup();
  const starts = [];
  let hub;
  openChannel({
    project: env.project,
    env: env.env,
    onEvent: () => {},
    startHub: async (project) => {
      starts.push(project);
      hub ??= await fakeHub(env.socket);
    },
  });
  await until(() => hub && hub.received.some((m) => m.t === 'hello'), 10000);
  assert.deepEqual(starts.slice(0, 1), [env.project]);
  await hub.close();
});

for (const reason of ['stop', 'stale_pid', 'SIGINT'])
  test(`a hub the user stopped (${reason}) is not started again`, async () => {
    const env = setup({ stopped: reason });
    const starts = [];
    const waiting = [];
    openChannel({
      project: env.project,
      env: env.env,
      onEvent: () => {},
      startHub: async (p) => starts.push(p),
      onWaiting: (why) => waiting.push(why),
    });
    await until(() => waiting.length > 0);
    assert.deepEqual(waiting[0], 'stopped');
    assert.deepEqual(starts, []);
  });

test('a project without .ryugi/artifacts does not start the hub', async () => {
  const env = setup({ ryugiProject: false });
  const starts = [];
  const waiting = [];
  openChannel({
    project: env.project,
    env: env.env,
    onEvent: () => {},
    startHub: async (p) => starts.push(p),
    onWaiting: (why) => waiting.push(why),
  });
  await until(() => waiting.length > 0);
  assert.deepEqual(waiting[0], 'not-a-ryugi-project');
  assert.deepEqual(starts, []);
});

test('a refused hello starts the hub through the launcher', async () => {
  const env = setup();
  const old = await fakeHub(env.socket, { refuse: true });
  const starts = [];
  openChannel({
    project: env.project,
    env: env.env,
    onEvent: () => {},
    startHub: async (p) => starts.push(p),
  });
  await until(() => starts.length > 0, 5000);
  await old.close();
});

test('a newer watcher for the same session replaces this one', async () => {
  const env = setup();
  const hub = await fakeHub(env.socket);
  let replaced = false;
  openChannel({
    project: env.project,
    env: env.env,
    onEvent: () => {},
    onReplaced: () => (replaced = true),
  });
  await until(() => hub.received.length > 0);
  hub.send({ t: 'bye', reason: 'replaced' });
  await until(() => replaced);
  await hub.close();
});

test('a retract is passed on', async () => {
  const env = setup();
  const hub = await fakeHub(env.socket);
  const retracts = [];
  openChannel({
    project: env.project,
    env: env.env,
    onEvent: () => {},
    onRetract: (m) => retracts.push(m),
  });
  await until(() => hub.received.length > 0);
  hub.send({
    t: 'retract',
    project: env.project,
    artifact: 'document/plan',
    type: 'ryugi-comments',
  });
  await until(() => retracts.length === 1);
  assert.equal(retracts[0].artifact, 'document/plan');
  await hub.close();
});

test('a hub that ended on SIGTERM is started again', async () => {
  const env = setup({ stopped: 'SIGTERM' });
  const starts = [];
  openChannel({
    project: env.project,
    env: env.env,
    onEvent: () => {},
    startHub: async (p) => starts.push(p),
  });
  await until(() => starts.length > 0);
  assert.deepEqual(starts.slice(0, 1), [env.project]);
});

test('a hub the user stopped is dialled every retry interval however long it stays down', async () => {
  const env = setup({ stopped: 'stop' });
  const waiting = [];
  mock.timers.enable({ apis: ['setTimeout'] });
  const channel = openHubChannel({
    host: 'claude',
    session: 's1',
    agent: 'Claude Code',
    retryMs: 1000,
    project: env.project,
    env: env.env,
    onEvent: () => {},
    onWaiting: (why) => waiting.push(why),
  });
  try {
    for (let attempt = 1; attempt <= 8; attempt++) {
      assert.ok(await turns(() => waiting.length === attempt), `dial ${attempt} never happened`);
      mock.timers.tick(1000);
    }
  } finally {
    channel.close();
    mock.timers.reset();
  }
});

test('launching a hub that stays unreachable backs off while dialling does not', async () => {
  const env = setup();
  const hub = await fakeHub(env.socket, { drop: true });
  const starts = [];
  mock.timers.enable({ apis: ['setTimeout'] });
  const channel = openHubChannel({
    host: 'claude',
    session: 's1',
    agent: 'Claude Code',
    retryMs: 1000,
    project: env.project,
    env: env.env,
    onEvent: () => {},
    startHub: async (p) => starts.push(p),
  });
  try {
    for (let attempt = 1; attempt <= 16; attempt++) {
      assert.ok(await turns(() => hub.connections() === attempt), `dial ${attempt} never happened`);
      await turns(() => false, 50);
      mock.timers.tick(1000);
    }
    assert.equal(starts.length, 4);
  } finally {
    channel.close();
    mock.timers.reset();
    await hub.close();
  }
});

test('a hub that keeps refusing the hello is launched no more often than an unreachable one', async () => {
  const env = setup();
  const hub = await fakeHub(env.socket, { refuse: true });
  const starts = [];
  mock.timers.enable({ apis: ['setTimeout'] });
  const channel = openHubChannel({
    host: 'claude',
    session: 's1',
    agent: 'Claude Code',
    retryMs: 1000,
    project: env.project,
    env: env.env,
    onEvent: () => {},
    startHub: async (p) => starts.push(p),
  });
  try {
    for (let attempt = 1; attempt <= 16; attempt++) {
      assert.ok(await turns(() => hub.connections() === attempt), `dial ${attempt} never happened`);
      await turns(() => false, 50);
      mock.timers.tick(1000);
    }
    assert.equal(starts.length, 4);
  } finally {
    channel.close();
    mock.timers.reset();
    await hub.close();
  }
});
