import { exec } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startArtifactsServer } from './app';
import { openBrowser } from './browser-focus';
import { credentialsFile } from './credentials';
import { isLoopback, liveOwners, parseEnv, processAlive, readOwners, shutdownReason } from './lifecycle';
import { openReady } from './ready';
import { registryDir, removeEntry, touchEntry, writeEntry, type RegistryEntry } from './registry';
import { writeJsonAtomic } from './state';
import { version } from '../../package.json';

async function main() {
  const config = parseEnv(process.env, process.argv.slice(2));
  const root = path.resolve(config.root);
  const stateDir = path.join(root, '.state');
  const server = await startArtifactsServer({
    root,
    viewerDir: path.join(__dirname, 'viewer'),
    runtimeDir: path.join(__dirname, 'runtime'),
    host: config.host,
    urlHost: config.urlHost,
    configFile: path.join(path.dirname(root), 'config.json'),
    cloud: { origin: config.cloudOrigin, credentialsFile: credentialsFile(process.env, process.platform, os.homedir()) },
    relay: { url: `${config.cloudOrigin.replace(/^http/, 'ws')}/api/relay/host`, version },
  });

  let lastActivity = Date.now();
  server.onActivity(() => {
    lastActivity = Date.now();
  });

  let browserOpened = false;
  server.onArtifactChange(async (ref, payload) => {
    if (browserOpened || !config.open || !isLoopback(config.host)) return;
    if (config.openArtifact && `${ref.type}/${ref.id}` !== config.openArtifact) return;
    if ('canvas' in payload ? !openReady(payload) : payload.warnings.length > 0) return;
    browserOpened = true;
    const link = await server.cloudLinkFor(ref.type, ref.id) ?? server.linkFor(ref.type, ref.id);
    if (config.openCmd) {
      exec(`${config.openCmd} ${JSON.stringify(link)}`, () => {});
      return;
    }
    await openBrowser(link, [server.linkFor(ref.type, ref.id)]).catch((error: Error) => {
      console.error(JSON.stringify({ type: 'browser-open-error', error: error.message }));
    });
  });

  const registry = registryDir();
  const entry: RegistryEntry | null = config.serverId
    ? { project: path.dirname(path.dirname(root)), root, pid: process.pid, serverId: config.serverId, startedAt: Date.now() }
    : null;
  const quietly = (fn: () => void) => {
    try { fn(); } catch {}
  };

  let stopping = false;
  const shutdown = async (reason: string) => {
    if (stopping) return;
    stopping = true;
    console.log(JSON.stringify({ type: 'server-stopped', reason }));
    fs.rmSync(path.join(stateDir, 'server-info'), { force: true });
    writeJsonAtomic(path.join(stateDir, 'server-stopped'), { reason, timestamp: Date.now() });
    if (entry) quietly(() => removeEntry(registry, entry));
    await server.close();
    process.exit(0);
  };

  const ownersFile = path.join(stateDir, 'owners');
  const timer = setInterval(() => {
    const owners = readOwners(ownersFile);
    const reason = shutdownReason({
      now: Date.now(),
      lastActivity,
      idleTimeoutMs: config.idleTimeoutMs,
      ownersAlive: owners.length === 0 || liveOwners(owners, processAlive).length > 0,
    });
    if (reason) void shutdown(reason);
    else if (entry) quietly(() => touchEntry(registry, entry));
  }, config.lifecycleCheckMs);
  timer.unref();

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGHUP', () => void shutdown('SIGHUP'));

  fs.rmSync(path.join(stateDir, 'server-stopped'), { force: true });
  if (entry) quietly(() => writeEntry(registry, entry));
  console.log(JSON.stringify({ type: 'server-started', url: server.url, port: server.port, root }));
}

main().catch((err) => {
  console.log(JSON.stringify({ type: 'server-error', error: (err as Error).message }));
  process.exit(1);
});
