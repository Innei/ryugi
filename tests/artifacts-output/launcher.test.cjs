const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'output-launcher-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, 'app'),
    bin = path.join(root, 'bin');
  fs.mkdirSync(app);
  fs.mkdirSync(bin);
  for (const file of ['ryugi-artifacts.cjs', 'output-bootstrap.cjs']) {
    const source = path.join(__dirname, '../../skills/artifacts/app', file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(app, file));
  }
  fs.writeFileSync(path.join(bin, 'npm'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  return {
    root,
    app,
    env: {
      PATH: bin,
      HOME: root,
      XDG_CONFIG_HOME: path.join(root, 'config'),
      XDG_CACHE_HOME: path.join(root, 'cache'),
    },
  };
}
test('installation failures use the shared JSONL terminal schema', (t) => {
  const f = setup(t);
  const out = spawnSync(
    process.execPath,
    [path.join(f.app, 'ryugi-artifacts.cjs'), 'start', '--format', 'jsonl'],
    {
      env: f.env,
      encoding: 'utf8',
    },
  );
  assert.equal(out.status, 1);
  const events = out.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(events.length, 1);
  assert.equal(events[0].schema, 'ryugi.cli/v1');
  assert.equal(events[0].kind, 'result');
  assert.equal(events[0].error.code, 'E_BOOTSTRAP_FAILED');
});
test('offline cache is selected by its output contract rather than a version floor', (t) => {
  const f = setup(t);
  const old = path.join(f.root, 'cache/ryugi/artifacts/1.43.0/node_modules/ryugi-artifacts/dist');
  fs.mkdirSync(old, { recursive: true });
  fs.writeFileSync(
    path.join(old, 'cli.cjs'),
    'process.stdout.write(JSON.stringify({schema:"ryugi.cli/v1",command:process.argv.includes("--version")?"version":"get",outcome:"success",data:{cached:true}}))',
  );
  const out = spawnSync(
    process.execPath,
    [path.join(f.app, 'ryugi-artifacts.cjs'), 'get', 'cloud', '--format', 'json'],
    { env: f.env, encoding: 'utf8' },
  );
  assert.equal(out.status, 0);
  assert.equal(JSON.parse(out.stdout).data.cached, true);
});

test('a cached CLI with the old JSON protocol cannot execute the requested command', (t) => {
  const f = setup(t);
  const old = path.join(f.root, 'cache/ryugi/artifacts/1.52.0/node_modules/ryugi-artifacts/dist');
  fs.mkdirSync(old, { recursive: true });
  const marker = path.join(f.root, 'command-was-run');
  fs.writeFileSync(
    path.join(old, 'cli.cjs'),
    [
      'const fs=require("node:fs");',
      `if (process.argv.includes('config')) fs.writeFileSync(${JSON.stringify(marker)}, 'mutated');`,
      'process.stdout.write(JSON.stringify({type:"auto-publish",global:null,project:null}));',
    ].join('\n'),
  );
  const out = spawnSync(
    process.execPath,
    [path.join(f.app, 'ryugi-artifacts.cjs'), 'config', '--json'],
    {
      env: f.env,
      encoding: 'utf8',
    },
  );
  assert.equal(out.status, 1);
  const result = JSON.parse(out.stdout);
  assert.equal(result.schema, 'ryugi.cli/v1');
  assert.equal(result.outcome, 'error');
  assert.equal(fs.existsSync(marker), false);
});

test('a fresh latest pointer to an unusable CLI still permits a working offline cache', (t) => {
  const f = setup(t);
  const releases = path.join(f.root, 'cache/ryugi/artifacts');
  for (const [version, code] of [
    ['1.52.0', 'console.log(JSON.stringify({type:"auto-publish"}))'],
    [
      '1.59.1',
      'console.log(JSON.stringify({schema:"ryugi.cli/v1",command:process.argv.includes("--version")?"version":"config",outcome:"success",data:{cached:true}}))',
    ],
  ]) {
    const dist = path.join(releases, version, 'node_modules/ryugi-artifacts/dist');
    fs.mkdirSync(dist, { recursive: true });
    fs.writeFileSync(path.join(dist, 'cli.cjs'), code);
  }
  fs.writeFileSync(
    path.join(releases, 'latest.json'),
    JSON.stringify({ version: '1.52.0', checkedAt: Date.now() }),
  );
  const out = spawnSync(
    process.execPath,
    [path.join(f.app, 'ryugi-artifacts.cjs'), 'config', '--json'],
    { env: f.env, encoding: 'utf8' },
  );
  assert.equal(out.status, 0, out.stdout);
  assert.equal(JSON.parse(out.stdout).data.cached, true);
});

test('output conflicts fail before installer or subscription work', (t) => {
  const f = setup(t);
  const out = spawnSync(
    process.execPath,
    [path.join(f.app, 'ryugi-artifacts.cjs'), 'start', '--format', 'json', '--json'],
    { env: f.env, encoding: 'utf8' },
  );
  assert.equal(out.status, 1);
  assert.equal(JSON.parse(out.stdout).error.code, 'E_OPTION_CONFLICT');
  assert.equal(fs.existsSync(path.join(f.root, 'cache')), false);
});
