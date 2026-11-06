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
const { humanTokens, reviewStateKey } = require(
  path.join(repo, 'skills/artifacts/app/comment-threads.cjs'),
);
function acknowledged(f, artifact, at, key = 'Claude Code') {
  const file = JSON.parse(fs.readFileSync(path.join(f.root, artifact, 'comments.json'), 'utf8'));
  const consumed = file.threads
    .flatMap((thread) => humanTokens(thread))
    .filter((event) => event.at <= at)
    .map((event) => event.token);
  f.write(`.state/agent-review/agent-${reviewStateKey(artifact, key)}.json`, {
    artifact,
    agent: key,
    consumed,
    frontiers: null,
  });
}
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

const message = (event) =>
  require(path.join(repo, 'skills/artifacts/app/comment-watch.cjs')).wakeMessage(event);
const artifactOf = (line) => line.match(/^Ryugi \w+ (\S+)/)?.[1];

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
    assert.ok(event.command.includes('comment list --section threads --detail --format brief'));
    assert.ok(event.command.includes(`--artifact ${event.artifact}`));
    assert.ok(message(event).includes('acknowledge'));
    assert.ok(!fs.existsSync(path.join(f.root, '.state', event.artifact, 'comment-cursors.json')));
  }
  assert.deepEqual(poll(), []);
});

test('a whiteboard comment wakes the agent and points at the whiteboard guide', (t) => {
  const f = fixture(t);
  const poll = watch(f.project);
  assert.deepEqual(poll(), []);
  f.save('whiteboard/sync', [{ ...thread(), anchor: { x: 10, y: 20, elements: ['n-hub'] } }]);
  const [event] = poll();
  assert.equal(event?.artifact, 'whiteboard/sync');
  assert.equal(event.unread, 1);
  assert.ok(event.command.includes('--artifact whiteboard/sync'));
  assert.ok(message(event).includes('whiteboard/sync'));
});

test('starting a whiteboard subscribes the session to its comments', (t) => {
  const f = fixture(t);
  const { register, subscriptions } = require(
    path.join(repo, 'skills/artifacts/app/comment-subscriptions.cjs'),
  );
  const session = randomUUID();
  fs.mkdirSync(path.join(f.project, '.git'));
  register(['start', '--project-dir', f.project, '--artifact', 'whiteboard/sync'], {
    CLAUDE_CODE_SESSION_ID: session,
  });
  assert.deepEqual([...subscriptions(f.project, 'claude', session)], ['whiteboard/sync']);
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
  acknowledged(f, 'document/plan', at(1));
  const poll = watch(f.project);
  assert.deepEqual(poll(), []);
  Object.assign(value.messages[0], { text: 'A different request', editedAt: at(2) });
  f.save('document/plan', [value]);
  assert.equal(poll().length, 1);
  acknowledged(f, 'document/plan', at(2));
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
  acknowledged(f, 'document/plan', at(2));
  assert.deepEqual(watch(f.project)(), []);
  assert.equal(watch(f.project, 'Claude Cowork')().length, 1);
});

