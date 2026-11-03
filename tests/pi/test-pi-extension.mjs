import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const packageJsonPath = resolve(repoRoot, 'package.json');
const extensionPath = resolve(repoRoot, '.pi/extensions/ryugi.ts');
const piToolsPath = resolve(repoRoot, 'skills/using-ryugi/references/pi-tools.md');

async function readPackageJson() {
  return JSON.parse(await readFile(packageJsonPath, 'utf8'));
}

async function loadExtension(deliver = () => {}) {
  const handlers = new Map();
  const sent = [];
  const pi = {
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(handler);
    },
    sendMessage(message, options) {
      sent.push({ message, options });
      return deliver(message);
    },
  };
  const mod = await import(
    pathToFileURL(extensionPath).href + `?cachebust=${Date.now()}-${Math.random()}`
  );
  mod.default(pi);
  return { handlers, sent };
}

function firstHandler(handlers, event) {
  const eventHandlers = handlers.get(event) ?? [];
  assert.equal(eventHandlers.length, 1, `expected one ${event} handler`);
  return eventHandlers[0];
}

function textOf(message) {
  if (typeof message.content === 'string') return message.content;
  return message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

test('package.json declares a pi package with skills and extension resources', async () => {
  const pkg = await readPackageJson();

  assert.equal(pkg.name, 'ryugi');
  assert.ok(pkg.keywords.includes('pi-package'));
  assert.deepEqual(pkg.pi.skills, ['./skills']);
  assert.deepEqual(pkg.pi.extensions, ['./.pi/extensions/ryugi.ts']);
});

test('extension leaves package skill discovery to Pi and registers lifecycle hooks', async () => {
  const { handlers } = await loadExtension();

  assert.equal(
    (handlers.get('resources_discover') ?? []).length,
    0,
    'extension must not bypass package skill filters',
  );
  for (const event of ['session_start', 'session_compact', 'context', 'agent_end']) {
    assert.equal((handlers.get(event) ?? []).length, 1, `missing ${event} handler`);
  }
  assert.equal((handlers.get('session_before_compact') ?? []).length, 0);
});

test('startup context injects the bootstrap as one user message until agent_end', async (t) => {
  const { handlers } = await loadExtension();
  const sessionStart = firstHandler(handlers, 'session_start');
  const context = firstHandler(handlers, 'context');
  const agentEnd = firstHandler(handlers, 'agent_end');

  const ctx = { cwd: tmpdir(), sessionManager: { getSessionId: () => session } };
  await sessionStart({ type: 'session_start', reason: 'startup' }, ctx);
  t.after(() => firstHandler(handlers, 'session_shutdown')({ type: 'session_shutdown' }, ctx));

  const originalMessages = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Let us make a react todo list' }],
      timestamp: 1,
    },
  ];
  const result = await context({ type: 'context', messages: originalMessages }, {});

  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].role, 'user');
  assert.match(textOf(result.messages[0]), /You have Ryugi/);
  assert.match(textOf(result.messages[0]), /Pi tool mapping/);
  assert.equal(result.messages[1], originalMessages[0]);

  const repeatedProviderRequest = await context(
    { type: 'context', messages: originalMessages },
    {},
  );
  assert.equal(repeatedProviderRequest.messages.length, 2);
  assert.match(textOf(repeatedProviderRequest.messages[0]), /You have Ryugi/);

  const alreadyInjected = await context({ type: 'context', messages: result.messages }, {});
  assert.equal(alreadyInjected, undefined, 'bootstrap should not duplicate when already present');

  await agentEnd({ type: 'agent_end', messages: [] }, {});
  const afterEnd = await context({ type: 'context', messages: originalMessages }, {});
  assert.equal(afterEnd, undefined, 'startup bootstrap should clear after agent_end');
});

test('session_compact injects bootstrap after compaction summaries, not before compaction', async () => {
  const { handlers } = await loadExtension();
  const sessionCompact = firstHandler(handlers, 'session_compact');
  const context = firstHandler(handlers, 'context');

  await sessionCompact({ type: 'session_compact', compactionEntry: {}, fromExtension: false }, {});

  const summary = {
    role: 'compactionSummary',
    summary: 'Prior work summary',
    tokensBefore: 123,
    timestamp: 1,
  };
  const user = { role: 'user', content: [{ type: 'text', text: 'Continue' }], timestamp: 2 };
  const result = await context({ type: 'context', messages: [summary, user] }, {});

  assert.equal(result.messages.length, 3);
  assert.equal(result.messages[0], summary);
  assert.equal(result.messages[1].role, 'user');
  assert.match(textOf(result.messages[1]), /You have Ryugi/);
  assert.equal(result.messages[2], user);
});

