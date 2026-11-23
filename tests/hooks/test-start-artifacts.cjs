'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { hookBin } = require('./hook-bin.cjs');

const repo = path.resolve(__dirname, '../..');
const bin = hookBin();

function fakeServer() {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      seen.push({
        method: req.method,
        path: req.url.split('?')[0],
        body,
        origin: req.headers.origin,
      });
      res.setHeader('Content-Type', 'application/json');
      res.end('{}');
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ server, seen, port: server.address().port })),
  );
}

function setup() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'start-artifacts-')));
  const project = path.join(root, 'project');
  fs.mkdirSync(path.join(project, '.ryugi', 'artifacts'), { recursive: true });
  const serverHome = path.join(root, 'server');
  fs.mkdirSync(serverHome, { recursive: true });
  return {
    project,
    serverHome,
    env: {
      PATH: process.env.PATH,
      HOME: root,
      XDG_CONFIG_HOME: path.join(root, 'config'),
      RYUGI_SERVER_HOME: serverHome,
    },
  };
}

const runHook = (project, env) =>
  new Promise((resolve) => {
    const child = require('node:child_process').spawn(bin, ['start', project], {
      env,
      stdio: 'ignore',
    });
    child.on('close', resolve);
  });

test('registers the project with a running server when it has nothing published', async () => {
  const { project, serverHome, env } = setup();
  const fake = await fakeServer();
  try {
    fs.writeFileSync(
      path.join(serverHome, 'server-info'),
      JSON.stringify({
        type: 'server-started',
        url: `http://localhost:${fake.port}/`,
        port: fake.port,
      }),
    );
    await runHook(project, env);
    assert.equal(fake.seen.length, 1);
    assert.equal(fake.seen[0].method, 'POST');
    assert.equal(fake.seen[0].path, '/api/hub/projects');
    assert.equal(fake.seen[0].origin, undefined);
    assert.deepEqual(JSON.parse(fake.seen[0].body), { dir: project });
  } finally {
    fake.server.close();
  }
});

test('does nothing when no server runs and nothing is published', () => {
  const { project, env } = setup();
  const result = spawnSync(bin, ['start', project], { env, timeout: 5000 });
  assert.equal(result.status, 0);
});

test('starts the hub through the launcher when a document is published and the user is signed in', () => {
  const { project, env } = setup();
  const fakeBin = path.join(env.HOME, 'bin');
  const argsFile = path.join(env.HOME, 'node-args');
  fs.mkdirSync(fakeBin);
  fs.writeFileSync(path.join(fakeBin, 'node'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${argsFile}'\n`, {
    mode: 0o755,
  });
  fs.mkdirSync(path.join(env.XDG_CONFIG_HOME, 'ryugi'), { recursive: true });
  fs.writeFileSync(
    path.join(env.XDG_CONFIG_HOME, 'ryugi/credentials.json'),
    JSON.stringify({ token: 't' }),
  );
  fs.writeFileSync(
    path.join(project, '.ryugi/config.json'),
    JSON.stringify({ artifacts: { 'document/plan': { cloud: { id: 'c1' } } } }),
  );
  const result = spawnSync(bin, ['start', project], {
    env: { ...env, PATH: `${fakeBin}:/usr/bin:/bin`, RYUGI_PLUGIN_ROOT: repo },
    timeout: 5000,
  });
  assert.equal(result.status, 0);
  assert.deepEqual(fs.readFileSync(argsFile, 'utf8').trim().split('\n'), [
    path.join(repo, 'skills/artifacts/app/ryugi.cjs'),
    'start',
    '--background',
    '--format',
    'json',
    '--no-open',
    '--project-dir',
    project,
  ]);
});
