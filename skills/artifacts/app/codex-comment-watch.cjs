'use strict';

const { execFile, execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createCommentWatch, unreadCount } = require('./comment-watch.cjs');
const { projectRoot, register, subscriptionFile, UUID } = require('./comment-subscriptions.cjs');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function endpoint(value) {
  if (
    typeof value !== 'string' ||
    [...value].some((char) => char.charCodeAt(0) < 33 || /\s/.test(char))
  )
    return null;
  if (value.startsWith('unix://')) return value;
  try {
    const url = new URL(value);
    return ['ws:', 'wss:'].includes(url.protocol) && !url.username && !url.password ? value : null;
  } catch {
    return null;
  }
}

// Hooks do not receive the connection URL. Follow the launching host, never another thread's env ID.
function hostEndpoint() {
  if (process.platform === 'win32') return null;
  let pid = process.ppid;
  for (let i = 0; i < 8 && pid > 1; i++) {
    try {
      const info = execFileSync('ps', ['-p', String(pid), '-o', 'ppid=,comm='], {
        encoding: 'utf8',
        timeout: 1000,
      })
        .trim()
        .match(/^(\d+)\s+(\S.*)$/);
      if (!info) return null;
      if (path.basename(info[2]).startsWith('codex')) {
        const args = execFileSync('ps', ['-p', String(pid), '-o', 'args='], {
          encoding: 'utf8',
          timeout: 1000,
        });
        const match = args.match(/--listen(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/);
        if (match) return endpoint(match[1] || match[2] || match[3]);
      }
      pid = Number(info[1]);
    } catch {
      return null;
    }
  }
  return null;
}

function context(input, env = process.env) {
  // CODEX_THREAD_ID can be inherited from the process that launched this Codex session.
  if (!UUID.test(input.session_id || '') || typeof input.cwd !== 'string') return null;
  const project = projectRoot(input.cwd);
  const data =
    env.PLUGIN_DATA || env.CLAUDE_PLUGIN_DATA || path.join(project, '.ryugi/artifacts/.state');
  return {
    session: input.session_id,
    project,
    file: path.join(data, 'codex-comment-watch', 'workers', `${input.session_id}.json`),
    subscriptions: subscriptionFile(project, 'codex', input.session_id),
  };
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function claim(ctx) {
  fs.mkdirSync(path.dirname(ctx.file), { recursive: true });
  const state = {
    pid: process.pid,
    token: randomUUID(),
    project: ctx.project,
    session: ctx.session,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(ctx.file, 'wx', 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify(state));
      } finally {
        fs.closeSync(fd);
      }
      return state;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const previous = readJson(ctx.file);
      if (alive(previous?.pid)) return null;
      try {
        // A second startup can arrive while the first writes its ownership record.
        if (!previous && Date.now() - fs.statSync(ctx.file).mtimeMs < 5000) return null;
        if (readJson(ctx.file)?.token === previous?.token) fs.rmSync(ctx.file, { force: true });
      } catch {
        // A concurrent lifecycle hook may already have removed the stale record.
      }
    }
  }
  return null;
}

function queueComment(ctx, remote, event, signal) {
  const skill = path.join(__dirname, '..', 'SKILL.md');
  const guide = path.join(__dirname, '..', `${event.artifact.split('/')[0]}.md`);
  const message = `Ryugi review comments changed. Local skill: ${JSON.stringify(skill)}; guide: ${JSON.stringify(guide)}. ${event.instruction}\nRun: ${event.command}`;
  const args = [
    'queue',
    '--remote',
    remote,
    '--thread',
    ctx.session,
    '--message',
    message,
    '--resume',
  ];
  const tokenEnv = process.env.RYUGI_CODEX_REMOTE_AUTH_TOKEN_ENV;
  if (tokenEnv && /^[a-z_]\w*$/i.test(tokenEnv)) args.push('--remote-auth-token-env', tokenEnv);
  return new Promise((resolve, reject) => {
    execFile(
      'codex',
      args,
      {
        cwd: ctx.project,
        env: { ...process.env, CODEX_THREAD_ID: ctx.session, CODEX_SESSION_ID: ctx.session },
        signal,
        timeout: 15000,
        maxBuffer: 16384,
      },
      (error, stdout, stderr) => {
        if (error) reject(new Error(stderr.trim() || error.message));
        // Exit 0 acknowledges durable enqueue, even when --resume prints a warning: do not enqueue twice.
        else resolve({ receipt: stdout.trim(), warning: stderr.trim() });
      },
    );
  });
}

function notice(input, message) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: input.hook_event_name || 'SessionStart',
        additionalContext: message,
      },
    })}\n`,
  );
}

function watch(ctx, input) {
  const remote = endpoint(process.env.RYUGI_CODEX_REMOTE) || hostEndpoint();
  if (!remote) {
    notice(
      input,
      'Ryugi comment watch needs the current Codex App Server endpoint. Set RYUGI_CODEX_REMOTE for a host that does not expose --listen.',
    );
    return;
  }
  const state = claim(ctx);
  if (!state) return;
  state.remote = remote;
  fs.writeFileSync(ctx.file, JSON.stringify(state), { mode: 0o600 });
  const poll = createCommentWatch(ctx.project, 'Codex');
  const pending = new Map();
  const controller = new AbortController();
  let running = false;
  let nextAttempt = 0;
  let failures = 0;
  let timer;
  const update = (fields) => {
    if (readJson(ctx.file)?.token === state.token)
      fs.writeFileSync(ctx.file, JSON.stringify({ ...state, ...fields }), { mode: 0o600 });
  };
  const stop = () => {
    clearInterval(timer);
    controller.abort();
    if (readJson(ctx.file)?.token === state.token) fs.rmSync(ctx.file, { force: true });
    process.exit(0);
  };
  const tick = async () => {
    if (readJson(ctx.file)?.token !== state.token) return stop();
    if (running) return;
    const subscriptions = new Set(readJson(ctx.subscriptions)?.artifacts || []);
    for (const event of poll(subscriptions)) pending.set(event.artifact, event);
    if (!pending.size || Date.now() < nextAttempt) return;
    const event = pending.values().next().value;
    if (!subscriptions.has('*') && !subscriptions.has(event.artifact)) {
      pending.delete(event.artifact);
      return;
    }
    const unread = unreadCount(ctx.project, event.artifact, 'Codex');
    if (unread === null) return;
    if (!unread) {
      pending.delete(event.artifact);
      return;
    }
    running = true;
    try {
      const { receipt, warning } = await queueComment(ctx, remote, event, controller.signal);
      pending.delete(event.artifact);
      failures = 0;
      update({ artifact: event.artifact, receipt, warning, queuedAt: new Date().toISOString() });
    } catch (error) {
      nextAttempt = Date.now() + Math.min(30000, 1000 * 2 ** failures++);
      update({ lastError: String(error.message).slice(0, 800) });
    } finally {
      running = false;
    }
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  timer = setInterval(tick, 1000);
  void tick();
}

function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return;
  }
  const ctx = context(input);
  if (!ctx) return;
  if (process.argv[2] === 'stop') fs.rmSync(ctx.file, { force: true });
  else if (process.argv[2] === 'watch') watch(ctx, input);
}

module.exports = { context, endpoint, hostEndpoint, projectRoot, register };
if (require.main === module) main();
