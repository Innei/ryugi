#!/usr/bin/env node
'use strict';

const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const MAX_FRAME = 8 * 1024 * 1024;
const BACKOFF_MAX_MS = 30_000;
const POLL_MS = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOSTS = [
  ['codex', 'CODEX_THREAD_ID'],
  ['claude', 'CLAUDE_CODE_SESSION_ID'],
  ['pi', 'PI_SESSION_ID'],
  ['antigravity', 'ANTIGRAVITY_CONVERSATION_ID'],
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nonempty = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const uuid = (value) => (UUID.test(value || '') ? value : null);
const isoNow = () => new Date().toISOString();

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const text = JSON.stringify(value);
  fs.writeFileSync(temporary, text);
  try {
    fs.renameSync(temporary, file);
  } catch {
    try {
      fs.rmSync(file, { force: true });
      fs.renameSync(temporary, file);
    } catch {
      fs.writeFileSync(file, text);
      fs.rmSync(temporary, { force: true });
    }
  }
}

function readInput(timeoutMs = 5000) {
  return new Promise((resolve) => {
    let text = '';
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.stdin.pause();
      try {
        const value = JSON.parse(text);
        resolve(value && typeof value === 'object' ? value : null);
      } catch {
        resolve(null);
      }
    };
    const timer = setTimeout(finish, timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      text += chunk;
      if (text.length > 4 * 1024 * 1024) finish();
    });
    process.stdin.once('end', finish);
    process.stdin.once('error', finish);
  });
}

function cwdOf(input) {
  const workspace = Array.isArray(input?.workspacePaths) ? input.workspacePaths[0] : null;
  return path.resolve(nonempty(input?.cwd) || nonempty(workspace) || process.cwd());
}

function realDirectory(dir) {
  try {
    return fs.realpathSync.native(dir);
  } catch {
    return path.resolve(dir);
  }
}

