import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

import { AGENT_MARKERS } from '../server/agent';
import { artifactPath } from '../server/artifact-address';
import { artifactKeyOf } from '../server/artifacts';
import { openBrowser } from '../server/browser-focus';
import { ensureHome, type MachinePaths, machinePaths, readProjects } from '../server/machine';
import { readEntries, registryDir, removeEntry } from '../server/registry';
import type { CommandSpec } from './command';
import { takeLoginHint } from './login-hint';
import {
  ARTIFACT_ERROR,
  ARTIFACT_PATTERN,
  CliError,
  invocation,
  type ProjectPaths,
  projectPaths,
} from './paths';
import { alive, hasServerId, readText, sleep, waitForExit } from './process';
import { replaceDecision } from './upgrade-rule';

declare const CLI_VERSION: string | undefined;

export interface StartOptions {
  artifact?: string;
  background: boolean;
  foreground: boolean;
  host: string;
  open: boolean;
  openExisting?: boolean;
  port?: string;
  projectDir: string;
  urlHost?: string;
}

export type Emit = (value: Record<string, unknown>) => void;

interface ServerInfo {
  cloudOrigin?: string;
  host?: string;
  port: number;
  url: string;
  urlHost?: string;
  version?: string;
}

const DEFAULT_CLOUD_ORIGIN = 'https://ryugi.innei.dev';
const RESERVE_TIMEOUT_MS = 5000;
const REGISTER_TIMEOUT_MS = 15000;
const STATUS_TIMEOUT_MS = 1000;
const START_TIMEOUT_MS = 10000;
const SETTLE_MS = 6000;

const cloudOriginOf = (env: NodeJS.ProcessEnv) =>
  (env.RYUGI_CLOUD_ORIGIN || DEFAULT_CLOUD_ORIGIN).replace(/\/+$/, '');

const loopbackUrl = (url: string) => {
  const parsed = new URL(url);
  if (parsed.hostname === 'localhost') parsed.hostname = '127.0.0.1';
  return parsed;
};

const apiUrl = (info: ServerInfo, pathname: string) => {
  const base = loopbackUrl(info.url);
  const target = new URL(pathname, base.origin);
  const key = base.searchParams.get('key');
  if (key) target.searchParams.set('key', key);
  return target.toString();
};

function withLink(info: ServerInfo, paths: ProjectPaths, artifact: string | undefined) {
  const out: Record<string, unknown> = {
    type: 'server-started',
    url: info.url,
    port: info.port,
    root: paths.root,
  };
  if (artifact) {
    const url = new URL(info.url);
    const ref = artifactKeyOf(artifact)!;
    const key = url.searchParams.get('key');
    out.link = `${url.origin}${artifactPath(paths.root, ref.type, ref.id)}${key ? `?key=${key}` : ''}`;
  }
  return out;
}

