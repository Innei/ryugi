'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { after, test } = require('node:test');

const app = path.resolve(__dirname, '../../skills/artifacts/app');
const hook = path.join(app, 'codex-hook.cjs');
const {
  humanTokens,
  promptFor,
  unread,
  validArtifact,
} = require(hook);

const SESSION = '01a21805-1d78-7332-9d20-8a4b34091a78';
const OTHER = '01a21805-1d78-7332-9d20-8a4b34091a79';
const ARTIFACT = 'document/plan';
const AT = '2026-11-26T10:00:00.000Z';
const roots = new Set();

after(() => {
  for (const root of roots)
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

async function until(check, explanation, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {}
    await delay(25);
  }
  assert.fail(typeof explanation === 'function' ? explanation() : explanation);
}

function readWorkerView(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function childEnv(base, overrides = {}) {
  const value = { ...base, ...overrides };
  for (const [key, item] of Object.entries(overrides)) if (item === null) delete value[key];
  return value;
}

function comments(messages = []) {
  return {
    version: 1,
    threads: [
      {
        id: 'thread-1',
        status: 'open',
        anchor: { blockId: 'hero' },
        messages,
      },
    ],
  };
}

function message(id, text, at = AT) {
  return { id, author: 'human', at, text };
}

function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-node-hook-')));
  const project = path.join(root, 'project');
  const data = path.join(root, 'plugin-data');
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(project, '.git'), { recursive: true });
  fs.mkdirSync(data, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  roots.add(root);
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    HOMEDRIVE: path.parse(home).root.replace(/\\$/, ''),
    HOMEPATH: home.slice(path.parse(home).root.length - 1),
    PLUGIN_DATA: data,
    RYUGI_SERVER_HOME: path.join(home, 'unused-server'),
    CODEX_THREAD_ID: SESSION,
    CODEX_SESSION_ID: SESSION,
    CODEX_MCP_NODE_PATH: process.execPath,
  };
  for (const key of [
    'CLAUDE_PLUGIN_DATA',
    'CLAUDE_CODE_SESSION_ID',
    'PI_SESSION_ID',
    'ANTIGRAVITY_CONVERSATION_ID',
    'CODEX_APP_TOOLS_PIPE_PATH',
    'CODEX_APP_TOOLS_CALLER_HOST_ID',
    'RYUGI_CODEX_REMOTE',
  ])
    delete env[key];
  const input = (event = 'SessionStart', session = SESSION) => ({
    session_id: session,
    cwd: project,
    hook_event_name: event,
  });
  const run = (args, stdin = null, overrides = {}) =>
    spawnSync(process.execPath, [hook, ...args], {
      cwd: project,
      env: childEnv(env, overrides),
      input: stdin === null ? undefined : JSON.stringify(stdin),
      encoding: 'utf8',
      timeout: 15_000,
    });
  const commentsPath = path.join(project, '.ryugi', 'artifacts', ARTIFACT, 'comments.json');
  const writeComments = (value) => {
    fs.mkdirSync(path.dirname(commentsPath), { recursive: true });
    fs.writeFileSync(commentsPath, JSON.stringify(value));
  };
  const workerPath = (session = SESSION) =>
    path.join(data, 'codex-comment-watch', 'workers', `${session}.json`);
  const subscriptionPath = (session = SESSION) =>
    path.join(data, 'codex-comment-watch', 'subscriptions', `${session}.json`);
  const state = (session = SESSION) => {
    try {
      return JSON.parse(fs.readFileSync(workerPath(session), 'utf8'));
    } catch {
      return null;
    }
  };
  return {
    root,
    project,
    data,
    home,
    env,
    input,
    run,
    commentsPath,
    writeComments,
    workerPath,
    subscriptionPath,
    state,
  };
}

