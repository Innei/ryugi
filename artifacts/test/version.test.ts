import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

test('the version start-server.sh installs matches the npm package version', () => {
  const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '../../skills/artifacts/app/version.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  expect(shipped.version).toBe(pkg.version);
});
