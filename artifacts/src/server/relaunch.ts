import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const LAUNCHER_COMMAND = /^node "(.+)"$/;

const WAIT_THEN_RUN = `
const [pid, file, ...args] = process.argv.slice(1);
const gone = () => { try { process.kill(Number(pid), 0); return false; } catch { return true; } };
const tick = () => {
  if (!gone()) return setTimeout(tick, 100);
  require('child_process').spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
};
tick();
`;

export function relaunchCommand(env: NodeJS.ProcessEnv, serverDir: string): string[] | null {
  const launcher = LAUNCHER_COMMAND.exec(env.RYUGI_ARTIFACTS_LAUNCHER ?? '')?.[1];
  if (launcher) return [process.execPath, launcher];
  const cli = path.join(serverDir, 'cli.cjs');
  return fs.existsSync(cli) ? [process.execPath, cli] : null;
}

export function pinLauncherRelease(
  env: NodeJS.ProcessEnv,
  homedir: string,
  version: string,
  now = Date.now(),
) {
  const releases = path.join(
    env.XDG_CACHE_HOME || path.join(homedir, '.cache'),
    'ryugi',
    'artifacts',
  );
  fs.mkdirSync(releases, { recursive: true });
  const file = path.join(releases, 'latest.json');
  const tmp = `${file}.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({ version, checkedAt: now }));
  fs.renameSync(tmp, file);
}

export function spawnAfterExit(pid: number, argv: string[], env: NodeJS.ProcessEnv = process.env) {
  const [file, ...args] = argv;
  if (!file) return;
  spawn(process.execPath, ['-e', WAIT_THEN_RUN, String(pid), file, ...args], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env,
  }).unref();
}
