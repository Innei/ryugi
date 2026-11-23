'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const repo = path.resolve(__dirname, '../..');

function hookBin() {
  if (process.env.RYUGI_HOOK_BIN) return process.env.RYUGI_HOOK_BIN;
  execFileSync(
    'cargo',
    ['build', '--quiet', '--manifest-path', path.join(repo, 'hook/Cargo.toml')],
    {
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  );
  process.env.RYUGI_HOOK_BIN = path.join(repo, 'hook/target/debug/ryugi-hook');
  return process.env.RYUGI_HOOK_BIN;
}

module.exports = { hookBin, repo };
