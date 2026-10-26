import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { AGENT_MARKERS } from '../server/agent';
import { artifactPath } from '../server/artifact-address';
import { artifactKeyOf } from '../server/artifacts';
import { openBrowser } from '../server/browser-focus';
import { ARTIFACT_ERROR, ARTIFACT_PATTERN, CliError, invocation, projectPaths, type ProjectPaths } from './paths';
import { alive, hasServerId, parentOf, readText, sleep, waitForExit } from './process';

export interface StartOptions {
  projectDir: string;
  artifact?: string;
  host: string;
  urlHost?: string;
  idleTimeoutMinutes?: string;
  open: boolean;
  foreground: boolean;
  background: boolean;
}

export type Emit = (value: Record<string, unknown>) => void;

const windowsLike = () => process.platform === 'win32';

function withLink(info: Record<string, unknown>, artifact: string | undefined, reused: boolean) {
  const out = { ...info };
  if (reused) out.reused = true;
  if (artifact && typeof out.url === 'string') {
    const url = new URL(out.url);
    const ref = artifactKeyOf(artifact)!;
    out.link = `${url.origin}${artifactPath(String(out.root), ref.type, ref.id)}?key=${url.searchParams.get('key')}`;
  }
  return out;
}

const RESERVE_TIMEOUT_MS = 5000;

async function withCloudLink(out: Record<string, unknown>, artifact: string | undefined) {
  if (!artifact || typeof out.url !== 'string') return out;
  const server = new URL(out.url);
  if (server.hostname === 'localhost') server.hostname = '127.0.0.1';
  try {
    const res = await fetch(`${server.origin}/api/cloud/reserve/${artifact}?key=${encodeURIComponent(server.searchParams.get('key') ?? '')}`, {
      method: 'POST',
      signal: AbortSignal.timeout(RESERVE_TIMEOUT_MS),
    });
    const { url, limit } = (await res.json()) as { url?: unknown; limit?: { message?: unknown; upgradeUrl?: unknown } };
    if (typeof url === 'string') return { ...out, cloudLink: url };
    if (typeof limit?.upgradeUrl === 'string') return { ...out, cloudLimit: { message: limit.message, upgradeUrl: limit.upgradeUrl } };
    return out;
  } catch {
    return out;
  }
}

async function acquireLock(lock: string) {
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      fs.mkdirSync(lock);
      return true;
    } catch {}
    try {
      if (Date.now() - fs.statSync(lock).mtimeMs > 60_000) {
        fs.rmdirSync(lock);
        continue;
      }
    } catch {}
    await sleep(100);
  }
  return false;
}

function runningPid(paths: ProjectPaths) {
  const pid = Number(readText(paths.pid));
  const id = readText(paths.serverId);
  if (!Number.isInteger(pid) || pid <= 0 || !id) return null;
  return hasServerId(pid, id) ? pid : null;
}

function ownerPid() {
  if (windowsLike()) return null;
  const given = Number(process.env.RYUGI_ARTIFACTS_OWNER);
  if (Number.isInteger(given) && given > 1) return given;
  return parentOf(process.ppid) ?? process.ppid;
}

function registerOwner(paths: ProjectPaths) {
  const owners = new Set<number>();
  for (const line of (readText(paths.owners) ?? '').split('\n')) {
    const pid = Number(line.trim());
    if (Number.isInteger(pid) && pid > 1 && alive(pid)) owners.add(pid);
  }
  const owner = ownerPid();
  if (owner) owners.add(owner);
  const tmp = `${paths.owners}.${process.pid}`;
  fs.writeFileSync(tmp, [...owners].sort((a, b) => a - b).map((pid) => `${pid}\n`).join(''));
  fs.renameSync(tmp, paths.owners);
}

// The server names agent comments after the latest session that started it; a start outside any agent keeps the last name.
function recordAgent(paths: ProjectPaths) {
  const markers = Object.fromEntries(AGENT_MARKERS.flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])));
  if (Object.keys(markers).length) fs.writeFileSync(paths.agent, `${JSON.stringify(markers)}\n`);
}

async function replace(pid: number, paths: ProjectPaths) {
  try { process.kill(pid, 'SIGTERM'); } catch {}
  if (await waitForExit(pid, 5000)) return;
  try { process.kill(pid, 'SIGKILL'); } catch {}
  if (await waitForExit(pid, 2000)) return;
  throw new CliError(`The running server (pid ${pid}) is on another release and did not stop; stop it with \`${invocation()} stop --project-dir ${paths.project}\` and retry`);
}

