import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { browserLauncher, parseEnv } from '../src/server/lifecycle';
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

describe('lifecycle', () => {
  test('has no idle or owner exit any more', async () => {
    const lifecycle = await import('../src/server/lifecycle');
    expect('shutdownReason' in lifecycle).toBe(false);
    expect('readOwners' in lifecycle).toBe(false);
  });
});

describe('parseEnv', () => {
  test('needs no project root and defaults to loopback and the fixed ports', () => {
    expect(parseEnv({})).toMatchObject({
      host: '127.0.0.1',
      urlHost: 'localhost',
      ports: [27319, 27320, 27321],
      boardPorts: [27329, 27330, 27331],
      serverId: null,
    });
  });

  test('uses the bind host as the url host for non-loopback binds', () => {
    expect(parseEnv({ ARTIFACTS_HOST: '0.0.0.0' }).urlHost).toBe('0.0.0.0');
    expect(parseEnv({ ARTIFACTS_HOST: '0.0.0.0', ARTIFACTS_URL_HOST: 'dev.box' }).urlHost).toBe(
      'dev.box',
    );
  });

  test('a --port argument replaces the main port list', () => {
    expect(parseEnv({}, ['--port=4100']).ports).toEqual([4100]);
    expect(parseEnv({ RYUGI_ARTIFACTS_PORTS: '0' }).ports).toEqual([0]);
  });

  test('reads the server id argument and the open command', () => {
    expect(parseEnv({ ARTIFACTS_OPEN_CMD: 'echo' }, ['--artifacts-server-id=abc'])).toMatchObject({
      serverId: 'abc',
      openCmd: 'echo',
    });
  });

  test('points at the official cloud unless RYUGI_CLOUD_ORIGIN overrides it', () => {
    expect(parseEnv({}).cloudOrigin).toBe('https://ryugi.innei.dev');
    expect(parseEnv({ RYUGI_CLOUD_ORIGIN: 'http://localhost:8787/' }).cloudOrigin).toBe(
      'http://localhost:8787',
    );
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
