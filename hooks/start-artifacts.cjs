'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { credentialsPath } = require('./selection-context.cjs');

const LAUNCHER = path.resolve(__dirname, '..', 'skills', 'artifacts', 'app', 'ryugi.cjs');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function serverHome(env) {
  return env.RYUGI_SERVER_HOME || path.join(os.homedir(), '.ryugi', 'server');
}

function registerWithRunningServer(project) {
  const info = readJson(path.join(serverHome(process.env), 'server-info'));
  if (!info || typeof info.url !== 'string') return Promise.resolve();
  let base;
  try {
    base = new URL(info.url);
  } catch {
    return Promise.resolve();
  }
  const key = base.searchParams.get('key') || '';
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: base.hostname === 'localhost' ? '127.0.0.1' : base.hostname,
        port: base.port,
        method: 'POST',
        path: `/api/hub/projects?key=${encodeURIComponent(key)}`,
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
      },
      (res) => {
        res.resume();
        res.on('end', resolve);
      },
    );
    req.on('error', resolve);
    req.on('timeout', () => req.destroy());
    req.end(JSON.stringify({ dir: project }));
  });
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
  const credentials = readJson(credentialsPath(process.env, process.platform, os.homedir()));
  const signedIn = credentials && typeof credentials.token === 'string';
  if (!published || !signedIn) return registerWithRunningServer(project);
  spawnSync(
    process.execPath,
    [LAUNCHER, 'start', '--background', '--format', 'json', '--no-open', '--project-dir', project],
    { env: process.env, stdio: 'ignore', timeout: 60000 },
  );
}

void main();
