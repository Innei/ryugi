import { exec, execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { startArtboardServer } from './app';
import { browserLauncher, isLoopback, parseEnv, processAlive, shutdownReason } from './lifecycle';
import { writeJsonAtomic } from './state';

async function main() {
  const config = parseEnv(process.env, process.argv.slice(2));
  const boardDir = path.resolve(config.boardDir);
  const stateDir = path.join(boardDir, 'state');
  const server = await startArtboardServer({
    boardDir,
    viewerDir: path.join(__dirname, 'viewer'),
    host: config.host,
    urlHost: config.urlHost,
  });

  let lastActivity = Date.now();
  server.onActivity(() => {
    lastActivity = Date.now();
  });

  let browserOpened = false;
  server.onBoardChange((payload) => {
    if (browserOpened || !config.open || !isLoopback(config.host)) return;
    if (!payload.canvas || Object.keys(payload.canvas.boards ?? {}).length === 0) return;
    browserOpened = true;
    if (server.clientCount() > 0) return;
    if (config.openCmd) {
      exec(`${config.openCmd} ${JSON.stringify(server.url)}`, () => {});
      return;
    }
    const launcher = browserLauncher(process.platform, server.url);
    if (launcher) execFile(launcher.bin, launcher.args, () => {});
  });

  const shutdown = async (reason: string) => {
    console.log(JSON.stringify({ type: 'server-stopped', reason }));
    fs.rmSync(path.join(stateDir, 'server-info'), { force: true });
    writeJsonAtomic(path.join(stateDir, 'server-stopped'), { reason, timestamp: Date.now() });
    await server.close();
    process.exit(0);
  };

  const timer = setInterval(() => {
    const reason = shutdownReason({
      now: Date.now(),
      lastActivity,
      idleTimeoutMs: config.idleTimeoutMs,
      ownerAlive: config.ownerPid === null || processAlive(config.ownerPid),
    });
    if (reason) void shutdown(reason);
  }, config.lifecycleCheckMs);
  timer.unref();

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  fs.rmSync(path.join(stateDir, 'server-stopped'), { force: true });
  console.log(JSON.stringify({ type: 'server-started', url: server.url, port: server.port, dir: boardDir }));
}

main().catch((err) => {
  console.log(JSON.stringify({ type: 'server-error', error: (err as Error).message }));
  process.exit(1);
});