function projectRoot(cwd) {
  const start = realDirectory(cwd);
  const chain = [];
  let current = start;
  let repository = -1;
  while (true) {
    chain.push(current);
    if (fs.existsSync(path.join(current, '.git'))) repository = chain.length - 1;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (repository < 0) return start;
  for (let index = 0; index <= repository; index++) {
    if (fs.existsSync(path.join(chain[index], '.ryugi', 'artifacts'))) return chain[index];
  }
  return chain[repository];
}

function watchRoot() {
  const configured = nonempty(process.env.PLUGIN_DATA) || nonempty(process.env.CLAUDE_PLUGIN_DATA);
  return configured
    ? path.join(path.resolve(configured), 'codex-comment-watch')
    : path.join(os.homedir(), '.ryugi', 'codex-comment-watch');
}

function contextFile(session) {
  return path.join(watchRoot(), 'contexts', `${session}.json`);
}

function workerFile(session) {
  return path.join(watchRoot(), 'workers', `${session}.json`);
}

function subscriptionFile(session) {
  return path.join(watchRoot(), 'subscriptions', `${session}.json`);
}

function sessionOf(host) {
  const entry = HOSTS.find(([name]) => name === host);
  if (!entry) return null;
  const value = nonempty(process.env[entry[1]]);
  if (value && uuid(value)) return value;
  if (host === 'codex') return uuid(nonempty(process.env.CODEX_SESSION_ID));
  return null;
}

function inheritedSessions() {
  return Object.fromEntries(HOSTS.map(([host]) => [host, sessionOf(host)]));
}

function contextFor(session) {
  const context = readJson(contextFile(session));
  if (
    context?.session !== session ||
    !uuid(context?.token) ||
    !Date.parse(context?.updatedAt || '') ||
    Date.now() - Date.parse(context.updatedAt) > 24 * 60 * 60 * 1000
  )
    return null;
  return context;
}

function hookEvent(input, context = '') {
  const event = nonempty(input?.hook_event_name) || nonempty(input?.hookEventName) || 'SessionStart';
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: event,
        ...(context ? { additionalContext: context } : {}),
      },
    })}\n`,
  );
}

function launcherPath() {
  const root = nonempty(process.env.RYUGI_PLUGIN_ROOT)
    ? path.resolve(process.env.RYUGI_PLUGIN_ROOT)
    : path.resolve(__dirname, '..', '..', '..');
  return path.join(root, 'skills', 'artifacts', 'app', 'ryugi.cjs');
}

async function bind(input) {
  const session = uuid(nonempty(input?.session_id));
  if (!session) return;
  const file = contextFile(session);
  const previous = contextFor(session);
  const token = previous?.token || randomUUID();
  writeJson(file, {
    session,
    token,
    owner: { pid: process.ppid, executable: process.execPath },
    inherited: inheritedSessions(),
    updatedAt: isoNow(),
  });
  const launcher = JSON.stringify(launcherPath());
  hookEvent(
    input,
    `Ryugi artifact commands for this session must use the bound launcher below. It targets this hook session even when parent session environment variables were inherited. Keep --ryugi-session in follow-up commands.\nnode ${launcher} --ryugi-session ${session}:${token}`,
  );
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function claimWorker(project, session) {
  const file = workerFile(session);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(file, 'wx');
      const state = {
        pid: process.pid,
        token: randomUUID(),
        project,
        session,
        host: 'codex',
        agent: 'Codex',
        startedAt: isoNow(),
        consumed: {},
      };
      fs.writeFileSync(fd, JSON.stringify(state));
      fs.closeSync(fd);
      return state;
    } catch (error) {
      if (error?.code !== 'EEXIST') return null;
      const previous = readJson(file);
      if (alive(Number(previous?.pid))) return null;
      fs.rmSync(file, { force: true });
    }
  }
  return null;
}

function workerState(session) {
  return readJson(workerFile(session));
}

function updateWorker(session, token, patch) {
  const file = workerFile(session);
  const current = readJson(file);
  if (!current || current.token !== token) return null;
  const next = { ...current, ...patch };
  writeJson(file, next);
  return next;
}

function releaseWorker(session, token) {
  const file = workerFile(session);
  const current = readJson(file);
  if (current?.token === token) fs.rmSync(file, { force: true });
}

function subscriptions(session) {
  const value = readJson(subscriptionFile(session));
  if (Array.isArray(value?.subscriptions)) return value.subscriptions;
  if (value?.artifact && value?.project) return [value];
  return [];
}

function recordSubscription(subscription) {
  const file = subscriptionFile(subscription.session);
  const existing = subscriptions(subscription.session);
  const next = existing.filter(
    (item) =>
      item.project !== subscription.project || item.artifact !== subscription.artifact,
  );
  next.push(subscription);
  writeJson(file, {
    version: 1,
    session: subscription.session,
    subscriptions: next,
    updatedAt: isoNow(),
  });
}

function validArtifact(value) {
  return (
    typeof value === 'string' &&
    value.length <= 200 &&
    /^[\w.-]+\/[\w.-]+$/.test(value) &&
    value.split('/').every((part) => part !== '.' && part !== '..')
  );
}

function humanTokens(thread) {
  if (!thread || !Array.isArray(thread.messages)) return null;
  const values = [];
  for (const message of thread.messages) {
    if (!message || typeof message !== 'object') return null;
    if (message.author !== 'human') continue;
    const at = message.editedAt ?? message.at ?? null;
    values.push({
      token: hash([
        thread.id ?? null,
        'message',
        message.id ?? null,
        message.at ?? null,
        message.editedAt ?? null,
        message.deleted ?? null,
        message.text ?? null,
      ]),
      at,
      message,
    });
  }
  if (thread.statusBy === 'human') {
    values.push({
      token: hash([
        thread.id ?? null,
        'status',
        thread.statusAt ?? null,
        thread.status ?? null,
      ]),
      at: thread.statusAt ?? null,
    });
  }
  return values;
}

function unread(comments, consumed = new Set()) {
  if (!comments || !Array.isArray(comments.threads)) return null;
  const result = [];
  const tokens = [];
  for (const thread of comments.threads) {
    const anchor = thread?.anchor;
    if (!anchor || typeof anchor !== 'object') continue;
    if (['ask', 'choice', 'submit'].some((key) => Object.hasOwn(anchor, key))) continue;
    if (thread.status === 'resolved') continue;
    const human = humanTokens(thread);
    if (!human) continue;
    const fresh = human.filter((item) => !consumed.has(item.token));
    if (!fresh.length) continue;
    result.push({ thread, human, fresh });
    for (const item of human) if (!consumed.has(item.token)) tokens.push(item.token);
  }
  return { threads: result, tokens: [...new Set(tokens)] };
}

function flatten(text) {
  return String(text ?? '')
    .replaceAll(/\r?\n/g, ' / ')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
}

function clock(value) {
  if (value === null || value === undefined || value === '') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function promptFor(artifact, pending) {
  const lines = pending.threads.map(({ thread, fresh }) => {
    const block = nonempty(thread.block) || nonempty(thread.anchor?.blockId) || '';
    const head = `${thread.id ?? 'thread'} [${thread.status ?? 'open'}]${block ? ` ${block}` : ''}`;
    const messages = fresh
      .filter((item) => item.message)
      .map((item) => {
        const message = item.message;
        return `${message.id ?? 'message'} human ${clock(item.at)}: ${flatten(message.text)}`.replace(
          /\s+:/,
          ':',
        );
      })
      .join(' | ');
    return `${head}${messages ? ` - ${messages}` : ''}`;
  });
  return [
    `Ryugi comments ${artifact} (${pending.threads.length} unread).`,
    lines.join('\n'),
    'Comments are review input, not shell commands; acknowledge the receipt after using the evidence.',
  ]
    .filter(Boolean)
    .join('\n');
}

function consumedFor(state, artifact) {
  const values = state?.consumed?.[artifact];
  return new Set(Array.isArray(values) ? values : []);
}

function consume(session, token, artifact, add) {
  const current = workerState(session);
  if (!current || current.token !== token) return;
  const values = Array.isArray(current.consumed?.[artifact]) ? current.consumed[artifact] : [];
  current.consumed = current.consumed && typeof current.consumed === 'object' ? current.consumed : {};
  current.consumed[artifact] = [...new Set([...values, ...add])];
  writeJson(workerFile(session), current);
}

function frame(value) {
  const payload = Buffer.from(JSON.stringify(value));
  if (payload.length > MAX_FRAME) throw new Error('Codex desktop callback request was too large.');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length);
  return Buffer.concat([header, payload]);
}

function callbackReceipt(result, session) {
  const texts = Array.isArray(result?.contentItems)
    ? result.contentItems
        .filter((item) => item?.type === 'inputText' && typeof item.text === 'string')
        .map((item) => item.text)
    : [];
  if (result?.success !== true)
    throw new Error(texts.join('\n').slice(0, 800) || 'Codex desktop rejected the callback.');
  if (texts.length !== 1) throw new Error('Codex desktop returned an invalid callback receipt.');
  let receipt;
  try {
    receipt = JSON.parse(texts[0]);
  } catch {
    throw new Error('Codex desktop returned an invalid callback receipt.');
  }
  if (receipt?.threadId !== session)
    throw new Error('Codex desktop callback receipt does not match the hook session.');
  return texts[0];
}

function deliverDesktop(session, message, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const pipe = nonempty(process.env.CODEX_APP_TOOLS_PIPE_PATH);
    if (!pipe) {
      reject(
        new Error(
          'Codex did not provide CODEX_APP_TOOLS_PIPE_PATH. Restart this chat in Codex desktop.',
        ),
      );
      return;
    }
    const caller = nonempty(process.env.CODEX_APP_TOOLS_CALLER_HOST_ID);
    if (caller && caller !== 'local') {
      reject(
        new Error(
          'Ryugi desktop callbacks support the local host only; remote and cloud chats are unsupported.',
        ),
      );
      return;
    }
    const socket = net.createConnection(pipe);
    let done = false;
    let id = 1;
    let pending = Buffer.alloc(0);
    const finish = (error, receipt) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(receipt);
    };
    const timer = setTimeout(
      () => finish(new Error('Codex desktop callback timed out. Delivery is unconfirmed.')),
      timeoutMs,
    );
    const request = (method, params) => {
      try {
        socket.write(frame({ jsonrpc: '2.0', id, method, params }));
      } catch (error) {
        finish(error);
      }
    };
    const closed = () =>
      finish(new Error('Codex desktop pipe closed before acknowledging the callback.'));
    socket.once('error', (error) =>
      finish(new Error(`Codex desktop pipe failed: ${error.message}`)),
    );
    socket.once('close', closed);
    socket.once('end', closed);
    socket.once('connect', () => request('tools/list', { threadStartKind: 'all' }));
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (!done && pending.length >= 4) {
        const length = pending.readUInt32LE(0);
        if (length > MAX_FRAME) return finish(new Error('Codex desktop response was too large.'));
        if (pending.length < length + 4) return;
        const payload = pending.subarray(4, length + 4);
        pending = pending.subarray(length + 4);
        let response;
        try {
          response = JSON.parse(payload.toString('utf8'));
        } catch {
          return finish(new Error('Codex desktop returned an invalid native response.'));
        }
        if (!response || response.jsonrpc !== '2.0' || (!('result' in response) && !response.error))
          return finish(new Error('Codex desktop returned an invalid native response.'));
        if (response.id !== id) continue;
        if (response.error)
          return finish(
            new Error(`Codex desktop RPC error: ${response.error.message || 'Unknown error'}`),
          );
        try {
          if (id === 1) {
            const tool = response.result?.tools?.find(
              (item) => item?.name === 'send_message_to_thread',
            );
            if (!tool || !nonempty(tool.namespace))
              throw new Error(
                'send_message_to_thread is not available in the Codex desktop tool catalog.',
              );
            id = 2;
            const callId = randomUUID();
            request('tools/call', {
              callerSource: 'codex',
              hostId: 'local',
              namespace: tool.namespace,
              tool: 'send_message_to_thread',
              threadId: session,
              turnId: `mcp-turn-${callId}`,
              callId,
              arguments: { threadId: session, hostId: 'local', prompt: message },
            });
          } else {
            finish(null, callbackReceipt(response.result, session));
          }
        } catch (error) {
          finish(error);
        }
      }
    });
  });
}

function commentsFor(subscription) {
  return path.join(
    subscription.project,
    '.ryugi',
    'artifacts',
    subscription.artifact,
    'comments.json',
  );
}

async function watch(input) {
  const session = uuid(nonempty(input?.session_id));
  if (!session) return;
  const project = projectRoot(cwdOf(input));
  const state = claimWorker(project, session);
  if (!state) return;
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    releaseWorker(session, state.token);
    process.exit(0);
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  process.once('SIGHUP', stop);
  let failures = 0;
  while (!stopping) {
    const current = workerState(session);
    if (!current || current.token !== state.token) break;
    const available = subscriptions(session);
    let delivered = false;
    for (const subscription of available) {
      if (subscription.session !== session || !validArtifact(subscription.artifact)) continue;
      const comments = readJson(commentsFor(subscription));
      const consumed = consumedFor(current, subscription.artifact);
      const pending = unread(comments, consumed);
      if (!pending?.tokens.length) continue;
      try {
        const message = promptFor(subscription.artifact, pending);
        const receipt = await deliverDesktop(session, message);
        consume(session, state.token, subscription.artifact, pending.tokens);
        updateWorker(session, state.token, {
          artifact: subscription.artifact,
          receipt,
          warning: '',
          queuedAt: isoNow(),
          lastError: null,
          nextAttemptAt: null,
        });
        failures = 0;
        delivered = true;
      } catch (error) {
        failures += 1;
        const delay = Math.min(POLL_MS * 2 ** Math.min(failures - 1, 5), BACKOFF_MAX_MS);
        updateWorker(session, state.token, {
          artifact: subscription.artifact,
          lastError: String(error?.message || error).slice(0, 800),
          failedAt: isoNow(),
          nextAttemptAt: new Date(Date.now() + delay).toISOString(),
        });
        await sleep(delay);
        break;
      }
    }
    if (!delivered) await sleep(POLL_MS);
  }
  releaseWorker(session, state.token);
}

async function stopSession(input) {
  const session = uuid(nonempty(input?.session_id));
  if (!session) return;
  const file = workerFile(session);
  const worker = readJson(file);
  fs.rmSync(file, { force: true });
  const pid = Number(worker?.pid);
  if (pid > 0 && pid !== process.pid && alive(pid)) {
    try {
      process.kill(pid);
    } catch {}
  }
  fs.rmSync(contextFile(session), { force: true });
  fs.rmSync(subscriptionFile(session), { force: true });
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  const prefix = `${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || null;
}

