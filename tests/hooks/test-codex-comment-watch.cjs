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
const { setTimeout: delay } = require('node:timers/promises');

const repo = path.resolve(__dirname, '../..');
const adapter = path.join(repo, 'skills/artifacts/app/codex-comment-watch.cjs');
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

async function initialScan(f) {
  const file = path.join(f.project, '.ryugi/artifacts/.state/codex-comment-watch', `${id}.alive`);
  await until(() => fs.existsSync(file), 'codex watcher never wrote a heartbeat');
  const first = fs.readFileSync(file, 'utf8');
  // A heartbeat starts each synchronous scan. The next one proves the initial
  // snapshot finished before this test submits a new answer or round.
  await until(
    () => fs.readFileSync(file, 'utf8') !== first,
    'codex watcher never finished its initial scan',
  );
}

function fixture(t) {
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
  for (const name of fs.readdirSync(path.dirname(adapter)))
    if (/\.(?:cjs|json)$/.test(name))
      fs.copyFileSync(path.join(path.dirname(adapter), name), path.join(app, name));
  fs.writeFileSync(
    path.join(app, 'cli.cjs'),
    `console.log(JSON.stringify({schema:'ryugi.cli/v1', command:process.argv.includes('--version')?'version':'start', outcome:'success', data:{status:'running',capabilities:['reviewBundlesV1']}}));\n`,
  );
  const open = (artifact, session = id) => {
    const bound = spawnSync(process.execPath, [adapter, 'bind'], {
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
  const start = (overrides = {}, activate = true) => {
    if (activate)
      for (const artifact of ['document/plan', 'artboard/settings'])
        open(artifact, overrides.session_id ?? id);
    const child = spawn(process.execPath, [adapter, 'watch'], {
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

test('a new comment is queued to the hook session rather than an inherited parent thread', async (t) => {
  const f = fixture(t);
  f.start();
  f.write('document/plan', f.comments());
  await until(() => f.read().length > 0, 'comment never reached codex queue');
  const args = f.read()[0];
  assert.equal(args[0], 'queue');
  assert.equal(args[args.indexOf('--thread') + 1], id);
  assert.ok(args.includes('--resume'));
  assert.equal(args[args.indexOf('--remote') + 1], f.env.RYUGI_CODEX_REMOTE);
  const message = args[args.indexOf('--message') + 1];
  assert.ok(message.includes('document/plan'));
  assert.ok(message.includes('comment list --section threads --detail --format brief'));
  assert.ok(message.includes('Change it'));
  assert.ok(
    !fs.existsSync(
      path.join(f.project, '.ryugi/artifacts/.state/document/plan/comment-cursors.json'),
    ),
  );
  await delay(1200);
  assert.equal(f.read().length, 1);
});

test('two lifecycle invocations keep a single watcher for the same session', async (t) => {
  const f = fixture(t);
  f.start();
  f.start({ source: 'compact' });
  await delay(250);
  f.write('artboard/settings', f.comments());
  await until(() => f.read().length > 0, 'comment never reached the active watcher');
  await delay(1200);
  assert.equal(f.read().length, 1);
});

test('transport failure retries the pending comment without requiring another human edit', async (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.fail, 'offline');
  f.start();
  f.write('document/plan', f.comments());
  await until(() => f.read().length > 0, 'no first delivery attempt');
  fs.unlinkSync(f.fail);
  await until(() => f.read().length >= 2, 'failed comment was lost instead of retried');
  const delivered = f.read().length;
  await delay(1200);
  assert.equal(f.read().length, delivered);
});

test('comments wake only the session that opened that artifact through the launcher', async (t) => {
  const f = fixture(t);
  f.start({}, false);
  f.write('document/plan', f.comments());
  f.open('document/plan', inherited);
  await delay(1200);
  assert.equal(f.read().length, 0);
  f.open('document/plan');
  await until(() => f.read().length === 1, 'opening the artifact did not activate its watcher');
  f.write('artboard/unrelated', f.comments());
  await delay(1200);
  assert.equal(f.read().length, 1);
});

test('a legacy project wildcard cannot wake a session for unrelated historical comments', async (t) => {
  const f = fixture(t);
  const file = path.join(f.project, '.ryugi/artifacts/.state/codex-comment-watch', `${id}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ artifacts: ['*'] }));
  f.write('document/history', f.comments());
  f.start({}, false);
  await initialScan(f);
  assert.equal(f.read().length, 0);
  f.open('document/plan');
  f.write('document/plan', f.comments());
  await until(() => f.read().length === 1, 'an explicitly opened artifact never woke its session');
  assert.ok(f.read()[0][f.read()[0].indexOf('--message') + 1].includes('document/plan'));
});

test('hosts without PLUGIN_DATA keep worker ownership separate from launcher subscriptions', async (t) => {
  const f = fixture(t);
  delete f.env.PLUGIN_DATA;
  delete f.env.CLAUDE_PLUGIN_DATA;
  const child = f.start({}, false);
  await delay(250);
  f.open('document/plan');
  f.write('document/plan', f.comments());
  await until(() => f.read().length > 0, 'launcher registration stopped its own watcher');
  assert.equal(child.exitCode, null);
});

test('a comment resolved during an outage is not delivered when transport recovers', async (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.fail, 'offline');
  f.start();
  const comments = f.comments();
  f.write('document/plan', comments);
  await until(() => f.read().length > 0, 'no first delivery attempt');
  Object.assign(comments.threads[0], { status: 'resolved', statusBy: 'human', statusAt: at(2) });
  f.write('document/plan', comments);
  fs.unlinkSync(f.fail);
  await delay(2400);
  assert.equal(f.read().length, 1);
});

test('SessionEnd stops delivery and leaves other sessions alone', async (t) => {
  const f = fixture(t);
  const first = f.start();
  const other = f.start({ session_id: inherited });
  await delay(250);
  const end = spawnSync(process.execPath, [adapter, 'stop'], {
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
  f.write('document/plan', f.comments());
  await until(() => f.read().length > 0, 'other session stopped too');
  assert.ok(f.read().every((args) => args[args.indexOf('--thread') + 1] === inherited));
});

test('an invalid session identifier does not fall back to an inherited thread', async (t) => {
  const f = fixture(t);
  const child = f.start({ session_id: '' }, false);
  await until(() => child.exitCode !== null, 'invalid input left a watcher running');
  f.write('document/plan', f.comments());
  await delay(1100);
  assert.equal(f.read().length, 0);
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
  f.open('document/plan');
  f.write('document/plan', f.comments());
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

test('a submitted round is queued even with no unread comments, and the watcher beats', async (t) => {
  const f = fixture(t);
  const rounds = (state) => {
    const file = path.join(f.project, '.ryugi/artifacts/.state/artboard/settings/rounds.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({ rounds: [{ id: 'r1', page: 'p', state, groups: ['q1'], boards: ['a'] }] }),
    );
  };
  f.write('artboard/settings', { version: 1, threads: [] });
  rounds('open');
  f.start();
  await initialScan(f);
  rounds('submitted');
  await until(() => f.read().length > 0, 'submitted round never reached codex queue');
  const args = f.read()[0];
  const message = args[args.indexOf('--message') + 1];
  assert.ok(message.includes('artboard/settings'));
  assert.ok(message.includes('submitted'));
});

test('the heartbeat keeps beating while a queue call is in flight', async (t) => {
  const f = fixture(t);
  fs.writeFileSync(`${f.fail}.slow`, '');
  f.start();
  const alive = path.join(f.project, '.ryugi/artifacts/.state/codex-comment-watch', `${id}.alive`);
  await until(() => fs.existsSync(alive), 'codex watcher never wrote a heartbeat');
  f.write('document/plan', f.comments());
  await until(() => f.read().length > 0, 'comment never reached codex queue');
  const during = Number(fs.readFileSync(alive, 'utf8'));
  await delay(2500);
  assert.ok(Number(fs.readFileSync(alive, 'utf8')) > during, 'heartbeat stopped while queueing');
});

test('submitted document answers are queued even with no unread comments', async (t) => {
  const f = fixture(t);
  const asks = (latest) => {
    const file = path.join(f.project, '.ryugi/artifacts/.state/document/plan/asks.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ latest }));
  };
  f.write('document/plan', { version: 1, threads: [] });
  asks(null);
  f.start();
  await initialScan(f);
  asks({ id: 's1', at: '2026-11-03T00:00:00.000Z', withdrawn: false });
  await until(() => f.read().length > 0, 'submitted answers never reached codex queue');
  const args = f.read()[0];
  const message = args[args.indexOf('--message') + 1];
  assert.ok(
    message.startsWith(
      'Ryugi answers document/plan submitted (s1). Apply each answer, then settle it with comment note --ask <id>. Run: node ',
    ),
    message,
  );
  assert.ok(
    message.includes('comment list --section asks --status submitted --detail --format brief'),
  );
});

test('desktop comments retry through the app pipe and acknowledge the hook session without a CLI fallback', async (t) => {
  const f = fixture(t);
  const app = await desktop(t, f);
  f.start();
  f.write('document/plan', f.comments());
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
  assert.ok(
    call.arguments.prompt.includes('comment list --section threads --detail --format brief'),
  );
  assert.ok(call.arguments.prompt.includes('Change it'));
  assert.equal(JSON.parse(f.state().receipt).threadId, id);
  assert.equal(f.read().length, 0);
});

test('desktop choice submissions use the existing artifact subscription and round notification', async (t) => {
  const f = fixture(t);
  const app = await desktop(t, f);
  app.recover();
  f.write('artboard/settings', { version: 1, threads: [] });
  const file = path.join(f.project, '.ryugi/artifacts/.state/artboard/settings/rounds.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const round = { id: 'r1', page: 'p', state: 'open', groups: ['q1'], boards: ['a'] };
  fs.writeFileSync(file, JSON.stringify({ rounds: [round] }));
  f.start();
  await until(() => Boolean(f.state()), 'desktop watcher never started');
  fs.writeFileSync(file, JSON.stringify({ rounds: [{ ...round, state: 'submitted' }] }));
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
  f.write('document/plan', f.comments());
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
  f.write('document/plan', f.comments());
  await until(
    () => /local host/i.test(f.state()?.lastError || ''),
    'nonlocal host was not rejected',
  );
  assert.equal(app.calls.length, 0);
  assert.equal(f.read().length, 0);
});

test(
  'macOS startup replaces the whole watcher runtime before reading hook stdin',
  { skip: process.platform !== 'darwin' || typeof process.execve !== 'function' },
  async (t) => {
    const f = fixture(t);
    const runtime = path.join(f.root, 'runtime/bin/node');
    const preload = path.join(f.root, 'startup.cjs');
    const log = path.join(f.root, 'startup.jsonl');
    fs.mkdirSync(path.dirname(runtime), { recursive: true });
    // Homebrew Node locates libnode relative to its executable; standalone Node needs no library.
    const lib = path.resolve(path.dirname(process.execPath), '../lib');
    if (fs.existsSync(lib)) fs.symlinkSync(lib, path.join(f.root, 'runtime/lib'), 'dir');
    fs.copyFileSync(process.execPath, runtime);
    fs.chmodSync(runtime, 0o755);
    fs.writeFileSync(
      preload,
      `require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify({runtime:process.execPath,pid:process.pid,ppid:process.ppid,argv:process.argv,cwd:process.cwd()})+'\\n');`,
    );
    f.env.CODEX_APP_TOOLS_PIPE_PATH = path.join(f.root, 'unused.sock');
    f.env.CODEX_MCP_NODE_PATH = runtime;
    delete f.env.RYUGI_CODEX_REMOTE;
    f.env.NODE_OPTIONS = `${f.env.NODE_OPTIONS || ''} --require=${preload}`.trim();
    const child = f.start({}, false);
    await until(() => Boolean(f.state()), 'replaced watcher lost the hook stdin context');
    const starts = fs
      .readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(starts.length, 2);
    assert.equal(starts[0].runtime, process.execPath);
    assert.equal(starts[1].runtime, runtime);
    assert.equal(starts[1].pid, child.pid);
    assert.equal(starts[1].pid, starts[0].pid);
    assert.equal(starts[1].ppid, process.pid);
    assert.deepEqual(
      starts[1].argv,
      starts[0].argv.map((arg, i) => (i === 0 ? runtime : arg)),
    );
    assert.equal(starts[1].cwd, f.project);
    assert.equal(f.state().session, id);
  },
);

test(
  'macOS startup diagnoses a missing inherited runtime or unavailable execve',
  { skip: process.platform !== 'darwin' },
  (t) => {
    const f = fixture(t);
    const preload = path.join(f.root, 'older-node.cjs');
    fs.writeFileSync(preload, 'process.execve = undefined;');
    const runtime = path.join(f.root, 'desktop-node');
    fs.writeFileSync(runtime, '#!/bin/sh\nexit 99\n', { mode: 0o755 });
    for (const [node, expected] of [
      ['relative-node', /absolute CODEX_MCP_NODE_PATH/],
      [runtime, /Node.js 22\.15.*process\.execve/],
    ]) {
      const env = { ...f.env, CODEX_APP_TOOLS_PIPE_PATH: 'unused', CODEX_MCP_NODE_PATH: node };
      delete env.RYUGI_CODEX_REMOTE;
      const result = spawnSync(process.execPath, ['--require', preload, adapter, 'watch'], {
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
  },
);
