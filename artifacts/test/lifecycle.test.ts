import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { browserLauncher, parseEnv, shutdownReason } from '../src/server/lifecycle';
import { pollTree } from '../src/server/watch';
import { waitFor } from './helpers';

describe('browserLauncher', () => {
  const url = 'http://localhost:5000/?key=abc';

  test('uses open on macOS, xdg-open on Linux and start on Windows, passing the url as one argument', () => {
    expect(browserLauncher('darwin', url)).toEqual({ bin: 'open', args: [url] });
    expect(browserLauncher('linux', url)).toEqual({ bin: 'xdg-open', args: [url] });
    expect(browserLauncher('win32', url)).toEqual({ bin: 'cmd', args: ['/c', 'start', '""', url] });
  });

  test('returns null on an unknown platform', () => {
    expect(browserLauncher('aix', url)).toBeNull();
  });
});

describe('shutdownReason', () => {
  test('stops when the owner process is gone', () => {
    expect(shutdownReason({ now: 10, lastActivity: 10, idleTimeoutMs: 100, ownerAlive: false })).toBe(
      'owner process exited',
    );
  });

  test('stops after the idle timeout', () => {
    expect(shutdownReason({ now: 200, lastActivity: 50, idleTimeoutMs: 100, ownerAlive: true })).toBe('idle timeout');
  });

  test('keeps running otherwise', () => {
    expect(shutdownReason({ now: 100, lastActivity: 50, idleTimeoutMs: 100, ownerAlive: true })).toBeNull();
  });
});

describe('parseEnv', () => {
  test('reads the board directory, hosts and options with defaults', () => {
    const config = parseEnv({ ARTBOARD_DIR: '/b' });
    expect(config).toMatchObject({
      boardDir: '/b',
      host: '127.0.0.1',
      urlHost: 'localhost',
      ownerPid: null,
      idleTimeoutMs: 4 * 60 * 60 * 1000,
      open: false,
    });
  });

  test('uses the bind host as the url host for non-loopback binds', () => {
    expect(parseEnv({ ARTBOARD_DIR: '/b', ARTBOARD_HOST: '0.0.0.0' }).urlHost).toBe('0.0.0.0');
    expect(parseEnv({ ARTBOARD_DIR: '/b', ARTBOARD_HOST: '0.0.0.0', ARTBOARD_URL_HOST: 'dev.box' }).urlHost).toBe(
      'dev.box',
    );
  });

  test('parses owner pid, idle timeout and open flag', () => {
    const config = parseEnv({
      ARTBOARD_DIR: '/b',
      ARTBOARD_OWNER_PID: '1234',
      ARTBOARD_IDLE_TIMEOUT_MS: '5000',
      ARTBOARD_OPEN: '1',
    });
    expect(config).toMatchObject({ ownerPid: 1234, idleTimeoutMs: 5000, open: true });
  });

  test('requires a board directory', () => {
    expect(() => parseEnv({})).toThrow(/ARTBOARD_DIR/);
  });
});

describe('pollTree', () => {
  test('reports added and changed files and ignores .state/', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artboard-poll-'));
    const seen: string[] = [];
    const watcher = pollTree(dir, (files) => seen.push(...files), 30);
    fs.mkdirSync(path.join(dir, 'html', 'x'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'html', 'x', 'index.html'), 'a');
    fs.mkdirSync(path.join(dir, '.state'));
    fs.writeFileSync(path.join(dir, '.state', 'warnings.json'), '{}');
    await waitFor(() => seen.includes('html/x/index.html'));
    watcher.close();
    expect(seen.some((f) => f.startsWith('.state'))).toBe(false);
  });
});
