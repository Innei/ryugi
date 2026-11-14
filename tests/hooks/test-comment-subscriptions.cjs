'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

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
  for (const name of fs.readdirSync(source))
    if (name.endsWith('.cjs') && !['cli.cjs', 'server.cjs'].includes(name))
      fs.copyFileSync(path.join(source, name), path.join(app, name));
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
    RYUGI_CODEX_REMOTE: 'unix:///tmp/ryugi-subscriptions-no-server.sock',
  };
  for (const key of [
    'CLAUDE_CODE_SESSION_ID',
    'PI_SESSION_ID',
    'CODEX_APP_TOOLS_PIPE_PATH',
    'CODEX_MCP_NODE_PATH',
    'CODEX_APP_TOOLS_CALLER_HOST_ID',
  ])
    delete env[key];
  const bind = (session = CURRENT, overrides = {}) => {
    const result = spawnSync(
      process.execPath,
      [path.join(app, 'codex-comment-watch.cjs'), 'bind'],
      {
        cwd: project,
        env: { ...env, ...overrides },
        input: JSON.stringify({
          session_id: session,
          cwd: project,
          hook_event_name: 'SessionStart',
        }),
        encoding: 'utf8',
      },
    );
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
  const file = (host = 'codex', session = CURRENT) =>
    path.join(project, '.ryugi/artifacts/.state', `${host}-comment-watch`, `${session}.json`);
  const read = (host, session) =>
    fs.existsSync(file(host, session))
      ? JSON.parse(fs.readFileSync(file(host, session), 'utf8')).artifacts
      : [];
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
  return { app, bind, env, file, hook, project, read, run };
}

for (const event of ['SessionStart', 'UserPromptSubmit'])
  test(`${event} binds the hook session before the launcher can open a page`, (t) => {
    const f = fixture(t);
    f.hook(event);
    f.run(['start', '--artifact', 'document/bound']);
    assert.deepEqual(f.read('codex', CURRENT), ['document/bound']);
    assert.deepEqual(f.read('codex', PARENT), []);
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
  const barrier = path.join(f.env.XDG_CACHE_HOME, 'barrier');
  fs.mkdirSync(barrier, { recursive: true });
  const preload = path.join(barrier, 'preload.cjs');
  const binding = path.join(
    f.env.XDG_CACHE_HOME,
    'ryugi/codex-comment-watch/contexts',
    `${CURRENT}.json`,
  );
  fs.writeFileSync(
    preload,
    `const fs=require('node:fs');
const read=fs.readFileSync;
fs.readFileSync=function(file,...args){
  try{return read.call(this,file,...args);}catch(error){
    if(file===${JSON.stringify(binding)}&&error.code==='ENOENT'){
      fs.writeFileSync(${JSON.stringify(barrier)}+'/'+process.pid+'.ready','');
      const deadline=Date.now()+5000;
      while(fs.readdirSync(${JSON.stringify(barrier)}).filter(f=>f.endsWith('.ready')).length<2){
        if(Date.now()>deadline)throw new Error('concurrent hook barrier timed out');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);
      }
    }
    throw error;
  }
};`,
  );
  const runHook = () =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--require', preload, path.join(f.app, 'codex-comment-watch.cjs'), 'bind'],
        {
          cwd: f.project,
          env: f.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      let output = '';
      let errors = '';
      child.stdout.on('data', (chunk) => (output += chunk));
      child.stderr.on('data', (chunk) => (errors += chunk));
      child.on('error', reject);
      child.on('exit', (code) => {
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
  const result = spawnSync(
    process.execPath,
    [path.join(f.app, 'codex-comment-watch.cjs'), 'stop'],
    {
      cwd: f.project,
      env: f.env,
      input: JSON.stringify({ session_id: CURRENT, cwd: f.project, hook_event_name: 'SessionEnd' }),
      encoding: 'utf8',
    },
  );
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
const r=spawnSync(process.execPath,[${JSON.stringify(path.join(f.app, 'codex-comment-watch.cjs'))},'bind'],{
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
