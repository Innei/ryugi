'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');

const cacheHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-codex-cache-'));
process.env.XDG_CACHE_HOME = cacheHome;
after(() => fs.rmSync(cacheHome, { recursive: true, force: true }));
require('./fake-artifacts-release.cjs').seedFakeRelease(cacheHome);
const { setTimeout: delay } = require('node:timers/promises');
const { fakeHub } = require('./fake-hub.cjs');

const { hookBin } = require('./hook-bin.cjs');

const repo = path.resolve(__dirname, '../..');
const hook = hookBin();
const id = '01a18caa-a157-7071-ac28-96aa9066af5f';
const inherited = '01a18ca7-51af-77f0-8c4d-0c4bd2e2fcaf';
const at = (n) => `2026-10-30T10:00:${String(n).padStart(2, '0')}.000Z`;

async function until(check, explanation, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return;
    await delay(25);
  }
  assert.fail(typeof explanation === 'function' ? explanation() : explanation);
}

function fixture(t) {
  const hub = fakeHub(t);
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-codex-watch-')));
  const project = path.join(root, "project with ' quote");
  const data = path.join(root, 'plugin-data');
  const bin = path.join(root, 'bin');
  fs.mkdirSync(project);
  fs.mkdirSync(data);
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(project, '.git'));
  // Hide the enclosing agent's external transport discovery, but retain real
  // ancestry for session bindings. A shell wrapper also survives Node execve
  // without adding extra NODE_OPTIONS preload executions to the fixture log.
  if (process.platform !== 'win32')
    fs.writeFileSync(
      path.join(bin, 'ps'),
      `#!/bin/sh
case " $* " in
  *" ppid=,comm= "*) /bin/ps "$@" | sed 's/codex[^[:space:]/]*/fixture-host/g' ;;
  *) exec /bin/ps "$@" ;;
esac
`,
      { mode: 0o755 },
    );
  const log = path.join(root, 'queue.jsonl');
  const fail = path.join(root, 'fail');
  const fake = path.join(bin, process.platform === 'win32' ? 'codex.cmd' : 'codex');
  // Substitute only the external CLI transport; the watcher, hooks and filesystem are real.
  fs.writeFileSync(
    fake,
    `#!/usr/bin/env node\nconst fs=require('node:fs');fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(process.argv.slice(2))+'\\n');if(fs.existsSync(${JSON.stringify(fail)})){process.stderr.write('transport unavailable');process.exit(1);}if(fs.existsSync(${JSON.stringify(fail)}+'.slow')){Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,4000);}console.log('Queued message test-receipt');\n`,
    { mode: 0o755 },
  );
  const env = {
    ...process.env,
    PLUGIN_ROOT: repo,
    PLUGIN_DATA: data,
    CODEX_THREAD_ID: inherited,
    CODEX_SESSION_ID: inherited,
    RYUGI_CODEX_REMOTE: 'unix:///tmp/ryugi-test.sock',
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    ...hub.env,
  };
  // Fixture hooks must never contact the real desktop app inherited by the test runner.
  delete env.CODEX_APP_TOOLS_PIPE_PATH;
  delete env.CODEX_MCP_NODE_PATH;
  delete env.CODEX_APP_TOOLS_CALLER_HOST_ID;
  const input = {
    session_id: id,
    cwd: project,
    hook_event_name: 'SessionStart',
    source: 'startup',
  };
  const children = [];
  const errors = [];
  const app = path.join(root, 'app');
  fs.mkdirSync(app);
  const appDir = path.join(repo, 'skills/artifacts/app');
  for (const name of fs.readdirSync(appDir))
    if (/\.(?:cjs|json)$/.test(name))
      fs.copyFileSync(path.join(appDir, name), path.join(app, name));
  fs.writeFileSync(
    path.join(app, 'cli.cjs'),
    `console.log(JSON.stringify({schema:'ryugi.cli/v1', command:process.argv.includes('--version')?'version':'start', outcome:'success', data:{status:'running',capabilities:['reviewBundlesV1']}}));\n`,
  );
  const open = (artifact, session = id) => {
    const bound = spawnSync(hook, ['codex-bind'], {
      env,
      input: JSON.stringify({ ...input, session_id: session }),
      encoding: 'utf8',
    });
    assert.equal(bound.status, 0, bound.stderr);
    const proof = bound.stdout.match(/--ryugi-session ([a-f0-9:-]+)/)?.[1];
    assert.ok(proof, 'the hook did not supply a session-bound invocation');
    const result = spawnSync(
      process.execPath,
      [
        path.join(app, 'ryugi.cjs'),
        '--ryugi-session',
        proof,
        'start',
        '--json',
        '--project-dir',
        project,
        '--artifact',
        artifact,
      ],
      {
        env: { ...env, CODEX_THREAD_ID: session, CODEX_SESSION_ID: session },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '', 'the launcher rejected its hook binding');
  };
  const read = () =>
    fs.existsSync(log)
      ? fs
          .readFileSync(log, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];
  const write = (artifact, value) => {
    const file = path.join(project, '.ryugi/artifacts', artifact, 'comments.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  };
  const comments = (n = 1) => ({
    version: 1,
    threads: [
      {
        id: 't1',
        status: 'open',
        statusBy: 'human',
        statusAt: at(1),
        anchor: { blockId: 'b1' },
        messages: [{ id: `m${n}`, author: 'human', at: at(n), text: 'Change it' }],
      },
    ],
  });
  let nextId = 0;
  const push = async (artifact, event = {}, session = id) => {
    await until(() => hub.sessions.has(session), 'the watcher never said hello to the hub');
    const sent = ++nextId;
    hub.send(session, {
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
            messages: [{ id: 'm1', at: at(1), name: 'human', text: 'Change it' }],
          },
        ],
        ...event,
      },
    });
    return sent;
  };
  const retract = (artifact, session = id) =>
    hub.send(session, { t: 'retract', project, artifact, type: 'ryugi-comments' });
  const start = (overrides = {}, activate = false) => {
    if (activate)
      for (const artifact of ['document/plan', 'artboard/settings'])
        open(artifact, overrides.session_id ?? id);
    const child = spawn(hook, ['codex-watch'], {
      cwd: project,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stderr.on('data', (chunk) => errors.push(String(chunk)));
    child.stdout.on('data', () => {});
    child.stdin.end(JSON.stringify({ ...input, ...overrides }));
    children.push(child);
    return child;
  };
  t.after(async () => {
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      const done = new Promise((resolve) => child.once('exit', resolve));
      child.kill();
      await done;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const state = () => {
    try {
      return JSON.parse(
        fs.readFileSync(path.join(data, 'codex-comment-watch/workers', `${id}.json`), 'utf8'),
      );
    } catch {
      return null;
    }
  };
  return {
    hub,
    push,
    retract,
    root,
    project,
    data,
    env,
    input,
    read,
    write,
    comments,
    start,
    fail,
    open,
    state,
    errors,
  };
}

async function desktop(t, f) {
  const calls = [];
  const sockets = new Set();
  let failure = true;
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
          result = { tools: [{ name: 'send_message_to_thread', namespace: 'test_desktop' }] };
        } else {
          calls.push(request.params);
          result = failure
            ? { success: false, contentItems: [{ type: 'inputText', text: 'desktop offline' }] }
            : {
                success: true,
                contentItems: [{ type: 'inputText', text: JSON.stringify({ threadId: id }) }],
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
      ? `\\\\.\\pipe\\ryugi-test-${path.basename(f.root)}`
      : path.join(f.root, 'desktop.sock');
  await new Promise((resolve) => server.listen(pipe, resolve));
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  });
  f.env.CODEX_APP_TOOLS_PIPE_PATH = pipe;
  f.env.CODEX_MCP_NODE_PATH = process.execPath;
  delete f.env.RYUGI_CODEX_REMOTE;
  return {
    calls,
    recover: () => {
      failure = false;
    },
  };
}

function hooks() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(repo, '.codex-plugin/plugin.json'), 'utf8'),
  );
  if (typeof manifest.hooks !== 'string') return {};
  return JSON.parse(fs.readFileSync(path.resolve(repo, manifest.hooks), 'utf8')).hooks;
}

