'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { after, beforeEach, test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');

const SESSION = '11111111-1111-4111-8111-111111111111';
const INHERITED = '22222222-2222-4222-8222-222222222222';
const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const environmentKeys = [
  'CODEX_APP_TOOLS_PIPE_PATH',
  'CODEX_APP_TOOLS_CALLER_HOST_ID',
  'CODEX_MCP_NODE_PATH',
  'CODEX_THREAD_ID',
  'CODEX_SESSION_ID',
];
const inheritedEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));

function resetEnvironment() {
  for (const key of environmentKeys) delete process.env[key];
  process.env.CODEX_THREAD_ID = INHERITED;
  process.env.CODEX_SESSION_ID = INHERITED;
}

// No test may connect to the real desktop pipe or address a real chat.
resetEnvironment();
beforeEach(resetEnvironment);
after(() => {
  for (const [key, value] of inheritedEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
const transport = require('../../skills/artifacts/app/codex-desktop-transport.cjs');

function encode(value) {
  const payload = Buffer.from(JSON.stringify(value), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length);
  return Buffer.concat([header, payload]);
}

function catalog(namespace = 'dynamic') {
  return {
    tools: [
      {
        name: 'send_message_to_thread',
        namespace,
        inputSchema: {
          type: 'object',
          properties: {
            threadId: { type: 'string' },
            hostId: { type: 'string' },
            prompt: { type: 'string' },
          },
          required: ['threadId', 'prompt'],
        },
      },
    ],
  };
}

function receipt(threadId = SESSION) {
  return {
    success: true,
    contentItems: [{ type: 'inputText', text: JSON.stringify({ threadId }) }],
  };
}

function respond(socket, request, result) {
  socket.write(encode({ jsonrpc: '2.0', id: request.id, result }));
}

async function desktop(
  t,
  handle = (request, socket) => {
    respond(socket, request, request.method === 'tools/list' ? catalog() : receipt());
  },
) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-ipc-')));
  const pipe =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\ryugi-${path.basename(root)}`
      : path.join(root, 's');
  const requests = [];
  const sockets = new Set();
  const errors = [];
  let connections = 0;
  const server = net.createServer((socket) => {
    connections++;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let pending = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 4 && pending.length >= pending.readUInt32LE(0) + 4) {
        const length = pending.readUInt32LE(0);
        const request = JSON.parse(pending.subarray(4, length + 4).toString('utf8'));
        pending = pending.subarray(length + 4);
        requests.push(request);
        Promise.resolve()
          .then(() => handle(request, socket))
          .catch((error) => {
            errors.push(error);
            socket.destroy();
          });
      }
    });
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
    assert.deepEqual(errors, [], 'fake desktop server failed');
  });
  server.listen(pipe);
  await once(server, 'listening');
  process.env.CODEX_APP_TOOLS_PIPE_PATH = pipe;
  return {
    requests,
    sockets,
    get connections() {
      return connections;
    },
  };
}

function send(message = 'Ryugi comments changed.', signal, options = {}) {
  return transport.sendDesktop({ session: SESSION }, message, signal, {
    timeoutMs: 1000,
    ...options,
  });
}

async function disconnected(server) {
  const deadline = Date.now() + 1000;
  while (server.sockets.size && Date.now() < deadline) await delay(5);
  assert.equal(server.sockets.size, 0, 'the desktop connection was left open');
}

test('desktop pipe detection requires a nonempty inherited path', () => {
  assert.equal(transport.hasDesktopPipe(), false);
  process.env.CODEX_APP_TOOLS_PIPE_PATH = ' \t ';
  assert.equal(transport.hasDesktopPipe(), false);
  process.env.CODEX_APP_TOOLS_PIPE_PATH = 'fixture-only-pipe';
  assert.equal(transport.hasDesktopPipe(), true);
});

test('invalid hook input and nonlocal caller hosts fail before connecting', async (t) => {
  const server = await desktop(t);
  for (const session of [undefined, '', `${SESSION}/other`]) {
    await assert.rejects(transport.sendDesktop({ session }, 'Changed'), /session/i);
  }
  await assert.rejects(send('  '), /message/i);
  for (const host of ['durable', 'ssh-fixture']) {
    process.env.CODEX_APP_TOOLS_CALLER_HOST_ID = host;
    await assert.rejects(send(), /local.*only|only.*local/i);
  }
  delete process.env.CODEX_APP_TOOLS_CALLER_HOST_ID;
  delete process.env.CODEX_APP_TOOLS_PIPE_PATH;
  await assert.rejects(send(), /CODEX_APP_TOOLS_PIPE_PATH/);
  await delay(10);
  assert.equal(server.connections, 0);
});

test('fragmented native callbacks preserve the hook session and discover each namespace', async (t) => {
  let catalogs = 0;
  const server = await desktop(t, async (request, socket) => {
    const result =
      request.method === 'tools/list'
        ? catalog(++catalogs === 1 ? 'dynamic' : 'dynamic_next')
        : receipt();
    const frame = encode({ jsonrpc: '2.0', id: request.id, result });
    socket.write(frame.subarray(0, 2));
    await delay(5);
    socket.write(frame.subarray(2, 9));
    await delay(5);
    socket.write(frame.subarray(9));
  });
  const message = 'Ryugi comments changed. 请查看。';
  assert.deepEqual(await send(message), {
    receipt: JSON.stringify({ threadId: SESSION }),
    warning: '',
  });
  process.env.CODEX_APP_TOOLS_CALLER_HOST_ID = 'local';
  await send('Second callback');
  await disconnected(server);
  assert.equal(server.connections, 2);
  const lists = server.requests.filter((request) => request.method === 'tools/list');
  const calls = server.requests.filter((request) => request.method === 'tools/call');
  assert.equal(server.requests.length, 4);
  assert.equal(lists.length, 2);
  assert.equal(calls.length, 2);
  for (const [index, call] of calls.entries()) {
    assert.equal(lists[index].jsonrpc, '2.0');
    assert.deepEqual(lists[index].params, { threadStartKind: 'all' });
    assert.equal(call.jsonrpc, '2.0');
    assert.notEqual(call.id, lists[index].id);
    assert.deepEqual(call.params.arguments, {
      threadId: SESSION,
      hostId: 'local',
      prompt: index ? 'Second callback' : message,
    });
    assert.equal(call.params.threadId, SESSION);
    assert.equal(call.params.hostId, 'local');
    assert.equal(call.params.namespace, index ? 'dynamic_next' : 'dynamic');
    assert.equal(call.params.tool, 'send_message_to_thread');
    assert.equal(call.params.callerSource, 'codex');
    assert.equal(typeof call.params.callId, 'string');
    assert.ok(call.params.callId.length > 0);
    assert.equal(typeof call.params.turnId, 'string');
    assert.ok(call.params.turnId.length > 0);
  }
  assert.notEqual(calls[0].params.callId, calls[1].params.callId);
  assert.notEqual(calls[0].params.turnId, calls[1].params.turnId);
});

test('RPC errors during discovery or delivery remain failures', async (t) => {
  for (const phase of ['tools/list', 'tools/call']) {
    const server = await desktop(t, (request, socket) => {
      if (request.method !== phase) return respond(socket, request, catalog());
      socket.write(
        encode({
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32603, message: 'fixture RPC unavailable' },
        }),
      );
    });
    await assert.rejects(send(), /fixture RPC unavailable/);
    await disconnected(server);
    assert.equal(server.requests.length, phase === 'tools/list' ? 1 : 2);
  }
});

test('an unsuccessful native tool result remains a delivery failure', async (t) => {
  const server = await desktop(t, (request, socket) => {
    respond(
      socket,
      request,
      request.method === 'tools/list'
        ? catalog()
        : {
            success: false,
            contentItems: [{ type: 'inputText', text: 'fixture delivery denied' }],
          },
    );
  });
  await assert.rejects(send(), /fixture delivery denied/);
  await disconnected(server);
  assert.deepEqual(
    server.requests.map((request) => request.method),
    ['tools/list', 'tools/call'],
  );
});

test('missing, invalid and mismatched callback receipts are rejected', async (t) => {
  for (const contentItems of [
    [],
    [{ type: 'inputText', text: 'not JSON' }],
    receipt(INHERITED).contentItems,
  ]) {
    const server = await desktop(t, (request, socket) => {
      respond(
        socket,
        request,
        request.method === 'tools/list' ? catalog() : { success: true, contentItems },
      );
    });
    await assert.rejects(send(), /receipt/i);
    await disconnected(server);
    assert.equal(server.requests.length, 2);
  }
});

test('an unavailable callback tool stops after discovery', async (t) => {
  const server = await desktop(t, (request, socket) => respond(socket, request, { tools: [] }));
  await assert.rejects(
    send(),
    /send_message_to_thread.*available|send_message_to_thread.*enabled/i,
  );
  await disconnected(server);
  assert.deepEqual(
    server.requests.map((request) => request.method),
    ['tools/list'],
  );
});

test('malformed native response JSON fails the attempt', async (t) => {
  const server = await desktop(t, (_request, socket) =>
    socket.write(Buffer.from([1, 0, 0, 0, 123])),
  );
  await assert.rejects(send(), /invalid.*response/i);
  await disconnected(server);
});

test('native request and response frames are limited to 8 MiB', async (t) => {
  const oversized = Buffer.alloc(4);
  oversized.writeUInt32LE(MAX_FRAME_BYTES + 1);
  const responseServer = await desktop(t, (_request, socket) => socket.write(oversized));
  await assert.rejects(send(), /too large/i);
  await disconnected(responseServer);

  const requestServer = await desktop(t);
  await assert.rejects(send('x'.repeat(MAX_FRAME_BYTES)), /too large/i);
  await disconnected(requestServer);
  assert.ok(requestServer.requests.every((request) => request.method === 'tools/list'));
});

test('a pipe closing before acknowledgement fails the attempt', async (t) => {
  const server = await desktop(t, (request, socket) => {
    if (request.method === 'tools/list') respond(socket, request, catalog());
    else socket.end();
  });
  await assert.rejects(send(), /closed.*acknowledg/i);
  await disconnected(server);
  assert.equal(server.connections, 1);
});

test('a timeout closes the pending connection without retrying', async (t) => {
  const server = await desktop(t, (request, socket) => {
    if (request.method === 'tools/list') respond(socket, request, catalog());
  });
  await assert.rejects(send(undefined, undefined, { timeoutMs: 100 }), /timed out/i);
  await disconnected(server);
  assert.equal(server.connections, 1);
  assert.deepEqual(
    server.requests.map((request) => request.method),
    ['tools/list', 'tools/call'],
  );
});

test('abort closes an in-flight callback and rejects pre-aborted work before connecting', async (t) => {
  const controller = new AbortController();
  const server = await desktop(t, (request, socket) => {
    if (request.method === 'tools/list') respond(socket, request, catalog());
    else controller.abort(new Error('fixture watcher stopped'));
  });
  await assert.rejects(send(undefined, controller.signal), /fixture watcher stopped/);
  await disconnected(server);
  assert.equal(server.connections, 1);
  assert.deepEqual(
    server.requests.map((request) => request.method),
    ['tools/list', 'tools/call'],
  );
  await assert.rejects(send(undefined, controller.signal), /fixture watcher stopped/);
  await delay(10);
  assert.equal(server.connections, 1);
});