async function desktopPipe(t, root, session, behavior) {
  const calls = [];
  const sockets = new Set();
  let nextBehavior = behavior;
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let pending = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 4 && pending.length >= pending.readUInt32LE(0) + 4) {
        const length = pending.readUInt32LE(0);
        const request = JSON.parse(pending.subarray(4, length + 4));
        pending = pending.subarray(length + 4);
        let result;
        if (request.method === 'tools/list') {
          result = {
            tools: [{ name: 'send_message_to_thread', namespace: 'test_desktop' }],
          };
        } else {
          calls.push(request.params);
          const answer = nextBehavior(calls.length, request.params);
          result = answer.failure
            ? {
                success: false,
                contentItems: [{ type: 'inputText', text: answer.failure }],
              }
            : {
                success: true,
                contentItems: [
                  {
                    type: 'inputText',
                    text: JSON.stringify({ threadId: answer.threadId ?? session }),
                  },
                ],
              };
        }
        const payload = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
        const header = Buffer.alloc(4);
        header.writeUInt32LE(payload.length);
        socket.write(Buffer.concat([header, payload]));
      }
    });
  });
  const pipe =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\ryugi-node-hook-${randomUUID()}`
      : path.join(root, 'desktop.sock');
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(pipe, resolve);
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  });
  return {
    pipe,
    calls,
    behavior(value) {
      nextBehavior = value;
    },
  };
}

async function startWatch(t, f, pipe, session = SESSION, overrides = {}) {
  const child = spawn(process.execPath, [hook, 'codex-watch'], {
    cwd: f.project,
    env: childEnv(f.env, { ...overrides, CODEX_APP_TOOLS_PIPE_PATH: pipe }),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const errors = [];
  child.stdout.resume();
  child.stderr.on('data', (chunk) => errors.push(String(chunk)));
  child.stdin.end(JSON.stringify(f.input('SessionStart', session)));
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill();
    await Promise.race([once(child, 'exit'), delay(3000)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });
  return { child, errors };
}

function subscribe(f, session = SESSION) {
  const result = f.run(['subscribe'], {
    host: 'codex',
    session,
    project: f.project,
    artifact: ARTIFACT,
  });
  assert.equal(result.status, 0, result.stderr);
}

test('evidence tokens identify new human comments and status changes', () => {
  const thread = {
    id: 'thread-1',
    status: 'open',
    statusBy: 'human',
    statusAt: '2026-11-26T10:01:00.000Z',
    anchor: { blockId: 'hero' },
    messages: [
      message('m1', 'First', '2026-11-26T10:00:00.000Z'),
      { id: 'm2', author: 'agent', at: AT, text: 'Reply' },
      { ...message('m3', 'Edited'), editedAt: '2026-11-26T10:02:00.000Z' },
    ],
  };
  const tokens = humanTokens(thread);
  assert.equal(tokens.length, 3);
  assert.equal(tokens[1].at, '2026-11-26T10:02:00.000Z');
  const pending = unread({
    threads: [
      thread,
      {
        id: 'question',
        status: 'open',
        anchor: { ask: 'q1' },
        messages: [message('q', 'Which option?')],
      },
    ],
  });
  assert.equal(pending.threads.length, 1);
  assert.equal(pending.tokens.length, 3);
  assert.match(promptFor(ARTIFACT, pending), /thread-1 \[open\] hero/);
  assert.deepEqual(unread({ threads: [thread] }, new Set(pending.tokens)), {
    threads: [],
    tokens: [],
  });
  assert.equal(validArtifact(ARTIFACT), true);
  assert.equal(validArtifact('../escape'), false);
});

test('resolved threads are not replayed as historical unread comments', () => {
  const resolved = {
    id: 'thread-resolved',
    status: 'resolved',
    statusBy: 'agent',
    statusAt: '2026-11-26T10:02:00.000Z',
    anchor: { blockId: 'hero' },
    messages: [message('m1', 'Already handled', '2026-11-26T10:00:00.000Z')],
  };
  const open = {
    ...resolved,
    id: 'thread-open',
    status: 'open',
    statusBy: 'human',
    messages: [message('m2', 'Please change this')],
  };
  const pending = unread({ threads: [resolved, open] });
  assert.deepEqual(
    pending.threads.map(({ thread }) => thread.id),
    ['thread-open'],
  );
  assert.equal(pending.tokens.length, 2);
  assert.match(promptFor(ARTIFACT, pending), /thread-open \[open\] hero/);
  assert.doesNotMatch(promptFor(ARTIFACT, pending), /Already handled/);
});

test('subscribe records the session and stamps the project header', async (t) => {
  const f = fixture();
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      requests.push({
        url: request.url,
        project: request.headers['x-ryugi-project'],
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      });
      response.end('{}');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const state = path.join(f.project, '.ryugi', 'artifacts', '.state');
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(
    path.join(state, 'server-info'),
    JSON.stringify({ url: `http://127.0.0.1:${server.address().port}/?key=test-key` }),
  );
  subscribe(f);
  await until(() => requests.length === 1, 'subscribe request was not sent');
  assert.equal(requests[0].url, '/api/agent/subscribe?key=test-key');
  assert.equal(requests[0].project, encodeURIComponent(f.project));
  assert.deepEqual(requests[0].body, {
    host: 'codex',
    session: SESSION,
    project: f.project,
    artifact: ARTIFACT,
  });
  const recorded = JSON.parse(fs.readFileSync(f.subscriptionPath(), 'utf8'));
  assert.equal(recorded.subscriptions[0].artifact, ARTIFACT);
});

