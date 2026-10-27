#!/usr/bin/env node
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MIN_VERSION = '1.43.0';
const LATEST_CHECK_MS = 24 * 60 * 60 * 1000;
const RETRY_CHECK_MS = 60 * 60 * 1000;
const RELEASES = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'ryugi', 'artifacts');
const LATEST_FILE = path.join(RELEASES, 'latest.json');
const win32 = process.platform === 'win32';

const valid = (v) => /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(v || '');
const parts = (v) => v.split(/[-+]/)[0].split('.').map(Number);
const compare = (a, b) => {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};
const supported = (v) => valid(v) && compare(v, MIN_VERSION) >= 0;
const cliOf = (version) => path.join(RELEASES, version, 'node_modules', 'ryugi-artifacts', 'dist', 'cli.cjs');

// The local checkout has no release version. Fingerprint the code that affects
// the running server so start replaces an older process instead of reusing it.
function localVersion() {
  const hash = crypto.createHash('sha256');
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
    if (supported(version) && Date.now() - checkedAt < LATEST_CHECK_MS) return version;
  } catch {}
  return null;
}

function newestInstalled() {
  let names = [];
  try { names = fs.readdirSync(RELEASES); } catch {}
  return names.filter((v) => supported(v) && fs.existsSync(cliOf(v))).sort(compare).pop() || null;
}

// npm is npm.cmd on Windows and needs cmd, which splits unquoted arguments on spaces (C:\Users\Jane Doe).
function npmCommand(args, windows) {
  if (!windows) return { file: 'npm', args, shell: false };
  return { file: ['npm', ...args.map((arg) => `"${arg.replace(/"/g, '""')}"`)].join(' '), args: [], shell: true };
}

function npm(args) {
  const { file, args: argv, shell } = npmCommand(args, win32);
  return spawnSync(file, argv, { encoding: 'utf8', shell, maxBuffer: 16 * 1024 * 1024 });
}

const NEEDS_NETWORK = `network access and a writable ${RELEASES}, so rerun outside the sandbox`;

function askNpm() {
  const result = npm(['view', 'ryugi-artifacts', 'version', '--prefer-online', '--fetch-retries=0', '--fetch-timeout=10000']);
  const version = result.status === 0 ? (result.stdout || '').trim().split('\n').pop().trim() : '';
  return valid(version) ? version : null;
}

function fallback(reason) {
  const installed = newestInstalled();
  if (!installed) throw new LaunchError(reason);
  record(installed, Date.now() - LATEST_CHECK_MS + RETRY_CHECK_MS);
  return installed;
}

function install(version) {
  if (fs.existsSync(cliOf(version))) return version;
  const target = path.join(RELEASES, version);
  const staging = `${target}.install.${process.pid}`;
  try {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
  } catch {
    return fallback(`Could not install ryugi-artifacts@${version}; the first start of each version needs ${NEEDS_NETWORK}.`);
  }
  const result = npm(['install', '--prefix', staging, '--no-save', '--no-package-lock', '--no-audit', '--no-fund', '--loglevel=error', `ryugi-artifacts@${version}`]);
  if (result.status !== 0 || !fs.existsSync(path.join(staging, 'node_modules', 'ryugi-artifacts', 'dist', 'cli.cjs'))) {
    fs.rmSync(staging, { recursive: true, force: true });
    return fallback(`Could not install ryugi-artifacts@${version} from npm; the first start of each version needs ${NEEDS_NETWORK}. npm said: ${(result.stderr || result.stdout || '').trim()}`);
  }
  try { fs.renameSync(staging, target); } catch {}
  fs.rmSync(staging, { recursive: true, force: true });
  if (!fs.existsSync(cliOf(version))) throw new LaunchError(`Installed ryugi-artifacts@${version} but could not move it into ${target}`);
  return version;
}

function resolveRelease(command) {
  if (command !== 'start') {
    const installed = newestInstalled();
    if (installed) return installed;
  }
  const cached = cachedLatest();
  if (cached) return install(cached);
  const latest = askNpm();
  if (!latest) return fallback(`Could not reach npm for the latest ryugi-artifacts; the first start needs ${NEEDS_NETWORK}.`);
  if (!supported(latest)) {
    const installed = newestInstalled();
    if (installed) return installed;
    throw new LaunchError(`This skill needs ryugi-artifacts ${MIN_VERSION} or newer, and npm still serves ${latest}. A new release may still be processing on npm; retry in a few minutes.`);
  }
  record(latest, Date.now());
  return install(latest);
}

function ownerPid() {
  if (win32) return null;
  const result = spawnSync('ps', ['-o', 'ppid=', '-p', String(process.ppid)], { encoding: 'utf8' });
  const parent = Number((result.stdout || '').trim());
  return Number.isInteger(parent) && parent > 1 ? parent : process.ppid;
}

function main() {
  const args = process.argv.slice(2);
  const local = path.join(__dirname, 'cli.cjs');
  const env = { ...process.env, RYUGI_ARTIFACTS_COMMAND: `node "${__filename}"`, RYUGI_ARTIFACTS_RESOLVE_ROOT: '1' };
  let cli = local;
  if (!fs.existsSync(local)) {
    const version = resolveRelease(args[0]);
    cli = cliOf(version);
    env.RYUGI_ARTIFACTS_VERSION = version;
  } else if (!env.RYUGI_ARTIFACTS_VERSION) {
    env.RYUGI_ARTIFACTS_VERSION = localVersion();
  }
  const given = Number(env.RYUGI_ARTIFACTS_OWNER);
  const owner = Number.isInteger(given) && given > 1 ? given : ownerPid();
  if (owner) env.RYUGI_ARTIFACTS_OWNER = String(owner);
  const child = spawn(process.execPath, [cli, ...args], { env, stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('close', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }));
    process.exitCode = 1;
  }
}

module.exports = { npmCommand };
