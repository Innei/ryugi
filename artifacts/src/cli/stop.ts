import fs from 'node:fs';
import type { CommandSpec } from './command';
import { projectPaths } from './paths';
import { alive, hasServerId, readText, waitForExit } from './process';
import type { Emit } from './start';

export async function stop(projectDir: string, emit: Emit): Promise<number> {
  const paths = projectPaths(projectDir);
  const markStopped = (reason: string) => {
    fs.rmSync(paths.info, { force: true });
    fs.mkdirSync(paths.state, { recursive: true });
    fs.writeFileSync(paths.stopped, `${JSON.stringify({ reason, timestamp: Math.floor(Date.now() / 1000) })}\n`);
  };
  const pid = Number(readText(paths.pid));
  if (readText(paths.pid) === null) {
    emit({ status: 'not_running' });
    return 0;
  }
  const id = readText(paths.serverId) ?? '';
  if (!Number.isInteger(pid) || pid <= 0 || !/^[A-Za-z0-9_-]{32,64}$/.test(id) || !hasServerId(pid, id)) {
    fs.rmSync(paths.pid, { force: true });
    fs.rmSync(paths.serverId, { force: true });
    markStopped('stale_pid');
    emit({ status: 'stale_pid' });
    return 0;
  }
  try { process.kill(pid, 'SIGTERM'); } catch {}
  if (!(await waitForExit(pid, 2000))) {
    try { process.kill(pid, 'SIGKILL'); } catch {}
    await waitForExit(pid, 1000);
  }
  if (alive(pid)) {
    emit({ status: 'failed', error: 'process still running' });
    return 1;
  }
  for (const file of [paths.pid, paths.serverId, paths.log, paths.owners]) fs.rmSync(file, { force: true });
  markStopped('stop');
  emit({ status: 'stopped' });
  return 0;
}

export const stopCommand: CommandSpec = {
  name: 'stop',
  summary: 'Stop the project\'s artifacts server; the artifacts are kept',
  usage: ['[project-directory] [options]'],
  options: {},
  positionals: 1,
  run: ({ values, positionals }, emit) => stop((values['project-dir'] as string | undefined) ?? positionals[0] ?? process.cwd(), emit),
};
