import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'vitest';

import { createUpdateCheck, newerVersion } from '../src/server/update-check';

const cacheFile = () =>
  path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-update-')), 'latest.json');

const registry = (version: string, calls: string[] = []) =>
  (async (url: string) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ version }), { status: 200 });
  }) as unknown as typeof fetch;

test('reports a newer release from the registry', async () => {
  const check = createUpdateCheck({
    current: '1.50.0',
    cacheFile: cacheFile(),
    fetch: registry('1.51.0'),
  });
  await check.refresh();
  expect(check.latest()).toBe('1.51.0');
});

test('reports nothing when the running release is current or newer', async () => {
  const check = createUpdateCheck({
    current: '1.51.0',
    cacheFile: cacheFile(),
    fetch: registry('1.51.0'),
  });
  await check.refresh();
  expect(check.latest()).toBeNull();
});

test('asks the registry at most once a day', async () => {
  const calls: string[] = [];
  let now = 1_000;
  const check = createUpdateCheck({
    current: '1.50.0',
    cacheFile: cacheFile(),
    fetch: registry('1.51.0', calls),
    now: () => now,
  });
  await check.refresh();
  now += 60 * 60 * 1000;
  await check.refresh();
  expect(calls).toHaveLength(1);
  now += 24 * 60 * 60 * 1000;
  await check.refresh();
  expect(calls).toHaveLength(2);
  expect(calls[0]).toBe('https://registry.npmjs.org/ryugi-artifacts/latest');
});

test('a local build never sees an update', async () => {
  const check = createUpdateCheck({
    current: 'local-abc',
    cacheFile: cacheFile(),
    fetch: registry('9.0.0'),
  });
  await check.refresh();
  expect(check.latest()).toBeNull();
});

test('a failing registry keeps the last answer', async () => {
  const file = cacheFile();
  const first = createUpdateCheck({
    current: '1.50.0',
    cacheFile: file,
    fetch: registry('1.51.0'),
  });
  await first.refresh();
  const broken = (async () => {
    throw new Error('offline');
  }) as unknown as typeof fetch;
  const second = createUpdateCheck({
    current: '1.50.0',
    cacheFile: file,
    fetch: broken,
    now: () => Date.now() + 2 * 86_400_000,
  });
  await second.refresh();
  expect(second.latest()).toBe('1.51.0');
});

test('compares releases numerically', () => {
  expect(newerVersion('1.50.10', '1.50.9')).toBe(true);
  expect(newerVersion('1.50.0', '1.50.0')).toBe(false);
});
