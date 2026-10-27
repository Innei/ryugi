'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

function main() {
  const project = process.argv[2];
  let info;
  try {
    info = JSON.parse(
      fs.readFileSync(path.join(project, '.ryugi', 'artifacts', '.state', 'server-info'), 'utf8'),
    );
  } catch {
    return;
  }
  let base;
  try {
    base = new URL(info.url);
  } catch {
    return;
  }
  const key = base.searchParams.get('key') || '';
  const host = base.hostname === 'localhost' ? '127.0.0.1' : base.hostname;
  const req = http.request(
    {
      host,
      port: base.port,
      method: 'POST',
      path: `/api/cloud/flush?key=${encodeURIComponent(key)}`,
      timeout: 2000,
    },
    (res) => res.resume(),
  );
  req.on('error', () => {});
  req.on('timeout', () => req.destroy());
  req.end();
}

main();
