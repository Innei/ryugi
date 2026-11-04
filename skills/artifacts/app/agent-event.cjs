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
        timeout: 2000,
      },
      (res) => {
        res.resume();
        res.on('end', resolve);
      },
    );
    req.on('error', () => resolve());
    req.on('timeout', () => req.destroy());
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
  if (input.hook_event_name === 'PreToolUse') event.paths = pathsOf(input);
  return event;
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
  const at = Date.now();
  const host = process.argv[2] === 'claude' ? 'claude' : 'codex';
  const input = readStdin();
  const event = eventFrom(input, host, at);
  const project =
    process.argv[3] || (input && typeof input.cwd === 'string' ? projectOf(input.cwd) : null);
  if (event && project) void postToServer(project, '/api/agent/event', event);
}

module.exports = { eventFrom, pathsOf, postToServer, readStdin };
