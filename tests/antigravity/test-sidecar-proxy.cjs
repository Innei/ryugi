'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const {
  createSidecarServer,
  isAllowedOrigin,
  resolveLandingPath,
  resolveUpstream,
  rewriteCsp,
  rewriteLocation,
} = require('../../sidecars/artifacts/server.cjs');

const CONV_ID = '9d0cb0c2-84c0-40f4-996a-251a4fcf713a';
const OTHER_CONV_ID = '11111111-2222-3333-4444-555555555555';
const VALID_ARTIFACT_ID = 'fNlTcoR89fKZ7peWMqBR1';

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function getDeadPid() {
  const child = spawnSync(process.execPath, ['-e', ''], { stdio: 'ignore' });
  assert.ok(Number.isInteger(child.pid) && child.pid > 0, 'spawned helper must expose a numeric PID');
  return child.pid;
}

function listenServer(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const addr = server.address();
      resolve(addr.port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections?.();
  });
}

function httpRequest({ port, method = 'GET', reqPath = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path: reqPath,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

function rawTcpRequest(port, rawPayload, { expectClose = false, readUntil = null } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    const chunks = [];
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    socket.on('connect', () => {
      socket.write(rawPayload);
    });

    socket.on('data', (chunk) => {
      chunks.push(chunk);
      const text = Buffer.concat(chunks).toString('utf8');
      if (readUntil && readUntil(text)) {
        finish({ text, socket });
      }
    });

    socket.on('end', () => {
      if (expectClose) {
        finish({ text: Buffer.concat(chunks).toString('utf8'), socket });
      }
    });

    socket.on('close', () => {
      finish({ text: Buffer.concat(chunks).toString('utf8'), socket });
    });

    socket.on('error', (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

function testResolveUpstream() {
  const dir = makeTempDir('ryugi-sidecar-upstream-');
  const env = { RYUGI_SERVER_HOME: dir };
  const infoFile = path.join(dir, 'server-info');

  try {
    assert.deepEqual(
      resolveUpstream(env),
      { kind: 'offline', reason: 'no-server-info' },
      'missing server-info must report offline/no-server-info',
    );

    fs.writeFileSync(infoFile, '{not-json');
    assert.deepEqual(
      resolveUpstream(env),
      { kind: 'offline', reason: 'invalid-info' },
      'corrupt server-info JSON must report offline/invalid-info',
    );

    fs.writeFileSync(
      infoFile,
      JSON.stringify({ host: '192.168.1.5', port: 27319, pid: process.pid }),
    );
    assert.deepEqual(
      resolveUpstream(env),
      { kind: 'offline', reason: 'non-loopback' },
      'non-loopback host must be rejected to prevent SSRF',
    );

    fs.writeFileSync(
      infoFile,
      JSON.stringify({ host: '0.0.0.0', port: 27319, pid: process.pid }),
    );
    assert.deepEqual(
      resolveUpstream(env),
      { kind: 'offline', reason: 'non-loopback' },
      'wildcard bind address 0.0.0.0 must be rejected as non-loopback',
    );

    fs.writeFileSync(
      infoFile,
      JSON.stringify({ host: '127.0.0.1', port: 70000, pid: process.pid }),
    );
    assert.deepEqual(
      resolveUpstream(env),
      { kind: 'offline', reason: 'invalid-info' },
      'out-of-range port must be rejected',
    );

    const deadPid = getDeadPid();
    fs.writeFileSync(
      infoFile,
      JSON.stringify({ host: '127.0.0.1', port: 27319, pid: deadPid }),
    );
    assert.deepEqual(
      resolveUpstream(env),
      { kind: 'offline', reason: 'stale-pid' },
      'dead server PID must report offline/stale-pid',
    );

    fs.writeFileSync(
      infoFile,
      JSON.stringify({
        host: 'localhost',
        urlHost: 'localhost',
        port: 27319,
        boardPort: 27329,
        pid: process.pid,
      }),
    );
    assert.deepEqual(
      resolveUpstream(env),
      {
        kind: 'ready',
        host: '127.0.0.1',
        port: 27319,
        boardPort: 27329,
        urlHost: 'localhost',
        pid: process.pid,
      },
      'localhost host must normalize connect host to 127.0.0.1 while preserving urlHost',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testIsAllowedOrigin() {
  for (const allowed of [
    undefined,
    '',
    'null',
    'http://127.0.0.1',
    'http://127.0.0.1:4321',
    'http://localhost',
    'http://localhost:27319',
    'http://[::1]',
    'http://[::1]:27319',
  ]) {
    assert.equal(isAllowedOrigin(allowed), true, `expected origin ${String(allowed)} to be allowed`);
  }

  for (const blocked of [
    'https://evil.example',
    'http://evil.example:27319',
    'http://localhost.evil.example',
    'http://127.0.0.1.evil.example',
    'https://localhost:27319',
    'http://0.0.0.0:27319',
    'http://127.0.0.1:27319/path',
    'http://127.0.0.1:27319/',
    'http://127.0.0.1@evil.example',
  ]) {
    assert.equal(isAllowedOrigin(blocked), false, `expected origin ${blocked} to be rejected`);
  }
}

const EXPECTED_FRAME_ANCESTORS = 'frame-ancestors plugin: http://127.0.0.1:* http://localhost:*';

function testRewriteCsp() {
  assert.equal(
    rewriteCsp(
      "default-src 'self'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline'; base-uri 'self'",
    ),
    `default-src 'self'; ${EXPECTED_FRAME_ANCESTORS}; script-src 'self' 'unsafe-inline'; base-uri 'self'`,
    'rewriteCsp must narrow frame-ancestors to plugin and loopback origins while preserving all other directives',
  );

  assert.equal(
    rewriteCsp("FRAME-ANCESTORS 'self' https://example.com; connect-src 'self' ws:"),
    `${EXPECTED_FRAME_ANCESTORS}; connect-src 'self' ws:`,
    'rewriteCsp must match frame-ancestors case-insensitively',
  );

  assert.equal(
    rewriteCsp("frame-ancestors 'none'"),
    EXPECTED_FRAME_ANCESTORS,
    'rewriteCsp must replace frame-ancestors when it is the sole directive',
  );

  assert.deepEqual(
    rewriteCsp(["frame-ancestors 'none'", "default-src 'self'; img-src data:"]),
    [EXPECTED_FRAME_ANCESTORS, "default-src 'self'; img-src data:"],
    'rewriteCsp must handle header arrays and preserve entries without frame-ancestors',
  );
}

function testRewriteLocation() {
  const upstream = { host: '127.0.0.1', urlHost: 'localhost', port: 27319 };

  assert.equal(
    rewriteLocation('http://localhost:27319/document/abc?tab=1#sec', upstream),
    '/document/abc?tab=1#sec',
    'upstream urlHost redirect must rewrite to relative path with query and hash',
  );

  assert.equal(
    rewriteLocation('http://127.0.0.1:27319/', upstream),
    '/',
    'upstream 127.0.0.1 redirect must rewrite to relative root path',
  );

  assert.equal(
    rewriteLocation('http://localhost:9999/other', upstream),
    'http://localhost:9999/other',
    'redirect to a different local port must remain untouched',
  );

  assert.equal(
    rewriteLocation('https://ryugi.innei.dev/auth', upstream),
    'https://ryugi.innei.dev/auth',
    'external redirect URL must remain untouched',
  );

  assert.equal(
    rewriteLocation('/document/abc', upstream),
    '/document/abc',
    'already-relative location must remain untouched',
  );
}

function testResolveLandingPath() {
  const serverDir = makeTempDir('ryugi-sidecar-subs-');
  const projectDir = makeTempDir('ryugi-sidecar-project-');
  const outsideFile = path.join(serverDir, 'secret-id');
  const env = { RYUGI_SERVER_HOME: serverDir };
  const subsFile = path.join(serverDir, 'agent-subscriptions.json');

  try {
    fs.writeFileSync(outsideFile, 'OutsideSecretId12345');

    const docWithId = path.join(projectDir, '.ryugi', 'artifacts', 'document', 'paper-review');
    const docSlugOnly = path.join(projectDir, '.ryugi', 'artifacts', 'artboard', 'wireframe-v1');
    const docBadId = path.join(projectDir, '.ryugi', 'artifacts', 'document', 'bad-id-doc');
    const docSymlinkId = path.join(projectDir, '.ryugi', 'artifacts', 'document', 'symlink-doc');
    fs.mkdirSync(docWithId, { recursive: true });
    fs.mkdirSync(docSlugOnly, { recursive: true });
    fs.mkdirSync(docBadId, { recursive: true });
    fs.mkdirSync(docSymlinkId, { recursive: true });

    fs.writeFileSync(path.join(docWithId, '.artifact-id'), `${VALID_ARTIFACT_ID}\n`);
    fs.writeFileSync(path.join(docBadId, '.artifact-id'), '../escape');
    fs.symlinkSync(outsideFile, path.join(docSymlinkId, '.artifact-id'));

    fs.writeFileSync(
      subsFile,
      JSON.stringify({
        [`antigravity:${CONV_ID}`]: {
          items: [
            { project: projectDir, artifact: 'artboard/wireframe-v1' },
            { project: projectDir, artifact: 'document/paper-review' },
          ],
        },
      }),
    );

    assert.equal(
      resolveLandingPath(CONV_ID, env),
      `/document/${VALID_ARTIFACT_ID}`,
      'resolveLandingPath must pick the most recent item and resolve its .artifact-id',
    );

    assert.equal(
      resolveLandingPath(OTHER_CONV_ID, env),
      null,
      'unknown conversationId must resolve to null',
    );

    assert.equal(
      resolveLandingPath('not-a-uuid', env),
      null,
      'non-UUID conversationId must resolve to null',
    );

    fs.writeFileSync(
      subsFile,
      JSON.stringify({
        [`antigravity:${CONV_ID}`]: {
          items: [{ project: projectDir, artifact: 'artboard/wireframe-v1' }],
        },
      }),
    );
    assert.equal(
      resolveLandingPath(CONV_ID, env),
      '/artboard/wireframe-v1',
      'missing .artifact-id must fall back to /<artifact> slug',
    );

    fs.writeFileSync(
      subsFile,
      JSON.stringify({
        [`antigravity:${CONV_ID}`]: {
          items: [{ project: projectDir, artifact: 'document/bad-id-doc' }],
        },
      }),
    );
    assert.equal(
      resolveLandingPath(CONV_ID, env),
      '/document/bad-id-doc',
      'invalid .artifact-id content must be rejected and fall back to slug',
    );

    fs.writeFileSync(
      subsFile,
      JSON.stringify({
        [`antigravity:${CONV_ID}`]: {
          items: [{ project: projectDir, artifact: 'document/symlink-doc' }],
        },
      }),
    );
    assert.equal(
      resolveLandingPath(CONV_ID, env),
      '/document/symlink-doc',
      'symlinked .artifact-id escaping artifacts root must be rejected and fall back to slug',
    );

    fs.writeFileSync(
      subsFile,
      JSON.stringify({
        [`antigravity:${CONV_ID}`]: {
          items: [
            { project: projectDir, artifact: 'document/../etc/passwd' },
            { project: projectDir, artifact: 'unknown/foo' },
          ],
        },
      }),
    );
    assert.equal(
      resolveLandingPath(CONV_ID, env),
      null,
      'invalid artifact paths must be ignored and yield null when no valid item exists',
    );
  } finally {
    fs.rmSync(serverDir, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

async function testLiveHttpAndWebSocketProxy() {
  const serverDir = makeTempDir('ryugi-sidecar-live-');
  const projectDir = makeTempDir('ryugi-sidecar-live-proj-');
  const env = { RYUGI_SERVER_HOME: serverDir };
  const recordedRequests = [];
  const recordedUpgrades = [];

  const docDir = path.join(projectDir, '.ryugi', 'artifacts', 'document', 'live-doc');
  fs.mkdirSync(docDir, { recursive: true });
  fs.writeFileSync(path.join(docDir, '.artifact-id'), `${VALID_ARTIFACT_ID}\n`);
  fs.writeFileSync(
    path.join(serverDir, 'agent-subscriptions.json'),
    JSON.stringify({
      [`antigravity:${CONV_ID}`]: {
        items: [{ project: projectDir, artifact: 'document/live-doc' }],
      },
    }),
  );

  const mockUpstream = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      recordedRequests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body,
      });

      if (req.url === '/redirect-local') {
        const port = mockUpstream.address().port;
        res.writeHead(302, { Location: `http://localhost:${port}/document/${VALID_ARTIFACT_ID}?from=local` });
        res.end();
        return;
      }

      if (req.url === '/redirect-external') {
        res.writeHead(302, { Location: 'https://ryugi.innei.dev/docs' });
        res.end();
        return;
      }

      if (req.method === 'POST' && req.url === '/api/echo') {
        res.writeHead(201, {
          'Content-Type': 'application/json',
          'Keep-Alive': 'timeout=99, max=123',
          'Proxy-Connection': 'keep-alive',
        });
        res.end(
          JSON.stringify({
            echoed: body,
            host: req.headers.host,
            origin: req.headers.origin,
            sidecarToken: req.headers['x-sidecar-token'] ?? null,
          }),
        );
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy':
          "default-src 'self'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline'",
        'Keep-Alive': 'timeout=99, max=123',
        'Proxy-Connection': 'keep-alive',
      });
      res.end(`upstream-ok:${req.url}`);
    });
  });

  const mockUpgradeSockets = new Set();
  mockUpstream.on('upgrade', (req, socket, head) => {
    mockUpgradeSockets.add(socket);
    socket.once('close', () => mockUpgradeSockets.delete(socket));
    recordedUpgrades.push({
      url: req.url,
      host: req.headers.host,
      origin: req.headers.origin,
      sidecarToken: req.headers['x-sidecar-token'] ?? null,
    });
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
    );
    if (head && head.length > 0) {
      socket.write(`echo:${head.toString('utf8')}`);
    }
    socket.on('data', (data) => {
      socket.write(`echo:${data.toString('utf8')}`);
    });
    socket.on('end', () => socket.end());
  });

  const sidecar = createSidecarServer({ env });

  try {
    const upstreamPort = await listenServer(mockUpstream);
    const sidecarPort = await listenServer(sidecar);

    const missingNonceRes = await httpRequest({
      port: sidecarPort,
      reqPath: '/_ryugi_sidecar/enter?to=%2F',
    });
    assert.equal(missingNonceRes.statusCode, 403, 'enter endpoint without nonce must return 403');

    const invalidNonceRes = await httpRequest({
      port: sidecarPort,
      reqPath: '/_ryugi_sidecar/enter?nonce=wrong-nonce&to=%2F',
    });
    assert.equal(invalidNonceRes.statusCode, 403, 'enter endpoint with invalid nonce must return 403');

    const gatewayShellRes = await httpRequest({
      port: sidecarPort,
      reqPath: `/?token=super-secret&conversationId=${CONV_ID}`,
      headers: { 'X-Sidecar-Token': 'agy-sidecar-secret' },
    });
    assert.equal(gatewayShellRes.statusCode, 200, 'gateway root request with x-sidecar-token must return shell HTML');
    assert.ok(
      !gatewayShellRes.body.includes('super-secret'),
      'gateway shell HTML must never leak Antigravity token query param',
    );
    assert.ok(
      !gatewayShellRes.body.includes('agy-sidecar-secret'),
      'gateway shell HTML must never leak x-sidecar-token header',
    );
    const iframeMatch = gatewayShellRes.body.match(/<iframe\s+src="([^"]+)"/);
    assert.ok(iframeMatch, 'gateway shell HTML must render an iframe element');
    const iframeUrl = new URL(iframeMatch[1].replaceAll('&amp;', '&'));
    assert.equal(
      iframeUrl.origin,
      `http://127.0.0.1:${sidecarPort}`,
      'gateway shell iframe must target loopback sidecar origin',
    );
    assert.equal(iframeUrl.pathname, '/_ryugi_sidecar/enter', 'gateway shell iframe must point to enter handoff');
    assert.equal(
      iframeUrl.searchParams.get('to'),
      `/document/${VALID_ARTIFACT_ID}`,
      'gateway shell iframe must carry resolved artifact landing path',
    );
    assert.equal(
      iframeUrl.searchParams.get('conv'),
      CONV_ID,
      'gateway shell iframe must carry conversationId for offline polling',
    );
    const validNonce = iframeUrl.searchParams.get('nonce');
    assert.ok(validNonce && validNonce.length >= 32, 'gateway shell iframe must carry a strong per-process nonce');
    assert.ok(
      gatewayShellRes.body.includes("data.type !== 'theme-change'") &&
        gatewayShellRes.body.includes('cssVariables') &&
        gatewayShellRes.body.includes('var(--background, transparent)'),
      'gateway shell HTML must handle Antigravity theme-change CSS variables without flashing',
    );
    assert.ok(
      gatewayShellRes.body.includes('/_ryugi_sidecar/watch?conversationId='),
      'gateway shell HTML must hook up the zero-polling subscription watch stream',
    );

    const offlineEnterRes = await httpRequest({
      port: sidecarPort,
      reqPath: `${iframeUrl.pathname}${iframeUrl.search}`,
    });
    assert.equal(offlineEnterRes.statusCode, 200, 'enter endpoint while offline must serve waiting HTML page');
    assert.equal(
      offlineEnterRes.headers['content-security-policy'],
      EXPECTED_FRAME_ANCESTORS,
      'offline waiting page must allow embedding from plugin and loopback ancestors',
    );
    assert.ok(
      offlineEnterRes.body.includes('/_ryugi_sidecar/status'),
      'offline waiting page from enter must poll /_ryugi_sidecar/status',
    );
    assert.ok(
      offlineEnterRes.body.includes(CONV_ID),
      'offline waiting page from enter must preserve conversationId for status polling',
    );

    const offlineHtmlRes = await httpRequest({ port: sidecarPort, reqPath: '/' });
    assert.equal(offlineHtmlRes.statusCode, 200, 'offline root GET must serve waiting HTML page');
    assert.match(
      offlineHtmlRes.headers['content-type'],
      /^text\/html/,
      'offline waiting page must be text/html',
    );
    assert.ok(
      offlineHtmlRes.body.includes('/_ryugi_sidecar/status'),
      'offline waiting page must poll /_ryugi_sidecar/status',
    );

    const offlineApiRes = await httpRequest({
      port: sidecarPort,
      reqPath: '/api/artifacts',
      headers: { Accept: 'application/json' },
    });
    assert.equal(offlineApiRes.statusCode, 503, 'offline API request must return 503 JSON');

    const offlineStatusRes = await httpRequest({
      port: sidecarPort,
      reqPath: `/_ryugi_sidecar/status?conversationId=${CONV_ID}`,
    });
    assert.deepEqual(
      JSON.parse(offlineStatusRes.body),
      { ready: false, targetPath: null, reason: 'no-server-info' },
      'status endpoint must report offline before server-info exists',
    );

    const offlineUpgrade = await rawTcpRequest(
      sidecarPort,
      `GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${sidecarPort}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n`,
      { expectClose: true },
    );
    assert.match(
      offlineUpgrade.text,
      /^HTTP\/1\.1 503 Service Unavailable\r\n/,
      'WebSocket upgrade while offline must return 503',
    );

    const deadPid = getDeadPid();
    fs.writeFileSync(
      path.join(serverDir, 'server-info'),
      JSON.stringify({ host: '127.0.0.1', urlHost: 'localhost', port: upstreamPort, pid: deadPid }),
    );
    const staleStatusRes = await httpRequest({ port: sidecarPort, reqPath: '/_ryugi_sidecar/status' });
    assert.deepEqual(
      JSON.parse(staleStatusRes.body),
      { ready: false, targetPath: null, reason: 'stale-pid' },
      'status endpoint must report stale-pid when server-info PID is dead',
    );

    fs.writeFileSync(
      path.join(serverDir, 'server-info'),
      JSON.stringify({
        host: '127.0.0.1',
        urlHost: 'localhost',
        port: upstreamPort,
        pid: process.pid,
      }),
    );

    const readyStatusRes = await httpRequest({
      port: sidecarPort,
      reqPath: `/_ryugi_sidecar/status?conversationId=${CONV_ID}`,
    });
    assert.deepEqual(
      JSON.parse(readyStatusRes.body),
      { ready: true, targetPath: `/document/${VALID_ARTIFACT_ID}` },
      'status endpoint must transition to ready with resolved targetPath once server-info is live',
    );

    const readyEnterRes = await httpRequest({
      port: sidecarPort,
      reqPath: `${iframeUrl.pathname}${iframeUrl.search}`,
    });
    assert.equal(readyEnterRes.statusCode, 200, 'enter endpoint with valid nonce while ready must return 200');
    assert.equal(
      readyEnterRes.headers['content-security-policy'],
      EXPECTED_FRAME_ANCESTORS,
      'enter handoff page must set narrow frame-ancestors CSP',
    );
    assert.ok(
      readyEnterRes.body.includes(`window.location.replace("/document/${VALID_ARTIFACT_ID}")`),
      'enter handoff page must navigate via same-origin window.location.replace to target path',
    );

    for (const unsafeTo of ['//evil.example', '/\\evil.example', 'https://evil.example']) {
      const clampedRes = await httpRequest({
        port: sidecarPort,
        reqPath: `/_ryugi_sidecar/enter?nonce=${encodeURIComponent(validNonce)}&to=${encodeURIComponent(unsafeTo)}`,
      });
      assert.equal(clampedRes.statusCode, 200);
      assert.ok(
        clampedRes.body.includes('data-ryugi-empty-pane') && !clampedRes.body.includes('evil.example'),
        `unsafe enter target ${unsafeTo} must fall back to the empty pane`,
      );
    }

    const landingRes = await httpRequest({
      port: sidecarPort,
      reqPath: `/?token=super-secret&conversationId=${CONV_ID}`,
    });
    assert.equal(landingRes.statusCode, 302, 'direct loopback load with subscribed conversationId must 302');
    assert.equal(
      landingRes.headers.location,
      `/document/${VALID_ARTIFACT_ID}`,
      'landing redirect must point to clean artifact path without token or conversationId',
    );
    assert.equal(
      recordedRequests.length,
      0,
      'landing redirect must not leak token or hit upstream',
    );

    const unsubscribedRes = await httpRequest({
      port: sidecarPort,
      reqPath: `/?token=super-secret&conversationId=${OTHER_CONV_ID}`,
    });
    assert.equal(unsubscribedRes.statusCode, 200, 'unsubscribed conversationId must get the empty pane');
    assert.ok(
      unsubscribedRes.body.includes('data-ryugi-empty-pane'),
      'a conversation without an artifact must get the empty pane, not the hub home page',
    );
    assert.ok(
      !unsubscribedRes.body.includes('super-secret'),
      'the empty pane must never echo the Antigravity token',
    );

    const homeRes = await httpRequest({
      port: sidecarPort,
      reqPath: '/',
      headers: {
        Origin: `http://127.0.0.1:${sidecarPort}`,
        Referer: `http://127.0.0.1:${sidecarPort}/document/${VALID_ARTIFACT_ID}`,
      },
    });
    assert.equal(homeRes.statusCode, 200, 'plain GET / must proxy directly with no redirect loop');
    assert.equal(
      homeRes.headers['content-security-policy'],
      `default-src 'self'; ${EXPECTED_FRAME_ANCESTORS}; script-src 'self' 'unsafe-inline'`,
      'proxied response CSP must replace frame-ancestors while keeping other directives',
    );
    assert.notEqual(
      homeRes.headers['keep-alive'],
      'timeout=99, max=123',
      'proxied response must strip upstream keep-alive hop-by-hop header',
    );
    assert.equal(
      homeRes.headers['proxy-connection'],
      undefined,
      'proxied response must strip proxy-connection hop-by-hop header',
    );
    const lastHomeReq = recordedRequests.at(-1);
    assert.equal(lastHomeReq.headers.host, `localhost:${upstreamPort}`, 'Host must be rewritten to upstream urlHost:port');
    assert.equal(lastHomeReq.headers.origin, `http://localhost:${upstreamPort}`, 'loopback Origin must be rewritten to upstream origin');
    assert.equal(
      lastHomeReq.headers.referer,
      `http://localhost:${upstreamPort}/document/${VALID_ARTIFACT_ID}`,
      'loopback Referer must be rewritten to upstream origin while preserving path',
    );

    const postRes = await httpRequest({
      port: sidecarPort,
      method: 'POST',
      reqPath: '/api/echo',
      headers: {
        Connection: 'close',
        'Content-Type': 'text/plain',
        Origin: `http://127.0.0.1:${sidecarPort}`,
        'X-Sidecar-Token': 'agy-sidecar-secret',
      },
      body: 'hello-ryugi',
    });
    assert.equal(postRes.statusCode, 201, 'POST must stream through to upstream');
    assert.equal(postRes.headers['keep-alive'], undefined, 'proxied POST response must strip upstream keep-alive header');
    assert.equal(
      postRes.headers['proxy-connection'],
      undefined,
      'proxied POST response must strip proxy-connection header',
    );
    assert.deepEqual(
      JSON.parse(postRes.body),
      {
        echoed: 'hello-ryugi',
        host: `localhost:${upstreamPort}`,
        origin: `http://localhost:${upstreamPort}`,
        sidecarToken: null,
      },
      'POST body and rewritten headers must arrive intact at upstream with x-sidecar-token stripped',
    );

    const localRedirectRes = await httpRequest({ port: sidecarPort, reqPath: '/redirect-local' });
    assert.equal(localRedirectRes.statusCode, 302);
    assert.equal(
      localRedirectRes.headers.location,
      `/document/${VALID_ARTIFACT_ID}?from=local`,
      'upstream absolute loopback Location must rewrite to relative path',
    );

    const extRedirectRes = await httpRequest({ port: sidecarPort, reqPath: '/redirect-external' });
    assert.equal(extRedirectRes.statusCode, 302);
    assert.equal(
      extRedirectRes.headers.location,
      'https://ryugi.innei.dev/docs',
      'upstream external Location must remain untouched',
    );

    const reqCountBeforeBlocked = recordedRequests.length;
    const forbiddenHttpRes = await httpRequest({
      port: sidecarPort,
      reqPath: '/',
      headers: { Origin: 'https://evil.example' },
    });
    assert.equal(forbiddenHttpRes.statusCode, 403, 'external Origin on HTTP must return 403');
    assert.equal(
      recordedRequests.length,
      reqCountBeforeBlocked,
      'blocked HTTP request must never reach upstream',
    );

    const forbiddenWs = await rawTcpRequest(
      sidecarPort,
      `GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${sidecarPort}\r\nOrigin: https://evil.example\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n`,
      { expectClose: true },
    );
    assert.match(
      forbiddenWs.text,
      /^HTTP\/1\.1 403 Forbidden\r\n/,
      'external Origin on WebSocket upgrade must return 403',
    );
    assert.equal(recordedUpgrades.length, 0, 'blocked WebSocket upgrade must never reach upstream');

    const upgradeHandshake = await rawTcpRequest(
      sidecarPort,
      `GET /ws?room=doc HTTP/1.1\r\nHost: 127.0.0.1:${sidecarPort}\r\nOrigin: http://127.0.0.1:${sidecarPort}\r\nX-Sidecar-Token: agy-sidecar-secret\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\ninit`,
      { readUntil: (text) => text.includes('echo:init') },
    );
    assert.match(
      upgradeHandshake.text,
      /^HTTP\/1\.1 101 Switching Protocols\r\n/,
      'loopback WebSocket upgrade must tunnel 101 Switching Protocols',
    );
    assert.deepEqual(
      recordedUpgrades,
      [
        {
          url: '/ws?room=doc',
          host: `localhost:${upstreamPort}`,
          origin: `http://localhost:${upstreamPort}`,
          sidecarToken: null,
        },
      ],
      'WebSocket upgrade must rewrite Host and loopback Origin and strip x-sidecar-token',
    );

    const echoResult = await new Promise((resolve, reject) => {
      const sock = upgradeHandshake.socket;
      const onData = (chunk) => {
        const text = chunk.toString('utf8');
        if (text.includes('echo:ping-frame')) {
          sock.off('data', onData);
          sock.end();
          resolve(text);
        }
      };
      sock.on('data', onData);
      sock.once('error', reject);
      sock.write('ping-frame');
    });
    assert.ok(echoResult.includes('echo:ping-frame'), 'WebSocket tunnel must echo bidirectional payloads');
  } finally {
    for (const sock of mockUpgradeSockets) sock.destroy();
    await closeServer(sidecar);
    await closeServer(mockUpstream);
    fs.rmSync(serverDir, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

async function testKeepAliveAndUpstreamCache() {
  const serverDir = makeTempDir('ryugi-sidecar-cache-');
  const env = { RYUGI_SERVER_HOME: serverDir };
  const infoFile = path.join(serverDir, 'server-info');
  const remotePorts = [];

  const mockUpstream = http.createServer((req, res) => {
    remotePorts.push(req.socket.remotePort);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });

  const sidecar = createSidecarServer({ env, upstreamCacheTtlMs: 2000 });

  try {
    const upstreamPort = await listenServer(mockUpstream);
    const sidecarPort = await listenServer(sidecar);

    fs.writeFileSync(
      infoFile,
      JSON.stringify({
        host: '127.0.0.1',
        urlHost: 'localhost',
        port: upstreamPort,
        pid: process.pid,
      }),
    );

    const first = await httpRequest({ port: sidecarPort, reqPath: '/one' });
    assert.equal(first.statusCode, 200);
    const second = await httpRequest({ port: sidecarPort, reqPath: '/two' });
    assert.equal(second.statusCode, 200);
    assert.equal(remotePorts.length, 2);
    assert.equal(
      remotePorts[0],
      remotePorts[1],
      'proxied HTTP requests must reuse the pooled keep-alive TCP connection to upstream',
    );

    fs.rmSync(infoFile, { force: true });
    const cachedHit = await httpRequest({ port: sidecarPort, reqPath: '/cached' });
    assert.equal(
      cachedHit.statusCode,
      200,
      'resolveUpstream cache must serve requests within TTL when server-info is momentarily absent',
    );

    await closeServer(mockUpstream);
    const failedHit = await httpRequest({
      port: sidecarPort,
      reqPath: '/api/after-close',
      headers: { Accept: 'application/json' },
    });
    assert.equal(
      failedHit.statusCode,
      502,
      'connection refused against stale cached upstream must return 502 and invalidate cache',
    );

    const postInvalidate = await httpRequest({
      port: sidecarPort,
      reqPath: '/api/after-invalidate',
      headers: { Accept: 'application/json' },
    });
    assert.equal(
      postInvalidate.statusCode,
      503,
      'upstream error must invalidate cache immediately so the next request sees offline state without waiting for TTL',
    );
    assert.deepEqual(JSON.parse(postInvalidate.body), {
      error: 'Ryugi server offline',
      reason: 'no-server-info',
    });
  } finally {
    await closeServer(sidecar);
    await closeServer(mockUpstream);
    fs.rmSync(serverDir, { recursive: true, force: true });
  }
}

function openWatchStream(port, conversationId) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method: 'GET',
        path: `/_ryugi_sidecar/watch?conversationId=${encodeURIComponent(conversationId)}`,
      },
      (res) => {
        const queue = [];
        const waiters = [];
        let buffer = '';
        let closed = false;

        const pushLine = (line) => {
          const parsed = JSON.parse(line);
          if (waiters.length > 0) {
            const waiter = waiters.shift();
            clearTimeout(waiter.timer);
            waiter.resolve(parsed);
          } else {
            queue.push(parsed);
          }
        };

        res.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const raw of lines) {
            const trimmed = raw.trim();
            if (trimmed) pushLine(trimmed);
          }
        });

        const markClosed = () => {
          closed = true;
          while (waiters.length > 0) {
            const waiter = waiters.shift();
            clearTimeout(waiter.timer);
            waiter.resolve(null);
          }
        };
        res.on('end', markClosed);
        res.on('close', markClosed);

        const nextEvent = (timeoutMs = 3000) => {
          if (queue.length > 0) return Promise.resolve(queue.shift());
          if (closed) return Promise.resolve(null);
          return new Promise((resNext, rejNext) => {
            const waiter = {
              resolve: resNext,
              timer: setTimeout(() => {
                const idx = waiters.indexOf(waiter);
                if (idx >= 0) waiters.splice(idx, 1);
                rejNext(new Error(`timed out waiting for watch event after ${timeoutMs}ms`));
              }, timeoutMs),
            };
            waiters.push(waiter);
          });
        };

        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          nextEvent,
          hasQueuedEvents: () => queue.length > 0,
          close: () => req.destroy(),
          waitClosed: () =>
            closed
              ? Promise.resolve()
              : new Promise((resClose) => {
                  res.once('close', resClose);
                  res.once('end', resClose);
                }),
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function testSubscriptionWatcherStream() {
  const serverDir = makeTempDir('ryugi-sidecar-watch-');
  const projectDir = makeTempDir('ryugi-sidecar-watch-proj-');
  const env = { RYUGI_SERVER_HOME: serverDir };
  const subsFile = path.join(serverDir, 'agent-subscriptions.json');

  const docDir = path.join(projectDir, '.ryugi', 'artifacts', 'document', 'initial-doc');
  const boardDir = path.join(projectDir, '.ryugi', 'artifacts', 'artboard', 'new-board');
  const boardId = 'BoardId1234567890';
  fs.mkdirSync(docDir, { recursive: true });
  fs.mkdirSync(boardDir, { recursive: true });
  fs.writeFileSync(path.join(docDir, '.artifact-id'), `${VALID_ARTIFACT_ID}\n`);
  fs.writeFileSync(path.join(boardDir, '.artifact-id'), `${boardId}\n`);
  fs.writeFileSync(
    subsFile,
    JSON.stringify({
      [`antigravity:${CONV_ID}`]: {
        items: [{ project: projectDir, artifact: 'document/initial-doc' }],
      },
    }),
  );

  const sidecar = createSidecarServer({ env });

  try {
    const sidecarPort = await listenServer(sidecar);

    const invalidWatch = await httpRequest({
      port: sidecarPort,
      reqPath: '/_ryugi_sidecar/watch?conversationId=not-a-uuid',
    });
    assert.equal(invalidWatch.statusCode, 400, 'watch endpoint must reject non-UUID conversationId with 400');

    const missingWatch = await httpRequest({
      port: sidecarPort,
      reqPath: '/_ryugi_sidecar/watch',
    });
    assert.equal(missingWatch.statusCode, 400, 'watch endpoint must reject missing conversationId with 400');

    const stream = await openWatchStream(sidecarPort, CONV_ID);
    assert.equal(stream.statusCode, 200);
    assert.match(
      stream.headers['content-type'],
      /^application\/x-ndjson/,
      'watch endpoint must stream newline-delimited JSON',
    );

    const initial = await stream.nextEvent();
    assert.deepEqual(
      initial,
      { type: 'ready', targetPath: `/document/${VALID_ARTIFACT_ID}` },
      'watch stream must immediately emit initial ready event with current targetPath',
    );

    const updatedSubs = JSON.stringify({
      [`antigravity:${CONV_ID}`]: {
        items: [
          { project: projectDir, artifact: 'document/initial-doc' },
          { project: projectDir, artifact: 'artboard/new-board' },
        ],
      },
    });
    fs.writeFileSync(subsFile, updatedSubs);

    const navEvent = await stream.nextEvent();
    assert.deepEqual(
      navEvent,
      { type: 'navigate', targetPath: `/artboard/${boardId}` },
      'watch stream must emit navigate event when a new artifact is subscribed',
    );

    fs.writeFileSync(subsFile, updatedSubs);
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(
      stream.hasQueuedEvents(),
      false,
      'rewriting the same subscription must not emit a duplicate navigate event',
    );

    const closedPromise = stream.waitClosed();
    await closeServer(sidecar);
    await closedPromise;
  } finally {
    await closeServer(sidecar);
    fs.rmSync(serverDir, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

async function testEmptyPaneNeverLoadsHubHome() {
  const serverDir = makeTempDir('ryugi-sidecar-empty-');
  const env = { RYUGI_SERVER_HOME: serverDir };
  const recorded = [];
  const upstream = http.createServer((req, res) => {
    recorded.push(req.url);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`upstream-ok:${req.url}`);
  });
  const sidecar = createSidecarServer({ env, upstreamCacheTtlMs: 0 });
  try {
    const upstreamPort = await listenServer(upstream);
    const sidecarPort = await listenServer(sidecar);
    fs.writeFileSync(
      path.join(serverDir, 'server-info'),
      JSON.stringify({ host: '127.0.0.1', port: upstreamPort, pid: process.pid }),
    );

    for (const query of [`?conversationId=${OTHER_CONV_ID}`, '']) {
      const shell = await httpRequest({
        port: sidecarPort,
        reqPath: `/${query}`,
        headers: { 'X-Sidecar-Token': 'agy-sidecar-secret' },
      });
      assert.equal(shell.statusCode, 200, 'the pane shell must load');
      const src = new URL(shell.body.match(/<iframe\s+src="([^"]+)"/)[1].replaceAll('&amp;', '&'));
      assert.equal(src.searchParams.get('to'), null, 'a pane without an artifact must not target the hub home');
      const framed = await httpRequest({ port: sidecarPort, reqPath: `${src.pathname}${src.search}` });
      assert.equal(framed.statusCode, 200, 'the empty pane must load in the frame');
      assert.ok(framed.body.includes('data-ryugi-empty-pane'), 'the frame must show the empty pane');
      assert.equal(
        framed.headers['content-security-policy'],
        EXPECTED_FRAME_ANCESTORS,
        'the empty pane must allow embedding from the pane shell',
      );
      assert.ok(
        !framed.body.includes('setInterval') && !framed.body.includes('location.reload'),
        'the empty pane must not poll or reload',
      );
    }

    const offline = await httpRequest({ port: sidecarPort, reqPath: '/_ryugi_sidecar/offline-probe' });
    assert.ok(offline.statusCode > 0);
    assert.deepEqual(
      recorded.filter((url) => url === '/' || url.startsWith('/?') || url.startsWith('/api/hub')),
      [],
      'an empty pane must never ask the hub for its home page or artifact list',
    );
  } finally {
    await closeServer(sidecar);
    await closeServer(upstream);
    fs.rmSync(serverDir, { recursive: true, force: true });
  }
}

function testOfflinePageNeverFallsBackToHubHome() {
  const { offlineHtml } = require('../../sidecars/artifacts/server.cjs');
  const page = offlineHtml(CONV_ID);
  assert.ok(
    !page.includes("window.location.replace('/')"),
    'once the hub is up, a waiting pane without an artifact must go to the empty pane, not the hub home',
  );
  assert.ok(page.includes('/_ryugi_sidecar/empty'), 'the waiting pane must know the empty pane');
}

async function main() {
  testResolveUpstream();
  testIsAllowedOrigin();
  testRewriteCsp();
  testRewriteLocation();
  testResolveLandingPath();
  await testLiveHttpAndWebSocketProxy();
  await testKeepAliveAndUpstreamCache();
  await testSubscriptionWatcherStream();
  await testEmptyPaneNeverLoadsHubHome();
  testOfflinePageNeverFallsBackToHubHome();
  console.info('PASS: Antigravity sidecar proxy unit and integration tests');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
