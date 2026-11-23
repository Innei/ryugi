'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { startFakeApi } = require('./fake-agent-api.cjs');
const { hookBin, repo } = require('./hook-bin.cjs');

const source = path.resolve(__dirname, '../../skills/artifacts/app');
const PARENT = '11111111-1111-4111-8111-111111111111';
const CURRENT = '22222222-2222-4222-8222-222222222222';

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-subscriptions-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'project');
  const plugin = path.join(root, 'plugin');
  const app = path.join(plugin, 'skills/artifacts/app');
  fs.mkdirSync(path.join(project, '.git'), { recursive: true });
  fs.mkdirSync(app, { recursive: true });
  const api = startFakeApi(t, project);
  for (const name of ['ryugi.cjs', 'output-bootstrap.cjs', 'codex-hook', 'hook-bin.sh'])
    fs.copyFileSync(path.join(source, name), path.join(app, name));
  fs.cpSync(path.join(repo, 'hooks'), path.join(plugin, 'hooks'), { recursive: true });
  fs.writeFileSync(
    path.join(app, 'cli.cjs'),
    `console.log(JSON.stringify({schema:'ryugi.cli/v1', command:process.argv.includes('--version')?'version':'start', outcome:'success', data:{status:'running',capabilities:['reviewBundlesV1']}}));\n`,
  );
  const env = {
    ...process.env,
    XDG_CACHE_HOME: path.join(root, 'cache'),
    PLUGIN_DATA: path.join(root, 'plugin-data'),
    PLUGIN_ROOT: plugin,
    CODEX_THREAD_ID: PARENT,
    CODEX_SESSION_ID: PARENT,
    RYUGI_NO_UPDATE_CHECK: '1',
    RYUGI_HOOK_BIN: hookBin(),
    RYUGI_CODEX_REMOTE: 'unix:///tmp/ryugi-subscriptions-no-server.sock',
  };
  for (const key of [
    'CLAUDE_CODE_SESSION_ID',
    'PI_SESSION_ID',
    'ANTIGRAVITY_CONVERSATION_ID',
    'ANTIGRAVITY_AGENT',
    'ANTIGRAVITY_LS_ADDRESS',
    'ANTIGRAVITY_CSRF_TOKEN',
    'CODEX_APP_TOOLS_PIPE_PATH',
    'CODEX_MCP_NODE_PATH',
    'CODEX_APP_TOOLS_CALLER_HOST_ID',
  ])
    delete env[key];
  const bind = (session = CURRENT, overrides = {}) => {
    const result = spawnSync(env.RYUGI_HOOK_BIN, ['codex-bind'], {
      cwd: project,
      env: { ...env, ...overrides },
      input: JSON.stringify({
        session_id: session,
        cwd: project,
        hook_event_name: 'SessionStart',
      }),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.match(/--ryugi-session ([a-f0-9:-]+)/)?.[1];
  };
  const run = (args, overrides = {}) => {
    const result = spawnSync(
      process.execPath,
      [path.join(app, 'ryugi.cjs'), ...args, '--project-dir', project],
      {
        cwd: project,
        env: { ...env, ...overrides },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, result.stderr);
    return result;
  };
  const read = (host, session) =>
    api
      .requests()
      .filter(
        (request) =>
          request.path === '/api/agent/subscribe' &&
          request.body?.host === host &&
          request.body?.session === session,
      )
      .map((request) => {
        assert.equal(request.body.project, project);
        assert.equal(request.key, 'test-key');
        return request.body.artifact;
      });
  const subscriptionFiles = () =>
    fs
      .readdirSync(path.join(project, '.ryugi/artifacts/.state'))
      .filter((name) => name.endsWith('-comment-watch'));
  const hook = (event) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(source, 'codex-hooks.json'), 'utf8'));
    for (const group of manifest.hooks[event] ?? [])
      for (const step of group.hooks.filter((step) => !step.async)) {
        const result = spawnSync(step.command.replaceAll('${PLUGIN_ROOT}', plugin), {
          shell: true,
          cwd: project,
          env,
          input: JSON.stringify({ session_id: CURRENT, cwd: project, hook_event_name: event }),
          encoding: 'utf8',
        });
        assert.equal(result.status, 0, result.stderr);
      }
  };
  return { app, bind, env, hook, project, read, run, subscriptionFiles };
}

for (const event of ['SessionStart', 'UserPromptSubmit'])
  test(`${event} binds the hook session before the launcher can open a page`, (t) => {
    const f = fixture(t);
    f.hook(event);
    f.run(['start', '--artifact', 'document/bound']);
    assert.deepEqual(f.read('codex', CURRENT), ['document/bound']);
    assert.deepEqual(f.read('codex', PARENT), []);
    assert.deepEqual(f.subscriptionFiles(), []);
  });

