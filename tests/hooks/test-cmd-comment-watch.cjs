'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');
const { fakeHub } = require('./fake-hub.cjs');
const { startFakeApi } = require('./fake-agent-api.cjs');

const cacheHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-cmd-cache-'));
process.env.XDG_CACHE_HOME = cacheHome;
after(() => fs.rmSync(cacheHome, { recursive: true, force: true }));
require('./fake-artifacts-release.cjs').seedFakeRelease(cacheHome);

const repo = path.resolve(__dirname, '../..');
const appDir = path.join(repo, 'skills/artifacts/app');
const { hookBin } = require('./hook-bin.cjs');

const hook = hookBin();
const UNSUBSCRIBE_EXIT_CODE = 10;

const THREAD = 'mcp:thr_01JXYZ.42';
const CLAUDE_SESSION = '29ba4e4a-2224-4457-947d-c39ebcbc846c';
const at = (n) => `2026-11-22T01:00:${String(n).padStart(2, '0')}.000Z`;

async function until(check, explanation, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return;
    await delay(25);
  }
  assert.fail(typeof explanation === 'function' ? explanation() : explanation);
}

function writeDeliverScript(dir, name = 'deliver.cjs') {
  const logFile = path.join(dir, `${name}.log.jsonl`);
  const modeFile = path.join(dir, `${name}.mode.json`);
  const script = path.join(dir, name);
  fs.writeFileSync(
    script,
    `'use strict';
const fs = require('node:fs');
const input = fs.readFileSync(0, 'utf8');
let payload = null;
try { payload = JSON.parse(input); } catch {}
const record = {
  payload,
  env: {
    RYUGI_HOST: process.env.RYUGI_HOST,
    RYUGI_SESSION: process.env.RYUGI_SESSION,
    RYUGI_PROJECT: process.env.RYUGI_PROJECT,
    RYUGI_ARTIFACT: process.env.RYUGI_ARTIFACT,
    RYUGI_EVENT_TYPE: process.env.RYUGI_EVENT_TYPE,
  },
};
fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify(record) + '\\n');
let mode = { code: 0, stdout: JSON.stringify({ status: 'queued', id: 'msg-1' }) };
try { mode = JSON.parse(fs.readFileSync(${JSON.stringify(modeFile)}, 'utf8')); } catch {}
if (mode.stdout) process.stdout.write(mode.stdout + '\\n');
if (mode.stderr) process.stderr.write(mode.stderr + '\\n');
process.exit(mode.code ?? 0);
`,
  );
  const reads = () => {
    if (!fs.existsSync(logFile)) return [];
    return fs
      .readFileSync(logFile, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  };
  const setMode = (mode) => fs.writeFileSync(modeFile, JSON.stringify(mode));
  return { command: [process.execPath, script], logFile, reads, script, setMode };
}

function fixture(t) {
  const hub = fakeHub(t);
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-cmd-watch-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'project');
  const data = path.join(root, 'plugin-data');
  const configHome = path.join(root, 'config-home');
  fs.mkdirSync(path.join(project, '.git'), { recursive: true });
  fs.mkdirSync(data, { recursive: true });
  fs.mkdirSync(path.join(configHome, 'ryugi'), { recursive: true });

  const deliver = writeDeliverScript(root);
  const writeHosts = (hosts) =>
    fs.writeFileSync(path.join(configHome, 'ryugi', 'config.json'), JSON.stringify({ hosts }));
  writeHosts({
    t3: {
      env: 'T3CODE_THREAD_ID',
      agent: 'T3 Code',
      command: deliver.command,
      timeoutMs: 5000,
    },
  });

  const env = {
    ...process.env,
    PLUGIN_ROOT: repo,
    PLUGIN_DATA: data,
    XDG_CONFIG_HOME: configHome,
    T3CODE_THREAD_ID: THREAD,
    RYUGI_NO_UPDATE_CHECK: '1',
    ...hub.env,
  };
  for (const key of [
    'RYUGI_HOSTS_CONFIG',
    'CODEX_THREAD_ID',
    'CODEX_SESSION_ID',
    'CLAUDE_CODE_SESSION_ID',
    'PI_SESSION_ID',
    'ANTIGRAVITY_CONVERSATION_ID',
    'ANTIGRAVITY_AGENT',
    'ANTIGRAVITY_LS_ADDRESS',
  ])
    delete env[key];

  const children = [];
  t.after(() => {
    for (const child of children) {
      try {
        child.kill('SIGTERM');
      } catch {}
    }
  });

  let nextId = 0;
  const connected = (count = 1) =>
    until(
      () => hub.hellos().length >= count && hub.sessions.has(THREAD),
      'the custom watcher never said hello to the hub',
    );
  const push = async (artifact, text) => {
    await connected();
    const sent = ++nextId;
    hub.send(THREAD, {
      t: 'event',
      id: sent,
      event: {
        type: 'ryugi-comments',
        project,
        artifact,
        unread: 1,
        threads: [
          {
            thread: 't1',
            status: 'open',
            block: 'b1',
            messages: [{ id: 'm1', at: at(1), name: 'human', text }],
          },
        ],
      },
    });
    return sent;
  };
  const retract = (artifact) =>
    hub.send(THREAD, { t: 'retract', project, artifact, type: 'ryugi-comments' });

  const startWatch = (overrides = {}) => {
    const child = spawn(hook, ['watch', 'cmd'], {
      cwd: project,
      env: { ...env, ...overrides },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    children.push(child);
    child.stdin.end(JSON.stringify({ cwd: project }));
    return child;
  };
  const stopWatch = () => {
    const res = spawnSync(hook, ['cmd-stop'], {
      cwd: project,
      env,
      input: JSON.stringify({ host: 't3', session: THREAD, cwd: project }),
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, res.stderr);
  };

  return {
    configHome,
    connected,
    data,
    deliver,
    env,
    hub,
    project,
    push,
    retract,
    root,
    startWatch,
    stopWatch,
    writeHosts,
  };
}

function prepare(env, args) {
  const result = spawnSync(hook, ['launch-prepare', '--', ...args], { env, encoding: 'utf8' });
  return {
    subscription: result.stdout.trim() ? JSON.parse(result.stdout) : null,
    stderr: result.stderr,
  };
}

test('custom host config ignores built-in names, invalid entries and repo config, and wins priority over inner providers', async (t) => {
  const f = fixture(t);
  f.writeHosts({
    claude: { env: 'CLAUDE_CODE_SESSION_ID', command: ['/bin/true'] },
    BadHost: { env: 'BAD_ID', command: ['/bin/true'] },
    t3: { env: 'T3CODE_THREAD_ID', agent: 'T3 Code', command: f.deliver.command },
    zcode: { env: 'ZCODE_SESSION_ID', command: ['/bin/true'] },
  });
  fs.mkdirSync(path.join(f.project, '.ryugi'), { recursive: true });
  fs.writeFileSync(
    path.join(f.project, '.ryugi', 'config.json'),
    JSON.stringify({ hosts: { evil: { env: 'EVIL_ID', command: ['/bin/echo'] } } }),
  );
  const args = ['start', '--artifact', 'document/spec', '--project-dir', f.project];
  const bare = { ...f.env };
  delete bare.T3CODE_THREAD_ID;

  assert.equal(prepare({ ...bare, BAD_ID: 'b-1' }, args).subscription, null);
  assert.equal(prepare({ ...bare, EVIL_ID: 'e-1' }, args).subscription, null);
  assert.equal(prepare({ ...bare, ZCODE_SESSION_ID: 'z-1' }, args).subscription.host, 'zcode');

  const { subscription } = prepare(
    {
      ...f.env,
      CLAUDE_CODE_SESSION_ID: CLAUDE_SESSION,
      ANTIGRAVITY_AGENT: '1',
      ANTIGRAVITY_CONVERSATION_ID: CLAUDE_SESSION,
    },
    args,
  );
  assert.deepEqual(subscription, {
    host: 't3',
    session: THREAD,
    project: f.project,
    artifact: 'document/spec',
  });

  const ambiguous = prepare({ ...f.env, ZCODE_SESSION_ID: 'z-1' }, args);
  assert.equal(ambiguous.subscription, null);
  assert.match(ambiguous.stderr, /ambiguous custom host/i);

  // Each subscription above also started a detached watcher, as the launcher does.
  const workers = path.join(f.data, 'cmd-comment-watch', 'workers');
  const claimed = () =>
    fs.existsSync(workers)
      ? fs
          .readdirSync(workers)
          .flatMap((host) =>
            fs.readdirSync(path.join(workers, host)).map((name) => path.join(workers, host, name)),
          )
      : [];
  await until(() => claimed().length === 2, 'the started watchers never claimed their sessions');
  const pids = claimed().map((file) => JSON.parse(fs.readFileSync(file, 'utf8')).pid);
  for (const pid of pids) process.kill(pid, 'SIGTERM');
  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  await until(() => !pids.some(alive), 'the started watchers did not stop');
});

test('cmd-comment-watch delivers hub events via user command, acknowledges queued receipt, and deduplicates workers', async (t) => {
  const f = fixture(t);
  f.startWatch();
  await f.connected();

  const duplicate = f.startWatch();
  const dupExit = await new Promise((resolve) => duplicate.on('exit', resolve));
  assert.equal(dupExit, 0);

  const sent = await f.push('document/spec', 'please update the schema');
  await until(() => f.deliver.reads().length === 1, 'delivery command was never invoked');

  const call = f.deliver.reads()[0];
  assert.equal(call.payload.protocol, 1);
  assert.equal(call.payload.host, 't3');
  assert.equal(call.payload.session, THREAD);
  assert.equal(call.payload.project, f.project);
  assert.equal(call.payload.artifact, 'document/spec');
  assert.match(call.payload.wakeMessage, /Ryugi comments document\/spec \(1 unread\)/);
  assert.match(call.payload.wakeMessage, /please update the schema/);
  assert.equal(call.env.RYUGI_HOST, 't3');
  assert.equal(call.env.RYUGI_SESSION, THREAD);
  assert.equal(call.env.RYUGI_ARTIFACT, 'document/spec');

  await until(() => f.hub.delivered().includes(sent), 'hub was not notified of delivery');
  assert.equal(f.hub.hellos()[0].host, 't3');
  assert.equal(f.hub.hellos()[0].agent, 'T3 Code');

  f.stopWatch();
});

test('cmd-comment-watch retries on non-zero exit or retry receipt, and drops pending item on retract', async (t) => {
  const f = fixture(t);
  f.deliver.setMode({ code: 1, stderr: 't3 busy' });
  f.startWatch();

  const sent = await f.push('document/retry', 'try again');
  await until(() => f.deliver.reads().length >= 1, 'initial delivery attempt missing');
  assert.deepEqual(f.hub.delivered(), []);

  // JSON retry status also retries even with exit 0.
  f.deliver.setMode({ code: 0, stdout: JSON.stringify({ status: 'retry', reason: 'locked' }) });
  const before = f.deliver.reads().length;
  await until(() => f.deliver.reads().length > before, 'retry attempt missing', 5000);
  assert.deepEqual(f.hub.delivered(), []);

  // Succeed on next attempt.
  f.deliver.setMode({ code: 0, stdout: JSON.stringify({ status: 'delivered' }) });
  await until(
    () => f.hub.delivered().includes(sent),
    'event was not acknowledged after recovery',
    6000,
  );

  // Retract drops a failing item before recovery.
  f.deliver.setMode({ code: 1, stderr: 'offline' });
  await f.push('document/retract', 'already handled');
  const countBefore = f.deliver.reads().length;
  await until(() => f.deliver.reads().length > countBefore, 'retract item not attempted');
  f.retract('document/retract');
  await delay(100);
  const attemptsAfterRetract = f.deliver.reads().length;
  f.deliver.setMode({ code: 0, stdout: JSON.stringify({ status: 'delivered' }) });
  await delay(1500);
  assert.equal(f.deliver.reads().length, attemptsAfterRetract);

  f.stopWatch();
});

test('cmd-comment-watch unsubscribes and exits cleanly on unsubscribe exit code or JSON status', async (t) => {
  for (const mode of [
    { code: UNSUBSCRIBE_EXIT_CODE },
    { code: 0, stdout: JSON.stringify({ status: 'unsubscribe' }) },
  ]) {
    const f = fixture(t);
    f.deliver.setMode(mode);
    const child = f.startWatch();
    await f.push('document/archived', 'thread closed');
    const exitCode = await new Promise((resolve) => child.on('exit', resolve));
    assert.equal(exitCode, 0);
    await until(
      () => f.hub.received.some((msg) => msg.t === 'unsubscribe'),
      'hub never received unsubscribe',
    );
    assert.deepEqual(f.hub.delivered(), []);
  }
});

test('cmd-ensure launches detached custom watcher, skips while healthy, and supersedes on config change', async (t) => {
  const f = fixture(t);
  const ensureWatch = () => spawnSync(hook, ['cmd-ensure', f.project], { env: f.env }).status;
  assert.equal(ensureWatch(), 0);
  await f.connected(1);
  assert.equal(ensureWatch(), 3);

  const deliver2 = writeDeliverScript(f.root, 'deliver2.cjs');
  f.writeHosts({
    t3: { env: 'T3CODE_THREAD_ID', agent: 'T3 Code', command: deliver2.command, timeoutMs: 5000 },
  });
  assert.equal(ensureWatch(), 0);
  await f.connected(2);

  await f.push('document/updated-cmd', 'use new script');
  await until(() => deliver2.reads().length === 1, 'updated command did not receive event');
  assert.equal(f.deliver.reads().length, 0);

  f.stopWatch();
});

test('launcher subscribes under custom host, spawns cmd watcher, and suppresses Codex App Server warning', async (t) => {
  const f = fixture(t);
  const api = startFakeApi(t, f.project);
  const plugin = path.join(f.root, 'plugin');
  const copiedApp = path.join(plugin, 'skills/artifacts/app');
  fs.mkdirSync(copiedApp, { recursive: true });
  for (const name of ['ryugi.cjs', 'output-bootstrap.cjs'])
    fs.copyFileSync(path.join(appDir, name), path.join(copiedApp, name));
  fs.writeFileSync(
    path.join(copiedApp, 'cli.cjs'),
    `console.log(JSON.stringify({schema:'ryugi.cli/v1', command:process.argv.includes('--version')?'version':'start', outcome:'success', data:{status:'running',capabilities:['reviewBundlesV1']}}));\n`,
  );

  const launcherRes = spawnSync(
    process.execPath,
    [
      path.join(copiedApp, 'ryugi.cjs'),
      'start',
      '--background',
      '--artifact',
      'document/spec',
      '--project-dir',
      f.project,
    ],
    {
      cwd: f.project,
      env: { ...f.env, CLAUDE_CODE_SESSION_ID: CLAUDE_SESSION },
      encoding: 'utf8',
    },
  );
  assert.equal(launcherRes.status, 0, launcherRes.stderr);

  const subs = api.requests().filter((req) => req.path === '/api/agent/subscribe');
  assert.equal(subs.length, 1);
  assert.deepEqual(subs[0].body, {
    host: 't3',
    session: THREAD,
    project: f.project,
    artifact: 'document/spec',
  });

  await f.connected();
  f.stopWatch();

  // Codex watch and bind hooks stay silent when a custom host owns the session.
  for (const mode of ['watch', 'bind']) {
    const codexRes = spawnSync(hook, [`codex-${mode}`], {
      cwd: f.project,
      env: { ...f.env, CODEX_THREAD_ID: CLAUDE_SESSION },
      input: JSON.stringify({
        session_id: CLAUDE_SESSION,
        cwd: f.project,
        hook_event_name: 'SessionStart',
      }),
      encoding: 'utf8',
    });
    assert.equal(codexRes.status, 0);
    assert.equal(codexRes.stdout.trim(), '');
  }
});