test('pi tools reference documents pi-specific mappings', async () => {
  assert.equal(existsSync(piToolsPath), true, 'pi-tools.md should exist');
  const text = await readFile(piToolsPath, 'utf8');

  // Assert against the mapping-table rows only. The surrounding prose mentions
  // these same tokens, so matching the whole file would still pass if the table
  // were deleted — the exact regression this test exists to catch.
  const rows = text.split('\n').filter((line) => line.startsWith('|'));
  assert.ok(
    rows.some((row) => /subagent/i.test(row)),
    'mapping table documents subagent dispatch',
  );
  assert.ok(
    rows.some((row) => /todo|task/i.test(row)),
    'mapping table documents task tracking',
  );
});

const require = createRequire(import.meta.url);
const { register } = require('../../skills/artifacts/app/comment-subscriptions.cjs');

const session = '019a4f5e-8a2b-7c3d-9e4f-0123456789ab';
const at = (n) => `2026-11-03T10:00:${String(n).padStart(2, '0')}.000Z`;

async function until(check, explanation, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return;
    await delay(50);
  }
  assert.fail(explanation);
}

function project(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ryugi-pi-watch-')));
  mkdirSync(join(root, '.git'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => {
    const target = join(root, '.ryugi/artifacts', file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(value));
  };
  const human = (n, text = 'Make the header smaller') => ({
    id: `t${n}`,
    status: 'open',
    anchor: { board: 'b1' },
    messages: [{ id: `m${n}`, author: 'human', at: at(n), text }],
  });
  return { root, write, human };
}

test('a human comment on an artboard this Pi session opened wakes the session', async (t) => {
  const p = project(t);
  const { handlers, sent } = await loadExtension();
  const ctx = { cwd: p.root, sessionManager: { getSessionId: () => session } };
  t.after(() => firstHandler(handlers, 'session_shutdown')({ type: 'session_shutdown' }, ctx));
  p.write('artboard/home/comments.json', { threads: [] });
  p.write('artboard/other/comments.json', { threads: [] });
  p.write('.state/artboard/home/rounds.json', { rounds: [{ id: 'r1', state: 'open' }] });
  await firstHandler(handlers, 'session_start')({ type: 'session_start' }, ctx);
  register(['comment', 'list', '--artifact', 'artboard/home', '--project-dir', p.root], {
    PI_SESSION_ID: session,
  });
  await delay(1500);

  p.write('artboard/other/comments.json', { threads: [p.human(1)] });
  const agentReply = p.human(2);
  agentReply.messages.push({ id: 'a2', author: 'agent', at: at(3), text: 'Done' });
  agentReply.messages.shift();
  p.write('artboard/home/comments.json', { threads: [agentReply] });
  await delay(1500);
  assert.deepEqual(sent, [], 'agent replies and artifacts this session never opened stay quiet');

  p.write('artboard/home/comments.json', { threads: [p.human(4)] });
  await until(() => sent.length === 1, 'a human comment on the opened artboard wakes Pi');
  assert.equal(sent[0].message.customType, 'ryugi-comments');
  assert.deepEqual(sent[0].options, { triggerTurn: true, deliverAs: 'followUp' });
  assert.match(sent[0].message.content, /artboard\/home/);
  assert.match(sent[0].message.content, /comment list --json/);
  assert.doesNotMatch(sent[0].message.content, /Make the header smaller/);

  p.write('.state/artboard/home/rounds.json', { rounds: [{ id: 'r1', state: 'submitted' }] });
  await until(() => sent.length === 2, 'a submitted choice round wakes Pi');
  assert.equal(sent[1].message.customType, 'ryugi-choices');
  assert.match(sent[1].message.content, /round r1 on artboard\/home were submitted/);

  await firstHandler(handlers, 'session_shutdown')({ type: 'session_shutdown' }, ctx);
  p.write('artboard/home/comments.json', { threads: [p.human(4), p.human(5)] });
  await delay(1500);
  assert.equal(sent.length, 2, 'a shut-down session no longer wakes');
});

function sessionContext(cwd, id = session) {
  const notes = [];
  return {
    cwd,
    notes,
    sessionManager: { getSessionId: () => id },
    ui: { notify: (message, type) => notes.push({ message, type }) },
  };
}

async function startSession(t, handlers, ctx) {
  await firstHandler(handlers, 'session_start')({ type: 'session_start' }, ctx);
  t.after(() => firstHandler(handlers, 'session_shutdown')({ type: 'session_shutdown' }, ctx));
}

function opened(p, artifact, id = session) {
  p.write(`${artifact}/comments.json`, { threads: [] });
  register(['comment', 'list', '--artifact', artifact, '--project-dir', p.root], {
    PI_SESSION_ID: id,
  });
}

const comments = (sent) => sent.filter((s) => s.message.customType === 'ryugi-comments');

test('a delivery that throws or rejects is reported once and the watch keeps waking Pi', async (t) => {
  const p = project(t);
  const failures = [
    () => {
      throw new Error('extension runtime is gone');
    },
    () => Promise.reject(new Error('extension runtime is gone')),
  ];
  const { handlers, sent } = await loadExtension(() => failures.shift()?.());
  const ctx = sessionContext(p.root);
  opened(p, 'artboard/home');
  await startSession(t, handlers, ctx);
  await delay(1200);

  p.write('artboard/home/comments.json', { threads: [p.human(1)] });
  await until(() => sent.length === 1, 'the first comment reaches sendMessage');
  p.write('artboard/home/comments.json', { threads: [p.human(1), p.human(2)] });
  await until(() => sent.length === 2, 'the watch survives a synchronous throw');
  p.write('artboard/home/comments.json', { threads: [p.human(1), p.human(2), p.human(3)] });
  await until(() => sent.length === 3, 'the watch survives a rejected delivery');

  assert.equal(ctx.notes.length, 1, 'a repeated failure is reported once');
  assert.equal(ctx.notes[0].type, 'warning');
  assert.match(ctx.notes[0].message, /Ryugi comment watch.*extension runtime is gone/);
});

test('a new session ID replaces the watch: only the new session is woken', async (t) => {
  const p = project(t);
  const next = '019a4f5e-8a2b-7c3d-9e4f-0123456789ac';
  const { handlers, sent } = await loadExtension();
  opened(p, 'artboard/home');
  opened(p, 'artboard/other', next);
  await startSession(t, handlers, sessionContext(p.root));
  await startSession(t, handlers, sessionContext(p.root, next));
  await delay(1200);

  p.write('artboard/home/comments.json', { threads: [p.human(1)] });
  await delay(1500);
  assert.deepEqual(sent, [], 'the replaced session no longer has a watch');

  p.write('artboard/other/comments.json', { threads: [p.human(2)] });
  await until(() => sent.length === 1, 'the new session is woken');
  assert.match(sent[0].message.content, /artboard\/other/);
});

test('after reload the reloaded extension keeps watching and the old one stays quiet', async (t) => {
  const p = project(t);
  const before = await loadExtension();
  const after = await loadExtension();
  const ctx = sessionContext(p.root);
  opened(p, 'artboard/home');
  await firstHandler(before.handlers, 'session_start')({ type: 'session_start' }, ctx);
  await firstHandler(before.handlers, 'session_shutdown')(
    { type: 'session_shutdown', reason: 'reload' },
    ctx,
  );
  await startSession(t, after.handlers, ctx);
  await delay(1200);

  p.write('artboard/home/comments.json', { threads: [p.human(1)] });
  await until(() => after.sent.length === 1, 'the reloaded extension wakes the session');
  await delay(1200);
  assert.deepEqual(before.sent, []);
});

test('a forked session watches only what it opens itself', async (t) => {
  const p = project(t);
  const fork = '019a4f5e-8a2b-7c3d-9e4f-0123456789ad';
  const { handlers, sent } = await loadExtension();
  opened(p, 'artboard/home');
  await firstHandler(handlers, 'session_start')({ type: 'session_start' }, sessionContext(p.root));
  await firstHandler(handlers, 'session_shutdown')(
    { type: 'session_shutdown', reason: 'fork' },
    sessionContext(p.root),
  );
  await startSession(t, handlers, sessionContext(p.root, fork));
  await delay(1200);

  p.write('artboard/home/comments.json', { threads: [p.human(1)] });
  await delay(1500);
  assert.deepEqual(comments(sent), [], 'the fork does not inherit the parent subscriptions');

  register(['comment', 'list', '--artifact', 'artboard/home', '--project-dir', p.root], {
    PI_SESSION_ID: fork,
  });
  p.write('artboard/home/comments.json', { threads: [p.human(1), p.human(2)] });
  await until(() => comments(sent).length === 1, 'the fork is woken once it opens the artboard');
});

test('a Pi nested in Codex or Claude Code registers with the outer host', (t) => {
  const p = project(t);
  const ids = {
    CODEX_THREAD_ID: '019a4f5e-0000-7000-8000-000000000001',
    CLAUDE_CODE_SESSION_ID: '019a4f5e-0000-7000-8000-000000000002',
    PI_SESSION_ID: '019a4f5e-0000-7000-8000-000000000003',
  };
  const hostOf = (env) => {
    const root = join(p.root, '.ryugi/artifacts/.state');
    rmSync(root, { recursive: true, force: true });
    register(['comment', 'list', '--artifact', 'artboard/home', '--project-dir', p.root], env);
    return ['codex', 'claude', 'pi'].filter((host) =>
      existsSync(join(root, `${host}-comment-watch`)),
    );
  };
  assert.deepEqual(hostOf(ids), ['codex']);
  assert.deepEqual(hostOf({ ...ids, CODEX_THREAD_ID: undefined }), ['claude']);
  assert.deepEqual(hostOf({ PI_SESSION_ID: ids.PI_SESSION_ID }), ['pi']);
});
