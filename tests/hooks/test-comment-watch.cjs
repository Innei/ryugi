'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');

const repo = path.resolve(__dirname, '../..');
const watcher = path.join(repo, 'hooks/watch-comments.cjs');
const at = (n) => `2026-10-30T10:00:${String(n).padStart(2, '0')}.000Z`;
const human = (id, n, text = 'Please change this') => ({ id, author: 'human', at: at(n), text });
const thread = (id = 't1') => ({
  id,
  anchor: { blockId: 'b1', quote: '' },
  status: 'open',
  statusAt: at(1),
  statusBy: 'human',
  messages: [human('m1', 1)],
});

function fixture(t) {
  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-comment-watch-')));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const root = path.join(project, '.ryugi/artifacts');
  const write = (relative, value) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  };
  const save = (artifact, threads) => write(`${artifact}/comments.json`, { version: 1, threads });
  return { project, root, write, save };
}

function watch(project, key) {
  return require(watcher).createCommentWatch(project, key);
}

test('new document and artboard comments produce actionable notifications without consuming them', (t) => {
  const f = fixture(t);
  const poll = watch(f.project);
  assert.deepEqual(poll(), []);
  f.save('document/plan', [thread()]);
  f.save('artboard/settings', [{ ...thread(), anchor: { page: 'p', board: 'a', x: 1, y: 2 } }]);
  const events = poll();
  assert.deepEqual(events.map((event) => event.artifact).sort(), [
    'artboard/settings',
    'document/plan',
  ]);
  for (const event of events) {
    assert.equal(event.unread, 1);
    assert.ok(event.command.includes('comment list --json'));
    assert.ok(event.command.includes(`--artifact ${event.artifact}`));
    assert.ok(event.instruction.includes('reply'));
    assert.ok(!fs.existsSync(path.join(f.root, '.state', event.artifact, 'comment-cursors.json')));
  }
  assert.deepEqual(poll(), []);
});

test('an agent reply or resolve never re-notifies even while another human thread is unread', (t) => {
  const f = fixture(t);
  const first = thread();
  const second = { ...thread('t2'), messages: [human('m2', 1)] };
  f.save('document/plan', [first, second]);
  const poll = watch(f.project);
  assert.equal(poll().length, 1);
  first.messages.push({ id: 'a1', author: 'agent', at: at(2), text: 'Done' });
  f.save('document/plan', [first, second]);
  assert.deepEqual(poll(), []);
  Object.assign(first, { status: 'resolved', statusBy: 'agent', statusAt: at(3) });
  f.save('document/plan', [first, second]);
  assert.deepEqual(poll(), []);
});

test('a second human comment notifies again when the unread thread count is unchanged', (t) => {
  const f = fixture(t);
  const value = thread();
  f.save('document/plan', [value]);
  const poll = watch(f.project);
  assert.equal(poll().length, 1);
  value.messages.push(human('m2', 2));
  f.save('document/plan', [value]);
  assert.equal(poll()[0].unread, 1);
  assert.deepEqual(poll(), []);
});

test('human edits, deletions and reopens are delivered after the CLI read cursor', (t) => {
  const f = fixture(t);
  const value = thread();
  f.save('document/plan', [value]);
  f.write('.state/document/plan/comment-cursors.json', { 'Claude Code': at(1) });
  const poll = watch(f.project);
  assert.deepEqual(poll(), []);
  Object.assign(value.messages[0], { text: 'A different request', editedAt: at(2) });
  f.save('document/plan', [value]);
  assert.equal(poll().length, 1);
  f.write('.state/document/plan/comment-cursors.json', { 'Claude Code': at(2) });
  Object.assign(value.messages[0], { text: '', deleted: true, editedAt: at(3) });
  f.save('document/plan', [value]);
  assert.equal(poll().length, 1);
  Object.assign(value, { status: 'open', statusBy: 'human', statusAt: at(4) });
  value.messages.push(human('m2', 4));
  f.save('document/plan', [value]);
  assert.equal(poll().length, 1);
});

