import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  assert.match(injected, /ryugi:using-ryugi bootstrap for omp/);
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
  assert.match(afterCompact.messages[1].content[0].text, /ryugi:using-ryugi bootstrap for omp/);

  await handlers.get('session_shutdown')({});
});