test('a hub event is queued to the hook session rather than an inherited parent thread, then acknowledged', async (t) => {
  const f = fixture(t);
  f.start();
  const sent = await f.push('document/plan');
  await until(() => f.read().length > 0, 'comment never reached codex queue');
  assert.equal(f.hub.hellos()[0].session, id);
  assert.equal(f.hub.hellos()[0].agent, 'Codex');
  const args = f.read()[0];
  assert.equal(args[0], 'queue');
  assert.equal(args[args.indexOf('--thread') + 1], id);
  assert.ok(args.includes('--resume'));
  assert.equal(args[args.indexOf('--remote') + 1], f.env.RYUGI_CODEX_REMOTE);
  const message = args[args.indexOf('--message') + 1];
  assert.ok(message.includes('document/plan'));
  assert.ok(message.includes('\nComment list: document/plan · fake threads'));
  assert.ok(!message.includes('Run: '));
  await until(() => f.hub.delivered().includes(sent), 'the delivery was never acknowledged');
  assert.equal(f.read().length, 1);
});

test('two lifecycle invocations keep a single watcher for the same session', async (t) => {
  const f = fixture(t);
  const first = f.start();
  const second = f.start({ source: 'compact' });
  await until(
    () => [first, second].some((child) => child.exitCode !== null),
    'both watchers kept running',
  );
  await f.push('artboard/settings');
  await until(() => f.read().length > 0, 'comment never reached the active watcher');
  await delay(300);
  assert.equal(f.read().length, 1);
  assert.equal(f.hub.hellos().length, 1);
});

