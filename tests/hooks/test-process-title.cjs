'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../..');
const app = path.join(root, 'skills/artifacts/app');
const { version } = require(path.join(root, 'package.json'));

const probe = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'title-probe-')), 'probe.cjs');
fs.writeFileSync(
  probe,
  "setImmediate(() => { require('fs').writeFileSync(process.env.TITLE_OUT, process.title); if (process.env.TITLE_EXIT) process.exit(0); });\n",
);

function titleOf(script, args = [], options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'title-run-'));
  const out = path.join(dir, 'title');
  spawnSync(process.execPath, ['-r', probe, script, ...args], {
    cwd: options.cwd ?? dir,
    input: options.input ?? '{}',
    env: { ...process.env, ...options.env, TITLE_OUT: out, TITLE_EXIT: '1' },
    timeout: 15000,
  });
  return fs.existsSync(out) ? fs.readFileSync(out, 'utf8').trim() : null;
}

const project = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'title-project-'));
  fs.mkdirSync(path.join(dir, '.git'));
  return dir;
};

const skip = process.platform === 'win32';

test('the Claude Code comment watcher runs as Ryugi watch-comments (version)', { skip }, () => {
  assert.equal(
    titleOf(path.join(root, 'hooks/watch-comments.cjs'), [project()]),
    `Ryugi watch-comments (${version})`,
  );
});

test('the Codex comment watcher runs as Ryugi watch-comments (version)', { skip }, () => {
  assert.equal(
    titleOf(path.join(app, 'codex-comment-watch.cjs'), ['stop']),
    `Ryugi watch-comments (${version})`,
  );
});

test('the Antigravity comment watcher runs as Ryugi watch-comments (version)', { skip }, () => {
  assert.equal(
    titleOf(path.join(app, 'agy-comment-watch.cjs'), ['stop']),
    `Ryugi watch-comments (${version})`,
  );
});

test('the launcher runs as Ryugi launcher (version)', { skip }, () => {
  assert.equal(titleOf(path.join(app, 'ryugi.cjs'), ['--version']), `Ryugi launcher (${version})`);
});

test('the agent event hook runs as Ryugi hook (version)', { skip }, () => {
  assert.equal(
    titleOf(path.join(app, 'agent-event.cjs'), ['claude', project()]),
    `Ryugi hook (${version})`,
  );
});

test('the start-artifacts hook runs as Ryugi hook (version)', { skip }, () => {
  assert.equal(
    titleOf(path.join(root, 'hooks/start-artifacts.cjs'), [project()]),
    `Ryugi hook (${version})`,
  );
});

test('the flush-artifacts hook runs as Ryugi hook (version)', { skip }, () => {
  assert.equal(
    titleOf(path.join(root, 'hooks/flush-artifacts.cjs'), [project()]),
    `Ryugi hook (${version})`,
  );
});

test('the selection-context hook runs as Ryugi hook (version)', { skip }, () => {
  assert.equal(titleOf(path.join(root, 'hooks/selection-context.cjs')), `Ryugi hook (${version})`);
});

test(
  'a package.json of another project above a copied app does not lend its version',
  { skip },
  () => {
    const host = fs.mkdtempSync(path.join(os.tmpdir(), 'title-host-'));
    fs.writeFileSync(
      path.join(host, 'package.json'),
      JSON.stringify({ name: 'other', version: '9.9.9' }),
    );
    const copied = path.join(host, 'skills/artifacts/app');
    fs.mkdirSync(copied, { recursive: true });
    for (const name of ['process-title.cjs', 'ryugi.cjs', 'output-bootstrap.cjs'])
      fs.copyFileSync(path.join(app, name), path.join(copied, name));
    const script = path.join(copied, 'name-me.cjs');
    fs.writeFileSync(script, "require('./process-title.cjs').setRyugiTitle('hook');\n");
    assert.equal(titleOf(script), 'Ryugi hook');
    assert.equal(titleOf(path.join(copied, 'ryugi.cjs'), ['--version']), 'Ryugi launcher');
  },
);