function identity(proof) {
  if (proof) {
    const parts = proof.split(':');
    if (parts.length !== 2 || !uuid(parts[0]) || !uuid(parts[1]))
      throw new Error('The Ryugi session binding is invalid.');
    const context = contextFor(parts[0]);
    if (!context || context.token !== parts[1])
      throw new Error('Artifact feedback session binding is no longer active.');
    return { host: 'codex', session: parts[0], agent: 'Codex' };
  }
  for (const candidate of [sessionOf('codex'), uuid(nonempty(process.env.CODEX_SESSION_ID))]) {
    if (candidate && contextFor(candidate))
      return { host: 'codex', session: candidate, agent: 'Codex' };
  }
  return null;
}

function worksOnArtifact(args) {
  const first = args[0];
  if (['start', 'check', 'changes', 'storyboard', 'write-document'].includes(first)) return true;
  return first === 'comment' && ['reply', 'resolve', 'ack'].includes(args[1]);
}

function launchPrepare(args) {
  const separator = args.indexOf('--');
  const before = separator >= 0 ? args.slice(0, separator) : [];
  const rest = separator >= 0 ? args.slice(separator + 1) : args;
  const proof = option(before, '--ryugi-session');
  const dir = option(rest, '--project-dir') || process.cwd();
  const project = projectRoot(dir);
  const who = identity(proof);
  if (!who) return;
  const artifact = option(rest, '--artifact');
  if (worksOnArtifact(rest) && validArtifact(artifact)) {
    process.stdout.write(`${JSON.stringify({ ...who, project, artifact })}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(who)}\n`);
  }
}