test('transport failure retries the pending comment, and only success is acknowledged', async (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.fail, 'offline');
  f.start();
  const sent = await f.push('document/plan');
  await until(() => f.read().length > 0, 'no first delivery attempt');
  assert.deepEqual(f.hub.delivered(), []);
  fs.unlinkSync(f.fail);
  await until(() => f.read().length >= 2, 'failed comment was lost instead of retried');
  await until(() => f.hub.delivered().includes(sent), 'the retried delivery was not acknowledged');
  const delivered = f.read().length;
  await delay(1200);
  assert.equal(f.read().length, delivered);
});

test('hosts without PLUGIN_DATA still deliver', async (t) => {
  const f = fixture(t);
  delete f.env.PLUGIN_DATA;
  delete f.env.CLAUDE_PLUGIN_DATA;
  const child = f.start();
  await f.push('document/plan');
  await until(() => f.read().length > 0, 'no delivery without PLUGIN_DATA');
  assert.equal(child.exitCode, null);
});

test('a retract drops a comment still waiting for the transport', async (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.fail, 'offline');
  f.start();
  await f.push('document/plan');
  await until(() => f.read().length > 0, 'no first delivery attempt');
  f.retract('document/plan');
  await delay(100);
  fs.unlinkSync(f.fail);
  await delay(2400);
  assert.equal(f.read().length, 1);
});

test('SessionEnd stops delivery and leaves other sessions alone', async (t) => {
  const f = fixture(t);
  const first = f.start();
  const other = f.start({ session_id: inherited });
  await until(
    () => f.hub.sessions.has(id) && f.hub.sessions.has(inherited),
    'watchers never connected',
  );
  const end = spawnSync(hook, ['codex-stop'], {
    // Cleanup must still work when the desktop runtime/pipe has gone away.
    env: { ...f.env, CODEX_APP_TOOLS_PIPE_PATH: 'unavailable', CODEX_MCP_NODE_PATH: 'missing' },
    input: JSON.stringify({ ...f.input, hook_event_name: 'SessionEnd' }),
    encoding: 'utf8',
  });
  assert.equal(end.status, 0);
  await until(
    () => first.exitCode !== null || first.signalCode !== null,
    'ended session kept watching',
  );
  assert.equal(other.exitCode, null);
  await f.push('document/plan', {}, inherited);
  await until(() => f.read().length > 0, 'other session stopped too');
  assert.ok(f.read().every((args) => args[args.indexOf('--thread') + 1] === inherited));
});

test('an invalid session identifier does not fall back to an inherited thread', async (t) => {
  const f = fixture(t);
  const child = f.start({ session_id: '' });
  await until(() => child.exitCode !== null, 'invalid input left a watcher running');
  assert.deepEqual(f.hub.hellos(), []);
});

test('on Windows, where adeck-hook has no build, every Codex hook runs nothing', () => {
  const entries = Object.values(hooks()).flatMap((groups) =>
    groups.flatMap((group) => group.hooks),
  );
  assert.ok(entries.length > 0);
  for (const entry of entries) assert.equal(entry.commandWindows, 'exit 0', entry.command);
});