async function withCloudLink(
  out: Record<string, unknown>,
  info: ServerInfo,
  paths: ProjectPaths,
  artifact: string | undefined,
) {
  if (!artifact) return out;
  try {
    const res = await fetch(apiUrl(info, `/api/cloud/reserve/${artifact}`), {
      method: 'POST',
      headers: { 'X-Ryugi-Project': encodeURIComponent(paths.project) },
      signal: AbortSignal.timeout(RESERVE_TIMEOUT_MS),
    });
    const { url, limit } = (await res.json()) as {
      url?: unknown;
      limit?: { message?: unknown; upgradeUrl?: unknown };
    };
    if (typeof url === 'string') return { ...out, cloudLink: url };
    if (typeof limit?.upgradeUrl === 'string')
      return { ...out, cloudLimit: { message: limit.message, upgradeUrl: limit.upgradeUrl } };
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

function runningPid(machine: MachinePaths) {
  const pid = Number(readText(machine.pid));
  const id = readText(machine.serverId);
  if (!Number.isInteger(pid) || pid <= 0 || !id) return null;
  return hasServerId(pid, id) ? pid : null;
}

function readInfo(machine: MachinePaths): ServerInfo | null {
  try {
    const info = JSON.parse(readText(machine.info) ?? '') as ServerInfo;
    return typeof info.url === 'string' && Number.isInteger(info.port) ? info : null;
  } catch {
    return null;
  }
}

async function answers(info: ServerInfo) {
  try {
    const res = await fetch(apiUrl(info, '/api/status'), {
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function stopPid(pid: number, what: string) {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {}
  if (await waitForExit(pid, 7000)) return;
  try {
    process.kill(pid, 'SIGKILL');
  } catch {}
  if (await waitForExit(pid, 2000)) return;
  throw new CliError(
    `The ${what} (pid ${pid}) did not stop; stop it with \`${invocation()} stop\` and retry`,
  );
}

async function stopOldProjectServers() {
  const dir = registryDir();
  for (const entry of readEntries(dir)) {
    if (hasServerId(entry.pid, entry.serverId)) {
      try {
        process.kill(entry.pid, 'SIGTERM');
      } catch {}
      await waitForExit(entry.pid, 5000);
    }
    try {
      removeEntry(dir, entry);
    } catch {}
  }
}

// The server names agent comments after the latest session that started it; a start outside any agent keeps the last name.
function recordAgent(paths: ProjectPaths) {
  const markers = Object.fromEntries(
    AGENT_MARKERS.flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
  );
  if (Object.keys(markers).length) fs.writeFileSync(paths.agent, `${JSON.stringify(markers)}\n`);
}

function serverEnv(options: StartOptions) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ARTIFACTS_HOST: options.host,
    ARTIFACTS_URL_HOST: options.urlHost!,
  };
  if (process.env.RYUGI_ARTIFACTS_COMMAND)
    env.RYUGI_ARTIFACTS_LAUNCHER = process.env.RYUGI_ARTIFACTS_COMMAND;
  for (const key of [
    'RYUGI_ARTIFACTS_OWNER',
    'RYUGI_ARTIFACTS_VERSION',
    'RYUGI_ARTIFACTS_COMMAND',
    'ARTIFACTS_OPEN_CMD',
    'ARTIFACTS_ROOT',
  ])
    delete env[key];
  return env;
}

const startedLine = (text: string) =>
  text.split('\n').find((line) => line.includes('"server-started"'));
const errorLine = (text: string) =>
  text.split('\n').find((line) => line.includes('"server-error"'));

async function register(
  info: ServerInfo,
  paths: ProjectPaths,
  open: string | true | undefined,
): Promise<void> {
  const res = await fetch(apiUrl(info, '/api/hub/projects'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dir: paths.project,
      ...(open ? { open } : {}),
      ...(open && process.env.ARTIFACTS_OPEN_CMD
        ? { openCmd: process.env.ARTIFACTS_OPEN_CMD }
        : {}),
    }),
    signal: AbortSignal.timeout(REGISTER_TIMEOUT_MS),
  });
  if (!res.ok) throw new CliError(`The artifacts server refused this project: ${await res.text()}`);
}

export async function start(options: StartOptions, emit: Emit): Promise<number> {
  if (options.artifact !== undefined && !ARTIFACT_PATTERN.test(options.artifact))
    throw new CliError(ARTIFACT_ERROR);
  if (
    options.port !== undefined &&
    (!/^\d+$/.test(options.port) || Number(options.port) < 1 || Number(options.port) > 65535)
  )
    throw new CliError('--port must be a port number');
  options.urlHost ||=
    options.host === '127.0.0.1' || options.host === 'localhost' ? 'localhost' : options.host;
  process.umask(0o077);
  const paths = projectPaths(options.projectDir);
  const machine = machinePaths();
  ensureHome(machine.home);
  fs.mkdirSync(paths.state, { recursive: true });
  if (!fs.existsSync(path.join(paths.state, '.gitignore')))
    fs.writeFileSync(path.join(paths.state, '.gitignore'), '*\n');
  const cliVersion =
    process.env.RYUGI_ARTIFACTS_VERSION || (typeof CLI_VERSION === 'string' ? CLI_VERSION : '');
  const known = readProjects(machine.projects).some((entry) => entry.dir === paths.project);

  const finish = async (info: ServerInfo, reused: boolean, hint?: string) => {
    recordAgent(paths);
    const wantsOpen = options.open && (!reused || !known);
    await register(info, paths, wantsOpen ? (options.artifact ?? true) : undefined);
    const base = withLink(info, paths, options.artifact);
    if (reused) base.reused = true;
    if (hint) base.hint = hint;
    const out = await withCloudLink(base, info, paths, options.artifact);
    const loginHint = takeLoginHint(paths.project);
    emit(loginHint ? { ...out, loginHint } : out);
    if (
      reused &&
      known &&
      process.platform === 'darwin' &&
      options.open &&
      options.openExisting &&
      options.artifact &&
      !process.env.ARTIFACTS_OPEN_CMD
    ) {
      const local = out.link as string;
      await openBrowser(typeof out.cloudLink === 'string' ? out.cloudLink : local, [local]).catch(
        (error: Error) => console.error(error.message),
      );
    }
  };

  if (!(await acquireLock(machine.lock)))
    throw new CliError('Another start is still starting the artifacts server; retry in a moment');
  let locked = true;
  const unlock = () => {
    if (!locked) return;
    locked = false;
    try {
      fs.rmdirSync(machine.lock);
    } catch {}
  };
  try {
    const running = runningPid(machine);
    let info = readInfo(machine);
    if (running && !info) {
      for (let waited = 0; waited < SETTLE_MS && alive(running) && !info; waited += 100) {
        await sleep(100);
        info = readInfo(machine);
      }
      if (!info && alive(running)) await stopPid(running, 'stopping artifacts server');
    }
    if (running && info) {
      const runningVersion = readText(machine.version) ?? '';
      const decision = replaceDecision(runningVersion, cliVersion);
      const mismatch =
        (info.host ?? '127.0.0.1') !== options.host ||
        (info.urlHost ?? 'localhost') !== options.urlHost ||
        (info.cloudOrigin ?? DEFAULT_CLOUD_ORIGIN) !== cloudOriginOf(process.env) ||
        (options.port !== undefined && String(info.port) !== options.port);
      if (decision !== 'replace' && !mismatch && (await answers(info))) {
        unlock();
        await finish(
          info,
          true,
          decision === 'keep-older-cli'
            ? `The running server is ${runningVersion}, newer than this CLI (${cliVersion}); kept it`
            : undefined,
        );
        return 0;
      }
      await stopPid(running, 'running artifacts server');
    }
    await stopOldProjectServers();

    fs.rmSync(machine.info, { force: true });
    const id = crypto.randomBytes(24).toString('hex');
    fs.writeFileSync(machine.serverId, `${id}\n`);
    fs.writeFileSync(machine.version, `${cliVersion}\n`);
    const server = path.join(__dirname, 'server.cjs');
    const args = [
      server,
      `--artifacts-server-id=${id}`,
      ...(options.port ? [`--port=${options.port}`] : []),
    ];
    const env = serverEnv(options);
    const foreground = options.foreground || (!options.background && !!process.env.CODEX_CI);

    if (foreground) {
      const child = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'inherit'] });
      fs.writeFileSync(machine.pid, `${child.pid}\n`);
      for (const signal of ['SIGINT', 'SIGTERM'] as const)
        process.on(signal, () => child.kill('SIGTERM'));
      const exited = new Promise<number>((resolve) =>
        child.on('close', (code) => resolve(code ?? 1)),
      );
      let announced = false;
      readline.createInterface({ input: child.stdout! }).on('line', (line) => {
        let value: Record<string, unknown>;
        try {
          value = JSON.parse(line);
        } catch {
          process.stdout.write(`${line}\n`);
          return;
        }
        if (value.type !== 'server-started' || announced) {
          emit(value);
          return;
        }
        announced = true;
        unlock();
        void finish(value as unknown as ServerInfo, false).catch((error: Error) =>
          emit({ type: 'error', error: error.message }),
        );
      });
      return await exited;
    }

    const log = fs.openSync(machine.log, 'w');
    const child = spawn(process.execPath, args, {
      env,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', log, log],
    });
    fs.closeSync(log);
    child.unref();
    fs.writeFileSync(machine.pid, `${child.pid}\n`);
    for (let waited = 0; waited < START_TIMEOUT_MS; waited += 100) {
      const text = readText(machine.log) ?? '';
      const started = startedLine(text);
      if (started) {
        for (let check = 0; check < 10; check++) {
          if (!alive(child.pid!))
            throw new CliError(
              `Server started but was killed. Retry in a persistent terminal with: ${invocation()} start --project-dir ${paths.project}${options.artifact ? ` --artifact ${options.artifact}` : ''} --host ${options.host} --url-host ${options.urlHost} --foreground`,
            );
          await sleep(100);
        }
        unlock();
        await finish(JSON.parse(started) as ServerInfo, false);
        return 0;
      }
      const failed = errorLine(text);
      if (failed) {
        emit(JSON.parse(failed));
        return 1;
      }
      await sleep(100);
    }
    throw new CliError(`Server failed to start within ${START_TIMEOUT_MS / 1000} seconds`);
  } finally {
    unlock();
  }
}

