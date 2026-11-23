'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const UUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const ARTIFACT = /^(?:document|artboard|whiteboard|slides|storyboard)\/[a-z0-9][a-z0-9-]*$/;
const ARTIFACT_ID = /^[\w-]{8,64}$/;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const FRAME_ANCESTORS = 'frame-ancestors plugin: http://127.0.0.1:* http://localhost:*';
const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'upgrade',
];

function stripBrackets(host) {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function formatHostForUrl(host) {
  return host.includes(':') ? `[${host}]` : host;
}

function serverHome(env = process.env) {
  return env.RYUGI_SERVER_HOME || path.join(os.homedir(), '.ryugi', 'server');
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function isValidPort(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function resolveUpstream(env = process.env) {
  const infoPath = path.join(serverHome(env), 'server-info');
  let raw;
  try {
    raw = fs.readFileSync(infoPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { kind: 'offline', reason: 'no-server-info' };
    return { kind: 'offline', reason: 'invalid-info' };
  }

  let info;
  try {
    info = JSON.parse(raw);
  } catch {
    return { kind: 'offline', reason: 'invalid-info' };
  }

  if (!info || typeof info !== 'object') {
    return { kind: 'offline', reason: 'invalid-info' };
  }

  const rawHost = typeof info.host === 'string' ? stripBrackets(info.host.trim().toLowerCase()) : '';
  if (!rawHost) {
    return { kind: 'offline', reason: 'invalid-info' };
  }
  if (!LOOPBACK_HOSTS.has(rawHost)) {
    return { kind: 'offline', reason: 'non-loopback' };
  }

  if (!isValidPort(info.port) || !Number.isInteger(info.pid) || info.pid <= 0) {
    return { kind: 'offline', reason: 'invalid-info' };
  }

  if (!isPidAlive(info.pid)) {
    return { kind: 'offline', reason: 'stale-pid' };
  }

  // Normalize localhost to IPv4 loopback so Node never races IPv6 ::1 against an IPv4-bound server.
  const host = rawHost === 'localhost' ? '127.0.0.1' : rawHost;
  const rawUrlHost =
    typeof info.urlHost === 'string' ? stripBrackets(info.urlHost.trim().toLowerCase()) : '';
  const urlHost = LOOPBACK_HOSTS.has(rawUrlHost) ? rawUrlHost : rawHost;
  const boardPort = isValidPort(info.boardPort) ? info.boardPort : null;

  return {
    kind: 'ready',
    host,
    port: info.port,
    boardPort,
    urlHost,
    pid: info.pid,
  };
}

function readSafeArtifactId(project, artifact) {
  if (typeof project !== 'string' || !path.isAbsolute(project)) return null;
  try {
    const artifactsRoot = fs.realpathSync(path.join(project, '.ryugi', 'artifacts'));
    const idFile = path.join(artifactsRoot, ...artifact.split('/'), '.artifact-id');
    const realIdFile = fs.realpathSync(idFile);
    if (!realIdFile.startsWith(`${artifactsRoot}${path.sep}`)) return null;
    const id = fs.readFileSync(realIdFile, 'utf8').trim();
    return ARTIFACT_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

function resolveLandingPath(conversationId, env = process.env) {
  if (typeof conversationId !== 'string' || !UUID.test(conversationId)) return null;
  const subs = readJson(path.join(serverHome(env), 'agent-subscriptions.json'));
  const entry = subs && typeof subs === 'object' ? subs[`antigravity:${conversationId}`] : null;
  if (!entry || !Array.isArray(entry.items) || entry.items.length === 0) return null;

  for (let i = entry.items.length - 1; i >= 0; i -= 1) {
    const item = entry.items[i];
    if (!item || typeof item !== 'object') continue;
    if (typeof item.artifact !== 'string' || !ARTIFACT.test(item.artifact)) continue;

    const id = readSafeArtifactId(item.project, item.artifact);
    if (id) {
      const [type] = item.artifact.split('/');
      return `/${type}/${id}`;
    }
    return `/${item.artifact}`;
  }

  return null;
}

function parseLoopbackHttpUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:') return null;
    if (parsed.username || parsed.password) return null;
    const hostname = stripBrackets(parsed.hostname.toLowerCase());
    if (!LOOPBACK_HOSTS.has(hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isAllowedOrigin(origin) {
  if (origin === undefined || origin === null || origin === '') return true;
  if (typeof origin !== 'string') return false;
  if (origin === 'null') return true;
  if (origin !== origin.trim() || origin.endsWith('/')) return false;
  const parsed = parseLoopbackHttpUrl(origin);
  if (!parsed) return false;
  return parsed.pathname === '/' && !parsed.search && !parsed.hash;
}

function isSafeRelativePath(value) {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isValidNonce(candidate, expected) {
  if (typeof candidate !== 'string') return false;
  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function rewriteSingleCsp(value) {
  if (typeof value !== 'string') return '';
  let seenFrameAncestors = false;
  const directives = [];
  for (const rawPart of value.split(';')) {
    const part = rawPart.trim();
    if (!part) continue;
    const [directive] = part.split(/\s+/, 1);
    if (directive.toLowerCase() === 'frame-ancestors') {
      if (!seenFrameAncestors) {
        directives.push(FRAME_ANCESTORS);
        seenFrameAncestors = true;
      }
      continue;
    }
    directives.push(part);
  }
  return directives.join('; ');
}

function rewriteCsp(headerValue) {
  if (Array.isArray(headerValue)) {
    return headerValue.map((value) => rewriteSingleCsp(value)).filter(Boolean);
  }
  return rewriteSingleCsp(headerValue);
}

function rewriteLocation(locationValue, upstream) {
  if (typeof locationValue !== 'string' || !locationValue) return locationValue;
  if (!/^https?:\/\//i.test(locationValue)) {
    return locationValue;
  }
  let parsed;
  try {
    parsed = new URL(locationValue);
  } catch {
    return locationValue;
  }
  if (parsed.protocol !== 'http:') return locationValue;

  const effectivePort = parsed.port ? Number(parsed.port) : 80;
  if (effectivePort !== upstream.port) return locationValue;

  const allowedHosts = new Set(
    [upstream.host, upstream.urlHost, 'localhost', '127.0.0.1']
      .filter((h) => typeof h === 'string' && h.length > 0)
      .map((h) => stripBrackets(h.toLowerCase())),
  );
  const hostname = stripBrackets(parsed.hostname.toLowerCase());
  if (!allowedHosts.has(hostname)) return locationValue;

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function rewriteLoopbackOrigin(origin, upstreamOrigin) {
  if (typeof origin !== 'string' || origin === 'null') return origin;
  return parseLoopbackHttpUrl(origin) ? upstreamOrigin : origin;
}

function rewriteLoopbackReferer(referer, upstreamOrigin) {
  const parsed = parseLoopbackHttpUrl(referer);
  if (!parsed) return referer;
  return `${upstreamOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function resolveLanding(req, url, env) {
  if (req.method !== 'GET' || url.pathname !== '/') {
    return { kind: 'proxy', targetPath: `${url.pathname}${url.search}` };
  }

  const conversationId = url.searchParams.get('conversationId');
  const hasAgyParams = url.searchParams.has('token') || url.searchParams.has('conversationId');

  if (conversationId) {
    const landing = resolveLandingPath(conversationId, env);
    if (landing) {
      return { kind: 'redirect', location: landing };
    }
  }

  if (hasAgyParams) return { kind: 'empty' };

  return { kind: 'proxy', targetPath: `${url.pathname}${url.search}` };
}

function wantsOfflineHtml(req, url) {
  if (req.method !== 'GET') return false;
  const accept = String(req.headers.accept || '');
  if (accept.includes('text/html')) return true;
  if (accept.includes('application/json') || url.pathname.startsWith('/api/')) return false;
  return accept === '' || accept.includes('*/*');
}

function escapeHtmlAttr(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function safeInlineJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function shellHtml({ iframeSrc, listenPort, frameNonce, conversationId }) {
  const safeConv = safeInlineJson(conversationId || '');
  const safeEnterBase = safeInlineJson(
    `http://127.0.0.1:${listenPort}/_ryugi_sidecar/enter?nonce=${frameNonce}`,
  );
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ryugi</title>
  <style>
    :root { color-scheme: light dark; }
    html, body, iframe {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
      overflow: hidden;
    }
    html, body {
      background: var(--background, transparent);
    }
  </style>
</head>
<body>
  <iframe src="${escapeHtmlAttr(iframeSrc)}" allow="clipboard-read; clipboard-write"></iframe>
  <script>
    (function () {
      window.addEventListener('message', function (event) {
        var data = event && event.data;
        if (!data || data.type !== 'theme-change' || !data.payload) return;
        var vars = data.payload.cssVariables;
        if (!vars || typeof vars !== 'object') return;
        var root = document.documentElement.style;
        var keys = Object.keys(vars);
        for (var i = 0; i < keys.length; i += 1) {
          var key = keys[i];
          if (key.indexOf('--') === 0) {
            root.setProperty(key, String(vars[key]));
          }
        }
      });

      var convId = ${safeConv};
      if (!convId) return;

      var enterBase = ${safeEnterBase};
      var frame = document.querySelector('iframe');
      var backoffMs = 2000;

      function connectWatch() {
        fetch('/_ryugi_sidecar/watch?conversationId=' + encodeURIComponent(convId), {
          cache: 'no-store',
        })
          .then(function (res) {
            if (!res.ok || !res.body) throw new Error('watch-unavailable');
            backoffMs = 2000;
            var reader = res.body.getReader();
            var decoder = new TextDecoder();
            var buffer = '';

            function pump() {
              return reader.read().then(function (chunk) {
                if (chunk.done) throw new Error('watch-closed');
                buffer += decoder.decode(chunk.value, { stream: true });
                var lines = buffer.split('\\n');
                buffer = lines.pop() || '';
                for (var i = 0; i < lines.length; i += 1) {
                  var line = lines[i].trim();
                  if (!line) continue;
                  try {
                    var msg = JSON.parse(line);
                    if (
                      msg &&
                      msg.type === 'navigate' &&
                      typeof msg.targetPath === 'string' &&
                      msg.targetPath.indexOf('/') === 0 &&
                      msg.targetPath.indexOf('//') !== 0 &&
                      frame
                    ) {
                      frame.src =
                        enterBase +
                        '&to=' +
                        encodeURIComponent(msg.targetPath) +
                        '&conv=' +
                        encodeURIComponent(convId);
                    }
                  } catch (_) {}
                }
                return pump();
              });
            }

            return pump();
          })
          .catch(function () {
            var wait = backoffMs;
            backoffMs = Math.min(backoffMs * 2, 10000);
            setTimeout(connectWatch, wait);
          });
      }

      connectWatch();
    })();
  </script>
</body>
</html>
`;
}

function enterHtml(target) {
  const safeTarget = safeInlineJson(target);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Ryugi</title>
</head>
<body>
  <script>window.location.replace(${safeTarget});</script>
</body>
</html>
`;
}

const NOTICE_STYLE = `  <style>
    :root {
      color-scheme: light dark;
      --bg: #fafafa;
      --fg: #18181b;
      --muted: #71717a;
      --card: #ffffff;
      --border: #e4e4e7;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #09090b;
        --fg: #f4f4f5;
        --muted: #a1a1aa;
        --card: #18181b;
        --border: #27272a;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: var(--bg);
      color: var(--fg);
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    main {
      width: 100%;
      max-width: 380px;
      padding: 24px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--card);
    }
    h1 {
      margin: 0 0 8px;
      font-size: 16px;
      font-weight: 600;
    }
    p {
      margin: 0;
      color: var(--muted);
    }
  </style>
`;

function emptyHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ryugi</title>
${NOTICE_STYLE}</head>
<body data-ryugi-empty-pane>
  <main>
    <h1>No artifact in this conversation yet</h1>
    <p>When the agent opens an artifact in this conversation, it shows up here.</p>
  </main>
</body>
</html>
`;
}

function offlineHtml(initialConversationId = '') {
  const safeConv = JSON.stringify(UUID.test(initialConversationId) ? initialConversationId : '');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ryugi</title>
${NOTICE_STYLE}</head>
<body>
  <main>
    <h1>Waiting for Ryugi server</h1>
    <p>Start an artifact in your conversation or run <code>ryugi start</code>. This pane will connect automatically.</p>
  </main>
  <script>
    (function () {
      var params = new URLSearchParams(window.location.search);
      var conversationId = ${safeConv} || params.get('conversationId') || params.get('conv') || '';
      var statusUrl = '/_ryugi_sidecar/status' +
        (conversationId ? '?conversationId=' + encodeURIComponent(conversationId) : '');

      function poll() {
        fetch(statusUrl, { cache: 'no-store' })
          .then(function (res) { return res.ok ? res.json() : null; })
          .then(function (data) {
            if (!data || !data.ready) return;
            if (typeof data.targetPath === 'string' && data.targetPath.startsWith('/') && !data.targetPath.startsWith('//')) {
              window.location.replace(data.targetPath);
              return;
            }
            if (
              window.location.pathname === '/_ryugi_sidecar/enter' ||
              (window.location.pathname === '/' && (params.has('token') || params.has('conversationId')))
            ) {
              window.location.replace('/_ryugi_sidecar/empty');
              return;
            }
            window.location.reload();
          })
          .catch(function () {});
      }

      setInterval(poll, 2000);
    })();
  </script>
</body>
</html>
`;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    'content-type': 'application/json; charset=utf-8',
  });
  res.end(body);
}

function sendHtml(res, statusCode, body, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    'content-type': 'text/html; charset=utf-8',
    ...extraHeaders,
  });
  res.end(body);
}

function sendEmptyHtml(res) {
  sendHtml(res, 200, emptyHtml(), { 'content-security-policy': FRAME_ANCESTORS });
}

function sendOfflineHtml(res, conversationId = '') {
  sendHtml(res, 200, offlineHtml(conversationId), {
    'content-security-policy': FRAME_ANCESTORS,
  });
}

function rejectUpgrade(socket, statusLine) {
  if (!socket.destroyed) {
    socket.end(`HTTP/1.1 ${statusLine}\r\nConnection: close\r\n\r\n`);
    socket.setTimeout(1000, () => socket.destroy());
  }
}

function buildUpgradeRequest(req, upstreamHostHeader, upstreamOrigin) {
  const lines = [`${req.method || 'GET'} ${req.url || '/'} HTTP/${req.httpVersion || '1.1'}`];
  let hasHost = false;
  const rawHeaders = Array.isArray(req.rawHeaders) ? req.rawHeaders : [];

  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = rawHeaders[i];
    const value = rawHeaders[i + 1] ?? '';
    const lower = name.toLowerCase();

    if (lower === 'host') {
      if (!hasHost) {
        lines.push(`Host: ${upstreamHostHeader}`);
        hasHost = true;
      }
      continue;
    }
    if (lower === 'origin') {
      lines.push(`${name}: ${rewriteLoopbackOrigin(value, upstreamOrigin)}`);
      continue;
    }
    if (lower === 'referer') {
      lines.push(`${name}: ${rewriteLoopbackReferer(value, upstreamOrigin)}`);
      continue;
    }
    if (lower === 'x-sidecar-token') {
      continue;
    }
    lines.push(`${name}: ${value}`);
  }

  if (!hasHost) {
    lines.push(`Host: ${upstreamHostHeader}`);
  }

  return `${lines.join('\r\n')}\r\n\r\n`;
}

function createSidecarServer({ env = process.env, upstreamCacheTtlMs = 500 } = {}) {
  const frameNonce = crypto.randomBytes(24).toString('hex');
  const upstreamAgent = new http.Agent({
    keepAlive: true,
    maxSockets: 32,
    keepAliveMsecs: 15000,
  });

  let upstreamCache = { value: null, expiresAt: 0 };
  const invalidateUpstreamCache = () => {
    upstreamCache = { value: null, expiresAt: 0 };
  };
  const getUpstream = ({ fresh = false } = {}) => {
    const now = Date.now();
    if (!fresh && upstreamCacheTtlMs > 0 && upstreamCache.value && now < upstreamCache.expiresAt) {
      return upstreamCache.value;
    }
    const value = resolveUpstream(env);
    upstreamCache = {
      value,
      expiresAt: upstreamCacheTtlMs > 0 ? now + upstreamCacheTtlMs : 0,
    };
    return value;
  };

  const watchClients = new Set();
  let fsWatcher = null;
  let watchedDir = null;
  let watchDebounceTimer = null;

  const stopSubscriptionWatcher = () => {
    if (watchDebounceTimer) {
      clearTimeout(watchDebounceTimer);
      watchDebounceTimer = null;
    }
    if (fsWatcher) {
      try {
        fsWatcher.close();
      } catch {}
      fsWatcher = null;
      watchedDir = null;
    }
  };

  const notifyWatchClients = () => {
    for (const client of watchClients) {
      if (client.res.destroyed || client.res.writableEnded) continue;
      const nextTarget = resolveLandingPath(client.conversationId, env);
      if (nextTarget && nextTarget !== client.lastTarget) {
        client.lastTarget = nextTarget;
        client.res.write(`${JSON.stringify({ type: 'navigate', targetPath: nextTarget })}\n`);
      }
    }
  };

  const scheduleNotify = () => {
    if (watchDebounceTimer) clearTimeout(watchDebounceTimer);
    watchDebounceTimer = setTimeout(() => {
      watchDebounceTimer = null;
      notifyWatchClients();
    }, 80);
    watchDebounceTimer.unref?.();
  };

  const ensureSubscriptionWatcher = () => {
    if (watchClients.size === 0) return;
    const homeDir = serverHome(env);
    const homeExists = fs.existsSync(homeDir);
    const targetDir = homeExists ? homeDir : path.dirname(homeDir);
    if (fsWatcher && watchedDir === targetDir) return;
    stopSubscriptionWatcher();
    if (!fs.existsSync(targetDir)) return;

    try {
      watchedDir = targetDir;
      fsWatcher = fs.watch(targetDir, (_eventType, filename) => {
        if (!homeExists) {
          if (fs.existsSync(homeDir)) {
            ensureSubscriptionWatcher();
            scheduleNotify();
          }
          return;
        }
        if (
          filename &&
          filename !== 'agent-subscriptions.json' &&
          !filename.startsWith('agent-subscriptions.json')
        ) {
          return;
        }
        scheduleNotify();
      });
      fsWatcher.on('error', () => {
        stopSubscriptionWatcher();
      });
    } catch {
      stopSubscriptionWatcher();
    }
  };

  const closeWatchResources = () => {
    stopSubscriptionWatcher();
    for (const client of watchClients) {
      if (!client.res.destroyed && !client.res.writableEnded) {
        client.res.end();
      }
      client.res.socket?.destroy();
    }
    watchClients.clear();
  };

  const server = http.createServer((req, res) => {
    if (!isAllowedOrigin(req.headers.origin)) {
      sendJson(res, 403, { error: 'Forbidden origin' });
      return;
    }

    let url;
    try {
      url = new URL(req.url || '/', 'http://127.0.0.1');
    } catch {
      sendJson(res, 400, { error: 'Invalid request URL' });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/_ryugi_sidecar/status') {
      const upstream = getUpstream({ fresh: true });
      if (upstream.kind === 'ready') {
        const targetPath = resolveLandingPath(url.searchParams.get('conversationId'), env);
        sendJson(res, 200, { ready: true, targetPath });
      } else {
        sendJson(res, 200, { ready: false, targetPath: null, reason: upstream.reason });
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/_ryugi_sidecar/watch') {
      const conversationId = url.searchParams.get('conversationId');
      if (!conversationId || !UUID.test(conversationId)) {
        sendJson(res, 400, { error: 'Invalid conversationId' });
        return;
      }
      res.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': 'application/x-ndjson; charset=utf-8',
        'x-accel-buffering': 'no',
      });
      res.flushHeaders?.();
      const initialTarget = resolveLandingPath(conversationId, env);
      res.write(`${JSON.stringify({ type: 'ready', targetPath: initialTarget })}\n`);
      const client = { conversationId, res, lastTarget: initialTarget };
      watchClients.add(client);
      ensureSubscriptionWatcher();
      const cleanup = () => {
        if (!watchClients.delete(client)) return;
        if (watchClients.size === 0) stopSubscriptionWatcher();
      };
      req.on('close', cleanup);
      res.on('close', cleanup);
      res.on('error', cleanup);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/_ryugi_sidecar/empty') {
      sendEmptyHtml(res);
      return;
    }

    // Antigravity loads sidecar UIs on plugin:// which blocks ES module CORS and loopback WS;
    // hand off through a nonce-gated same-origin page on 127.0.0.1 so Ryugi sees Sec-Fetch-Site: same-origin.
    if (req.method === 'GET' && url.pathname === '/_ryugi_sidecar/enter') {
      if (!isValidNonce(url.searchParams.get('nonce'), frameNonce)) {
        sendJson(res, 403, { error: 'Forbidden' });
        return;
      }
      const rawConv = url.searchParams.get('conv');
      const convId = rawConv && UUID.test(rawConv) ? rawConv : '';
      const rawTo = url.searchParams.get('to');
      const target = isSafeRelativePath(rawTo) ? rawTo : null;
      if (getUpstream({ fresh: true }).kind === 'offline') {
        sendOfflineHtml(res, convId);
        return;
      }
      if (!target) {
        sendEmptyHtml(res);
        return;
      }
      sendHtml(res, 200, enterHtml(target), { 'content-security-policy': FRAME_ANCESTORS });
      return;
    }

    const addr = server.address();
    const listenPort = addr && typeof addr === 'object' ? addr.port : null;
    if (req.method === 'GET' && url.pathname === '/' && req.headers['x-sidecar-token'] && listenPort) {
      const rawConv = url.searchParams.get('conversationId');
      const convId = rawConv && UUID.test(rawConv) ? rawConv : '';
      const target = resolveLandingPath(convId, env);
      const iframeSrc = `http://127.0.0.1:${listenPort}/_ryugi_sidecar/enter?nonce=${frameNonce}${target ? `&to=${encodeURIComponent(target)}` : ''}&conv=${encodeURIComponent(convId)}`;
      sendHtml(
        res,
        200,
        shellHtml({ iframeSrc, listenPort, frameNonce, conversationId: convId }),
      );
      return;
    }

    const upstream = getUpstream();
    if (upstream.kind === 'offline') {
      if (wantsOfflineHtml(req, url)) {
        sendOfflineHtml(res, url.searchParams.get('conversationId') || '');
      } else {
        sendJson(res, 503, { error: 'Ryugi server offline', reason: upstream.reason });
      }
      return;
    }

    const resolution = resolveLanding(req, url, env);
    if (resolution.kind === 'empty') {
      sendEmptyHtml(res);
      return;
    }
    if (resolution.kind === 'redirect') {
      res.writeHead(302, {
        'cache-control': 'no-store',
        location: resolution.location,
      });
      res.end();
      return;
    }

    const upstreamHostHeader = `${formatHostForUrl(upstream.urlHost)}:${upstream.port}`;
    const upstreamOrigin = `http://${upstreamHostHeader}`;
    const proxyHeaders = { ...req.headers, host: upstreamHostHeader };
    delete proxyHeaders['x-sidecar-token'];
    delete proxyHeaders.connection;
    delete proxyHeaders['keep-alive'];
    delete proxyHeaders['proxy-connection'];

    if (proxyHeaders.origin !== undefined) {
      proxyHeaders.origin = rewriteLoopbackOrigin(proxyHeaders.origin, upstreamOrigin);
    }
    if (proxyHeaders.referer !== undefined) {
      proxyHeaders.referer = rewriteLoopbackReferer(proxyHeaders.referer, upstreamOrigin);
    }

    const upstreamReq = http.request(
      {
        agent: upstreamAgent,
        host: upstream.host,
        port: upstream.port,
        method: req.method,
        path: resolution.targetPath,
        headers: proxyHeaders,
      },
      (upstreamRes) => {
        const resHeaders = { ...upstreamRes.headers };
        for (const header of HOP_BY_HOP_HEADERS) {
          delete resHeaders[header];
        }
        if (resHeaders['content-security-policy'] !== undefined) {
          const rewritten = rewriteCsp(resHeaders['content-security-policy']);
          if (rewritten.length === 0) {
            delete resHeaders['content-security-policy'];
          } else {
            resHeaders['content-security-policy'] = rewritten;
          }
        }
        if (resHeaders.location !== undefined) {
          resHeaders.location = rewriteLocation(resHeaders.location, upstream);
        }
        res.writeHead(upstreamRes.statusCode || 502, resHeaders);
        upstreamRes.pipe(res);
      },
    );

    upstreamReq.on('error', (error) => {
      invalidateUpstreamCache();
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if ((error?.code === 'ECONNREFUSED' || error?.code === 'EHOSTUNREACH') && wantsOfflineHtml(req, url)) {
        sendOfflineHtml(res, url.searchParams.get('conversationId') || '');
        return;
      }
      sendJson(res, 502, { error: 'Bad Gateway', reason: error?.code || 'upstream-error' });
    });

    res.on('close', () => {
      if (!res.writableEnded) upstreamReq.destroy();
    });

    req.pipe(upstreamReq);
  });

  const upgradeSockets = new Set();
  const trackUpgradeSocket = (sock) => {
    upgradeSockets.add(sock);
    sock.once('close', () => upgradeSockets.delete(sock));
  };

  // Node's server.closeAllConnections skips sockets detached by HTTP upgrade.
  const closeAllHttpConnections = server.closeAllConnections?.bind(server);
  server.closeAllConnections = () => {
    closeWatchResources();
    upstreamAgent.destroy();
    closeAllHttpConnections?.();
    for (const sock of upgradeSockets) {
      sock.destroy();
    }
  };

  server.on('close', () => {
    closeWatchResources();
    upstreamAgent.destroy();
  });

  server.on('upgrade', (req, socket, head) => {
    if (!isAllowedOrigin(req.headers.origin)) {
      rejectUpgrade(socket, '403 Forbidden');
      return;
    }

    const upstream = getUpstream();
    if (upstream.kind === 'offline') {
      rejectUpgrade(socket, '503 Service Unavailable');
      return;
    }

    const upstreamHostHeader = `${formatHostForUrl(upstream.urlHost)}:${upstream.port}`;
    const upstreamOrigin = `http://${upstreamHostHeader}`;
    const upstreamSocket = net.connect(upstream.port, upstream.host);
    trackUpgradeSocket(socket);
    trackUpgradeSocket(upstreamSocket);
    let connected = false;

    upstreamSocket.on('connect', () => {
      if (socket.destroyed) {
        upstreamSocket.destroy();
        return;
      }
      connected = true;
      const requestHead = Buffer.from(buildUpgradeRequest(req, upstreamHostHeader, upstreamOrigin));
      upstreamSocket.write(
        head && head.length > 0 ? Buffer.concat([requestHead, head]) : requestHead,
      );
      upstreamSocket.pipe(socket);
      socket.pipe(upstreamSocket);
    });

    upstreamSocket.on('error', () => {
      invalidateUpstreamCache();
      if (connected) {
        socket.destroy();
      } else {
        rejectUpgrade(socket, '502 Bad Gateway');
      }
    });

    upstreamSocket.on('close', () => {
      if (!socket.destroyed) socket.end();
    });

    socket.on('error', () => {
      upstreamSocket.destroy();
    });

    socket.on('close', () => {
      if (!upstreamSocket.destroyed) {
        if (connected) {
          upstreamSocket.end();
        } else {
          upstreamSocket.destroy();
        }
      }
    });
  });

  return server;
}

if (require.main === module) {
  const port = Number(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT);
  if (!isValidPort(port)) {
    process.stderr.write(
      `ryugi sidecar: invalid ANTIGRAVITY_SIDECAR_WEB_PORT (${process.env.ANTIGRAVITY_SIDECAR_WEB_PORT ?? 'unset'})\n`,
    );
    process.exit(1);
  }

  const server = createSidecarServer({ env: process.env });
  server.listen(port, '127.0.0.1', () => {
    const addr = server.address();
    console.log(`[sidecar] listening on 127.0.0.1:${addr && typeof addr === 'object' ? addr.port : port}`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    server.closeAllConnections?.();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = {
  createSidecarServer,
  offlineHtml,
  isAllowedOrigin,
  resolveLandingPath,
  resolveUpstream,
  rewriteCsp,
  rewriteLocation,
};
