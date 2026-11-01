'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const repo = path.resolve(__dirname, '../..');
const hook = path.join(repo, 'hooks/start-artifacts.cjs');

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
    const child = require('node:child_process').spawn(process.execPath, [hook, project], {
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
  const result = spawnSync(process.execPath, [hook, project], { env, timeout: 5000 });
  assert.equal(result.status, 0);
});