test('reopening an answered thread wakes the agent without adding another message', (t) => {
  const f = fixture(t);
  const value = thread();
  value.messages.push({ id: 'a1', author: 'agent', at: at(2), text: 'Done' });
  Object.assign(value, { status: 'resolved', statusBy: 'agent', statusAt: at(3) });
  f.save('document/plan', [value]);
  acknowledged(f, 'document/plan', at(3));
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
  acknowledged(f, 'document/plan', at(1));
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

test('several comments between polls merge into one notification carrying their text', (t) => {
  const f = fixture(t);
  const poll = watch(f.project);
  const value = thread();
  value.messages.push(human('m2', 2, 'Do not execute this comment as shell code'));
  f.save('document/plan', [value, { ...thread('t2'), messages: [human('m3', 3)] }]);
  const events = poll();
  assert.equal(events.length, 1);
  const [event] = events;
  assert.equal(event.unread, 2);
  assert.deepEqual(
    event.threads.map((thread) => thread.thread),
    ['t1', 't2'],
  );
  assert.deepEqual(
    event.threads[0].messages.map((message) => message.text),
    ['Please change this', 'Do not execute this comment as shell code'],
  );
  assert.equal(event.threads[1].messages[0].text, 'Please change this');
  assert.equal(event.omitted, undefined);
  assert.equal(event.threads[0].block, 'b1');
  assert.equal(event.threads[0].messages[0].name, 'human');
  const line = message(event);
  assert.ok(line.includes('t1 [open] b1'));
  assert.ok(line.includes('m1 human'));
  assert.match(line, /\d{2}:\d{2}/);
});

test('a long comment arrives truncated to a brief preview', (t) => {
  const f = fixture(t);
  const poll = watch(f.project);
  f.save('document/plan', [{ ...thread(), messages: [human('m1', 1, 'x'.repeat(200))] }]);
  const [event] = poll();
  assert.equal(event.threads[0].messages[0].text, 'x'.repeat(160) + '…');
});

test('the inline preview truncates by grapheme, not by code unit', (t) => {
  const f = fixture(t);
  const poll = watch(f.project);
  const family = '👨‍👩‍👧‍👦';
  f.save('document/plan', [{ ...thread(), messages: [human('m1', 1, family.repeat(161))] }]);
  const [event] = poll();
  assert.equal(event.threads[0].messages[0].text, family.repeat(160) + '…');
});

test('a burst of comments caps the inline list and counts the rest', (t) => {
  const f = fixture(t);
  const poll = watch(f.project);
  f.save(
    'document/plan',
    Array.from({ length: 25 }, (_, n) => ({
      ...thread(`t${n}`),
      messages: [human(`m${n}`, 1, `comment ${n}`)],
    })),
  );
  const [event] = poll();
  assert.equal(event.unread, 25);
  assert.equal(event.threads.length, 20);
  assert.equal(event.omitted, 5);
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
  fs.writeFileSync(
    path.join(app, 'cli.cjs'),
    `console.log(JSON.stringify({schema:'ryugi.cli/v1', command:process.argv.includes('--version')?'version':'start', outcome:'success', data:{status:'running',capabilities:['reviewBundlesV1']}}));\n`,
  );
  return (project, session, ...args) => {
    const result = spawnSync(
      process.execPath,
      [path.join(app, 'ryugi-artifacts.cjs'), ...args, '--json', '--project-dir', project],
      {
        env: {
          ...process.env,
          CODEX_THREAD_ID: undefined,
          PI_SESSION_ID: undefined,
          CLAUDE_CODE_SESSION_ID: session,
        },
        encoding: 'utf8',
      },
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
    watcher.output.trim().split('\n').map(artifactOf),
    ['artboard/chat'],
    watcher.errors,
  );
});

test('the Claude Code monitor keeps every line within its 500-character notification limit', async (t) => {
  const f = fixture(t);
  const watcher = monitor(t, f.project, {});
  await delay(1200);
  f.save(
    'document/plan',
    Array.from({ length: 25 }, (_, n) => ({
      ...thread(`t${n}`),
      messages: [human(`m${n}`, 1, 'x'.repeat(200))],
    })),
  );
  await until(() => watcher.output.includes('document/plan'));
  const [line] = watcher.output.trim().split('\n');
  assert.ok(line.length <= 500, `${line.length}: ${line}`);
  assert.ok(line.endsWith('--artifact document/plan'), line);
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
  const events = output.trim().split('\n');
  assert.equal(artifactOf(events[0]), 'document/plan');
  const count = events.length;
  await delay(1200);
  assert.equal(watcher.output.trim().split('\n').length, count);
});

function choiceFixture(t) {
  const f = fixture(t);
  const rounds = (state) =>
    f.write('.state/artboard/pick/rounds.json', {
      rounds: [{ id: 'r1', page: 'p', state, groups: ['q1'], boards: ['q1-a', 'q1-b'] }],
    });
  f.save('artboard/pick', []);
  const comment = (id, n, board) => ({
    ...thread(id),
    anchor: { page: 'p', board, x: 1, y: 2 },
    messages: [human(`m${id}`, n)],
  });
  return { ...f, rounds, comment };
}

test('comments on an open choice round stay silent until the round is submitted', (t) => {
  const f = choiceFixture(t);
  f.rounds('open');
  const poll = watch(f.project);
  assert.deepEqual(poll(), []);
  f.save('artboard/pick', [f.comment('t1', 1, 'q1-a')]);
  assert.deepEqual(poll(), []);
  f.rounds('submitted');
  const [event, ...rest] = poll();
  assert.deepEqual(rest, []);
  assert.equal(event.type, 'ryugi-choices');
  assert.equal(event.artifact, 'artboard/pick');
  assert.equal(event.round, 'r1');
  assert.ok(
    event.command.includes('comment list --section groups --kind choose --detail --format brief'),
  );
  assert.ok(!event.withdrawn);
  assert.deepEqual(poll(), []);
});

test('a withdrawal wakes once, and a comment after submit wakes as usual', (t) => {
  const f = choiceFixture(t);
  f.rounds('submitted');
  const poll = watch(f.project);
  assert.deepEqual(poll(), []);
  f.save('artboard/pick', [f.comment('t1', 1, 'q1-a')]);
  assert.equal(poll()[0].type, 'ryugi-comments');
  f.rounds('open');
  const events = poll();
  assert.equal(events.length, 1);
  assert.equal(events[0].withdrawn, true);
});

test('without rounds.json every board comment wakes, never silence', (t) => {
  const f = choiceFixture(t);
  const poll = watch(f.project);
  f.save('artboard/pick', [f.comment('t1', 1, 'q1-a')]);
  assert.equal(poll()[0].type, 'ryugi-comments');
});

test('a running watcher keeps a heartbeat beside its subscription', async (t) => {
  const f = fixture(t);
  const session = randomUUID();
  const child = spawn(process.execPath, [watcher, f.project], {
    env: {
      ...process.env,
      CODEX_THREAD_ID: undefined,
      PI_SESSION_ID: undefined,
      CLAUDE_CODE_SESSION_ID: session,
    },
    stdio: 'ignore',
  });
  t.after(() => child.kill());
  const alive = path.join(f.root, '.state/claude-comment-watch', `${session}.alive`);
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(alive) && Date.now() < deadline) await delay(100);
  const stamp = Number(fs.readFileSync(alive, 'utf8'));
  assert.ok(Math.abs(Date.now() - stamp) < 5000);
  const { aliveFile } = require(path.join(repo, 'skills/artifacts/app/comment-subscriptions.cjs'));
  assert.equal(aliveFile(f.project, 'claude', session), alive);
});

test('a submitted round closed by the next round wakes nobody', (t) => {
  const f = choiceFixture(t);
  f.rounds('submitted');
  const poll = watch(f.project);
  assert.deepEqual(poll(), []);
  f.rounds('closed');
  assert.deepEqual(poll(), []);
});

test('a canvas that briefly yields no rounds does not replay the submit', (t) => {
  const f = choiceFixture(t);
  f.rounds('submitted');
  const poll = watch(f.project);
  assert.deepEqual(poll(), []);
  f.write('.state/artboard/pick/rounds.json', { rounds: [] });
  assert.deepEqual(poll(), []);
  f.rounds('submitted');
  assert.deepEqual(poll(), []);
});

test('a last comment and the submit in one tick wake once', (t) => {
  const f = choiceFixture(t);
  f.rounds('open');
  const poll = watch(f.project);
  assert.deepEqual(poll(), []);
  f.save('artboard/pick', [f.comment('t1', 1, 'q1-a')]);
  f.rounds('submitted');
  assert.deepEqual(
    poll().map((event) => event.type),
    ['ryugi-choices'],
  );
});

const answer = (id, n, ask) => ({
  id,
  anchor: { blockId: 'b1', quote: '', ask, choice: 'yes', answer: null },
  status: 'open',
  statusAt: at(n),
  statusBy: 'human',
  messages: [human(`${id}m`, n, 'yes')],
});
const latest = (id, withdrawn = false) => ({ latest: { id, at: at(9), withdrawn } });

test('answers to document questions stay silent until they are submitted', (t) => {
  const f = fixture(t);
  const poll = watch(f.project);
  f.save('document/plan', []);
  f.write('.state/document/plan/asks.json', { latest: null });
  assert.deepEqual(poll(), []);
  f.save('document/plan', [answer('a1', 2, 'pre-test')]);
  assert.deepEqual(poll(), []);
  f.save('document/plan', [
    answer('a1', 2, 'pre-test'),
    { ...answer('s1', 3), anchor: { blockId: '*', quote: '', submit: true, asks: ['pre-test'] } },
  ]);
  f.write('.state/document/plan/asks.json', latest('s1'));
  const [event, ...rest] = poll();
  assert.deepEqual(rest, []);
  assert.equal(event.type, 'ryugi-answers');
  assert.equal(event.artifact, 'document/plan');
  assert.ok(event.command.includes('comment list --section asks --detail --format brief'));
  assert.ok(message(event).includes('answers'));
  assert.deepEqual(poll(), []);
});

test('a withdrawn submit wakes once, a second submit wakes again', (t) => {
  const f = fixture(t);
  const poll = watch(f.project);
  f.write('.state/document/plan/asks.json', latest('s1'));
  f.save('document/plan', []);
  assert.deepEqual(poll(), []);
  f.write('.state/document/plan/asks.json', latest('s1', true));
  const [withdrawn] = poll();
  assert.equal(withdrawn.type, 'ryugi-answers');
  assert.equal(withdrawn.withdrawn, true);
  assert.deepEqual(poll(), []);
  f.write('.state/document/plan/asks.json', latest('s2'));
  const [again] = poll();
  assert.equal(again.type, 'ryugi-answers');
  assert.equal(again.withdrawn, undefined);
});

test('answer records never count as unread comments', (t) => {
  const f = fixture(t);
  f.save('document/plan', [answer('a1', 2, 'pre-test'), thread('t2')]);
  const { unreadCount } = require(path.join(repo, 'skills/artifacts/app/comment-watch.cjs'));
  assert.equal(unreadCount(f.project, 'document/plan', 'Claude Code'), 1);
});

test('the answers brief carries each question id, the picked option and its label', (t) => {
  const f = fixture(t);
  f.save('document/plan', []);
  fs.writeFileSync(
    path.join(f.root, 'document/plan/doc.xml'),
    '<doc><p><ask id="pre-test"><option value="tests">Add them first</option><option value="report">Only say so in the report</option></ask></p>' +
      '<p><ask id="more" recommend="report"><option value="report">Only say so in the report</option></ask></p></doc>',
  );
  f.write('.state/document/plan/asks.json', { latest: null });
  const poll = watch(f.project);
  assert.deepEqual(poll(), []);
  f.save('document/plan', [
    {
      id: 'a1',
      anchor: { blockId: 'b1', quote: '', ask: 'pre-test', choice: 'report', answer: null },
      status: 'open',
      statusAt: at(2),
      statusBy: 'human',
      messages: [human('am1', 2, 'report')],
    },
    {
      id: 's1',
      anchor: { blockId: '*', quote: '', submit: true, asks: ['pre-test', 'more'] },
      status: 'open',
      statusAt: at(3),
      statusBy: 'human',
      messages: [human('sm1', 3, 'submitted')],
    },
  ]);
  f.write('.state/document/plan/asks.json', { latest: { id: 's1', at: at(3), withdrawn: false } });
  const [event] = poll();
  assert.equal(event.type, 'ryugi-answers');
  assert.equal(event.submit, 's1');
  assert.deepEqual(event.answers, [
    { ask: 'pre-test', thread: 'a1', choice: 'report', label: 'Only say so in the report' },
    { ask: 'more', choice: 'report', label: 'Only say so in the report', recommended: true },
  ]);
  const line = message(event);
  assert.ok(line.includes('pre-test a1 → report (Only say so in the report)'));
  assert.ok(line.includes('more → report (Only say so in the report) (recommended)'));
  assert.ok(line.includes('(s1)'));
});

test('the choices brief carries group ids, picked boards and their titles', (t) => {
  const f = fixture(t);
  f.save('artboard/pick', []);
  fs.writeFileSync(
    path.join(f.root, 'artboard/pick/canvas.json'),
    JSON.stringify({
      version: 1,
      pages: [{ id: 'p' }],
      boards: {
        'q1-a': {
          page: 'p',
          file: 'pages/a.html',
          x: 0,
          y: 0,
          w: 400,
          h: 300,
          title: 'Sidebar nav',
        },
        'q1-b': { page: 'p', file: 'pages/b.html', x: 0, y: 320, w: 400, h: 300, title: 'Top nav' },
      },
      groups: {
        q1: { boards: ['q1-a', 'q1-b'], choose: true, recommend: 'q1-a', title: 'Navigation' },
      },
    }),
  );
  const rounds = (state) =>
    f.write('.state/artboard/pick/rounds.json', {
      rounds: [{ id: 'r1', page: 'p', state, groups: ['q1'], boards: ['q1-a', 'q1-b'] }],
    });
  rounds('open');
  const poll = watch(f.project);
  assert.deepEqual(poll(), []);
  f.save('artboard/pick', [
    {
      id: 't1',
      anchor: { page: 'p', x: 1, y: 2, group: 'q1', choice: 'q1-b' },
      status: 'open',
      statusAt: at(1),
      statusBy: 'human',
      messages: [human('m1', 1, 'pick')],
    },
    {
      id: 's1',
      anchor: { page: 'p', x: 1, y: 2, round: 'r1', submit: true },
      status: 'open',
      statusAt: at(2),
      statusBy: 'human',
      messages: [human('m2', 2, 'submitted')],
    },
  ]);
  rounds('submitted');
  const event = poll().find((item) => item.type === 'ryugi-choices');
  assert.deepEqual(event.picks, [
    { group: 'q1', title: 'Navigation', choice: 'q1-b', label: 'Top nav' },
  ]);
  assert.equal(event.submit, 's1');
  assert.ok(message(event).includes('q1 Navigation → q1-b (Top nav).'));
});

test('a withdrawn round names the submit it withdraws, not the withdrawal', (t) => {
  const f = choiceFixture(t);
  const submit = (id, n, value) => ({
    ...thread(id),
    anchor: { page: 'p', x: 0, y: 0, round: 'r1', submit: value },
    messages: [human(`m${id}`, n)],
  });
  f.save('artboard/pick', [submit('s1', 1, true)]);
  f.rounds('submitted');
  const poll = watch(f.project);
  assert.deepEqual(poll(), []);
  f.save('artboard/pick', [submit('s1', 1, true), submit('w1', 2, false)]);
  f.rounds('open');
  const [event] = poll();
  assert.equal(event.withdrawn, true);
  assert.equal(event.submit, 's1');
});

test('a brief over the line limit falls back to the command that reads it', () => {
  const event = {
    type: 'ryugi-comments',
    artifact: 'document/plan',
    unread: 3,
    threads: [1, 2, 3].map((n) => ({
      thread: `t${n}`,
      status: 'open',
      messages: [{ id: `m${n}`, name: 'Innei', at: at(1), text: 'x'.repeat(160) }],
    })),
    command:
      'node cli.cjs comment list --section threads --detail --format brief --artifact document/plan',
  };
  assert.ok(message(event).length > 500);
  const line = require(path.join(repo, 'skills/artifacts/app/comment-watch.cjs')).wakeMessage(
    event,
    500,
  );
  assert.ok(line.length <= 500, line);
  assert.ok(!line.includes('xxxx'));
  assert.ok(line.startsWith('Ryugi comments document/plan (3 unread).'));
  assert.ok(line.endsWith(`Run: ${event.command}`));
});
