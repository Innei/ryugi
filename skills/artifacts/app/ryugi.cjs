#!/usr/bin/env node
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const nodeCrypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const outputBootstrap = require('./output-bootstrap.cjs');

const LATEST_CHECK_MS = 24 * 60 * 60 * 1000;
const RETRY_CHECK_MS = 60 * 60 * 1000;
const RELEASES = path.join(
  process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'),
  'ryugi',
  'artifacts',
);
const LATEST_FILE = path.join(RELEASES, 'latest.json');
const PLUGIN_ROOT = path.join(__dirname, '..', '..', '..');
const HOOK_CACHE = path.join(
  process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'),
  'ryugi',
  'hook',
);
const HOOK_RELEASE = 'https://github.com/Innei/ryugi/releases/download';
const HOOK_ASSETS = { 'darwin-arm64': 1, 'linux-x64': 1, 'linux-arm64': 1 };
const win32 = process.platform === 'win32';

const valid = (v) => /^\d+\.\d+\.\d+(?:[-+][0-9A-Z.-]+)?$/i.test(v || '');
const parts = (v) => v.split(/[-+]/)[0].split('.').map(Number);
const compare = (a, b) => {
  const x = parts(a),
    y = parts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};
const cliOf = (version) =>
  path.join(RELEASES, version, 'node_modules', 'ryugi-artifacts', 'dist', 'cli.cjs');
const protocolChecks = new Map();
function usesOutputProtocol(cli) {
  if (protocolChecks.has(cli)) return protocolChecks.get(cli);
  const probe = spawnSync(process.execPath, [cli, '--version', '--format', 'json'], {
    env: { ...process.env, RYUGI_NO_UPDATE_CHECK: '1' },
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 64 * 1024,
  });
  let accepted = false;
  try {
    const value = JSON.parse(probe.stdout);
    accepted =
      probe.status === 0 &&
      value.schema === 'ryugi.cli/v1' &&
      value.command === 'version' &&
      value.outcome === 'success' &&
      Array.isArray(value.data?.capabilities) &&
      value.data.capabilities.includes('reviewBundlesV1');
  } catch {}
  protocolChecks.set(cli, accepted);
  return accepted;
}
function requireOutputProtocol(cli) {
  if (!usesOutputProtocol(cli))
    throw new LaunchError(
      `The installed CLI does not provide ryugi.cli/v1 with reviewBundlesV1. Install a current ryugi-artifacts release or rebuild the local CLI.`,
    );
}

// The local checkout has no release version. Fingerprint the code that affects
// the running server so start replaces an older process instead of reusing it.
function localVersion() {
  const hash = nodeCrypto.createHash('sha256');
  for (const name of ['cli.cjs', 'server.cjs']) {
    try {
      hash.update(`${name}\0`);
      hash.update(fs.readFileSync(path.join(__dirname, name)));
    } catch {}
  }
  return `local-${hash.digest('hex').slice(0, 12)}`;
}

class LaunchError extends Error {}

// Best effort: a sandbox with a read-only cache can still run a release that is already installed.
function record(version, checkedAt) {
  try {
    fs.mkdirSync(RELEASES, { recursive: true });
    const tmp = `${LATEST_FILE}.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify({ version, checkedAt }));
    fs.renameSync(tmp, LATEST_FILE);
  } catch {}
}

function cachedLatest() {
  try {
    const { version, checkedAt } = JSON.parse(fs.readFileSync(LATEST_FILE, 'utf8'));
    if (
      valid(version) &&
      Date.now() - checkedAt < LATEST_CHECK_MS &&
      (!fs.existsSync(cliOf(version)) || usesOutputProtocol(cliOf(version)))
    )
      return version;
  } catch {}
  return null;
}

function newestInstalled() {
  let names = [];
  try {
    names = fs.readdirSync(RELEASES);
  } catch {}
  return (
    names
      .filter((v) => valid(v) && fs.existsSync(cliOf(v)) && usesOutputProtocol(cliOf(v)))
      .sort(compare)
      .pop() || null
  );
}

// npm is npm.cmd on Windows and needs cmd, which splits unquoted arguments on spaces (C:\Users\Jane Doe).
function npmCommand(args, windows) {
  if (!windows) return { file: 'npm', args, shell: false };
  return {
    file: ['npm', ...args.map((arg) => `"${arg.replaceAll('"', '""')}"`)].join(' '),
    args: [],
    shell: true,
  };
}

function npm(args) {
  const { file, args: argv, shell } = npmCommand(args, win32);
  return spawnSync(file, argv, { encoding: 'utf8', shell, maxBuffer: 16 * 1024 * 1024 });
}

const NEEDS_NETWORK = `network access and a writable ${RELEASES}, so rerun outside the sandbox`;

