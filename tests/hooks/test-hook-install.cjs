'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const repo = path.resolve(__dirname, '../..');

function plugin(t, version) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-hook-install-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, 'plugin/skills/artifacts/app');
  fs.mkdirSync(app, { recursive: true });
  for (const name of ['ryugi.cjs', 'output-bootstrap.cjs'])
    fs.copyFileSync(path.join(repo, 'skills/artifacts/app', name), path.join(app, name));
  fs.writeFileSync(
    path.join(root, 'plugin/package.json'),
    JSON.stringify({ name: 'ryugi', version }),
  );
  const calls = path.join(root, 'cli-calls');
  const release = path.join(root, 'release');
  fs.writeFileSync(
    path.join(app, 'cli.cjs'),
    `const fs = require('fs');
const args = process.argv.slice(2);
if (args[0] === 'hook') {
  fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args) + '\\n');
  const until = Date.now() + 60000;
  while (fs.existsSync(${JSON.stringify(path.join(root, 'hold'))}) && !fs.existsSync(${JSON.stringify(release)}) && Date.now() < until)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  process.exit(0);
}
console.log(JSON.stringify({schema:'ryugi.cli/v1', command:args.includes('--version')?'version':'start', outcome:'success', data:{status:'running',capabilities:['reviewBundlesV1']}}));
`,
  );
  const read = () =>
    fs.existsSync(calls)
      ? fs.readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
      : [];
  return {
    root,
    home: path.join(root, 'home'),
    launcher: path.join(app, 'ryugi.cjs'),
    read,
    release,
  };
}

function launch(p, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [p.launcher, ...args], {
      env: { ...process.env, HOME: p.home, RYUGI_HOOK_BIN: '', RYUGI_NO_UPDATE_CHECK: '1', ...env },
      stdio: 'ignore',
    });
    child.on('close', (status) => resolve(status));
  });
}

async function noNetwork(t) {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(req.url);
    res.statusCode = 404;
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return { base: `http://127.0.0.1:${server.address().port}`, seen };
}

test(
  process.platform === 'win32'
    ? 'hook-install is a no-op on Windows, where the launcher uses the Node hook'
    : "hook-install asks the CLI for the plugin version's binary and downloads nothing itself",
  async (t) => {
    const p = plugin(t, '9.1.0');
    const net = await noNetwork(t);
    assert.equal(await launch(p, ['hook-install'], { RYUGI_HOOK_RELEASE_BASE: net.base }), 0);
    assert.deepEqual(
      p.read(),
      process.platform === 'win32' ? [] : [['hook', 'install', '9.1.0', '--background']],
    );
    assert.deepEqual(net.seen, []);
  },
);

test('hook-install leaves a binary already in ~/.ryugi/hook alone', async (t) => {
  const p = plugin(t, '9.2.0');
  const binary = path.join(p.home, '.ryugi/hook/9.2.0/ryugi-hook');
  fs.mkdirSync(path.dirname(binary), { recursive: true });
  fs.writeFileSync(binary, '#!/bin/sh\n', { mode: 0o755 });
  assert.equal(await launch(p, ['hook-install']), 0);
  assert.deepEqual(p.read(), []);
});

test(
  'a launcher command without a binary does not wait for the download',
  { timeout: 20000 },
  async (t) => {
    const p = plugin(t, '9.3.0');
    fs.writeFileSync(path.join(p.root, 'hold'), '');
    const status = await launch(
      p,
      ['start', '--background', '--artifact', 'document/plan', '--project-dir', p.root],
      { CLAUDE_CODE_SESSION_ID: '29ba4e4a-2224-4457-947d-c39ebcbc846c' },
    );
    assert.equal(status, 0);
    fs.writeFileSync(p.release, '');
  },
);
