import fs from 'node:fs';
import path from 'node:path';

export interface Watcher {
  close(): void;
}

const toPosix = (file: string) => file.split(path.sep).join('/');
const ignored = (file: string) => file === '.state' || file.startsWith('.state/');

function snapshot(root: string, dir = root, out = new Map<string, number>()) {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = toPosix(path.relative(root, full));
    if (ignored(rel)) continue;
    if (entry.isDirectory()) snapshot(root, full, out);
    else {
      try {
        out.set(rel, fs.statSync(full).mtimeMs);
      } catch {
        // removed between readdir and stat
      }
    }
  }
  return out;
}

export function pollTree(
  root: string,
  onChange: (files: string[]) => void,
  intervalMs = 400,
): Watcher {
  let previous = snapshot(root);
  const timer = setInterval(() => {
    const current = snapshot(root);
    const changed: string[] = [];
    for (const [file, mtime] of current) if (previous.get(file) !== mtime) changed.push(file);
    for (const file of previous.keys()) if (!current.has(file)) changed.push(file);
    previous = current;
    if (changed.length > 0) onChange(changed);
  }, intervalMs);
  return { close: () => clearInterval(timer) };
}

export function watchTree(
  root: string,
  onChange: (files: string[]) => void,
  debounceMs = 120,
  backupPollMs = 1000,
): Watcher {
  let pending = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  const queue = (files: string[]) => {
    for (const file of files) if (!ignored(file)) pending.add(file);
    if (pending.size === 0) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const files = [...pending];
      pending = new Set();
      onChange(files);
    }, debounceMs);
  };

  try {
    const watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
      if (filename) queue([toPosix(filename.toString())]);
    });
    watcher.on('error', () => {});
    // fs.watch on macOS drops whole batches of events while many watchers start and stop; the poll catches them.
    const backup = pollTree(root, queue, backupPollMs);
    return {
      close: () => {
        clearTimeout(timer);
        watcher.close();
        backup.close();
      },
    };
  } catch {
    // Recursive fs.watch is unavailable on Linux before Node 20; fall back to polling.
    const poller = pollTree(root, queue);
    return {
      close: () => {
        clearTimeout(timer);
        poller.close();
      },
    };
  }
}
