import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { readEntries, registryDir, removeEntry, touchEntry, writeEntry, type RegistryEntry } from '../src/server/registry';

const tempDir = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-registry-')), 'servers');

const entry = (project: string, serverId = 'a'.repeat(48)): RegistryEntry => ({
  project,
  root: path.join(project, '.ryugi', 'artifacts'),
  pid: process.pid,
  serverId,
  startedAt: 1,
});

test('lives in a fixed per-user directory under /tmp, not the per-session TMPDIR', () => {
  expect(registryDir({ TMPDIR: '/var/folders/x/T' }, 'darwin', 501, '/var/folders/x/T')).toBe('/tmp/ryugi-501/servers');
  expect(registryDir({}, 'linux', 1000, '/tmp')).toBe('/tmp/ryugi-1000/servers');
});

test('uses the user temp directory on Windows and RYUGI_RUNTIME_DIR when set', () => {
  expect(registryDir({}, 'win32', -1, 'C:\\Users\\a\\AppData\\Local\\Temp')).toBe(path.join('C:\\Users\\a\\AppData\\Local\\Temp', 'ryugi', 'servers'));
  expect(registryDir({ RYUGI_RUNTIME_DIR: '/x/run' }, 'linux', 1000, '/tmp')).toBe(path.join('/x/run', 'servers'));
});

test('writes one private entry per project and reads them back', () => {
  const dir = tempDir();
  writeEntry(dir, entry('/p/one'));
  writeEntry(dir, entry('/p/two'));
  writeEntry(dir, entry('/p/one', 'b'.repeat(48)));
  expect(readEntries(dir).map((e) => [e.project, e.serverId]).sort()).toEqual([['/p/one', 'b'.repeat(48)], ['/p/two', 'a'.repeat(48)]]);
  if (process.platform !== 'win32') expect(fs.statSync(dir).mode & 0o077).toBe(0);
});

test('skips unreadable entries and reads nothing from a missing directory', () => {
  const dir = tempDir();
  expect(readEntries(dir)).toEqual([]);
  writeEntry(dir, entry('/p/one'));
  fs.writeFileSync(path.join(dir, 'broken.json'), '{');
  expect(readEntries(dir).map((e) => e.project)).toEqual(['/p/one']);
});

test('removes an entry only for the server that wrote it', () => {
  const dir = tempDir();
  writeEntry(dir, entry('/p/one', 'b'.repeat(48)));
  removeEntry(dir, entry('/p/one', 'a'.repeat(48)));
  expect(readEntries(dir)).toHaveLength(1);
  removeEntry(dir, entry('/p/one', 'b'.repeat(48)));
  expect(readEntries(dir)).toEqual([]);
});

test('touch refreshes the entry and rewrites it when it was cleaned away', () => {
  const dir = tempDir();
  const own = entry('/p/one');
  writeEntry(dir, own);
  const [file] = fs.readdirSync(dir);
  fs.utimesSync(path.join(dir, file!), new Date(0), new Date(0));
  touchEntry(dir, own);
  expect(fs.statSync(path.join(dir, file!)).mtimeMs).toBeGreaterThan(Date.now() - 60_000);
  fs.rmSync(dir, { recursive: true });
  touchEntry(dir, own);
  expect(readEntries(dir)).toEqual([own]);
  const replacement = entry('/p/one', 'b'.repeat(48));
  writeEntry(dir, replacement);
  touchEntry(dir, own);
  expect(readEntries(dir)).toEqual([replacement]);
});

test.skipIf(process.platform === 'win32')('refuses to write or read a directory others can write to', () => {
  const dir = tempDir();
  writeEntry(dir, entry('/p/one'));
  fs.chmodSync(dir, 0o777);
  expect(() => writeEntry(dir, entry('/p/two'))).toThrow(/Unsafe registry directory/);
  expect(readEntries(dir)).toEqual([]);
});

test.skipIf(process.platform === 'win32')('refuses a registry directory that is a symlink', () => {
  const real = tempDir();
  writeEntry(real, entry('/p/one'));
  const link = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-registry-')), 'servers');
  fs.symlinkSync(real, link);
  expect(() => writeEntry(link, entry('/p/two'))).toThrow(/Unsafe registry directory/);
  expect(readEntries(link)).toEqual([]);
});

test('skips entries whose root is not the project artifacts directory', () => {
  const dir = tempDir();
  writeEntry(dir, { ...entry('/p/one'), root: '/home/victim' });
  expect(readEntries(dir)).toEqual([]);
});
