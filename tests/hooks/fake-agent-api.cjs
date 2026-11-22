'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

function serve(log, portFile) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const url = new URL(req.url, 'http://127.0.0.1');
      fs.appendFileSync(
        log,
        `${JSON.stringify({ path: url.pathname, key: url.searchParams.get('key'), body: body ? JSON.parse(body) : null })}\n`,
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
  });
  server.listen(0, '127.0.0.1', () => fs.writeFileSync(portFile, String(server.address().port)));
}

function startFakeApi(t, project) {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'fake-api-'));
  const log = path.join(dir, 'requests.jsonl');
  const portFile = path.join(dir, 'port');
  const child = spawn(process.execPath, [__filename, log, portFile], { stdio: 'ignore' });
  t.after(() => {
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(portFile)) {
    if (Date.now() > deadline) throw new Error('the fake agent API never listened');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
  const state = path.join(project, '.ryugi', 'artifacts', '.state');
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(
    path.join(state, 'server-info'),
    JSON.stringify({ url: `http://127.0.0.1:${fs.readFileSync(portFile, 'utf8')}/?key=test-key` }),
  );
  return {
    requests: () =>
      fs.existsSync(log)
        ? fs
            .readFileSync(log, 'utf8')
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line))
        : [],
  };
}

if (require.main === module && process.argv[3]) serve(process.argv[2], process.argv[3]);

module.exports = { startFakeApi };
