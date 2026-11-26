import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

test('package.json declares omp extension and skills', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.ok(pkg.keywords.includes('omp-plugin'));
  assert.deepEqual(pkg.omp?.extensions, ['./.omp/extensions/ryugi.ts']);
  assert.deepEqual(pkg.omp?.skills, ['./skills']);
});

test('nodeBin falls back to node when execPath is an embedded host binary like omp.exe', async () => {
  const extUrl = pathToFileURL(path.join(repoRoot, '.omp', 'extensions', 'ryugi.ts')).href;
  const mod = await import(extUrl);

  assert.equal(mod.nodeBin('/usr/local/bin/node'), '/usr/local/bin/node');
  assert.equal(mod.nodeBin('C:\\Program Files\\nodejs\\node.exe'), 'C:\\Program Files\\nodejs\\node.exe');
  assert.equal(mod.nodeBin('/Users/dev/.bun/bin/bun'), '/Users/dev/.bun/bin/bun');
  assert.equal(mod.nodeBin('C:\\Users\\dev\\AppData\\Local\\Tern\\omp\\bin\\omp.exe'), 'node');
  assert.equal(mod.nodeBin('/usr/local/bin/omp'), 'node');
});

test('omp extension injects bootstrap once, deduplicates, and reinjects after compaction', async () => {
  const extUrl = pathToFileURL(path.join(repoRoot, '.omp', 'extensions', 'ryugi.ts')).href;
  const mod = await import(extUrl);
  const handlers = new Map();
  const fakeOmp = {
    on(event, fn) {
      handlers.set(event, fn);
    },
    sendMessage() {},
  };

  mod.default(fakeOmp);

  assert.ok(handlers.has('session_start'));
  assert.ok(handlers.has('session_compact'));
  assert.ok(handlers.has('agent_end'));
  assert.ok(handlers.has('context'));
  assert.ok(handlers.has('session_shutdown'));

  const ctx = handlers.get('context');
  const first = await ctx({
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }], timestamp: 1 }],
  });
  assert.equal(first.messages.length, 2);
  assert.equal(first.messages[0].role, 'user');
  const injected = first.messages[0].content[0].text;
  assert.match(injected, /<EXTREMELY_IMPORTANT>/);
  assert.match(injected, /adeck:using-adeck bootstrap for omp/);
  assert.match(injected, /skill:\/\//);
  assert.match(injected, /`task`/);
  assert.match(injected, /`todo`/);

  // Dedup guard prevents duplicate injection when bootstrap is already present
  const dup = await ctx({ messages: first.messages });
  assert.equal(dup, undefined);

  // After agent_end, context does not inject again until compaction
  await handlers.get('agent_end')({});
  const afterEnd = await ctx({
    messages: [{ role: 'user', content: 'next turn', timestamp: 2 }],
  });
  assert.equal(afterEnd, undefined);

  // After compaction, bootstrap reinjects right after leading compactionSummary messages
  await handlers.get('session_compact')({});
  const afterCompact = await ctx({
    messages: [
      { role: 'compactionSummary', summary: 'earlier context', timestamp: 3 },
      { role: 'user', content: 'continue', timestamp: 4 },
    ],
  });
  assert.equal(afterCompact.messages.length, 3);
  assert.equal(afterCompact.messages[0].role, 'compactionSummary');
  assert.equal(afterCompact.messages[1].role, 'user');
  assert.match(afterCompact.messages[1].content[0].text, /adeck:using-adeck bootstrap for omp/);

  await handlers.get('session_shutdown')({});
});

test('comment watch follows /new, /resume and /fork to the current session', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-omp-watch-'));
  const log = path.join(dir, 'spawns.log');
  const bin = path.join(dir, 'ryugi-hook');
  // Records `<session> <pid>` per watcher and stays alive like the real one.
  fs.writeFileSync(bin, `#!/bin/sh\necho "$4 $$" >> "${log}"\nexec sleep 30\n`, { mode: 0o755 });

  const saved = {};
  for (const key of ['RYUGI_HOOK_BIN', 'PI_SESSION_ID', 'CLAUDE_CODE_SESSION_ID', 'CODEX_THREAD_ID', 'ANTIGRAVITY_CONVERSATION_ID']) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.RYUGI_HOOK_BIN = bin;
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const mod = await import(pathToFileURL(path.join(repoRoot, '.omp', 'extensions', 'ryugi.ts')).href);
  const handlers = new Map();
  mod.default({ on: (event, fn) => handlers.set(event, fn), sendMessage() {} });

  const A = '01a21376-581e-73b1-ba0f-6ff23cfc2c83';
  const B = '01a216b3-ffcf-74e3-b3bc-989d39b402fb';
  const C = '01a21800-0000-7000-8000-000000000000';
  const ctxFor = (id) => ({ cwd: dir, sessionManager: { getSessionId: () => id }, ui: { notify() {} } });
  const spawns = async (count) => {
    for (let i = 0; i < 100; i++) {
      const lines = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : [];
      if (lines.length >= count) return lines.map((line) => line.split(' '));
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.fail(`expected ${count} watcher spawns`);
  };
  const alive = (pid) => {
    try {
      process.kill(Number(pid), 0);
      return true;
    } catch {
      return false;
    }
  };

  await handlers.get('session_start')({}, ctxFor(A));
  const [[firstSession, firstPid]] = await spawns(1);
  assert.equal(firstSession, A);

  // `/new` or `/resume`: the watch moves to the new session and the old watcher stops.
  await handlers.get('session_switch')({ reason: 'new' }, ctxFor(B));
  const afterSwitch = await spawns(2);
  assert.equal(afterSwitch[1][0], B);
  for (let i = 0; i < 50 && alive(firstPid); i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(alive(firstPid), false);

  // `/branch` rewinds within the same session: the running watcher is kept.
  await handlers.get('session_branch')({ reason: 'branch' }, ctxFor(B));
  // `/fork` lands in a new session.
  await handlers.get('session_branch')({ reason: 'fork' }, ctxFor(C));
  const afterFork = await spawns(3);
  assert.deepEqual(
    afterFork.map(([session]) => session),
    [A, B, C],
  );

  await handlers.get('session_shutdown')({});
  for (let i = 0; i < 50 && alive(afterFork[2][1]); i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(alive(afterFork[2][1]), false);
});