test('the shipped lifecycle hooks invoke the portable watcher and stop it on session end', async (t) => {
  const f = fixture(t);
  const config = hooks();
  const children = [];
  for (const entry of (config.SessionStart ?? []).flatMap((group) => group.hooks)) {
    if (!entry.async) {
      const result = spawnSync(entry.command, {
        cwd: f.project,
        env: f.env,
        shell: true,
        input: JSON.stringify(f.input),
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
    } else {
      const child = spawn(entry.command, {
        cwd: f.project,
        env: f.env,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      child.stderr.on('data', () => {});
      child.stdout.on('data', () => {});
      child.stdin.end(JSON.stringify(f.input));
      children.push(child);
      t.after(() => child.kill());
    }
  }
  await f.push('document/plan');
  await until(() => f.read().length > 0, 'the manifest command did not deliver comments');
  const end = config.SessionEnd?.[0]?.hooks?.[0];
  assert.ok(end, 'the Codex plugin has no cleanup hook');
  const result = spawnSync(end.command, {
    env: f.env,
    shell: true,
    input: JSON.stringify({ ...f.input, hook_event_name: 'SessionEnd' }),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  await until(
    () => children.every((child) => child.exitCode !== null),
    'the manifest cleanup command did not stop the watcher',
  );
});

test('a submitted round is queued', async (t) => {
  const f = fixture(t);
  f.start();
  await f.push('artboard/settings', {
    type: 'ryugi-choices',
    round: 'r1',
    groups: 1,
    threads: undefined,
    unread: undefined,
  });
  await until(() => f.read().length > 0, 'submitted round never reached codex queue');
  const args = f.read()[0];
  const message = args[args.indexOf('--message') + 1];
  assert.ok(message.includes('Ryugi choices artboard/settings round r1 submitted'), message);
});

test('the inline listing reads as the hook session the agent is bound to, not the inherited thread', async (t) => {
  const f = fixture(t);
  const calls = path.join(f.root, 'cli-calls.jsonl');
  f.env.RYUGI_FAKE_CLI_LOG = calls;
  f.write('document/plan', f.comments());
  f.open('document/plan');
  f.start();
  await f.push('document/plan');
  await until(() => f.read().length > 0, 'the comment never reached the codex queue');
  const reads = fs
    .readFileSync(calls, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((call) => call.args[0] === 'comment' && call.args[1] === 'list');
  assert.ok(reads.length > 0, 'the watcher did not read the listing');
  assert.deepEqual(
    { host: reads[0].host, agent: reads[0].agent, thread: reads[0].thread },
    { host: 'codex', agent: 'Codex', thread: id },
  );
});

test('submitted document answers are queued with the listed answers inline', async (t) => {
  const f = fixture(t);
  f.write('document/plan', { version: 1, threads: [] });
  f.start();
  await f.push('document/plan', {
    type: 'ryugi-answers',
    submit: 's1',
    questions: 0,
    threads: undefined,
    unread: undefined,
  });
  await until(() => f.read().length > 0, 'submitted answers never reached codex queue');
  const args = f.read()[0];
  const message = args[args.indexOf('--message') + 1];
  assert.ok(
    message.startsWith(
      'Ryugi answers document/plan submitted (s1).\nComment list: document/plan',
    ),
    message,
  );
  assert.ok(!message.includes('Run:'), message);
});

test('desktop comments retry through the app pipe and acknowledge the hook session without a CLI fallback', async (t) => {
  const f = fixture(t);
  const app = await desktop(t, f);
  f.start();
  const sent = await f.push('document/plan');
  await until(
    () => app.calls.length > 0,
    () =>
      `desktop comment never reached the app pipe: ${f.errors.join('')} ${JSON.stringify(f.state())}`,
  );
  await until(
    () => f.state()?.lastError?.includes('desktop offline'),
    'app failure was not recorded',
  );
  app.recover();
  await until(() => Boolean(f.state()?.queuedAt), 'pending desktop comment was not retried');
  const call = app.calls.at(-1);
  assert.equal(call.threadId, id);
  assert.equal(call.arguments.threadId, id);
  assert.equal(call.hostId, 'local');
  assert.equal(call.arguments.hostId, 'local');
  assert.equal(call.namespace, 'test_desktop');
  assert.ok(call.arguments.prompt.includes('\nComment list: document/plan · fake threads'));
  assert.ok(!call.arguments.prompt.includes('Run: '));
  assert.equal(JSON.parse(f.state().receipt).threadId, id);
  assert.equal(f.read().length, 0);
  await until(() => f.hub.delivered().includes(sent), 'the desktop delivery was not acknowledged');
});

test('desktop choice submissions reach the app pipe', async (t) => {
  const f = fixture(t);
  const app = await desktop(t, f);
  app.recover();
  f.start();
  await f.push('artboard/settings', {
    type: 'ryugi-choices',
    round: 'r1',
    groups: 1,
    threads: undefined,
    unread: undefined,
  });
  await until(() => app.calls.length > 0, 'desktop choice never reached the app pipe');
  assert.ok(
    app.calls[0].arguments.prompt.includes('Ryugi choices artboard/settings round r1 submitted'),
  );
  assert.equal(f.read().length, 0);
});

test('an explicit RYUGI_CODEX_REMOTE keeps the CLI queue inside a desktop environment', async (t) => {
  const f = fixture(t);
  const app = await desktop(t, f);
  app.recover();
  f.env.RYUGI_CODEX_REMOTE = 'unix:///tmp/ryugi-test.sock';
  f.start();
  await f.push('document/plan');
  await until(() => f.read().length > 0, 'comment never reached codex queue');
  assert.equal(f.read()[0][f.read()[0].indexOf('--remote') + 1], 'unix:///tmp/ryugi-test.sock');
  assert.equal(app.calls.length, 0);
  assert.equal(f.state().transport, undefined);
});

test('a nonlocal desktop host is rejected without trying the CLI endpoint', async (t) => {
  const f = fixture(t);
  const app = await desktop(t, f);
  f.env.CODEX_APP_TOOLS_CALLER_HOST_ID = 'durable';
  f.start();
  await f.push('document/plan');
  await until(
    () => /local host/i.test(f.state()?.lastError || ''),
    'nonlocal host was not rejected',
  );
  assert.equal(app.calls.length, 0);
  assert.equal(f.read().length, 0);
});

test('desktop startup names a missing or unusable inherited runtime', (t) => {
  const f = fixture(t);
  const runtime = path.join(f.root, 'desktop-node');
  fs.writeFileSync(runtime, 'not executable', { mode: 0o644 });
  for (const [node, expected] of [
    ['relative-node', /absolute CODEX_MCP_NODE_PATH/],
    [runtime, /not an executable file/],
  ]) {
    const env = { ...f.env, CODEX_APP_TOOLS_PIPE_PATH: 'unused', CODEX_MCP_NODE_PATH: node };
    delete env.RYUGI_CODEX_REMOTE;
    const result = spawnSync(hook, ['codex-watch'], {
      env,
      input: JSON.stringify(f.input),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout).hookSpecificOutput;
    assert.equal(output.hookEventName, 'SessionStart');
    assert.match(output.additionalContext, expected);
  }
  assert.equal(f.state(), null);
});

function appRuntime(f) {
  const log = path.join(f.root, 'runtime.log');
  const runtime = path.join(f.root, 'app-node');
  fs.writeFileSync(
    runtime,
    `#!/bin/sh\necho "$$ $PPID" >> '${log}'\nexec '${process.execPath}' "$@"\n`,
    {
      mode: 0o755,
    },
  );
  f.env.CODEX_MCP_NODE_PATH = runtime;
  f.env.PATH = '/usr/bin:/bin';
  return () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []);
}

test('the app pipe is reached by the hook process itself under the app runtime, with only the host above it', async (t) => {
  const f = fixture(t);
  const app = await desktop(t, f);
  app.recover();
  const launches = appRuntime(f);
  const watcher = f.start();
  await f.push('document/plan');
  await f.push('document/plan');
  await until(
    () => app.calls.length > 1,
    () => `desktop comments never arrived: ${JSON.stringify(f.state())} ${f.errors.join('')}`,
  );
  assert.deepEqual(launches(), [`${watcher.pid} ${process.pid}`]);
});

test('SessionEnd stops a desktop watcher, its app runtime included', async (t) => {
  const f = fixture(t);
  const app = await desktop(t, f);
  app.recover();
  appRuntime(f);
  const watcher = f.start();
  await until(() => f.hub.sessions.has(id), 'the desktop watcher never connected');
  const end = spawnSync(hook, ['codex-stop'], {
    env: f.env,
    input: JSON.stringify({ ...f.input, hook_event_name: 'SessionEnd' }),
    encoding: 'utf8',
  });
  assert.equal(end.status, 0, end.stderr);
  await until(
    () => watcher.exitCode !== null || watcher.signalCode !== null,
    'the app runtime kept running after SessionEnd',
  );
  await until(() => !f.hub.sessions.has(id), 'the hub channel stayed open');
});