test('desktop delivery consumes only the acknowledged snapshot and re-reads new comments', async (t) => {
  const f = fixture();
  const initial = message('m1', 'Change the name');
  f.writeComments(comments([initial]));
  subscribe(f);
  let desktop;
  desktop = await desktopPipe(t, f.root, SESSION, (call) => {
    if (call === 1)
      f.writeComments(comments([initial, message('m2', 'Now change the subtitle')]));
    return {};
  });
  const watch = await startWatch(t, f, desktop.pipe);
  await until(
    () => desktop.calls.length >= 2 && f.state()?.consumed?.[ARTIFACT]?.length === 2,
    () => `new snapshot was not delivered: ${JSON.stringify(f.state())} ${watch.errors.join('')}`,
  );
  const first = desktop.calls[0].arguments.prompt;
  const second = desktop.calls[1].arguments.prompt;
  assert.match(first, /m1 human \d{2}:\d{2}: Change the name/);
  assert.doesNotMatch(first, /m2/);
  assert.match(second, /m2 human \d{2}:\d{2}: Now change the subtitle/);
  assert.doesNotMatch(second, /m1/);
  assert.equal(desktop.calls[0].arguments.threadId, SESSION);
  assert.equal(desktop.calls[0].hostId, 'local');
});

test('a session bound in one project watches artifacts opened from another project', async (t) => {
  const f = fixture();
  const project = path.join(f.root, 'artifact-project');
  fs.mkdirSync(path.join(project, '.git'), { recursive: true });
  const env = { PLUGIN_DATA: null, CLAUDE_PLUGIN_DATA: null };
  const bound = f.run(['codex-bind'], f.input(), env);
  assert.equal(bound.status, 0, bound.stderr);
  const proof = bound.stdout.match(/--ryugi-session ([a-f0-9:-]+)/)?.[1];
  assert.ok(proof, bound.stdout);

  const prepared = f.run(
    [
      'launch-prepare',
      '--ryugi-session',
      proof,
      '--',
      'start',
      '--project-dir',
      project,
      '--artifact',
      ARTIFACT,
    ],
    null,
    env,
  );
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.deepEqual(JSON.parse(prepared.stdout), {
    host: 'codex',
    session: SESSION,
    agent: 'Codex',
    project,
    artifact: ARTIFACT,
  });

  const subscribed = f.run(
    ['subscribe'],
    { host: 'codex', session: SESSION, project, artifact: ARTIFACT },
    env,
  );
  assert.equal(subscribed.status, 0, subscribed.stderr);
  const watchData = path.join(f.home, '.ryugi', 'codex-comment-watch');
  const subscriptionPath = path.join(watchData, 'subscriptions', `${SESSION}.json`);
  assert.equal(
    JSON.parse(fs.readFileSync(subscriptionPath, 'utf8')).subscriptions[0].project,
    project,
  );
  const commentsPath = path.join(project, '.ryugi', 'artifacts', ARTIFACT, 'comments.json');
  fs.mkdirSync(path.dirname(commentsPath), { recursive: true });
  fs.writeFileSync(commentsPath, JSON.stringify(comments([message('m1', 'Cross-project')])));

  const desktop = await desktopPipe(t, f.root, SESSION, () => ({}));
  const watch = await startWatch(t, f, desktop.pipe, SESSION, env);
  const statePath = path.join(watchData, 'workers', `${SESSION}.json`);
  await until(
    () => {
      try {
        return (
          JSON.parse(fs.readFileSync(statePath, 'utf8')).consumed?.[ARTIFACT]?.length === 1
        );
      } catch {
        return false;
      }
    },
    () =>
      `cross-project comment was not delivered: ${watch.errors.join('')} ${JSON.stringify(
        readWorkerView(statePath),
      )}`,
  );
  assert.match(desktop.calls[0].arguments.prompt, /m1 human \d{2}:\d{2}: Cross-project/);
});

