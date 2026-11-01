import fs from 'node:fs';
import path from 'node:path';

import { artifactsRootOf, machinePaths, readProjects } from '../server/machine';
import type { CommandSpec } from './command';
import { alive, hasServerId, readText, waitForExit } from './process';
import type { Emit } from './start';

function clearCompatInfo(projectsFile: string) {
  for (const entry of readProjects(projectsFile))
    fs.rmSync(path.join(artifactsRootOf(entry.dir), '.state', 'server-info'), { force: true });
}

export async function stop(emit: Emit): Promise<number> {
  const machine = machinePaths();
  const markStopped = (reason: string) => {
    fs.rmSync(machine.info, { force: true });
    clearCompatInfo(machine.projects);
    fs.mkdirSync(machine.home, { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      machine.stopped,
      `${JSON.stringify({ reason, timestamp: Math.floor(Date.now() / 1000) })}\n`,
    );
  };
  if (readText(machine.pid) === null) {
    emit({ status: 'not_running' });
    return 0;
  }
  const pid = Number(readText(machine.pid));
  const id = readText(machine.serverId) ?? '';
  if (!Number.isInteger(pid) || pid <= 0 || !/^[\w-]{32,64}$/.test(id) || !hasServerId(pid, id)) {
    fs.rmSync(machine.pid, { force: true });
    fs.rmSync(machine.serverId, { force: true });
    markStopped('stale_pid');
    emit({ status: 'stale_pid' });
    return 0;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {}
  if (!(await waitForExit(pid, 7000))) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
    await waitForExit(pid, 1000);
  }
  if (alive(pid)) {
    emit({ status: 'failed', error: 'process still running' });
    return 1;
  }
  for (const file of [machine.pid, machine.serverId]) fs.rmSync(file, { force: true });
  markStopped('stop');
  emit({ status: 'stopped' });
  return 0;
}

export const stopCommand: CommandSpec = {
  name: 'stop',
  summary: "Stop this machine's artifacts server; the artifacts are kept",
  usage: ['[options]'],
  options: {},
  positionals: 1,
  run: (_args, emit) => stop(emit),
};
