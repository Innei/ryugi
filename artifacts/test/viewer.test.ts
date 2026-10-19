import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { viewerCdnFor } from '../src/server/viewer';
import { tempRoot } from './helpers';

test('the CDN url pins the exact version recorded next to the server', () => {
  const { root } = tempRoot();
  fs.writeFileSync(path.join(root, 'version.json'), JSON.stringify({ version: '7.1.0' }));
  expect(viewerCdnFor(root)).toBe('https://cdn.jsdelivr.net/npm/ryugi-artifacts@7.1.0/dist/viewer/');
});

test('the shipped version file matches the npm package version', () => {
  const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '../../skills/artifacts/app/version.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  expect(shipped.version).toBe(pkg.version);
});
