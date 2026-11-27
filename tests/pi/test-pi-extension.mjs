import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test, { after } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const cacheHome = mkdtempSync(join(tmpdir(), 'ryugi-pi-cache-'));
process.env.XDG_CACHE_HOME = cacheHome;
after(() => rmSync(cacheHome, { recursive: true, force: true }));
createRequire(import.meta.url)('../hooks/fake-artifacts-release.cjs').seedFakeRelease(cacheHome);

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const packageJsonPath = resolve(repoRoot, 'package.json');
const extensionPath = resolve(repoRoot, '.pi/extensions/ryugi.ts');
const piToolsPath = resolve(repoRoot, 'skills/using-adeck/references/pi-tools.md');

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

  assert.equal(pkg.name, 'adeck');
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
  assert.match(textOf(result.messages[0]), /You have Artideck/);
  assert.match(textOf(result.messages[0]), /Pi tool mapping/);
  assert.equal(result.messages[1], originalMessages[0]);

  const repeatedProviderRequest = await context(
    { type: 'context', messages: originalMessages },
    {},
  );
  assert.equal(repeatedProviderRequest.messages.length, 2);
  assert.match(textOf(repeatedProviderRequest.messages[0]), /You have Artideck/);

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
  assert.match(textOf(result.messages[1]), /You have Artideck/);
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
const { fakeHub } = require('../hooks/fake-hub.cjs');
const hook = require('../hooks/hook-bin.cjs').hookBin();
const { spawnSync } = require('node:child_process');

function subscriptionFor(args, env) {
  const result = spawnSync(hook, ['launch-prepare', '--', ...args], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    encoding: 'utf8',
  });
  if (result.stderr.includes('comment-watch-error')) throw new Error(result.stderr);
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

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
  mkdirSync(join(root, '.ryugi/artifacts'), { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root };
}

