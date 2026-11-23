'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');
const { fakeHub } = require('./fake-hub.cjs');
const { hookBin } = require('./hook-bin.cjs');

const root = path.resolve(__dirname, '../..');
const app = path.join(root, 'skills/artifacts/app');
const { version } = require(path.join(root, 'package.json'));
const hook = hookBin();

const probe = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'title-probe-')), 'probe.cjs');
fs.writeFileSync(
  probe,
  "setImmediate(() => { require('fs').writeFileSync(process.env.TITLE_OUT, process.title); if (process.env.TITLE_EXIT) process.exit(0); });\n",
);

function titleOf(script, args = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'title-run-'));
  const out = path.join(dir, 'title');
  spawnSync(process.execPath, ['-r', probe, script, ...args], {
    cwd: dir,
    input: '{}',
    env: { ...process.env, TITLE_OUT: out, TITLE_EXIT: '1' },
    timeout: 15000,
  });
  return fs.existsSync(out) ? fs.readFileSync(out, 'utf8').trim() : null;
}

const linux = process.platform === 'linux';
const shown = (title) => (linux ? title.split(' (')[0].slice(0, 15) : title);

async function hookTitle(t, args, env = {}) {
  const child = spawn(hook, args, {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  t.after(() => child.kill('SIGKILL'));
  const deadline = Date.now() + 5000;
  let seen = '';
  while (Date.now() < deadline) {
    try {
      seen = execFileSync('ps', ['-o', linux ? 'comm=' : 'command=', '-p', String(child.pid)], {
        encoding: 'utf8',
      }).trim();
    } catch {
      seen = '';
    }
    if (seen.startsWith('Ryugi ')) return seen;
    await delay(25);
  }
  return seen;
}

const project = () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'title-project-')));
  fs.mkdirSync(path.join(dir, '.git'));
  return dir;
};

const skip = process.platform === 'win32';

test(
  'the Claude Code comment watcher runs as Ryugi watch-comments (version)',
  { skip },
  async (t) => {
    const hub = fakeHub(t);
    assert.equal(
      await hookTitle(t, ['watch', 'claude', project()], hub.env),
      shown(`Ryugi watch-comments (${version})`),
    );
  },
);

test('the Pi comment watcher runs as Ryugi watch-comments (version)', { skip }, async (t) => {
  const hub = fakeHub(t);
  assert.equal(
    await hookTitle(t, ['watch', 'pi', project(), '019a4f5e-8a2b-7c3d-9e4f-0123456789ab'], hub.env),
    shown(`Ryugi watch-comments (${version})`),
  );
});

test('a hook waiting for its input runs as Ryugi hook (version)', { skip }, async (t) => {
  assert.equal(await hookTitle(t, ['context']), shown(`Ryugi hook (${version})`));
});

test('hook commands that are not watchers run as Ryugi hook (version)', { skip }, async (t) => {
  for (const command of ['subscribe', 'cmd-stop'])
    assert.equal(await hookTitle(t, [command]), shown(`Ryugi hook (${version})`), command);
});

test('the launcher runs as Ryugi launcher (version)', { skip }, () => {
  assert.equal(titleOf(path.join(app, 'ryugi.cjs'), ['--version']), `Ryugi launcher (${version})`);
});

test(
  'a package.json of another project above a copied launcher does not lend its version',
  { skip },
  () => {
    const host = fs.mkdtempSync(path.join(os.tmpdir(), 'title-host-'));
    fs.writeFileSync(
      path.join(host, 'package.json'),
      JSON.stringify({ name: 'other', version: '9.9.9' }),
    );
    const copied = path.join(host, 'skills/artifacts/app');
    fs.mkdirSync(copied, { recursive: true });
    for (const name of ['ryugi.cjs', 'output-bootstrap.cjs'])
      fs.copyFileSync(path.join(app, name), path.join(copied, name));
    assert.equal(titleOf(path.join(copied, 'ryugi.cjs'), ['--version']), 'Ryugi launcher');
  },
);
