import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { packArtifact } from '../src/server/pack';
import { writeFiles } from './helpers';

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-pack-'));

describe('packArtifact', () => {
  test('collects every file by its relative path, skipping dotfiles and dot directories', () => {
    const dir = tempDir();
    writeFiles(dir, {
      'index.html': '<p>hi</p>',
      'img/a.png': 'png',
      '.DS_Store': 'x',
      '.cache/b.js': 'x',
      'img/.hidden': 'x',
    });
    const files = packArtifact(dir, 'html');
    expect(files.map((f) => f.path).sort()).toEqual(['img/a.png', 'index.html']);
    expect(files.find((f) => f.path === 'index.html')!.data.toString()).toBe('<p>hi</p>');
  });

  test('leaves out document comments', () => {
    const dir = tempDir();
    writeFiles(dir, { 'doc.xml': '<doc/>', 'comments.json': '{}', 'assets/comments.json': '{}' });
    expect(
      packArtifact(dir, 'document')
        .map((f) => f.path)
        .sort(),
    ).toEqual(['assets/comments.json', 'doc.xml']);
  });

  test('skips symlinks that leave the artifact directory', () => {
    const dir = tempDir();
    const outside = tempDir();
    writeFiles(outside, { 'secret.txt': 'nope' });
    writeFiles(dir, { 'index.html': 'x' });
    fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(dir, 'leak.txt'));
    expect(packArtifact(dir, 'html').map((f) => f.path)).toEqual(['index.html']);
  });

  test('survives a symlink loop inside the artifact', () => {
    const dir = tempDir();
    writeFiles(dir, { 'a/index.html': 'x' });
    fs.symlinkSync(path.join(dir, 'a'), path.join(dir, 'a', 'loop'));
    expect(packArtifact(dir, 'html').map((f) => f.path)).toEqual(['a/index.html']);
  });

  test('refuses an artifact over the size limit and says how big it is', () => {
    const dir = tempDir();
    writeFiles(dir, { 'index.html': 'x'.repeat(600), 'big.bin': 'y'.repeat(600) });
    expect(() => packArtifact(dir, 'html', { maxBytes: 1000 })).toThrow(/1\.2 KB.*limit is 1000 B/);
  });
});
