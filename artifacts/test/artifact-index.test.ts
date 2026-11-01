import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'vitest';

import { createArtifactIndex } from '../src/server/artifact-index';

function project(artifacts: Record<string, string | null>) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-index-')));
  for (const [key, address] of Object.entries(artifacts)) {
    const artifactDir = path.join(dir, '.ryugi', 'artifacts', key);
    fs.mkdirSync(artifactDir, { recursive: true });
    if (address) fs.writeFileSync(path.join(artifactDir, '.artifact-id'), `${address}\n`);
  }
  return dir;
}

const A = 'aaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbb';

test('finds the project of an artifact by its address', () => {
  const one = project({ 'artboard/flow': A });
  const two = project({ 'artboard/flow': B });
  const index = createArtifactIndex(() => [one, two]);
  expect(index.find('artboard', A)).toEqual({ project: one, id: 'flow' });
  expect(index.find('artboard', B)).toEqual({ project: two, id: 'flow' });
});

test('a slug picks the first project in the order given, which is most recently used', () => {
  const one = project({ 'document/notes': null });
  const two = project({ 'document/notes': null });
  expect(createArtifactIndex(() => [two, one]).find('document', 'notes')).toEqual({
    project: two,
    id: 'notes',
  });
});

test('an address of another type does not match', () => {
  const one = project({ 'artboard/flow': A });
  expect(createArtifactIndex(() => [one]).find('document', A)).toBeNull();
});

test('a new artifact is found after a miss rescans', () => {
  const one = project({});
  const index = createArtifactIndex(() => [one], { rescanAfterMs: 0 });
  expect(index.find('html', 'page')).toBeNull();
  const dir = path.join(one, '.ryugi', 'artifacts', 'html', 'page');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.artifact-id'), `${B}\n`);
  expect(index.find('html', B)).toEqual({ project: one, id: 'page' });
});

test('ids that are not locators never match', () => {
  const one = project({ 'artboard/flow': A });
  const index = createArtifactIndex(() => [one]);
  expect(index.find('artboard', '../flow')).toBeNull();
  expect(index.find('artboard', 'Flow')).toBeNull();
});

test('lists every artifact with its project and modification time', () => {
  const one = project({ 'artboard/flow': A });
  const two = project({ 'html/page': null });
  const listed = createArtifactIndex(() => [one, two]).list();
  expect(listed.map((entry) => [entry.project, entry.type, entry.id, entry.address])).toEqual([
    [one, 'artboard', 'flow', A],
    [two, 'html', 'page', null],
  ]);
  expect(typeof listed[0]!.mtimeMs).toBe('number');
});
