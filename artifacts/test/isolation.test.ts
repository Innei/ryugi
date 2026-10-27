import fs from 'node:fs';
import os from 'node:os';

import { expect, test } from 'vitest';

import { credentialsFile } from '../src/server/credentials';

test('tests read credentials from a temporary config directory', () => {
  const file = credentialsFile(process.env, process.platform, os.homedir());
  expect(fs.realpathSync(file.slice(0, file.indexOf('/ryugi/')))).toContain(
    fs.realpathSync(os.tmpdir()),
  );
});

test('tests talk to a cloud that is not Ryugi Cloud', () => {
  expect(process.env.RYUGI_CLOUD_ORIGIN).toBeDefined();
  expect(process.env.RYUGI_CLOUD_ORIGIN).not.toBe('https://ryugi.innei.dev');
});