test('failed and mismatched desktop receipts keep the comment pending until a valid retry', async (t) => {
  const f = fixture();
  f.writeComments(comments([message('m1', 'Keep this pending')]));
  subscribe(f);
  const desktop = await desktopPipe(t, f.root, SESSION, (call) => {
    if (call === 1) return { failure: 'desktop offline' };
    if (call === 2) return { threadId: OTHER };
    return {};
  });
  const watch = await startWatch(t, f, desktop.pipe);
  await until(
    () => f.state()?.lastError === 'desktop offline',
    () => `first failure was not recorded: ${watch.errors.join('')}`,
  );
  assert.equal(f.state()?.consumed?.[ARTIFACT], undefined);
  await until(
    () => /does not match/.test(f.state()?.lastError || ''),
    'mismatched receipt was not rejected',
  );
  assert.equal(f.state()?.consumed?.[ARTIFACT], undefined);
  await until(
    () => f.state()?.consumed?.[ARTIFACT]?.length === 1,
    () => `valid retry did not consume the comment: ${JSON.stringify(f.state())}`,
  );
  assert.equal(desktop.calls.length, 3);
});

test('codex-stop terminates only the addressed hook session', async (t) => {
  const f = fixture();
  const first = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
  });
  const second = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
  });
  t.after(async () => {
    for (const child of [first, second]) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      child.kill();
      await Promise.race([once(child, 'exit'), delay(1000)]);
    }
  });
  for (const [session, child] of [
    [SESSION, first],
    [OTHER, second],
  ]) {
    const file = f.workerPath(session);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        pid: child.pid,
        token: randomUUID(),
        project: f.project,
        session,
        host: 'codex',
        agent: 'Codex',
        consumed: {},
      }),
    );
  }
  const result = f.run(['codex-stop'], f.input('SessionEnd'));
  assert.equal(result.status, 0, result.stderr);
  await until(
    () => first.exitCode !== null || first.signalCode !== null,
    'the addressed session kept running',
  );
  assert.equal(second.exitCode, null);
  assert.equal(fs.existsSync(f.workerPath(SESSION)), false);
  assert.equal(fs.existsSync(f.workerPath(OTHER)), true);
});

test(
  'the Windows wrapper and launcher use the bound Node hook',
  { skip: process.platform !== 'win32' },
  async () => {
    const f = fixture();
    const plugin = path.join(f.root, 'plugin');
    const target = path.join(plugin, 'skills', 'artifacts', 'app');
    fs.mkdirSync(target, { recursive: true });
    for (const name of [
      'ryugi.cjs',
      'output-bootstrap.cjs',
      'codex-hook.cjs',
      'codex-hook.cmd',
    ])
      fs.copyFileSync(path.join(app, name), path.join(target, name));
    fs.writeFileSync(
      path.join(target, 'cli.cjs'),
      `const args=process.argv.slice(2);if(args.includes('--version'))console.log(JSON.stringify({schema:'ryugi.cli/v1',command:'version',outcome:'success',data:{capabilities:['reviewBundlesV1']}}));else console.log(JSON.stringify({schema:'ryugi.cli/v1',command:'start',outcome:'success',data:{}}));\n`,
    );
    const bound = f.run(
      ['codex-bind'],
      f.input(),
      { RYUGI_PLUGIN_ROOT: plugin },
    );
    assert.equal(bound.status, 0, bound.stderr);
    const proof = bound.stdout.match(/--ryugi-session ([a-f0-9:-]+)/)?.[1];
    assert.ok(proof, bound.stdout);
    const context = path.join(
      f.data,
      'codex-comment-watch',
      'contexts',
      `${SESSION}.json`,
    );
    assert.equal(JSON.parse(fs.readFileSync(context, 'utf8')).session, SESSION);

    const command = `"${path.join(target, 'codex-hook.cmd')}" codex-bind`;
    const wrapper = spawnSync(command, {
      cwd: f.project,
      env: { ...f.env, RYUGI_PLUGIN_ROOT: plugin },
      input: JSON.stringify(f.input()),
      encoding: 'utf8',
      shell: true,
    });
    assert.equal(wrapper.status, 0, wrapper.stderr);

    const launched = spawnSync(
      process.execPath,
      [
        path.join(target, 'ryugi.cjs'),
        '--ryugi-session',
        proof,
        'start',
        '--artifact',
        ARTIFACT,
        '--project-dir',
        f.project,
      ],
      {
        cwd: f.project,
        env: { ...f.env, RYUGI_PLUGIN_ROOT: plugin },
        encoding: 'utf8',
        timeout: 15_000,
      },
    );
    assert.equal(launched.status, 0, launched.stderr);
    await until(
      () => fs.existsSync(f.subscriptionPath()),
      'the launcher did not subscribe through codex-hook.cjs',
    );
    assert.equal(
      JSON.parse(fs.readFileSync(f.subscriptionPath(), 'utf8')).subscriptions[0].artifact,
      ARTIFACT,
    );
  },
);