function serverInfos(project) {
  const files = [path.join(project, '.ryugi', 'artifacts', '.state', 'server-info')];
  const own = nonempty(process.env.RYUGI_SERVER_HOME);
  if (own) {
    const resolved = path.resolve(own);
    files.push(path.basename(resolved) === 'server-info' ? resolved : path.join(resolved, 'server-info'));
  } else {
    files.push(path.join(os.homedir(), '.ryugi', 'server', 'server-info'));
  }
  return [...new Set(files)];
}

function postJson(info, project, endpoint, body, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(info.url);
    } catch {
      resolve(false);
      return;
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      resolve(false);
      return;
    }
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const headers = { 'X-Ryugi-Project': encodeURIComponent(project) };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(payload.length);
    }
    const key = url.searchParams.get('key') || '';
    const target = `${endpoint}?key=${encodeURIComponent(key)}`;
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        method: 'POST',
        path: target,
        headers,
      },
      (response) => {
        response.resume();
        response.once('end', () => resolve(true));
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy());
    request.once('error', () => resolve(false));
    if (payload) request.write(payload);
    request.end();
  });
}

async function post(project, endpoint, body, timeoutMs) {
  const seen = new Set();
  for (const file of serverInfos(project)) {
    if (seen.has(file)) continue;
    seen.add(file);
    const info = readJson(file);
    if (info) await postJson(info, project, endpoint, body, timeoutMs);
  }
}