test('starting the server headlessly does not subscribe to all project feedback', (t) => {
  const f = fixture(t);
  f.bind();
  f.run(['start', '--background', '--no-open']);
  assert.deepEqual(f.read('codex', PARENT), []);
  assert.deepEqual(f.read('codex', CURRENT), []);
});

test('reading a comment does not opt the session into future feedback', (t) => {
  const f = fixture(t);
  f.bind();
  f.run(['comment', 'list', '--artifact', 'document/history']);
  assert.deepEqual(f.read('codex', PARENT), []);
  assert.deepEqual(f.read('codex', CURRENT), []);
});

test('opening an artifact uses the hook binding even when the launcher inherited its parent session', (t) => {
  const f = fixture(t);
  f.bind(CURRENT);
  f.run(['start', '--artifact', 'document/current']);
  assert.deepEqual(f.read('codex', CURRENT), ['document/current']);
  assert.deepEqual(f.read('codex', PARENT), []);
});

test('a host with only CODEX_SESSION_ID still uses its canonical hook binding', (t) => {
  const f = fixture(t);
  f.bind(CURRENT);
  f.run(['start', '--artifact', 'document/current'], { CODEX_THREAD_ID: '' });
  assert.deepEqual(f.read('codex', CURRENT), ['document/current']);
  assert.deepEqual(f.read('codex', PARENT), []);
});

test('a Codex environment without a hook binding cannot register a parent subscription', (t) => {
  const f = fixture(t);
  f.run(['start', '--artifact', 'document/unbound']);
  assert.deepEqual(f.read('codex', PARENT), []);
});

test('a nested Claude session does not register under its inherited Codex parent', (t) => {
  const f = fixture(t);
  f.bind(PARENT);
  f.run(['start', '--artifact', 'document/claude'], { CLAUDE_CODE_SESSION_ID: CURRENT });
  assert.deepEqual(f.read('claude', CURRENT), ['document/claude']);
  assert.deepEqual(f.read('codex', PARENT), []);
});

test('a bound Codex session nested in Claude retains its own subscription', (t) => {
  const f = fixture(t);
  const inherited = { CLAUDE_CODE_SESSION_ID: PARENT };
  f.bind(CURRENT, inherited);
  f.run(['start', '--artifact', 'document/codex'], inherited);
  assert.deepEqual(f.read('codex', CURRENT), ['document/codex']);
  assert.deepEqual(f.read('claude', PARENT), []);
});

test('an inherited id shared by two hook sessions is rejected instead of guessed', (t) => {
  const f = fixture(t);
  f.bind(PARENT);
  f.bind(CURRENT);
  f.run(['start', '--artifact', 'document/ambiguous']);
  assert.deepEqual(f.read('codex', PARENT), []);
  assert.deepEqual(f.read('codex', CURRENT), []);
});

test('two sessions on one host route an explicit current id to its matching hook binding', (t) => {
  const f = fixture(t);
  f.bind(PARENT);
  f.bind(CURRENT);
  f.run(['start', '--artifact', 'document/current'], {
    CODEX_THREAD_ID: CURRENT,
    CODEX_SESSION_ID: CURRENT,
  });
  assert.deepEqual(f.read('codex', CURRENT), ['document/current']);
  assert.deepEqual(f.read('codex', PARENT), []);
});

test('the hook-provided invocation disambiguates two sessions without trusting ambient ids', (t) => {
  const f = fixture(t);
  f.bind(PARENT);
  const proof = f.bind(CURRENT) ?? `${CURRENT}:00000000-0000-4000-8000-000000000000`;
  f.run(['--ryugi-session', proof, 'start', '--artifact', 'document/current']);
  assert.deepEqual(f.read('codex', CURRENT), ['document/current']);
  assert.deepEqual(f.read('codex', PARENT), []);
});

test('simultaneous lifecycle hooks keep both issued launcher invocations usable', async (t) => {
  const f = fixture(t);
  const runHook = () =>
    new Promise((resolve, reject) => {
      const child = spawn(f.env.RYUGI_HOOK_BIN, ['codex-bind'], {
        cwd: f.project,
        env: f.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let output = '';
      let errors = '';
      child.stdout.on('data', (chunk) => (output += chunk));
      child.stderr.on('data', (chunk) => (errors += chunk));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) return reject(new Error(errors));
        resolve(output.match(/--ryugi-session ([a-f0-9:-]+)/)?.[1]);
      });
      child.stdin.end(
        JSON.stringify({ session_id: CURRENT, cwd: f.project, hook_event_name: 'SessionStart' }),
      );
    });
  const proofs = await Promise.all([runHook(), runHook()]);
  for (const [index, proof] of proofs.entries()) {
    assert.ok(proof, 'the hook did not supply a bound invocation');
    f.run(['--ryugi-session', proof, 'start', '--artifact', `document/open-${index}`]);
  }
  assert.deepEqual(f.read('codex', CURRENT), ['document/open-0', 'document/open-1']);
  assert.deepEqual(f.read('codex', PARENT), []);
});

