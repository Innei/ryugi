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
  for (const file of ['ryugi.cjs', 'ryugi-artifacts.cjs', 'output-bootstrap.cjs']) {
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
    [path.join(f.app, 'ryugi.cjs'), 'start', '--format', 'jsonl'],
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
    'process.stdout.write(JSON.stringify({schema:"ryugi.cli/v1",command:process.argv.includes("--version")?"version":"get",outcome:"success",data:{cached:true,capabilities:["reviewBundlesV1"]}}))',
  );
  const out = spawnSync(
    process.execPath,
    [path.join(f.app, 'ryugi.cjs'), 'get', 'cloud', '--format', 'json'],
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
  const out = spawnSync(process.execPath, [path.join(f.app, 'ryugi.cjs'), 'config', '--json'], {
    env: f.env,
    encoding: 'utf8',
  });
  assert.equal(out.status, 1);
  const result = JSON.parse(out.stdout);
  assert.equal(result.schema, 'ryugi.cli/v1');
  assert.equal(result.outcome, 'error');
  assert.equal(fs.existsSync(marker), false);
});

test('a unified-envelope CLI without combined-review support cannot execute a requested command', (t) => {
  const f = setup(t);
  const dist = path.join(f.root, 'cache/ryugi/artifacts/1.60.0/node_modules/ryugi-artifacts/dist');
  fs.mkdirSync(dist, { recursive: true });
  const marker = path.join(f.root, 'requested-command-ran');
  fs.writeFileSync(
    path.join(dist, 'cli.cjs'),
    `if (!process.argv.includes('--version')) require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran'); process.stdout.write(JSON.stringify({schema:'ryugi.cli/v1',command:'version',outcome:'success',data:{version:'1.60.0'}}));`,
  );
  const out = spawnSync(
    process.execPath,
    [path.join(f.app, 'ryugi.cjs'), 'comment', 'list', '--sections', 'all', '--format', 'json'],
    { env: f.env, encoding: 'utf8' },
  );
  assert.equal(out.status, 1);
  assert.equal(fs.existsSync(marker), false);
  assert.equal(JSON.parse(out.stdout).error.code, 'E_BOOTSTRAP_FAILED');
});

