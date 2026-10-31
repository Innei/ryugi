import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from 'vitest';

import { artifactPath } from '../src/server/artifact-address';
import { isArtifactLocator, isMintedArtifactId, mintArtifactId } from '../src/shared/ids';
import { tempRoot } from './helpers';

test('mints 21 letters and digits', () => {
  const id = mintArtifactId();
  expect(id).toMatch(/^[a-z0-9]{21}$/i);
});

test('mints a different id each time', () => {
  const ids = new Set(Array.from({ length: 200 }, () => mintArtifactId()));
  expect(ids.size).toBe(200);
});

test('recognises minted ids only', () => {
  expect(isMintedArtifactId(mintArtifactId())).toBe(true);
  expect(isMintedArtifactId('Hd1EUxoadtn7g3xINjFZ')).toBe(false);
  expect(isMintedArtifactId('artboard-rewrite')).toBe(false);
  expect(isMintedArtifactId('Z9kiwz1B90PG8NnhV52D_')).toBe(false);
});

test('local artifact addresses come from the shared minter', () => {
  const { root } = tempRoot();
  fs.mkdirSync(path.join(root, 'artboard', 'demo'), { recursive: true });
  const address = artifactPath(root, 'artboard', 'demo').split('/').pop()!;
  expect(isMintedArtifactId(address)).toBe(true);
  expect(isArtifactLocator(address)).toBe(true);
});