function hubFor(t) {
  const hub = fakeHub(t);
  const saved = { ...process.env };
  Object.assign(process.env, hub.env);
  t.after(() => {
    for (const key of Object.keys(hub.env)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
  let nextId = 0;
  const event = (id, root, fields) => {
    const sent = ++nextId;
    hub.send(id, {
      t: 'event',
      id: sent,
      event: {
        type: 'ryugi-comments',
        project: root,
        artifact: 'artboard/home',
        unread: 1,
        threads: [
          {
            thread: 't1',
            status: 'open',
            block: 'b1',
            messages: [{ id: 'm1', at: at(1), name: 'human', text: 'Make the header smaller' }],
          },
        ],
        ...fields,
      },
    });
    return sent;
  };
  const connected = (id = session) =>
    until(() => hub.sessions.has(id), `session ${id} never said hello to the hub`);
  return { ...hub, event, connected };
}

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

test('a hub event wakes the Pi session and is acknowledged once delivered', async (t) => {
  const p = project(t);
  const hub = hubFor(t);
  const { handlers, sent } = await loadExtension();
  const ctx = sessionContext(p.root);
  await startSession(t, handlers, ctx);
  await hub.connected();
  assert.equal(hub.hellos()[0].host, 'pi');

  const first = hub.event(session, p.root);
  await until(() => sent.length === 1, 'a hub event wakes Pi');
  assert.equal(sent[0].message.customType, 'ryugi-comments');
  assert.deepEqual(sent[0].options, { triggerTurn: true, deliverAs: 'followUp' });
  // The listing the agent would run next is inlined, so there is no Run line to follow.
  assert.match(sent[0].message.content, /^Ryugi comments artboard\/home \(1 unread\)\./);
  assert.match(sent[0].message.content, /\nComment list: artboard\/home · fake threads/);
  assert.doesNotMatch(sent[0].message.content, /Run:/);
  await until(() => hub.delivered().includes(first), 'the delivery is acknowledged');

  hub.event(session, p.root, { type: 'ryugi-choices', round: 'r1', groups: 1, threads: undefined });
  await until(() => sent.length === 2, 'a submitted choice round wakes Pi');
  assert.equal(sent[1].message.customType, 'ryugi-choices');
  assert.match(sent[1].message.content, /Ryugi choices artboard\/home round r1 submitted/);
  assert.match(sent[1].message.content, /\nComment list: artboard\/home/);
  assert.doesNotMatch(sent[1].message.content, /Run:/);

  await firstHandler(handlers, 'session_shutdown')({ type: 'session_shutdown' }, ctx);
  await until(() => !hub.sessions.has(session), 'a shut-down session leaves the hub');
});

test('the comment watch runs in adeck-hook, not in the Pi process', async (t) => {
  const p = project(t);
  const hub = hubFor(t);
  const log = join(p.root, 'spawned.log');
  const wrapper = join(p.root, 'adeck-hook');
  require('node:fs').writeFileSync(
    wrapper,
    `#!/bin/sh\necho "$@" >> '${log}'\nexec '${hook}' "$@"\n`,
    { mode: 0o755 },
  );
  const saved = process.env.RYUGI_HOOK_BIN;
  process.env.RYUGI_HOOK_BIN = wrapper;
  t.after(() => (process.env.RYUGI_HOOK_BIN = saved));
  const { handlers } = await loadExtension();
  await startSession(t, handlers, sessionContext(p.root));
  await hub.connected();
  assert.match(
    require('node:fs').readFileSync(log, 'utf8'),
    new RegExp(`^watch pi ${p.root} ${session}`),
  );
});

test('a delivery that throws or rejects is reported once, not acknowledged, and the watch keeps waking Pi', async (t) => {
  const p = project(t);
  const hub = hubFor(t);
  const failures = [
    () => {
      throw new Error('extension runtime is gone');
    },
    () => Promise.reject(new Error('extension runtime is gone')),
  ];
  const { handlers, sent } = await loadExtension(() => failures.shift()?.());
  const ctx = sessionContext(p.root);
  await startSession(t, handlers, ctx);
  await hub.connected();

  hub.event(session, p.root);
  await until(() => sent.length === 1, 'the first event reaches sendMessage');
  hub.event(session, p.root);
  await until(() => sent.length === 2, 'the watch survives a synchronous throw');
  const third = hub.event(session, p.root);
  await until(() => sent.length === 3, 'the watch survives a rejected delivery');
  await until(() => hub.delivered().includes(third), 'the working delivery is acknowledged');

  assert.deepEqual(hub.delivered(), [third]);
  assert.equal(ctx.notes.length, 1, 'a repeated failure is reported once');
  assert.equal(ctx.notes[0].type, 'warning');
  assert.match(ctx.notes[0].message, /Ryugi comment watch.*extension runtime is gone/);
});

test('a new session ID replaces the watch: only the new session is connected', async (t) => {
  const p = project(t);
  const hub = hubFor(t);
  const next = '019a4f5e-8a2b-7c3d-9e4f-0123456789ac';
  const { handlers, sent } = await loadExtension();
  await startSession(t, handlers, sessionContext(p.root));
  await hub.connected();
  await startSession(t, handlers, sessionContext(p.root, next));
  await hub.connected(next);
  await until(() => !hub.sessions.has(session), 'the replaced session kept its connection');

  hub.event(next, p.root, { artifact: 'artboard/other' });
  await until(() => sent.length === 1, 'the new session is woken');
  assert.match(sent[0].message.content, /artboard\/other/);
});

test('after reload the reloaded extension keeps watching and the old one stays quiet', async (t) => {
  const p = project(t);
  const hub = hubFor(t);
  const before = await loadExtension();
  const after = await loadExtension();
  const ctx = sessionContext(p.root);
  await firstHandler(before.handlers, 'session_start')({ type: 'session_start' }, ctx);
  await hub.connected();
  await firstHandler(before.handlers, 'session_shutdown')(
    { type: 'session_shutdown', reason: 'reload' },
    ctx,
  );
  await startSession(t, after.handlers, ctx);
  await until(() => hub.hellos().length === 2 && hub.sessions.has(session), 'no reconnect');

  hub.event(session, p.root);
  await until(() => after.sent.length === 1, 'the reloaded extension wakes the session');
  await delay(300);
  assert.deepEqual(before.sent, []);
});

test('a Pi subscription does not guess its host from inherited or conflicting session markers', (t) => {
  const p = project(t);
  const ids = {
    CODEX_THREAD_ID: '019a4f5e-0000-7000-8000-000000000001',
    CLAUDE_CODE_SESSION_ID: '019a4f5e-0000-7000-8000-000000000002',
    PI_SESSION_ID: '019a4f5e-0000-7000-8000-000000000003',
  };
  const hostOf = (env) =>
    subscriptionFor(['start', '--artifact', 'artboard/home', '--project-dir', p.root], env)?.host;
  assert.throws(() => hostOf(ids), /ambiguous agent session markers/);
  assert.equal(
    hostOf({ CODEX_THREAD_ID: ids.CODEX_THREAD_ID, PI_SESSION_ID: ids.PI_SESSION_ID }),
    'pi',
  );
  assert.throws(
    () => hostOf({ ...ids, CODEX_THREAD_ID: undefined }),
    /ambiguous agent session markers/,
  );
  assert.equal(hostOf({ PI_SESSION_ID: ids.PI_SESSION_ID }), 'pi');
});