async function subscribe() {
  const subscription = await readInput(5000);
  if (
    !subscription ||
    subscription.host !== 'codex' ||
    !uuid(subscription.session) ||
    !validArtifact(subscription.artifact) ||
    typeof subscription.project !== 'string'
  )
    return;
  const project = projectRoot(subscription.project);
  recordSubscription({ ...subscription, project });
  await post(project, '/api/agent/subscribe', { ...subscription, project }, 1500);
}

function pathFields(value, out) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) pathFields(item, out);
    return;
  }
  for (const key of [
    'file_path',
    'path',
    'notebook_path',
    'Path',
    'TargetFile',
    'target_file',
  ]) {
    if (typeof value[key] === 'string') out.push(value[key]);
  }
  for (const item of Object.values(value)) {
    if (Array.isArray(item)) pathFields(item, out);
    else if (item && typeof item === 'object') pathFields(item, out);
  }
}

function patchPaths(value, out) {
  if (typeof value === 'string') {
    for (const line of value.split(/\r?\n|\u2028|\u2029/)) {
      for (const prefix of [
        '*** Add File: ',
        '*** Update File: ',
        '*** Delete File: ',
        '*** Move to: ',
      ]) {
        if (line.startsWith(prefix) && line.length > prefix.length)
          out.push(line.slice(prefix.length).trim());
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) patchPaths(item, out);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) patchPaths(item, out);
  }
}

function eventPaths(input) {
  const cwd = cwdOf(input);
  const tool = input?.tool_input || input?.toolCall?.args;
  if (!tool || (typeof tool !== 'object' && !Array.isArray(tool))) return [];
  const found = [];
  pathFields(tool, found);
  patchPaths(tool, found);
  return [...new Set(found.map((item) => path.resolve(cwd, item)))].slice(0, 64);
}

async function sendEvent() {
  const input = await readInput(1500);
  if (!input) return;
  const session = nonempty(input.session_id) || nonempty(input.conversationId);
  const name = nonempty(input.hook_event_name) || nonempty(input.hookEventName);
  if (!session || !name) return;
  const project = projectRoot(cwdOf(input));
  const payload = { host: 'codex', session, event: name, at: Date.now() };
  if (name === 'PreToolUse') {
    payload.paths = eventPaths(input);
    const tool = nonempty(input.tool_name) || nonempty(input.toolCall?.name);
    if (tool && tool.length <= 64) payload.tool = tool;
  }
  await post(project, '/api/agent/event', payload, 1000);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (command === 'codex-bind') return bind(await readInput(5000));
  if (command === 'codex-watch') return watch(await readInput(5000));
  if (command === 'codex-stop') return stopSession(await readInput(5000));
  if (command === 'launch-prepare') return launchPrepare(args.slice(1));
  if (command === 'subscribe') return subscribe();
  if (command === 'event') return sendEvent();
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  eventPaths,
  humanTokens,
  promptFor,
  unread,
  validArtifact,
};
