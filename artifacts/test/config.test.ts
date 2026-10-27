import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  ensureConfig,
  readConfig,
  setProjectAutoPublish,
  updateArtifactConfig,
} from '../src/server/config';

function tempRyugiDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-config-'));
}

describe('ensureConfig', () => {
  test('writes a default config and a .gitignore that hides it', () => {
    const dir = tempRyugiDir();
    const file = path.join(dir, 'config.json');
    ensureConfig(file);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ version: 1, artifacts: {} });
    expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')).toContain('config.json\n');
  });

  test('git tracks only documents and their files', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-ignore-'));
    const dir = path.join(project, '.ryugi');
    ensureConfig(path.join(dir, 'config.json'));
    for (const name of [
      'artifacts/document/plan/doc.xml',
      'artifacts/document/plan/assets/a.png',
      'artifacts/document/plan/.artifact-id',
      'artifacts/artboard/a/canvas.json',
      'artifacts/html/b/index.html',
      'artifacts/.state/x.json',
    ]) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), 'x');
    }
    execFileSync('git', ['init', '-q'], { cwd: project });
    const listed = execFileSync(
      'git',
      ['-c', 'core.excludesFile=/dev/null', 'ls-files', '--others', '--exclude-standard'],
      { cwd: project, encoding: 'utf8' },
    );
    expect(listed.trim().split('\n').sort()).toEqual([
      '.ryugi/.gitignore',
      '.ryugi/artifacts/document/plan/assets/a.png',
      '.ryugi/artifacts/document/plan/doc.xml',
    ]);
  });

  test('leaves an existing config untouched', () => {
    const dir = tempRyugiDir();
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, '{"version":1,"artifacts":{"html/a":{"visibility":"public"}}}');
    ensureConfig(file);
    expect(fs.readFileSync(file, 'utf8')).toBe(
      '{"version":1,"artifacts":{"html/a":{"visibility":"public"}}}',
    );
  });

  test('appends only the missing rules to an existing .gitignore', () => {
    const dir = tempRyugiDir();
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(path.join(dir, '.gitignore'), 'notes/\nconfig.json');
    ensureConfig(file);
    ensureConfig(file);
    expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')).toBe(
      'notes/\nconfig.json\nartifacts/*\n!artifacts/document/\nartifacts/document/*/.artifact-id\n',
    );
  });
});

describe('readConfig', () => {
  test('returns defaults with a warning when the file is not valid JSON', () => {
    const dir = tempRyugiDir();
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, '{oops');
    const { config, warning } = readConfig(file);
    expect(config).toEqual({ version: 1, artifacts: {} });
    expect(warning).toMatch(/config\.json is not valid JSON/);
  });

  test('drops artifact entries with an unknown visibility', () => {
    const dir = tempRyugiDir();
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        artifacts: { 'html/a': { visibility: 'secret' }, 'html/b': { visibility: 'public' } },
      }),
    );
    expect(readConfig(file).config.artifacts).toEqual({ 'html/b': { visibility: 'public' } });
  });
});

describe('updateArtifactConfig', () => {
  test('merges a patch into one artifact and keeps the others', () => {
    const dir = tempRyugiDir();
    const file = path.join(dir, 'config.json');
    ensureConfig(file);
    updateArtifactConfig(file, 'html/a', { visibility: 'public' });
    updateArtifactConfig(file, 'html/b', { visibility: 'private' });
    const cloud = {
      id: 'k3x9',
      url: 'https://ryugi.innei.dev/a/k3x9',
      publishedAt: '2026-10-20T08:00:00Z',
      visibility: 'public' as const,
    };
    updateArtifactConfig(file, 'html/a', { cloud });
    expect(readConfig(file).config.artifacts).toEqual({
      'html/a': { visibility: 'public', cloud },
      'html/b': { visibility: 'private' },
    });
  });

  test('keeps a cloud record that was created but never published', () => {
    const dir = tempRyugiDir();
    const file = path.join(dir, 'config.json');
    const cloud = {
      id: 'k3x9',
      url: 'https://ryugi.innei.dev/a/k3x9',
      publishedAt: null,
      visibility: 'private' as const,
    };
    updateArtifactConfig(file, 'html/a', { cloud });
    expect(readConfig(file).config.artifacts['html/a']).toEqual({ cloud });
  });

  test('keeps the fingerprint of the published content', () => {
    const dir = tempRyugiDir();
    const file = path.join(dir, 'config.json');
    const cloud = {
      id: 'k3x9',
      url: 'https://ryugi.innei.dev/a/k3x9',
      publishedAt: '2026-10-20T08:00:00Z',
      visibility: 'public' as const,
      fingerprint: 'abc',
    };
    updateArtifactConfig(file, 'html/a', { cloud });
    expect(readConfig(file).config.artifacts['html/a']).toEqual({ cloud });
  });

  test('removes the cloud record when patched with null', () => {
    const dir = tempRyugiDir();
    const file = path.join(dir, 'config.json');
    updateArtifactConfig(file, 'html/a', {
      visibility: 'public',
      cloud: { id: 'x', url: 'u', publishedAt: 't', visibility: 'public' },
    });
    updateArtifactConfig(file, 'html/a', { cloud: null });
    expect(readConfig(file).config.artifacts).toEqual({ 'html/a': { visibility: 'public' } });
  });

  test('refuses to overwrite a config that is not valid JSON', () => {
    const dir = tempRyugiDir();
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, '{oops');
    expect(() => updateArtifactConfig(file, 'html/a', { visibility: 'public' })).toThrow(
      /not valid JSON/,
    );
    expect(fs.readFileSync(file, 'utf8')).toBe('{oops');
  });
});

describe('auto-publish settings in the project config', () => {
  test('keeps the project switch and per-artifact opt-outs across artifact updates', () => {
    const file = path.join(tempRyugiDir(), 'config.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        autoPublish: false,
        artifacts: { 'html/a': { autoPublish: false } },
      }),
    );
    updateArtifactConfig(file, 'html/b', { visibility: 'public' });
    expect(readConfig(file).config).toEqual({
      version: 1,
      autoPublish: false,
      artifacts: { 'html/a': { autoPublish: false }, 'html/b': { visibility: 'public' } },
    });
  });

  test('drops values that are not booleans, and per-artifact true', () => {
    const file = path.join(tempRyugiDir(), 'config.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        autoPublish: 'yes',
        artifacts: { 'html/a': { autoPublish: true } },
      }),
    );
    expect(readConfig(file).config).toEqual({ version: 1, artifacts: { 'html/a': {} } });
  });

  test('opts an artifact out and back in', () => {
    const file = path.join(tempRyugiDir(), 'config.json');
    updateArtifactConfig(file, 'html/a', { visibility: 'public', autoPublish: false });
    expect(readConfig(file).config.artifacts['html/a']).toEqual({
      visibility: 'public',
      autoPublish: false,
    });
    updateArtifactConfig(file, 'html/a', { autoPublish: null });
    expect(readConfig(file).config.artifacts['html/a']).toEqual({ visibility: 'public' });
  });

  test('sets and clears the project switch', () => {
    const file = path.join(tempRyugiDir(), 'config.json');
    setProjectAutoPublish(file, false);
    expect(readConfig(file).config.autoPublish).toBe(false);
    setProjectAutoPublish(file, null);
    expect(readConfig(file).config).toEqual({ version: 1, artifacts: {} });
  });
});
