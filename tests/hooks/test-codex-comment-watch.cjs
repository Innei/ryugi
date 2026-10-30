'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
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
  assert.fail(explanation);
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
  const log = path.join(root, 'queue.jsonl');
  const fail = path.join(root, 'fail');
  const fake = path.join(bin, process.platform === 'win32' ? 'codex.cmd' : 'codex');
  // Substitute only the external CLI transport; the watcher, hooks and filesystem are real.
  fs.writeFileSync(
    fake,
    `#!/usr/bin/env node\nconst fs=require('node:fs');fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(process.argv.slice(2))+'\\n');if(fs.existsSync(${JSON.stringify(fail)})){process.stderr.write('transport unavailable');process.exit(1);}console.log('Queued message test-receipt');\n`,
    { mode: 0o755 },
  );
  const env = {
    ...process.env,
    PLUGIN_ROOT: repo,
    PLUGIN_DATA: data,
    CODEX_THREAD_ID: inherited,
    RYUGI_CODEX_REMOTE: 'unix:///tmp/ryugi-test.sock',
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
  };
  const input = {
    session_id: id,
    cwd: project,
    hook_event_name: 'SessionStart',
    source: 'startup',
  };
  const children = [];
  const app = path.join(root, 'app');
  fs.mkdirSync(app);
  for (const name of fs.readdirSync(path.dirname(adapter)))
    if (/\.(?:cjs|json)$/.test(name))
      fs.copyFileSync(path.join(path.dirname(adapter), name), path.join(app, name));
  fs.writeFileSync(
    path.join(app, 'cli.cjs'),
    "console.log(JSON.stringify({type:'server-started'}));\n",
  );
  const open = (artifact, session = id) => {
    const result = spawnSync(
      process.execPath,
      [
        path.join(app, 'ryugi-artifacts.cjs'),
        'start',
        '--json',
        '--project-dir',
        project,
        '--artifact',
        artifact,
      ],
      {
        env: { ...env, CODEX_THREAD_ID: session },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, result.stderr);
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
    child.stderr.on('data', () => {});
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
  return { root, project, data, env, input, read, write, comments, start, fail, open };
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
  assert.ok(message.includes('comment list --json'));
  assert.ok(!message.includes('Change it'));
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
    env: f.env,
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
  const child = f.start({ session_id: '' });
  await until(() => child.exitCode !== null, 'invalid input left a watcher running');
  f.write('document/plan', f.comments());
  await delay(1100);
  assert.equal(f.read().length, 0);
});

test('the shipped lifecycle hooks invoke the portable watcher and stop it on session end', async (t) => {
  const f = fixture(t);
  const config = hooks();
  f.open('document/plan');
  const entry = config.SessionStart?.[0]?.hooks?.[0];
  assert.ok(entry, 'the Codex plugin has no startup hook');
  assert.equal(entry.async, true);
  const child = spawn(entry.command, {
    cwd: f.project,
    env: f.env,
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stderr.on('data', () => {});
  child.stdout.on('data', () => {});
  child.stdin.end(JSON.stringify(f.input));
  t.after(() => child.kill());
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
    () => child.exitCode !== null,
    'the manifest cleanup command did not stop the watcher',
  );
});
