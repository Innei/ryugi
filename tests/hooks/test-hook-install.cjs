'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const repo = path.resolve(__dirname, '../..');
const asset = `ryugi-hook-${process.platform}-${process.arch}`;
const supported = ['darwin-arm64', 'linux-x64', 'linux-arm64'].includes(
  `${process.platform}-${process.arch}`,
);

async function releases(t, files) {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(req.url);
    const body = files[req.url];
    if (body === undefined) {
      res.statusCode = 404;
      res.end('missing');
      return;
    }
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return { base: `http://127.0.0.1:${server.address().port}/download`, seen };
}

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
  return { root, launcher: path.join(app, 'ryugi.cjs'), cache: path.join(root, 'cache') };
}

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function install(p, base, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [p.launcher, 'hook-install'], {
      env: {
        ...process.env,
        XDG_CACHE_HOME: p.cache,
        RYUGI_HOOK_RELEASE_BASE: base,
        RYUGI_HOOK_BIN: '',
        ...env,
      },
      stdio: 'ignore',
    });
    child.on('close', (status) => resolve({ status }));
  });
}

test(
  'hook-install downloads the binary of the plugin version and checks its sha256',
  { skip: !supported },
  async (t) => {
    const p = plugin(t, '9.1.0');
    const bytes = Buffer.from('#!/bin/sh\necho hook\n');
    const r = await releases(t, {
      [`/download/v9.1.0/${asset}`]: bytes,
      [`/download/v9.1.0/${asset}.sha256`]: `${sha(bytes)}  ${asset}\n`,
    });
    assert.equal((await install(p, r.base)).status, 0);
    const target = path.join(p.cache, 'ryugi/hook/9.1.0/ryugi-hook');
    assert.deepEqual(fs.readFileSync(target), bytes);
    assert.ok(fs.statSync(target).mode & 0o100);
    const fetched = r.seen.length;
    assert.equal((await install(p, r.base)).status, 0);
    assert.equal(r.seen.length, fetched, 'an installed binary is not fetched again');
  },
);

test('a binary that fails its sha256 check is never installed', { skip: !supported }, async (t) => {
  const p = plugin(t, '9.2.0');
  const r = await releases(t, {
    [`/download/v9.2.0/${asset}`]: 'tampered',
    [`/download/v9.2.0/${asset}.sha256`]: `${sha('original')}  ${asset}\n`,
  });
  assert.equal((await install(p, r.base)).status, 0);
  const dir = path.join(p.cache, 'ryugi/hook/9.2.0');
  assert.ok(!fs.existsSync(path.join(dir, 'ryugi-hook')));
  assert.deepEqual(
    fs.readdirSync(dir).filter((n) => !n.startsWith('.')),
    [],
  );
});

test(
  'a release without the binary yet is retried later, not on every session',
  { skip: !supported },
  async (t) => {
    const p = plugin(t, '9.3.0');
    const r = await releases(t, {});
    await install(p, r.base);
    const first = r.seen.length;
    assert.ok(first > 0);
    await install(p, r.base);
    assert.equal(r.seen.length, first, 'a fresh 404 is not fetched again at once');
    const marker = path.join(p.cache, 'ryugi/hook/9.3.0/.failed');
    const state = JSON.parse(fs.readFileSync(marker, 'utf8'));
    assert.equal(state.status, 404);
    fs.writeFileSync(marker, JSON.stringify({ ...state, at: Date.now() - 6 * 60 * 1000 }));
    await install(p, r.base);
    assert.ok(r.seen.length > first, 'a 404 older than five minutes is retried');
  },
);

test(
  'installing a version keeps the previous one and removes older ones',
  { skip: !supported },
  async (t) => {
    const p = plugin(t, '9.5.0');
    for (const v of ['9.3.0', '9.4.0', '9.10.0-beta'])
      fs.mkdirSync(path.join(p.cache, 'ryugi/hook', v), { recursive: true });
    const bytes = Buffer.from('bin');
    const r = await releases(t, {
      [`/download/v9.5.0/${asset}`]: bytes,
      [`/download/v9.5.0/${asset}.sha256`]: sha(bytes),
    });
    await install(p, r.base);
    assert.deepEqual(fs.readdirSync(path.join(p.cache, 'ryugi/hook')).sort(), [
      '9.10.0-beta',
      '9.4.0',
      '9.5.0',
    ]);
  },
);

test(
  'a launcher command during the first download waits for the binary and still subscribes',
  { skip: !supported },
  async (t) => {
    const p = plugin(t, '9.6.0');
    const app = path.dirname(p.launcher);
    fs.writeFileSync(
      path.join(app, 'cli.cjs'),
      "console.log(JSON.stringify({schema:'ryugi.cli/v1', command:process.argv.includes('--version')?'version':'start', outcome:'success', data:{status:'running',capabilities:['reviewBundlesV1']}}));\n",
    );
    const record = path.join(p.root, 'subscribed.json');
    const fake = Buffer.from(
      `#!/bin/sh\ncase "$1" in\n  launch-prepare) printf '%s\\n' '{"host":"claude","session":"s","project":"/p","artifact":"document/plan"}' ;;\n  subscribe) cat > '${record}' ;;\nesac\n`,
    );
    const r = await releases(t, {
      [`/download/v9.6.0/${asset}`]: fake,
      [`/download/v9.6.0/${asset}.sha256`]: sha(fake),
    });
    const status = await new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [
          p.launcher,
          'start',
          '--background',
          '--artifact',
          'document/plan',
          '--project-dir',
          p.root,
        ],
        {
          env: {
            ...process.env,
            XDG_CACHE_HOME: p.cache,
            RYUGI_HOOK_RELEASE_BASE: r.base,
            RYUGI_HOOK_BIN: '',
            RYUGI_NO_UPDATE_CHECK: '1',
            CLAUDE_CODE_SESSION_ID: '29ba4e4a-2224-4457-947d-c39ebcbc846c',
          },
          stdio: 'ignore',
        },
      );
      child.on('close', resolve);
    });
    assert.equal(status, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(record, 'utf8')), {
      host: 'claude',
      session: 's',
      project: '/p',
      artifact: 'document/plan',
    });
  },
);
