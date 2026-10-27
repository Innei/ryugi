import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  browserLauncher,
  liveOwners,
  parseEnv,
  readOwners,
  shutdownReason,
} from '../src/server/lifecycle';
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
  test('stops when every owner process is gone', () => {
    expect(
      shutdownReason({ now: 10, lastActivity: 10, idleTimeoutMs: 100, ownersAlive: false }),
    ).toBe('all owner processes exited');
  });

  test('stops after the idle timeout', () => {
    expect(
      shutdownReason({ now: 200, lastActivity: 50, idleTimeoutMs: 100, ownersAlive: true }),
    ).toBe('idle timeout');
  });

  test('keeps running otherwise', () => {
    expect(
      shutdownReason({ now: 100, lastActivity: 50, idleTimeoutMs: 100, ownersAlive: true }),
    ).toBeNull();
  });
});

describe('owners', () => {
  test('readOwners parses one pid per line and skips junk', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-owners-'));
    const file = path.join(dir, 'owners');
    fs.writeFileSync(file, '123\n\nabc\n1\n456\n123\n');
    expect(readOwners(file)).toEqual([123, 456]);
    expect(readOwners(path.join(dir, 'missing'))).toEqual([]);
  });

  test('liveOwners keeps only the pids that are still alive', () => {
    expect(liveOwners([10, 20, 30], (pid) => pid !== 20)).toEqual([10, 30]);
  });
});

describe('parseEnv', () => {
  test('reads the artifacts root, hosts and options with defaults', () => {
    const config = parseEnv({ ARTIFACTS_ROOT: '/r' });
    expect(config).toMatchObject({
      root: '/r',
      host: '127.0.0.1',
      urlHost: 'localhost',
      idleTimeoutMs: 4 * 60 * 60 * 1000,
      open: true,
      openArtifact: null,
    });
  });

  test('uses the bind host as the url host for non-loopback binds', () => {
    expect(parseEnv({ ARTIFACTS_ROOT: '/r', ARTIFACTS_HOST: '0.0.0.0' }).urlHost).toBe('0.0.0.0');
    expect(
      parseEnv({ ARTIFACTS_ROOT: '/r', ARTIFACTS_HOST: '0.0.0.0', ARTIFACTS_URL_HOST: 'dev.box' })
        .urlHost,
    ).toBe('dev.box');
  });

  test('parses idle timeout, open flag and the server id argument', () => {
    const config = parseEnv(
      {
        ARTIFACTS_ROOT: '/r',
        ARTIFACTS_IDLE_TIMEOUT_MS: '5000',
        ARTIFACTS_OPEN: '1',
        ARTIFACTS_OPEN_ARTIFACT: 'artboard/header',
      },
      ['--artifacts-server-id=abc'],
    );
    expect(config).toMatchObject({
      idleTimeoutMs: 5000,
      open: true,
      openArtifact: 'artboard/header',
      serverId: 'abc',
    });
  });

  test('points at the official cloud unless RYUGI_CLOUD_ORIGIN overrides it', () => {
    expect(parseEnv({ ARTIFACTS_ROOT: '/r' }).cloudOrigin).toBe('https://ryugi.innei.dev');
    expect(
      parseEnv({ ARTIFACTS_ROOT: '/r', RYUGI_CLOUD_ORIGIN: 'http://localhost:8787/' }).cloudOrigin,
    ).toBe('http://localhost:8787');
  });

  test('turns opening off when ARTIFACTS_OPEN is 0', () => {
    expect(parseEnv({ ARTIFACTS_ROOT: '/r', ARTIFACTS_OPEN: '0' }).open).toBe(false);
  });

  test('requires an artifacts root', () => {
    expect(() => parseEnv({})).toThrow(/ARTIFACTS_ROOT/);
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
