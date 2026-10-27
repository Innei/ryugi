import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface RegistryEntry {
  project: string;
  root: string;
  pid: number;
  serverId: string;
  startedAt: number;
}

// Harnesses give each session its own TMPDIR, so the registry uses a fixed path every session can see.
export function registryDir(
  env: Record<string, string | undefined> = process.env,
  platform: string = process.platform,
  uid: number = process.getuid?.() ?? -1,
  tmpdir: string = os.tmpdir(),
) {
  if (env.RYUGI_RUNTIME_DIR) return path.join(env.RYUGI_RUNTIME_DIR, 'servers');
  if (platform === 'win32') return path.join(tmpdir, 'ryugi', 'servers');
  return `/tmp/ryugi-${uid}/servers`;
}

const fileFor = (dir: string, project: string) =>
  path.join(dir, `${crypto.createHash('sha256').update(project).digest('hex').slice(0, 16)}.json`);

// /tmp is shared: refuse a directory another user created or swapped for a symlink, for reads too.
function verifyDir(dir: string) {
  if (process.platform === 'win32') return;
  for (const target of [path.dirname(dir), dir]) {
    const stat = fs.lstatSync(target);
    if (!stat.isDirectory() || stat.uid !== process.getuid!() || stat.mode & 0o022)
      throw new Error(`Unsafe registry directory: ${target}`);
  }
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  verifyDir(dir);
}

export function writeEntry(dir: string, entry: RegistryEntry) {
  ensureDir(dir);
  const file = fileFor(dir, entry.project);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function readEntry(file: string): RegistryEntry | null {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (
      typeof value.project !== 'string' ||
      typeof value.root !== 'string' ||
      typeof value.serverId !== 'string'
    )
      return null;
    if (!Number.isInteger(value.pid) || !Number.isFinite(value.startedAt)) return null;
    if (value.root !== path.join(value.project, '.ryugi', 'artifacts')) return null;
    return value as RegistryEntry;
  } catch {
    return null;
  }
}

export function readEntries(dir: string): RegistryEntry[] {
  let names: string[];
  try {
    verifyDir(dir);
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => readEntry(path.join(dir, name)) ?? []);
}

export function removeEntry(dir: string, entry: Pick<RegistryEntry, 'project' | 'serverId'>) {
  const file = fileFor(dir, entry.project);
  if (readEntry(file)?.serverId === entry.serverId) fs.rmSync(file, { force: true });
}

// macOS deletes /tmp files nobody touched for three days; a long-lived server keeps its entry fresh.
export function touchEntry(dir: string, entry: RegistryEntry) {
  const file = fileFor(dir, entry.project);
  const current = readEntry(file);
  if (!current) return writeEntry(dir, entry);
  if (current.serverId !== entry.serverId) return;
  const now = new Date();
  fs.utimesSync(file, now, now);
}
