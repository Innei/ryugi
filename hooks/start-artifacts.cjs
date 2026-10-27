'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { credentialsPath } = require('./selection-context.cjs');

const LAUNCHER = path.resolve(__dirname, '..', 'skills', 'artifacts', 'app', 'ryugi-artifacts.cjs');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  const project = process.argv[2];
  if (!project) return;
  const config = readJson(path.join(project, '.ryugi', 'config.json'));
  const artifacts =
    config && typeof config.artifacts === 'object' && config.artifacts ? config.artifacts : {};
  const published = Object.entries(artifacts).some(
    ([key, entry]) =>
      key.startsWith('document/') && entry && entry.cloud && typeof entry.cloud.id === 'string',
  );
  if (!published) return;
  const credentials = readJson(credentialsPath(process.env, process.platform, os.homedir()));
  if (!credentials || typeof credentials.token !== 'string') return;
  spawnSync(
    process.execPath,
    [LAUNCHER, 'start', '--json', '--no-open', '--project-dir', project],
    { env: process.env, stdio: 'ignore', timeout: 60000 },
  );
}

main();