function askNpm() {
  const result = npm([
    'view',
    'ryugi-artifacts',
    'version',
    '--prefer-online',
    '--fetch-retries=0',
    '--fetch-timeout=10000',
  ]);
  const version = result.status === 0 ? (result.stdout || '').trim().split('\n').pop().trim() : '';
  return valid(version) ? version : null;
}

function fallback(reason) {
  const installed = newestInstalled();
  if (!installed) throw new LaunchError(`${reason} No cached CLI provides ryugi.cli/v1.`);
  record(installed, Date.now() - LATEST_CHECK_MS + RETRY_CHECK_MS);
  return installed;
}

function install(version) {
  if (fs.existsSync(cliOf(version))) {
    requireOutputProtocol(cliOf(version));
    return version;
  }
  const target = path.join(RELEASES, version);
  const staging = `${target}.install.${process.pid}`;
  try {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
  } catch {
    return fallback(
      `Could not install ryugi-artifacts@${version}; the first start of each version needs ${NEEDS_NETWORK}.`,
    );
  }
  const result = npm([
    'install',
    '--prefix',
    staging,
    '--no-save',
    '--no-package-lock',
    '--no-audit',
    '--no-fund',
    '--loglevel=error',
    `ryugi-artifacts@${version}`,
  ]);
  if (
    result.status !== 0 ||
    !fs.existsSync(path.join(staging, 'node_modules', 'ryugi-artifacts', 'dist', 'cli.cjs'))
  ) {
    fs.rmSync(staging, { recursive: true, force: true });
    return fallback(
      `Could not install ryugi-artifacts@${version} from npm; the first start of each version needs ${NEEDS_NETWORK}. npm said: ${(result.stderr || result.stdout || '').trim()}`,
    );
  }
  try {
    fs.renameSync(staging, target);
  } catch {}
  fs.rmSync(staging, { recursive: true, force: true });
  if (!fs.existsSync(cliOf(version)))
    throw new LaunchError(
      `Installed ryugi-artifacts@${version} but could not move it into ${target}`,
    );
  requireOutputProtocol(cliOf(version));
  return version;
}

function resolveRelease() {
  const cached = cachedLatest();
  if (cached) return install(cached);
  const latest = askNpm();
  if (!latest)
    return fallback(
      `Could not reach npm for the latest ryugi-artifacts; the first start needs ${NEEDS_NETWORK}.`,
    );
  record(latest, Date.now());
  return install(latest);
}

function ownerPid() {
  if (win32) return null;
  const result = spawnSync('ps', ['-o', 'ppid=', '-p', String(process.ppid)], { encoding: 'utf8' });
  const parent = Number((result.stdout || '').trim());
  return Number.isInteger(parent) && parent > 1 ? parent : process.ppid;
}

function pluginVersion() {
  return ['package.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json']
    .map((file) => {
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, file), 'utf8'));
        return manifest.name === 'ryugi' ? manifest.version || null : null;
      } catch {
        return null;
      }
    })
    .find(Boolean);
}

const executable = (file) => {
  try {
    return fs.statSync(file).isFile() && (fs.statSync(file).mode & 0o111) !== 0;
  } catch {
    return false;
  }
};

function hookBin() {
  if (process.env.RYUGI_HOOK_BIN)
    return executable(process.env.RYUGI_HOOK_BIN) ? process.env.RYUGI_HOOK_BIN : null;
  const local = path.join(PLUGIN_ROOT, 'hook', 'target', 'release', 'ryugi-hook');
  if (executable(local)) return local;
  const version = pluginVersion();
  const cached = version && path.join(HOOK_CACHE, version, 'ryugi-hook');
  return cached && executable(cached) ? cached : null;
}

