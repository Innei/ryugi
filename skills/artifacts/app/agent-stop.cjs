'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

function postToServer(project, pathname) {
  return new Promise((resolve) => {
    let base;
    try {
      const info = JSON.parse(
        fs.readFileSync(path.join(project, '.ryugi', 'artifacts', '.state', 'server-info'), 'utf8'),
      );
      base = new URL(info.url);
    } catch {
      resolve();
      return;
    }
    const key = base.searchParams.get('key') || '';
    const req = http.request(
      {
        host: base.hostname === 'localhost' ? '127.0.0.1' : base.hostname,
        port: base.port,
        method: 'POST',
        path: `${pathname}?key=${encodeURIComponent(key)}`,
        headers: { 'X-Ryugi-Project': encodeURIComponent(project) },
        timeout: 2000,
      },
      (res) => {
        res.resume();
        res.on('end', resolve);
      },
    );
    req.on('error', () => resolve());
    req.on('timeout', () => req.destroy());
    req.end();
  });
}

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

function projectOf(cwd) {
  try {
    return require('./comment-subscriptions.cjs').projectRoot(cwd);
  } catch {
    return null;
  }
}

if (require.main === module) {
  const input = readStdin();
  const project = input && typeof input.cwd === 'string' ? projectOf(input.cwd) : null;
  if (project) void postToServer(project, '/api/agent/stop');
}

module.exports = { postToServer };