export const startCommand: CommandSpec = {
  name: 'start',
  summary: "Start this machine's artifacts server if needed and register the project with it",
  options: {
    'artifact': {
      type: 'string',
      value: '<type>/<id>',
      help: 'Also print a link that opens this artifact',
    },
    'host': {
      type: 'string',
      value: '<host>',
      help: 'Interface to listen on (default: 127.0.0.1)',
    },
    'url-host': {
      type: 'string',
      value: '<host>',
      help: 'Host in printed URLs (default: localhost for a loopback --host)',
    },
    'port': {
      type: 'string',
      value: '<n>',
      help: 'Port to listen on (default: the first free of 27319-27321)',
    },
    'open': {
      type: 'boolean',
      help: 'Open or focus the artifact, including when reusing a server',
    },
    'no-open': { type: 'boolean', help: 'Do not open a browser' },
    'foreground': { type: 'boolean', help: 'Run the server in this process until Ctrl+C' },
    'no-daemon': { type: 'boolean' },
    'background': {
      type: 'boolean',
      help: 'Detach the server even where it would run in the foreground',
    },
    'daemon': { type: 'boolean' },
  },
  run: ({ values, projectDir }, emit) =>
    start(
      {
        projectDir,
        artifact: values.artifact as string | undefined,
        host: (values.host as string | undefined) ?? '127.0.0.1',
        urlHost: values['url-host'] as string | undefined,
        port: values.port as string | undefined,
        open: values['no-open'] ? false : values.open ? true : process.env.ARTIFACTS_OPEN !== '0',
        openExisting: !!values.open,
        foreground: !!(values.foreground || values['no-daemon']),
        background: !!(values.background || values.daemon),
      },
      emit,
    ),
  text: (value) =>
    value.type === 'server-started'
      ? `${value.cloudLink ?? value.link ?? value.url}${value.reused ? ' (already running)' : ''}`
      : null,
};
