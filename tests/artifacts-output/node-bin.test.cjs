const { test } = require('node:test');
const assert = require('node:assert/strict');

const { nodeBin } = require('../../skills/artifacts/app/ryugi.cjs');

function withExecPath(value, fn) {
  const original = process.execPath;
  process.execPath = value;
  try {
    return fn();
  } finally {
    process.execPath = original;
  }
}

test('nodeBin keeps a real node or bun runtime', () => {
  for (const exe of [
    '/usr/bin/node',
    '/home/u/.bun/bin/bun',
    'C:\\nvm4w\\nodejs\\node.exe',
    'C:\\Users\\u\\.bun\\bin\\bun.exe',
  ]) {
    assert.equal(withExecPath(exe, nodeBin), exe);
  }
});

test('nodeBin never returns a host binary that embeds bun (omp.exe), which would respawn the whole host', () => {
  for (const exe of ['C:\\Users\\u\\.bun\\bin\\omp.exe', '/usr/local/bin/omp', '/opt/claude/claude']) {
    assert.equal(withExecPath(exe, nodeBin), 'node');
  }
});