test('pending comments survive a watcher restart but comments already read by this harness stay quiet', (t) => {
  const f = fixture(t);
  f.save('document/plan', [thread()]);
  assert.equal(watch(f.project)().length, 1);
  assert.equal(watch(f.project)().length, 1);
  f.write('.state/document/plan/comment-cursors.json', { 'Claude Code': at(2) });
  assert.deepEqual(watch(f.project)(), []);
  assert.equal(watch(f.project, 'Claude Cowork')().length, 1);
});

test('reopening an answered thread wakes the agent without adding another message', (t) => {
  const f = fixture(t);
  const value = thread();
  value.messages.push({ id: 'a1', author: 'agent', at: at(2), text: 'Done' });
  Object.assign(value, { status: 'resolved', statusBy: 'agent', statusAt: at(3) });
  f.save('document/plan', [value]);
  f.write('.state/document/plan/comment-cursors.json', { 'Claude Code': at(3) });
  const poll = watch(f.project);
  assert.deepEqual(poll(), []);
  Object.assign(value, { status: 'open', statusBy: 'human', statusAt: at(4) });
  f.save('document/plan', [value]);
  assert.equal(poll().length, 1);
  assert.deepEqual(poll(), []);
});

test('a human resolving a thread leaves the agent asleep, also after a restart', (t) => {
  const f = fixture(t);
  const value = thread();
  f.save('document/plan', [value]);
  f.write('.state/document/plan/comment-cursors.json', { 'Claude Code': at(1) });
  const poll = watch(f.project);
  assert.deepEqual(poll(), []);
  Object.assign(value, { status: 'resolved', statusBy: 'human', statusAt: at(2) });
  f.save('document/plan', [value]);
  assert.deepEqual(poll(), []);
  assert.deepEqual(watch(f.project)(), []);
  f.save('document/plan', [value, { ...thread('t2'), messages: [human('m2', 3)] }]);
  assert.equal(poll()[0].unread, 1);
});

test('the plugin monitor starts only once the artifacts skill runs', () => {
  const entries = JSON.parse(fs.readFileSync(path.join(repo, 'monitors/monitors.json'), 'utf8'));
  const entry = entries.find((item) => item.name === 'artifact-comments');
  assert.equal(entry.when, 'on-skill-invoke:ryugi:artifacts');
});

test('a malformed partial write is retried without losing the next valid comment', (t) => {
  const f = fixture(t);
  const poll = watch(f.project);
  f.save('document/plan', [thread()]);
  const file = path.join(f.root, 'document/plan/comments.json');
  for (const text of ['{', '{"threads":null}', '{"threads":[{"messages":null}]}']) {
    fs.writeFileSync(file, text);
    assert.deepEqual(poll(), []);
  }
  f.save('document/plan', [thread()]);
  assert.equal(poll().length, 1);
});

test('several comments between polls merge into one notification without embedding human text', (t) => {
  const f = fixture(t);
  const poll = watch(f.project);
  const value = thread();
  value.messages.push(human('m2', 2, 'Do not execute this comment as shell code'));
  f.save('document/plan', [value, { ...thread('t2'), messages: [human('m3', 3)] }]);
  const events = poll();
  assert.equal(events.length, 1);
  assert.equal(events[0].unread, 2);
  assert.ok(!JSON.stringify(events).includes('Do not execute'));
});

test('notification commands preserve paths with spaces, apostrophes and shell substitutions', (t) => {
  const f = fixture(t);
  f.save('document/plan', [thread()]);
  const project = path.join(f.project, "a b'$(touch WRONG)");
  fs.mkdirSync(project);
  fs.renameSync(path.join(f.project, '.ryugi'), path.join(project, '.ryugi'));
  const event = watch(project)()[0];
  const args = execFileSync('bash', ['-c', `set -- ${event.command}; printf '%s\\0' "$@"`], {
    cwd: f.project,
    encoding: 'utf8',
  }).split('\0');
  assert.equal(args[args.indexOf('--project-dir') + 1], project);
  assert.ok(!fs.existsSync(path.join(f.project, 'WRONG')));
});