test('an invocation from an ended session cannot fall back to an inherited parent', (t) => {
  const f = fixture(t);
  f.bind(PARENT);
  const proof = f.bind(CURRENT);
  const result = spawnSync(f.env.RYUGI_HOOK_BIN, ['codex-stop'], {
    cwd: f.project,
    env: f.env,
    input: JSON.stringify({ session_id: CURRENT, cwd: f.project, hook_event_name: 'SessionEnd' }),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  f.run(['--ryugi-session', proof, 'start', '--artifact', 'document/ended']);
  assert.deepEqual(f.read('codex', CURRENT), []);
  assert.deepEqual(f.read('codex', PARENT), []);
});

// process.title supplies a real Codex-named fixture host to POSIX ps. Windows
// reports the executable name instead and needs an actual codex.exe host.
test(
  'a short-lived command wrapper cannot become the owner of the hook session',
  { skip: process.platform === 'win32' },
  (t) => {
    const f = fixture(t);
    const previousTitle = process.title;
    process.title = 'codex';
    t.after(() => (process.title = previousTitle));
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `const {spawnSync}=require('node:child_process');
const r=spawnSync(${JSON.stringify(f.env.RYUGI_HOOK_BIN)},['codex-bind'],{
  input:${JSON.stringify(JSON.stringify({ session_id: CURRENT, cwd: f.project, hook_event_name: 'SessionStart' }))},
  encoding:'utf8'
});
process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exitCode=r.status;`,
      ],
      { cwd: f.project, env: f.env, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const proof = result.stdout.match(/--ryugi-session ([a-f0-9:-]+)/)?.[1];
    assert.ok(proof, 'the hook did not supply a bound invocation');
    f.run(['--ryugi-session', proof, 'start', '--artifact', 'document/wrapped']);
    assert.deepEqual(f.read('codex', CURRENT), ['document/wrapped']);
    assert.deepEqual(f.read('codex', PARENT), []);
  },
);

test('an Antigravity session subscribes as Antigravity even with inherited Codex/Claude vars', (t) => {
  const f = fixture(t);
  f.run(['start', '--artifact', 'document/agy-plan'], {
    ANTIGRAVITY_AGENT: '1',
    ANTIGRAVITY_CONVERSATION_ID: CURRENT,
    CLAUDE_CODE_SESSION_ID: PARENT,
  });
  assert.deepEqual(f.read('antigravity', CURRENT), ['document/agy-plan']);
  assert.deepEqual(f.read('claude', PARENT), []);
});

function defaultHubIn(t) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-home-')));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const scratch = path.join(home, 'scratch');
  const hub = startFakeApi(t, scratch);
  fs.mkdirSync(path.join(home, '.ryugi', 'server'), { recursive: true });
  fs.copyFileSync(
    path.join(scratch, '.ryugi', 'artifacts', '.state', 'server-info'),
    path.join(home, '.ryugi', 'server', 'server-info'),
  );
  const subscribed = () =>
    hub
      .requests()
      .filter((request) => request.path === '/api/agent/subscribe')
      .map(({ body }) => [body.host, body.session, body.project, body.artifact]);
  return { home, subscribed };
}

test('a command pointed at an isolated hub also subscribes on the default hub the session listens to', (t) => {
  const f = fixture(t);
  const fallback = defaultHubIn(t);
  f.run(['start', '--artifact', 'document/verify'], {
    HOME: fallback.home,
    CLAUDE_CODE_SESSION_ID: CURRENT,
    RYUGI_SERVER_HOME: path.join(fallback.home, 'isolated'),
  });
  assert.deepEqual(f.read('claude', CURRENT), ['document/verify']);
  assert.deepEqual(fallback.subscribed(), [['claude', CURRENT, f.project, 'document/verify']]);
});

test('a command on the default hub subscribes there once', (t) => {
  const f = fixture(t);
  const fallback = defaultHubIn(t);
  f.run(['start', '--artifact', 'document/plain'], {
    HOME: fallback.home,
    CLAUDE_CODE_SESSION_ID: CURRENT,
    RYUGI_SERVER_HOME: path.join(fallback.home, '.ryugi', 'server'),
  });
  assert.deepEqual(f.read('claude', CURRENT), ['document/plain']);
  assert.deepEqual(fallback.subscribed(), []);
});
