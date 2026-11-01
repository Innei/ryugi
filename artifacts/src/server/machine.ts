import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface MachinePaths {
  home: string;
  info: string;
  key: string;
  lock: string;
  log: string;
  pid: string;
  projects: string;
  serverId: string;
  settings: string;
  stopped: string;
  version: string;
}

export interface ProjectEntry {
  dir: string;
  lastUsedAt: number;
  registeredAt: number;
}

export const DORMANT_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export function machinePaths(
  env: Record<string, string | undefined> = process.env,
  homedir: string = os.homedir(),
): MachinePaths {
  const home = env.RYUGI_SERVER_HOME || path.join(homedir, '.ryugi', 'server');
  return {
    home,
    pid: path.join(home, 'server.pid'),
    serverId: path.join(home, 'server-instance-id'),
    info: path.join(home, 'server-info'),
    log: path.join(home, 'server.log'),
    version: path.join(home, 'server-version'),
    lock: path.join(home, 'start.lock'),
    key: path.join(home, 'key'),
    projects: path.join(home, 'projects.json'),
    settings: path.join(home, 'settings.json'),
    stopped: path.join(home, 'server-stopped'),
  };
}

export function ensureHome(home: string) {
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  fs.chmodSync(home, 0o700);
}

const realDir = (dir: string) => {
  try {
    return fs.realpathSync(path.resolve(dir));
  } catch {
    return path.resolve(dir);
  }
};

const validEntry = (value: unknown): value is ProjectEntry => {
  const entry = value as ProjectEntry;
  return (
    !!entry &&
    typeof entry.dir === 'string' &&
    path.isAbsolute(entry.dir) &&
    Number.isFinite(entry.registeredAt) &&
    Number.isFinite(entry.lastUsedAt)
  );
};

export function readProjects(file: string): ProjectEntry[] {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as { projects?: unknown };
    return Array.isArray(value.projects) ? value.projects.filter(validEntry) : [];
  } catch {
    return [];
  }
}

function writeProjects(file: string, projects: ProjectEntry[]) {
  ensureHome(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ projects }, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function registerProject(file: string, projectDir: string, now = Date.now()) {
  const dir = realDir(projectDir);
  const projects = readProjects(file);
  const existing = projects.find((entry) => entry.dir === dir);
  if (existing) existing.lastUsedAt = now;
  else projects.push({ dir, registeredAt: now, lastUsedAt: now });
  writeProjects(file, projects);
  return existing ?? projects.at(-1)!;
}

export function touchProject(file: string, projectDir: string, now = Date.now()) {
  const dir = realDir(projectDir);
  const projects = readProjects(file);
  const existing = projects.find((entry) => entry.dir === dir);
  if (!existing) return;
  existing.lastUsedAt = now;
  writeProjects(file, projects);
}

export function removeProject(file: string, projectDir: string) {
  const dir = realDir(projectDir);
  const projects = readProjects(file);
  const kept = projects.filter((entry) => entry.dir !== dir);
  if (kept.length !== projects.length) writeProjects(file, kept);
}

export const artifactsRootOf = (projectDir: string) => path.join(projectDir, '.ryugi', 'artifacts');

export function pruneProjects(file: string) {
  const projects = readProjects(file);
  const kept = projects.filter((entry) => fs.existsSync(artifactsRootOf(entry.dir)));
  if (kept.length !== projects.length) writeProjects(file, kept);
  return kept;
}

export const isDormant = (entry: ProjectEntry, now = Date.now()) =>
  now - entry.lastUsedAt > DORMANT_AFTER_MS;
