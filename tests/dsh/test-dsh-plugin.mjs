import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

test('dsh bundle manifest and cordis patch are valid', () => {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const dshPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, '.dsh', 'package.json'), 'utf8'));
  const patch = fs.readFileSync(path.join(repoRoot, '.dsh', 'cordis.patch.yml'), 'utf8');

  assert.equal(dshPkg.name, 'dsh-plugin-ryugi');
  assert.equal(dshPkg.version, rootPkg.version);
  assert.equal(dshPkg.dsh?.bundle?.patch, './cordis.patch.yml');
  assert.match(patch, /name:\s*dsh-plugin-ryugi/);
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
  assert.ok(names.includes('ryugi-using-ryugi'));
  assert.ok(names.includes('ryugi-brainstorming'));
  assert.ok(names.includes('ryugi-artifacts'));

  const loaded = await provider.get({ name: 'ryugi-brainstorming' });
  assert.ok(loaded);
  assert.equal(loaded.name, 'ryugi-brainstorming');
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

  const first = await preStepHandler(
    { agent, signal: { aborted: false } },
    async () => ({ kind: 'continue', messages: visibleMessages }),
  );
  assert.equal(first.messages.length, 2);
  assert.equal(first.messages[0].role, 'user');
  assert.equal(first.messages[0].source.kind, 'plugin:ryugi');
  assert.equal(first.messages[0].source.form, 'snapshot');
  assert.match(first.messages[0].content[0].text, /<EXTREMELY_IMPORTANT>/);
  assert.match(first.messages[0].content[0].text, /ryugi:using-ryugi bootstrap for dsh/);
  assert.match(first.messages[0].content[0].text, /`ask_user_question`/);
  assert.match(first.messages[0].content[0].text, /`todo_write`/);

  // 2. Subsequent turn when bootstrap is still visible does not duplicate
  visibleMessages = first.messages;
  const second = await preStepHandler(
    { agent, signal: { aborted: false } },
    async () => ({ kind: 'continue', messages: [{ role: 'user', content: [{ type: 'text', text: 'next' }] }] }),
  );
  assert.equal(second.messages.length, 1);

  // 3. After compaction drops old visible messages, bootstrap reinjects automatically
  visibleMessages = [{ role: 'user', content: [{ type: 'text', text: 'after compaction' }] }];
  const compacted = await preStepHandler(
    { agent, signal: { aborted: false } },
    async () => ({ kind: 'continue', messages: visibleMessages }),
  );
  assert.equal(compacted.messages.length, 2);
  assert.equal(compacted.messages[0].source.kind, 'plugin:ryugi');

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
    async () => ({ kind: 'continue', messages: [{ role: 'user', content: [{ type: 'text', text: 'subtask' }] }] }),
  );
  assert.equal(childRes.messages.length, 1);

  for (const cleanup of cleanups) cleanup();
});
