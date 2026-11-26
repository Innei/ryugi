import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

test('dsh bundle manifest and cordis patch are valid', () => {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const dshPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, '.dsh', 'package.json'), 'utf8'));
  const patch = fs.readFileSync(path.join(repoRoot, '.dsh', 'cordis.patch.yml'), 'utf8');

  assert.equal(dshPkg.name, 'dsh-plugin-adeck');
  assert.equal(dshPkg.version, rootPkg.version);
  assert.equal(dshPkg.dsh?.bundle?.patch, './cordis.patch.yml');
  assert.match(patch, /name:\s*dsh-plugin-adeck/);
});

test('dsh skill provider discovers all bundled ryugi skills and strips frontmatter', async () => {
  const mod = await import(pathToFileURL(path.join(repoRoot, '.dsh', 'index.mjs')).href);
  const provider = mod.createRyugiSkillProvider();
  const list = await provider.list();

  assert.ok(list.length >= 10, `expected >= 10 skills, got ${list.length}`);
  const names = list.map((s) => s.name);
  for (const n of names) {
    assert.match(n, /^[a-z0-9][a-z0-9-]*$/, `skill name must be DSH-valid kebab-case: ${n}`);
  }
  assert.ok(names.includes('adeck-using-adeck'));
  assert.ok(names.includes('adeck-brainstorming'));
  assert.ok(names.includes('adeck-artifacts'));

  const loaded = await provider.get({ name: 'adeck-brainstorming' });
  assert.ok(loaded);
  assert.equal(loaded.name, 'adeck-brainstorming');
  assert.ok(!loaded.content.startsWith('---'), 'frontmatter should be stripped');
  assert.ok(loaded.content.length > 100);
});

test('dsh apply registers skills provider, injects bootstrap once, reinjects after compaction, and skips subagents', async () => {
  const mod = await import(pathToFileURL(path.join(repoRoot, '.dsh', 'index.mjs')).href);

  const registeredProviders = [];
  let preStepHandler;
  const cleanups = [];

  const fakeCtx = {
    inject(services, cb) {
      if (services.includes('skills')) {
        cb({
          skills: {
            registerProvider(factory) {
              registeredProviders.push(factory());
            },
          },
        });
      }
    },
    on(event, handler) {
      if (event === 'agent/pre-step') preStepHandler = handler;
    },
    effect(fn) {
      cleanups.push(fn());
    },
  };

  mod.apply(fakeCtx, {});
  assert.equal(registeredProviders.length, 1);
  assert.equal(typeof preStepHandler, 'function');

  // 1. First step on a top-level session injects bootstrap
  let visibleMessages = [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }];
  const agent = {
    id: 'session-test-1',
    session: {
      header: { id: 'session-test-1' },
      deriveMessages: () => visibleMessages,
    },
  };

  const first = await preStepHandler({ agent, signal: { aborted: false } }, async () => ({
    kind: 'continue',
    messages: visibleMessages,
  }));
  assert.equal(first.messages.length, 2);
  assert.equal(first.messages[0].role, 'user');
  assert.equal(first.messages[0].source.kind, 'plugin:adeck');
  assert.equal(first.messages[0].source.form, 'snapshot');
  assert.match(first.messages[0].content[0].text, /<EXTREMELY_IMPORTANT>/);
  assert.match(first.messages[0].content[0].text, /adeck:using-adeck bootstrap for dsh/);
  assert.match(first.messages[0].content[0].text, /`ask_user_question`/);
  assert.match(first.messages[0].content[0].text, /`todo_write`/);

  // 2. Subsequent turn when bootstrap is still visible does not duplicate
  visibleMessages = first.messages;
  const second = await preStepHandler({ agent, signal: { aborted: false } }, async () => ({
    kind: 'continue',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'next' }] }],
  }));
  assert.equal(second.messages.length, 1);

  // 3. After compaction drops old visible messages, bootstrap reinjects automatically
  visibleMessages = [{ role: 'user', content: [{ type: 'text', text: 'after compaction' }] }];
  const compacted = await preStepHandler({ agent, signal: { aborted: false } }, async () => ({
    kind: 'continue',
    messages: visibleMessages,
  }));
  assert.equal(compacted.messages.length, 2);
  assert.equal(compacted.messages[0].source.kind, 'plugin:adeck');

  // 4. Delegated subagent sessions skip top-level bootstrap
  const childAgent = {
    id: 'session-child-1',
    session: {
      header: { id: 'session-child-1', parentId: 'session-test-1' },
      deriveMessages: () => [],
    },
  };
  const childRes = await preStepHandler(
    { agent: childAgent, signal: { aborted: false } },
    async () => ({
      kind: 'continue',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'subtask' }] }],
    }),
  );
  assert.equal(childRes.messages.length, 1);

  for (const cleanup of cleanups) cleanup();
});