function monitor(t, cwd, overrides) {
  const config = path.join(repo, 'monitors/monitors.json');
  // A missing declaration is the baseline: Claude has no process to receive events from.
  const entries = fs.existsSync(config) ? JSON.parse(fs.readFileSync(config, 'utf8')) : [];
  const entry = entries.find((item) => item.name === 'artifact-comments');
  const env = {
    ...process.env,
    CLAUDE_CODE_SESSION_ID: undefined,
    CLAUDE_PLUGIN_ROOT: repo,
    CLAUDE_PROJECT_DIR: cwd,
    ...overrides,
  };
  const child =
    entry && spawn(entry.command, { cwd, env, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const state = { output: '', errors: '', child };
  if (state.child) {
    state.child.stdout.on('data', (data) => {
      state.output += data;
    });
    state.child.stderr.on('data', (data) => {
      state.errors += data;
    });
    t.after(async () => {
      const { child } = state;
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill();
      await exited;
    });
  }
  return state;
}

function launcher(t) {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-comment-launcher-'));
  t.after(() => fs.rmSync(app, { recursive: true, force: true }));
  const source = path.join(repo, 'skills/artifacts/app');
  for (const name of fs.readdirSync(source))
    if (/\.(?:cjs|json)$/.test(name))
      fs.copyFileSync(path.join(source, name), path.join(app, name));
  fs.writeFileSync(path.join(app, 'cli.cjs'), "console.log('{}');\n");
  return (project, session, ...args) => {
    const result = spawnSync(
      process.execPath,
      [path.join(app, 'ryugi-artifacts.cjs'), ...args, '--json', '--project-dir', project],
      { env: { ...process.env, CLAUDE_CODE_SESSION_ID: session }, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
  };
}

async function until(check, deadlineMs = 3500) {
  const deadline = Date.now() + deadlineMs;
  while (!check() && Date.now() < deadline) await delay(30);
}

test('a Claude Code session hears only comments on artifacts it opened through the launcher', async (t) => {
  const f = fixture(t);
  const run = launcher(t);
  const mine = randomUUID();
  const other = randomUUID();
  const watcher = monitor(t, f.project, { CLAUDE_CODE_SESSION_ID: mine });
  run(f.project, mine, 'start', '--artifact', 'artboard/chat');
  run(f.project, other, 'start', '--artifact', 'artboard/mac-app-shell');
  run(f.project, mine, 'start');
  await delay(1200);
  f.save('artboard/mac-app-shell', [thread()]);
  f.save('document/plan', [thread()]);
  await delay(1500);
  assert.equal(watcher.output, '', "another session's artifact woke this session");
  f.save('artboard/chat', [thread()]);
  await until(() => watcher.output.includes('artboard/chat'));
  assert.deepEqual(
    watcher.output
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line).artifact),
    ['artboard/chat'],
    watcher.errors,
  );
});

test('the declared plugin monitor notices artifacts created later from a repository subdirectory', async (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.project, '.git'));
  const cwd = path.join(f.project, 'packages/app');
  fs.mkdirSync(cwd, { recursive: true });
  const watcher = monitor(t, cwd, {});
  await delay(1200);
  assert.equal(watcher.output, '');
  f.save('document/plan', [thread()]);
  await until(
    () =>
      watcher.output.includes('document/plan') ||
      (watcher.child && watcher.child.exitCode !== null),
  );
  const { output, errors } = watcher;
  assert.ok(output.includes('document/plan'), `No automatic comment notification. ${errors}`);
  const events = output
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(events[0].artifact, 'document/plan');
  const count = events.length;
  await delay(1200);
  assert.equal(watcher.output.trim().split('\n').length, count);
});