function requestHookInstall() {
  try {
    spawn(process.execPath, [__filename, 'hook-install'], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } catch {}
}

const sha256 = (bytes) => nodeCrypto.createHash('sha256').update(bytes).digest('hex');

async function fetchOk(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw Object.assign(new Error(`${url}: HTTP ${res.status}`), { status: res.status });
  return res;
}

function pruneHooks(current) {
  let names = [];
  try {
    names = fs.readdirSync(HOOK_CACHE).filter(valid);
  } catch {}
  const older = names.filter((v) => v !== current && compare(v, current) <= 0).sort(compare);
  older.pop();
  for (const name of older)
    fs.rmSync(path.join(HOOK_CACHE, name), { recursive: true, force: true });
}

// A 404 is a release whose binaries are still uploading, so it is asked again sooner than other failures.
async function hookInstall() {
  const asset = HOOK_ASSETS[`${process.platform}-${process.arch}`]
    ? `ryugi-hook-${process.platform}-${process.arch}`
    : null;
  const version = pluginVersion() || newestInstalled();
  if (!asset || !valid(version)) return;
  const dir = path.join(HOOK_CACHE, version);
  const target = path.join(dir, 'ryugi-hook');
  if (executable(target)) return;
  fs.mkdirSync(dir, { recursive: true });
  const failed = path.join(dir, '.failed');
  try {
    const last = JSON.parse(fs.readFileSync(failed, 'utf8'));
    if (Date.now() - last.at < (last.status === 404 ? 5 : 60) * 60 * 1000) return;
  } catch {}
  const lock = path.join(dir, '.lock');
  try {
    fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
  } catch {
    try {
      if (Date.now() - fs.statSync(lock).mtimeMs < 5 * 60 * 1000) return;
      fs.rmSync(lock, { force: true });
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
    } catch {
      return;
    }
  }
  try {
    const base = `${(process.env.RYUGI_HOOK_RELEASE_BASE || HOOK_RELEASE).replace(/\/+$/, '')}/v${version}/${asset}`;
    const bytes = Buffer.from(await (await fetchOk(base)).arrayBuffer());
    const expected = (await (await fetchOk(`${base}.sha256`)).text())
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase();
    if (expected !== sha256(bytes)) throw new Error(`${asset} failed its sha256 check`);
    const temp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temp, bytes, { mode: 0o755 });
    fs.chmodSync(temp, 0o755);
    fs.renameSync(temp, target);
    fs.rmSync(failed, { force: true });
    pruneHooks(version);
  } catch (error) {
    try {
      fs.writeFileSync(failed, JSON.stringify({ at: Date.now(), status: error.status ?? null }));
    } catch {}
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === 'hook-install') {
    void hookInstall();
    return;
  }
  let sessionProof;
  const proofIndex = args.indexOf('--ryugi-session');
  if (proofIndex >= 0) {
    sessionProof = args[proofIndex + 1];
    if (!/^[\da-f-]{36}:[\da-f-]{36}$/i.test(sessionProof || ''))
      throw new LaunchError(
        'The Ryugi session binding is invalid. Use the launcher supplied by the current session hook.',
      );
    args.splice(proofIndex, 2);
  }
  const selection = outputBootstrap.resolveSelection(args);
  if (selection.error) {
    outputBootstrap.reportFailure(args, selection.error, selection);
    return;
  }
  const local = path.join(__dirname, 'cli.cjs');
  const env = {
    ...process.env,
    RYUGI_ARTIFACTS_COMMAND: `node "${__filename}"${sessionProof ? ` --ryugi-session ${sessionProof}` : ''}`,
  };
  let cli = local;
  if (!fs.existsSync(local)) {
    const version = resolveRelease();
    cli = cliOf(version);
    env.RYUGI_ARTIFACTS_VERSION = version;
  } else if (!env.RYUGI_ARTIFACTS_VERSION) {
    env.RYUGI_ARTIFACTS_VERSION = localVersion();
  }
  requireOutputProtocol(cli);
  let hook = hookBin();
  const marked =
    sessionProof ||
    process.env.CODEX_THREAD_ID ||
    process.env.CLAUDE_CODE_SESSION_ID ||
    process.env.PI_SESSION_ID ||
    process.env.ANTIGRAVITY_CONVERSATION_ID;
  // A command that may subscribe waits for a first download: without the binary it records no subscription.
  if (!hook && marked && (args[0] === 'start' || args[0] === 'comment')) {
    spawnSync(process.execPath, [__filename, 'hook-install'], { stdio: 'ignore', timeout: 40000 });
    hook = hookBin();
  }
  let subscription = null;
  if (hook) {
    const prepared = spawnSync(
      hook,
      ['launch-prepare', ...(sessionProof ? ['--ryugi-session', sessionProof] : []), '--', ...args],
      {
        encoding: 'utf8',
        env: { ...process.env, RYUGI_PLUGIN_ROOT: PLUGIN_ROOT },
        stdio: ['ignore', 'pipe', 'inherit'],
        timeout: 15000,
      },
    );
    try {
      subscription = prepared.stdout.trim() ? JSON.parse(prepared.stdout) : null;
    } catch {}
  } else if (marked) {
    requestHookInstall();
  }
  const given = Number(env.RYUGI_ARTIFACTS_OWNER);
  const owner = Number.isInteger(given) && given > 1 ? given : ownerPid();
  if (owner) env.RYUGI_ARTIFACTS_OWNER = String(owner);
  const child = spawn(process.execPath, [cli, ...args], { env, stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('close', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
    // The hub is running only once the CLI command has returned, so the subscription follows it.
    if (subscription && hook)
      spawnSync(hook, ['subscribe'], {
        input: JSON.stringify(subscription),
        stdio: ['pipe', 'ignore', 'inherit'],
        timeout: 15000,
      });
  });
}

// Copied on its own into installs, so it cannot require process-title.cjs.
function setLauncherTitle() {
  if (win32) return;
  const version = pluginVersion();
  process.title = version ? `Ryugi launcher (${version})` : 'Ryugi launcher';
}

function run() {
  setLauncherTitle();
  try {
    main();
  } catch (err) {
    outputBootstrap.reportFailure(process.argv.slice(2), err);
  }
}

if (require.main === module) run();

module.exports = { npmCommand, run };