const require = createRequire(import.meta.url);

async function until(check, explanation, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return;
    await delay(25);
  }
  assert.fail(explanation);
}

test('dsh comment watch runs in ryugi-hook and wakes the session', async (t) => {
  const { fakeHub } = require('../hooks/fake-hub.cjs');
  const hook = require('../hooks/hook-bin.cjs').hookBin();
  const hub = fakeHub(t);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-dsh-hook-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const spawned = path.join(scratch, 'spawned.log');
  const wrapper = path.join(scratch, 'ryugi-hook');
  fs.writeFileSync(wrapper, `#!/bin/sh\necho "$@" >> '${spawned}'\nexec '${hook}' "$@"\n`, {
    mode: 0o755,
  });
  const saved = { ...process.env };
  Object.assign(process.env, hub.env, { RYUGI_HOOK_BIN: wrapper });
  t.after(() => {
    for (const key of [...Object.keys(hub.env), 'RYUGI_HOOK_BIN']) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-dsh-watch-')));
  fs.mkdirSync(path.join(root, '.git'));
  fs.mkdirSync(path.join(root, '.ryugi/artifacts'), { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const mod = await import(pathToFileURL(path.join(repoRoot, '.dsh', 'index.mjs')).href);
  const woken = [];
  const agent = {
    id: 'session-watch-1',
    status: 'idle',
    followup: (message) => woken.push(message),
    session: { header: { id: 'session-watch-1' }, deriveMessages: () => [] },
  };
  let preStep;
  const cleanups = [];
  mod.apply(
    {
      on: (event, handler) => event === 'agent/pre-step' && (preStep = handler),
      effect: (fn) => cleanups.push(fn()),
      agents: { get: () => agent },
    },
    { workspace: root },
  );
  t.after(() => cleanups.forEach((cleanup) => cleanup()));
  await preStep({ agent, signal: { aborted: false } }, async () => ({
    kind: 'continue',
    messages: [],
  }));

  const uuid = mod.toSessionUuid('session-watch-1');
  await until(() => hub.sessions.has(uuid), 'the dsh session never said hello to the hub');
  assert.equal(hub.hellos()[0].host, 'pi');
  assert.equal(hub.hellos()[0].agent, 'DeepSeek Harness');
  assert.match(fs.readFileSync(spawned, 'utf8'), new RegExp(`^watch dsh ${root} ${uuid}`));
  hub.send(uuid, {
    t: 'event',
    id: 1,
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
          messages: [
            { id: 'm1', at: '2026-11-03T10:00:01.000Z', name: 'human', text: 'Smaller header' },
          ],
        },
      ],
    },
  });
  await until(() => woken.length === 1, 'the hub event never woke the dsh agent');
  assert.match(JSON.stringify(woken[0]), /Smaller header/);
  await until(() => hub.delivered().includes(1), 'the delivery was not acknowledged');
});

test('dsh starts no comment watch for a workspace without artifacts', async (t) => {
  const hook = require('../hooks/hook-bin.cjs').hookBin();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-dsh-none-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const workspace = path.join(scratch, 'workspace');
  fs.mkdirSync(path.join(workspace, '.git'), { recursive: true });
  const spawned = path.join(scratch, 'spawned.log');
  const wrapper = path.join(scratch, 'ryugi-hook');
  fs.writeFileSync(wrapper, `#!/bin/sh\necho "$@" >> '${spawned}'\nexec '${hook}' "$@"\n`, {
    mode: 0o755,
  });
  const saved = process.env.RYUGI_HOOK_BIN;
  process.env.RYUGI_HOOK_BIN = wrapper;
  t.after(() => {
    if (saved === undefined) delete process.env.RYUGI_HOOK_BIN;
    else process.env.RYUGI_HOOK_BIN = saved;
  });
  const mod = await import(pathToFileURL(path.join(repoRoot, '.dsh', 'index.mjs')).href);
  const agent = {
    id: 'session-none-1',
    status: 'idle',
    followup: () => {},
    session: { header: { id: 'session-none-1' }, deriveMessages: () => [] },
  };
  let preStep;
  const cleanups = [];
  mod.apply(
    {
      on: (event, handler) => event === 'agent/pre-step' && (preStep = handler),
      effect: (fn) => cleanups.push(fn()),
      agents: { get: () => agent },
    },
    { workspace },
  );
  t.after(() => cleanups.forEach((cleanup) => cleanup()));
  for (let step = 0; step < 3; step++) {
    await preStep({ agent, signal: { aborted: false } }, async () => ({
      kind: 'continue',
      messages: [],
    }));
    await delay(150);
  }
  assert.equal(
    fs.existsSync(spawned),
    false,
    fs.existsSync(spawned) ? fs.readFileSync(spawned, 'utf8') : '',
  );
});
