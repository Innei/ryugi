import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function commandLine(pid: number): string[] | null {
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
  } catch {}
  const direct = spawnSync('ps', ['-ww', '-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  if (direct.status === 0 && direct.stdout.trim()) return direct.stdout.trim().split(/\s+/);
  const full = spawnSync('ps', ['-f', '-p', String(pid)], { encoding: 'utf8' });
  if (full.status !== 0) return null;
  const line = full.stdout.split('\n').slice(1).join(' ').trim();
  return line ? line.split(/\s+/) : null;
}

export function hasServerId(pid: number, id: string) {
  if (!alive(pid)) return false;
  // Node cannot read another process's command line on Windows; a live pid with our id file is trusted there.
  if (process.platform === 'win32') return true;
  return commandLine(pid)?.includes(`--artifacts-server-id=${id}`) ?? false;
}

export function parentOf(pid: number): number | null {
  if (process.platform === 'win32') return null;
  const result = spawnSync('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8' });
  const parent = Number(result.stdout.trim());
  return Number.isInteger(parent) && parent > 1 ? parent : null;
}

export async function waitForExit(pid: number, ms: number) {
  for (let waited = 0; waited < ms && alive(pid); waited += 100) await sleep(100);
  return !alive(pid);
}

export const readText = (file: string) => {
  try {
    return fs.readFileSync(file, 'utf8').replace(/[\r\n]+$/, '');
  } catch {
    return null;
  }
};