test('a fresh latest pointer to an unusable CLI still permits a working offline cache', (t) => {
  const f = setup(t);
  const releases = path.join(f.root, 'cache/ryugi/artifacts');
  for (const [version, code] of [
    ['1.52.0', 'console.log(JSON.stringify({type:"auto-publish"}))'],
    [
      '1.59.1',
      'console.log(JSON.stringify({schema:"ryugi.cli/v1",command:process.argv.includes("--version")?"version":"config",outcome:"success",data:{cached:true,capabilities:["reviewBundlesV1"]}}))',
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
  const out = spawnSync(process.execPath, [path.join(f.app, 'ryugi.cjs'), 'config', '--json'], {
    env: f.env,
    encoding: 'utf8',
  });
  assert.equal(out.status, 0, out.stdout);
  assert.equal(JSON.parse(out.stdout).data.cached, true);
});

test('the latest release is looked up and installed as artideck', (t) => {
  const f = setup(t);
  const log = path.join(f.root, 'npm.log');
  const cli = `process.stdout.write(JSON.stringify({schema:"ryugi.cli/v1",command:process.argv.includes("--version")?"version":"get",outcome:"success",data:{from:__filename,capabilities:["reviewBundlesV1"]}}))`;
  fs.writeFileSync(
    path.join(f.root, 'bin', 'npm'),
    [
      `#!${process.execPath}`,
      "const fs = require('node:fs'), path = require('node:path');",
      'const args = process.argv.slice(2);',
      `fs.appendFileSync(${JSON.stringify(log)}, args.join(' ') + '\\n');`,
      "if (args[0] === 'view') { if (args[1] !== 'artideck') process.exit(1); console.log('1.70.0'); process.exit(0); }",
      "const prefix = args[args.indexOf('--prefix') + 1];",
      "const name = args.at(-1).split('@')[0];",
      "const dist = path.join(prefix, 'node_modules', name, 'dist');",
      'fs.mkdirSync(dist, { recursive: true });',
      `fs.writeFileSync(path.join(dist, 'cli.cjs'), ${JSON.stringify(cli)});`,
    ].join('\n'),
    { mode: 0o755 },
  );
  const out = spawnSync(
    process.execPath,
    [path.join(f.app, 'ryugi.cjs'), 'get', 'cloud', '--format', 'json'],
    { env: f.env, encoding: 'utf8' },
  );
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.match(JSON.parse(out.stdout).data.from, /1\.70\.0[\\/]node_modules[\\/]artideck[\\/]dist/);
  assert.match(fs.readFileSync(log, 'utf8'), /artideck@1\.70\.0/);
});

test('output conflicts fail before installer or subscription work', (t) => {
  const f = setup(t);
  const out = spawnSync(
    process.execPath,
    [path.join(f.app, 'ryugi.cjs'), 'start', '--format', 'json', '--json'],
    { env: f.env, encoding: 'utf8' },
  );
  assert.equal(out.status, 1);
  assert.equal(JSON.parse(out.stdout).error.code, 'E_OPTION_CONFLICT');
  assert.equal(fs.existsSync(path.join(f.root, 'cache')), false);
});

test('the ryugi-artifacts.cjs alias runs the ryugi launcher', (t) => {
  const f = setup(t);
  fs.writeFileSync(
    path.join(f.app, 'cli.cjs'),
    'process.stdout.write(JSON.stringify({schema:"ryugi.cli/v1",command:process.argv.includes("--version")?"version":"get",outcome:"success",data:{command:process.env.RYUGI_ARTIFACTS_COMMAND,capabilities:["reviewBundlesV1"]}}))',
  );
  const out = spawnSync(
    process.execPath,
    [path.join(f.app, 'ryugi-artifacts.cjs'), 'get', 'cloud', '--format', 'json'],
    { env: f.env, encoding: 'utf8' },
  );
  assert.equal(out.status, 0, out.stderr);
  assert.equal(
    JSON.parse(out.stdout).data.command,
    `node "${path.join(fs.realpathSync(f.app), 'ryugi.cjs')}"`,
  );
});

test('a local build is versioned by everything the hub runs, so changing any part replaces the hub', (t) => {
  const f = setup(t);
  fs.writeFileSync(
    path.join(f.app, 'cli.cjs'),
    'process.stdout.write(JSON.stringify({schema:"ryugi.cli/v1",command:process.argv.includes("--version")?"version":"get",outcome:"success",data:{version:process.env.RYUGI_ARTIFACTS_VERSION,capabilities:["reviewBundlesV1"]}}))',
  );
  const daemon = process.platform === 'win32' ? 'ryugi-daemon.exe' : 'ryugi-daemon';
  for (const file of ['document-engine.cjs', 'loro_wasm_bg.wasm', daemon])
    fs.writeFileSync(path.join(f.app, file), file);
  fs.mkdirSync(path.join(f.app, 'viewer', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(f.app, 'viewer', 'assets', 'index.js'), 'viewer');
  fs.mkdirSync(path.join(f.app, 'runtime'));
  fs.writeFileSync(path.join(f.app, 'runtime', 'ryugi-ui.js'), 'runtime');
  const version = () => {
    const out = spawnSync(
      process.execPath,
      [path.join(f.app, 'ryugi.cjs'), 'get', 'cloud', '--format', 'json'],
      { env: f.env, encoding: 'utf8' },
    );
    assert.equal(out.status, 0, out.stderr);
    return JSON.parse(out.stdout).data.version;
  };
  const seen = [version()];
  assert.match(seen[0], /^local-[0-9a-f]{12}$/);
  assert.equal(version(), seen[0]);
  for (const [file, text] of [
    ['document-engine.cjs', 'engine changed'],
    ['loro_wasm_bg.wasm', 'wasm changed'],
    [daemon, 'hub changed'],
    ['viewer/assets/index.js', 'viewer changed'],
    ['runtime/ryugi-ui.js', 'runtime changed'],
  ]) {
    fs.writeFileSync(path.join(f.app, file), text);
    const next = version();
    assert.ok(!seen.includes(next), `${file} did not change the local version`);
    seen.push(next);
  }
});

const reportingCli = (marker) =>
  `process.stdout.write(JSON.stringify({schema:"ryugi.cli/v1",command:process.argv.includes("--version")?"version":"get",outcome:"success",data:{marker:${JSON.stringify(marker)},version:process.env.RYUGI_ARTIFACTS_VERSION,capabilities:["reviewBundlesV1"]}}))`;

function linkDev(f, link) {
  fs.mkdirSync(path.join(f.root, '.ryugi'), { recursive: true });
  fs.writeFileSync(path.join(f.root, '.ryugi', 'dev.json'), JSON.stringify(link, null, 2));
}

function frozenBuild(f) {
  const build = path.join(f.root, '.ryugi', 'dev', 'builds', 'abc123abc123');
  fs.mkdirSync(build, { recursive: true });
  fs.writeFileSync(path.join(build, 'cli.cjs'), reportingCli('dev'));
  return build;
}

const runGet = (f) =>
  spawnSync(process.execPath, [path.join(f.app, 'ryugi.cjs'), 'get', 'cloud', '--format', 'json'], {
    env: f.env,
    encoding: 'utf8',
  });

test("a dev link runs its frozen build under its version, before the launcher's own CLI", (t) => {
  const f = setup(t);
  fs.writeFileSync(path.join(f.app, 'cli.cjs'), reportingCli('own'));
  linkDev(f, {
    build: frozenBuild(f),
    plugin: path.join(f.root, 'plugin'),
    version: 'local-abc123abc123',
    linkedAt: '2026-11-25T00:00:00.000Z',
  });
  const out = runGet(f);
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(JSON.parse(out.stdout).data.marker, 'dev');
  assert.equal(JSON.parse(out.stdout).data.version, 'local-abc123abc123');
});

test('a launcher copy without a CLI of its own runs the dev build without asking npm', (t) => {
  const f = setup(t);
  linkDev(f, {
    build: frozenBuild(f),
    plugin: path.join(f.root, 'plugin'),
    version: 'local-abc123abc123',
    linkedAt: '2026-11-25T00:00:00.000Z',
  });
  const out = runGet(f);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(JSON.parse(out.stdout).data.marker, 'dev');
});

test('a dev link naming no usable build is ignored', (t) => {
  const f = setup(t);
  fs.writeFileSync(path.join(f.app, 'cli.cjs'), reportingCli('own'));
  linkDev(f, {
    build: path.join(f.root, 'gone'),
    plugin: path.join(f.root, 'plugin'),
    version: 'local-abc123abc123',
    linkedAt: '2026-11-25T00:00:00.000Z',
  });
  const out = runGet(f);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(JSON.parse(out.stdout).data.marker, 'own');
  assert.match(JSON.parse(out.stdout).data.version, /^local-[0-9a-f]{12}$/);
});

test('RYUGI_DEV_LINK names the link file, so a missing one turns the machine link off', (t) => {
  const f = setup(t);
  fs.writeFileSync(path.join(f.app, 'cli.cjs'), reportingCli('own'));
  linkDev(f, {
    build: frozenBuild(f),
    plugin: path.join(f.root, 'plugin'),
    version: 'local-abc123abc123',
    linkedAt: '2026-11-25T00:00:00.000Z',
  });
  const off = spawnSync(
    process.execPath,
    [path.join(f.app, 'ryugi.cjs'), 'get', 'cloud', '--format', 'json'],
    { env: { ...f.env, RYUGI_DEV_LINK: path.join(f.root, 'none.json') }, encoding: 'utf8' },
  );
  assert.equal(off.status, 0, off.stderr);
  assert.equal(JSON.parse(off.stdout).data.marker, 'own');
  const elsewhere = path.join(f.root, 'elsewhere.json');
  fs.renameSync(path.join(f.root, '.ryugi', 'dev.json'), elsewhere);
  const on = spawnSync(
    process.execPath,
    [path.join(f.app, 'ryugi.cjs'), 'get', 'cloud', '--format', 'json'],
    { env: { ...f.env, RYUGI_DEV_LINK: elsewhere }, encoding: 'utf8' },
  );
  assert.equal(on.status, 0, on.stderr);
  assert.equal(JSON.parse(on.stdout).data.marker, 'dev');
});
