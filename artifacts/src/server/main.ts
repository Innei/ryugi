import { exec } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { version } from '../../package.json';
import { openBrowser } from './browser-focus';
import { credentialsFile } from './credentials';
import { startHub } from './hub';
import { parseEnv } from './lifecycle';
import { ensureHome, machinePaths } from './machine';
import { pinLauncherRelease, relaunchCommand, spawnAfterExit } from './relaunch';
import { writeJsonAtomic } from './state';
import { createUpdateCheck } from './update-check';

const UPDATE_POLL_MS = 60 * 60 * 1000;

function machineKey(file: string) {
  try {
    const key = fs.readFileSync(file, 'utf8').trim();
    if (/^[a-f0-9]{48}$/.test(key)) return key;
  } catch {}
  const key = crypto.randomBytes(24).toString('hex');
  fs.writeFileSync(file, `${key}\n`, { mode: 0o600 });
  return key;
}

async function main() {
  const config = parseEnv(process.env, process.argv.slice(2));
  const paths = machinePaths();
  ensureHome(paths.home);
  const updates = createUpdateCheck({
    cacheFile: path.join(paths.home, 'latest.json'),
    current: version,
  });
  const hub = await startHub({
    host: config.host,
    urlHost: config.urlHost,
    viewerDir: path.join(__dirname, 'viewer'),
    runtimeDir: path.join(__dirname, 'runtime'),
    ports: config.ports,
    boardPorts: config.boardPorts,
    paths,
    token: machineKey(paths.key),
    version,
    latest: () => updates.latest(),
    cloud: {
      origin: config.cloudOrigin,
      credentialsFile: credentialsFile(process.env, process.platform, os.homedir()),
    },
    relay: { url: `${config.cloudOrigin.replace(/^http/, 'ws')}/api/relay/host`, version },
    control: {
      stop: () => void shutdown('stop'),
      relaunch: (upgrade) => relaunch(upgrade),
    },
    open: async (link, local, openCmd) => {
      const command = openCmd ?? config.openCmd;
      if (command) {
        exec(`${command} ${JSON.stringify(link)}`, () => {});
        return;
      }
      await openBrowser(link, [local]).catch((error: Error) => {
        console.error(JSON.stringify({ type: 'browser-open-error', error: error.message }));
      });
    },
  });

  if (process.env.RYUGI_NO_UPDATE_CHECK !== '1') {
    void updates.refresh();
    setInterval(() => void updates.refresh(), UPDATE_POLL_MS).unref();
  }

  let stopping = false;
  async function shutdown(reason: string, intended = true) {
    if (stopping) return;
    stopping = true;
    console.info(JSON.stringify({ type: 'server-stopped', reason }));
    fs.rmSync(paths.info, { force: true });
    if (intended) writeJsonAtomic(paths.stopped, { reason, timestamp: Date.now() });
    await hub.close();
    process.exit(0);
  }

  function readRunningVersion() {
    try {
      return fs.readFileSync(paths.version, 'utf8').trim() || version;
    } catch {
      return version;
    }
  }

  function relaunch(upgrade: boolean) {
    const command = relaunchCommand(process.env, __dirname);
    const project = hub.projects()[0]?.dir;
    const latest = updates.latest();
    const throughLauncher = Boolean(process.env.RYUGI_ARTIFACTS_LAUNCHER);
    if (!command || !project || (upgrade && (!latest || !throughLauncher))) return false;
    try {
      if (upgrade && latest) pinLauncherRelease(process.env, os.homedir(), latest);
    } catch {
      return false;
    }
    const env = { ...process.env };
    delete env.CODEX_CI;
    if (!throughLauncher) env.RYUGI_ARTIFACTS_VERSION = readRunningVersion();
    spawnAfterExit(
      process.pid,
      [
        ...command,
        'start',
        '--json',
        '--no-open',
        '--project-dir',
        project,
        '--host',
        config.host,
        '--url-host',
        config.urlHost,
        '--port',
        String(hub.port),
      ],
      env,
    );
    setImmediate(() => void shutdown(upgrade ? 'upgrade' : 'restart', false));
    return true;
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGHUP', () => void shutdown('SIGHUP'));

  fs.rmSync(paths.stopped, { force: true });
  const started = {
    type: 'server-started',
    url: hub.url,
    port: hub.port,
    boardPort: hub.boardPort,
    version,
    pid: process.pid,
    host: config.host,
    urlHost: config.urlHost,
    cloudOrigin: config.cloudOrigin,
  };
  writeJsonAtomic(paths.info, started);
  console.info(JSON.stringify(started));
}

main().catch((err) => {
  console.info(JSON.stringify({ type: 'server-error', error: (err as Error).message }));
  process.exit(1);
});
