import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { latestFile, readLatest, refreshLatest, updateCheck } from '../src/cli/update-hint';
import { readJson, waitFor } from './helpers';

const DAY = 24 * 60 * 60 * 1000;
const now = 1_800_000_000_000;
const base = { current: '1.42.2', now, env: {}, tty: true, json: false };
const servers: http.Server[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

test('hints when the cached latest release is newer', () => {
  const { hint, refresh } = updateCheck({ ...base, cached: { version: '1.43.0', checkedAt: now - 1000 } });
  expect(hint).toBe('ryugi-artifacts 1.43.0 is available (you have 1.42.2). Run `ryugi-artifacts update` to install it.');
  expect(refresh).toBe(false);
});

test.each(['1.42.2', '1.42.1', '1.42.3-beta.1', 'garbage'])('stays quiet when the cached latest is %s', (version) => {
  expect(updateCheck({ ...base, cached: { version, checkedAt: now } }).hint).toBeNull();
});

test('refreshes a missing or day-old cache without waiting for it', () => {
  expect(updateCheck({ ...base, cached: null })).toEqual({ hint: null, refresh: true });
  const stale = updateCheck({ ...base, cached: { version: '1.43.0', checkedAt: now - DAY } });
  expect(stale).toEqual({ hint: expect.stringContaining('1.43.0'), refresh: true });
});

test.each([
  ['not a terminal', { tty: false }],
  ['--json', { json: true }],
  ['CI', { env: { CI: 'true' } }],
  ['NO_UPDATE_NOTIFIER', { env: { NO_UPDATE_NOTIFIER: '1' } }],
  ['the skill launcher', { env: { RYUGI_ARTIFACTS_COMMAND: 'node launcher.cjs' } }],
])('neither hints nor refreshes under %s', (_name, override) => {
  expect(updateCheck({ ...base, ...override, cached: null })).toEqual({ hint: null, refresh: false });
  expect(updateCheck({ ...base, ...override, cached: { version: '9.0.0', checkedAt: 0 } })).toEqual({ hint: null, refresh: false });
});

test.each([['update'], ['update', '--check'], ['publish', '--help'], ['-h']])('stays quiet for %s', (...argv) => {
  expect(updateCheck({ ...base, argv, cached: { version: '9.0.0', checkedAt: 0 } }).hint).toBeNull();
});

test('shares the launcher cache under XDG_CACHE_HOME', () => {
  expect(latestFile({ XDG_CACHE_HOME: '/tmp/xdg' })).toBe(path.join('/tmp/xdg', 'ryugi', 'artifacts', 'latest.json'));
});

test('reads a missing or malformed cache as null', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-update-'));
  expect(readLatest(path.join(dir, 'latest.json'))).toBeNull();
  fs.writeFileSync(path.join(dir, 'latest.json'), '{');
  expect(readLatest(path.join(dir, 'latest.json'))).toBeNull();
});

test('the background refresh writes the registry\'s latest version to the cache', async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(req.url === '/ryugi-artifacts/latest' ? { version: '1.50.0' } : {}));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-update-')), 'nested', 'latest.json');
  const before = Date.now();
  refreshLatest(file, `http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
  await waitFor(() => fs.existsSync(file), 5000);
  const record = readJson(file);
  expect(record.version).toBe('1.50.0');
  expect(record.checkedAt).toBeGreaterThanOrEqual(before);
});
