import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

const pkgDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(pkgDir, '..');
const localApp = path.join(repoRoot, 'skills/artifacts/app');

test('the published package holds the CLI, the server, the viewer under fixed entry names, its license and nothing else', () => {
  const [pack] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: pkgDir, encoding: 'utf8' }));
  const files = (pack.files as { path: string }[]).map((f) => f.path).sort();
  expect(files).toEqual(
    expect.arrayContaining([
      'dist/server.cjs',
      'bin/ryugi-artifacts.cjs',
      'dist/cli.cjs',
      'dist/runtime/ryugi-ui.js',
      'dist/viewer/index.css',
      'dist/viewer/index.html',
      'dist/viewer/index.js',
      'dist/viewer-lib/index.js',
      'dist/viewer-lib/document.js',
      'dist/viewer-lib/shims.js',
      'dist/viewer-lib/types/src/viewer/library/index.d.ts',
      'package.json',
      'LICENSE',
      'README.md',
    ]),
  );
  expect(
    files.filter(
      (file) =>
        !file.startsWith('dist/viewer/') &&
        !file.startsWith('dist/viewer-lib/') &&
        !file.startsWith('dist/runtime/') &&
        file !== 'dist/server.cjs' &&
        file !== 'bin/ryugi-artifacts.cjs' &&
        file !== 'dist/cli.cjs' &&
        file !== 'package.json' &&
        file !== 'LICENSE' &&
        file !== 'README.md',
    ),
  ).toEqual([]);
}, 60_000);

test('the document page is a separate chunk that artboard and html pages never load', () => {
  const entry = fs.readFileSync(path.join(pkgDir, 'dist/viewer/index.js'), 'utf8');
  expect(fs.readdirSync(path.join(pkgDir, 'dist/viewer')).some((file) => /^DocumentPage-.*\.js$/.test(file))).toBe(true);
  expect(entry.length).toBeLessThan(1_500_000);
});

test('the published package installs nothing else: the server bundles its dependencies', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  expect(pkg.dependencies ?? {}).toEqual({});
  for (const peer of Object.keys(pkg.peerDependencies ?? {})) expect(pkg.peerDependenciesMeta?.[peer], `${peer} must stay optional for CLI installs`).toEqual({ optional: true });
});

test('the viewer is a production build even when built from the test runner', () => {
  expect(fs.readFileSync(path.join(pkgDir, 'dist/viewer/index.js'), 'utf8')).not.toContain('react.dev/link');
});

test('the server and viewer builds are mirrored into the plugin for local development', () => {
  expect(fs.existsSync(path.join(localApp, 'server.cjs'))).toBe(true);
  expect(fs.readdirSync(path.join(localApp, 'viewer')).sort()).toEqual(fs.readdirSync(path.join(pkgDir, 'dist/viewer')).sort());
  expect(fs.readFileSync(path.join(localApp, 'runtime/ryugi-ui.js'), 'utf8')).toBe(
    fs.readFileSync(path.join(pkgDir, 'dist/runtime/ryugi-ui.js'), 'utf8'),
  );
});

test('build output is never committed', () => {
  for (const rel of [
    'skills/artifacts/app/server.cjs',
    'skills/artifacts/app/cli.cjs',
    'skills/artifacts/app/viewer/index.js',
    'skills/artifacts/app/runtime/ryugi-ui.js',
    'artifacts/dist/server.cjs',
    'artifacts/dist/viewer/index.js',
  ]) {
    expect(() => execFileSync('git', ['check-ignore', '-q', rel], { cwd: repoRoot }), rel).not.toThrow();
  }
});

test('the thumbnail entry is one self-contained module a Worker can bundle', async () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  expect(pkg.exports['./thumbnail']).toEqual({ types: './dist/viewer-lib/types/src/shared/thumbnail.d.ts', default: './dist/viewer-lib/thumbnail.js' });
  const file = path.join(pkgDir, 'dist/viewer-lib/thumbnail.js');
  expect(fs.existsSync(path.join(pkgDir, 'dist/viewer-lib/types/src/shared/thumbnail.d.ts'))).toBe(true);
  const code = fs.readFileSync(file, 'utf8');
  expect(code).not.toMatch(/\bimport\b|\brequire\(|\.css\b/);
  const { renderThumbnail, renderBoardPlaceholder, THUMBNAIL_PATH } = await import(file);
  expect(THUMBNAIL_PATH).toBe('_ryugi/thumbnail-v1.svg');
  expect(renderThumbnail({ id: 'a', type: 'html', title: 'Hi' }, null)).toMatch(/^<svg /);
  expect(renderBoardPlaceholder({ id: 'a', w: 10, h: 10 })).toMatch(/^<svg /);
});
