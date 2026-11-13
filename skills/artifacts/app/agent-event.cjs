'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PATH_FIELDS = ['file_path', 'path', 'notebook_path'];
const PATCH_FILE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$/gm;

function postToServer(project, pathname, body) {
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
    const payload = body === undefined ? null : JSON.stringify(body);
    const finish = () => {
      clearTimeout(deadline);
      req.destroy();
      resolve();
    };
    const req = http.request(
      {
        host: base.hostname === 'localhost' ? '127.0.0.1' : base.hostname,
        port: base.port,
        method: 'POST',
        path: `${pathname}?key=${encodeURIComponent(key)}`,
        headers: {
          'X-Ryugi-Project': encodeURIComponent(project),
          ...(payload ? { 'Content-Type': 'application/json' } : {}),
        },
      },
      (res) => {
        res.on('error', finish);
        res.on('end', finish);
        res.resume();
      },
    );
    // Socket idle timeouts reset on data. Bound the entire request instead,
    // leaving room for stdin and process startup inside Codex's 3s hooks.
    const deadline = setTimeout(finish, 1500);
    req.on('error', finish);
    req.on('close', finish);
    req.end(payload ?? undefined);
  });
}

function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value && typeof value === 'object')
    for (const item of Object.values(value)) strings(item, out);
  return out;
}

function pathsOf(input) {
  const tool = input.tool_input;
  if (!tool || typeof tool !== 'object') return [];
  const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
  const found = PATH_FIELDS.map((field) => tool[field]).filter(
    (value) => typeof value === 'string',
  );
  for (const text of strings(tool))
    for (const match of text.matchAll(PATCH_FILE)) found.push((match[1] ?? match[2]).trim());
  return [...new Set(found.map((file) => path.resolve(cwd, file)))];
}

function eventFrom(input, host, at = Date.now()) {
  if (!input || typeof input.session_id !== 'string' || typeof input.hook_event_name !== 'string')
    return null;
  const event = { host, session: input.session_id, event: input.hook_event_name, at };
  if (input.hook_event_name === 'PreToolUse') {
    event.paths = pathsOf(input).slice(0, 64);
    if (typeof input.tool_name === 'string' && input.tool_name.length <= 64)
      event.tool = input.tool_name;
  }
  return event;
}

function readStdin(timeoutMs = 1000) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve(null);
      return;
    }
    const chunks = [];
    const finish = (value) => {
      clearTimeout(timer);
      process.stdin.removeAllListeners();
      process.stdin.destroy();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('error', () => finish(null));
    process.stdin.on('end', () => {
      try {
        finish(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        finish(null);
      }
    });
  });
}

function projectOf(cwd) {
  try {
    return require('./comment-subscriptions.cjs').projectRoot(cwd);
  } catch {
    return null;
  }
}

if (require.main === module) {
  const at = Date.now();
  const host = process.argv[2] === 'claude' ? 'claude' : 'codex';
  void readStdin().then((input) => {
    const event = eventFrom(input, host, at);
    const project =
      process.argv[3] || (input && typeof input.cwd === 'string' ? projectOf(input.cwd) : null);
    if (event && project) void postToServer(project, '/api/agent/event', event);
  });
}

module.exports = { eventFrom, pathsOf, postToServer, readStdin };