function serverEnv(paths: ProjectPaths, options: StartOptions) {
  const env: NodeJS.ProcessEnv = { ...process.env, ARTIFACTS_ROOT: paths.root, ARTIFACTS_HOST: options.host, ARTIFACTS_URL_HOST: options.urlHost!, ARTIFACTS_OPEN: options.open ? '1' : '0' };
  if (options.artifact) env.ARTIFACTS_OPEN_ARTIFACT = options.artifact;
  if (options.idleTimeoutMinutes) env.ARTIFACTS_IDLE_TIMEOUT_MS = String(Number(options.idleTimeoutMinutes) * 60_000);
  delete env.RYUGI_ARTIFACTS_OWNER;
  delete env.RYUGI_ARTIFACTS_VERSION;
  delete env.RYUGI_ARTIFACTS_COMMAND;
  return env;
}

export async function start(options: StartOptions, emit: Emit): Promise<number> {
  if (options.artifact !== undefined && !ARTIFACT_PATTERN.test(options.artifact)) throw new CliError(ARTIFACT_ERROR);
  if (options.idleTimeoutMinutes !== undefined && (!/^\d+$/.test(options.idleTimeoutMinutes) || Number(options.idleTimeoutMinutes) < 1)) throw new CliError('--idle-timeout-minutes must be a positive integer');
  options.urlHost ||= options.host === '127.0.0.1' || options.host === 'localhost' ? 'localhost' : options.host;
  const foreground = options.foreground || (!options.background && (!!process.env.CODEX_CI || windowsLike()));
  process.umask(0o077);
  const paths = projectPaths(options.projectDir);
  fs.mkdirSync(paths.state, { recursive: true });
  if (!fs.existsSync(path.join(paths.state, '.gitignore'))) fs.writeFileSync(path.join(paths.state, '.gitignore'), '*\n');
  const server = path.join(__dirname, 'server.cjs');
  const version = process.env.RYUGI_ARTIFACTS_VERSION ?? '';

  if (!(await acquireLock(paths.lock))) throw new CliError('Another start for this project is still starting; retry in a moment');
  let locked = true;
  const unlock = () => {
    if (!locked) return;
    locked = false;
    try { fs.rmdirSync(paths.lock); } catch {}
  };
  try {
    const running = runningPid(paths);
    const info = readText(paths.info);
    if (running && info) {
      if (!version || readText(paths.version) === version) {
        registerOwner(paths);
        recordAgent(paths);
        const out = await withCloudLink(withLink(JSON.parse(info), options.artifact, true), options.artifact);
        emit(out);
        if (process.platform === 'darwin' && options.open && options.artifact && !process.env.ARTIFACTS_OPEN_CMD) {
          const local = out.link as string;
          await openBrowser(typeof out.cloudLink === 'string' ? out.cloudLink : local, [local]).catch((error: Error) => {
            console.error(error.message);
          });
        }
        return 0;
      }
      await replace(running, paths);
    }
    registerOwner(paths);
    recordAgent(paths);
    fs.rmSync(paths.info, { force: true });
    const id = crypto.randomBytes(24).toString('hex');
    fs.writeFileSync(paths.serverId, `${id}\n`);
    fs.writeFileSync(paths.version, `${version}\n`);
    const env = serverEnv(paths, options);
    const args = [server, `--artifacts-server-id=${id}`];

    if (foreground) {
      const child = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'inherit'] });
      fs.writeFileSync(paths.pid, `${child.pid}\n`);
      for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill('SIGTERM'));
      readline.createInterface({ input: child.stdout! }).on('line', (line) => {
        let value: Record<string, unknown>;
        try { value = JSON.parse(line); } catch { process.stdout.write(`${line}\n`); return; }
        if (value.type !== 'server-started') emit(value);
        else void withCloudLink(withLink(value, options.artifact, false), options.artifact).then(emit);
      });
      const exited = new Promise<number>((resolve) => child.on('close', (code) => resolve(code ?? 1)));
      for (let waited = 0; waited < 5000 && !fs.existsSync(paths.info); waited += 100) await sleep(100);
      unlock();
      return await exited;
    }

    const log = fs.openSync(paths.log, 'w');
    const child = spawn(process.execPath, args, { env, detached: true, stdio: ['ignore', log, log] });
    fs.closeSync(log);
    child.unref();
    fs.writeFileSync(paths.pid, `${child.pid}\n`);
    for (let waited = 0; waited < 5000; waited += 100) {
      const lines = (readText(paths.log) ?? '').split('\n');
      const started = lines.find((line) => line.includes('"server-started"'));
      if (started) {
        for (let check = 0; check < 20; check++) {
          if (!alive(child.pid!)) throw new CliError(`Server started but was killed. Retry in a persistent terminal with: ${invocation()} start --project-dir ${paths.project}${options.artifact ? ` --artifact ${options.artifact}` : ''} --host ${options.host} --url-host ${options.urlHost} --foreground`);
          await sleep(100);
        }
        emit(await withCloudLink(withLink(JSON.parse(started), options.artifact, false), options.artifact));
        return 0;
      }
      const failed = lines.find((line) => line.includes('"server-error"'));
      if (failed) {
        emit(JSON.parse(failed));
        return 1;
      }
      await sleep(100);
    }
    throw new CliError('Server failed to start within 5 seconds');
  } finally {
    unlock();
  }
}
