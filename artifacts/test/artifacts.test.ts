import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  artifactKeyOf,
  artifactSignature,
  isArtifactId,
  listArtifacts,
  resolveArtifactDir,
} from '../src/server/artifacts';

function tempRoot(dirs: string[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-root-'));
  for (const dir of dirs) fs.mkdirSync(path.join(root, dir), { recursive: true });
  return root;
}

describe('isArtifactId', () => {
  test('accepts lowercase letters, digits and hyphens', () => {
    expect(isArtifactId('arrow-tuner')).toBe(true);
    expect(isArtifactId('q1')).toBe(true);
  });

  test('rejects dots, separators, uppercase and empty ids', () => {
    for (const id of ['', '.', '..', '.x', 'A', 'a/b', 'a\\b', 'a b', 'a.b', '-x']) {
      expect(isArtifactId(id), id).toBe(false);
    }
  });
});

describe('listArtifacts', () => {
  test('finds artifacts of every known type', () => {
    const root = tempRoot(['artboard/brainstorm', 'html/arrow-tuner', 'html/icon-review']);
    const { artifacts, warnings } = listArtifacts(root);
    expect(artifacts.map((a) => `${a.type}/${a.id}`)).toEqual([
      'artboard/brainstorm',
      'html/arrow-tuner',
      'html/icon-review',
    ]);
    expect(artifacts[0]!.dir).toBe(path.join(root, 'artboard', 'brainstorm'));
    expect(warnings).toEqual([]);
  });

  test('skips the server state directory', () => {
    const root = tempRoot(['.state/html/x', 'html/a']);
    expect(listArtifacts(root).artifacts.map((a) => a.id)).toEqual(['a']);
  });

  test('warns about unknown type directories and invalid ids', () => {
    const root = tempRoot(['slides/deck', 'html/Bad.Name', 'html/ok']);
    const { artifacts, warnings } = listArtifacts(root);
    expect(artifacts.map((a) => a.id)).toEqual(['ok']);
    expect(warnings.some((w) => w.includes('slides'))).toBe(true);
    expect(warnings.some((w) => w.includes('Bad.Name'))).toBe(true);
  });

  test('ignores plain files and a missing root', () => {
    const root = tempRoot(['html/a']);
    fs.writeFileSync(path.join(root, 'html', 'notes.txt'), 'x');
    expect(listArtifacts(root).artifacts.map((a) => a.id)).toEqual(['a']);
    expect(listArtifacts(path.join(root, 'missing'))).toEqual({ artifacts: [], warnings: [] });
  });
});

describe('resolveArtifactDir', () => {
  test('resolves an existing artifact directory', () => {
    const root = tempRoot(['html/a']);
    expect(resolveArtifactDir(root, 'html', 'a')).toBe(path.join(root, 'html', 'a'));
  });

  test('rejects unknown types, invalid ids and missing directories', () => {
    const root = tempRoot(['html/a']);
    expect(resolveArtifactDir(root, 'slides', 'a')).toBeNull();
    expect(resolveArtifactDir(root, 'html', '..')).toBeNull();
    expect(resolveArtifactDir(root, 'html', 'missing')).toBeNull();
  });
});

describe('artifactKeyOf', () => {
  test('maps a watched path to its artifact', () => {
    expect(artifactKeyOf('html/b/img/x.png')).toEqual({ type: 'html', id: 'b' });
    expect(artifactKeyOf('artboard/q/canvas.json')).toEqual({ type: 'artboard', id: 'q' });
    expect(artifactKeyOf('html/b')).toEqual({ type: 'html', id: 'b' });
  });

  test('returns null for state, unknown types and invalid ids', () => {
    expect(artifactKeyOf('.state/html/b/warnings.json')).toBeNull();
    expect(artifactKeyOf('slides/x/index.html')).toBeNull();
    expect(artifactKeyOf('html/.hidden/index.html')).toBeNull();
    expect(artifactKeyOf('html')).toBeNull();
  });
});

describe('artifactSignature', () => {
  test('changes when a file is renamed, though its size and time stay the same', () => {
    const dir = path.join(tempRoot(['html/tuner']), 'html', 'tuner');
    fs.writeFileSync(path.join(dir, 'draft.html'), '<html></html>');
    const before = artifactSignature(dir, 'html');
    fs.renameSync(path.join(dir, 'draft.html'), path.join(dir, 'index.html'));
    expect(artifactSignature(dir, 'html')).not.toBe(before);
  });
});
