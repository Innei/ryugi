import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

const pkgDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(pkgDir, '..');
const localApp = path.join(repoRoot, 'skills/artifacts/app');

test('the published package holds the server, the viewer under fixed entry names, and nothing else', () => {
  const [pack] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: pkgDir, encoding: 'utf8' }));
  const files = (pack.files as { path: string }[]).map((f) => f.path).sort();
  expect(files).toEqual(
    expect.arrayContaining([
      'dist/server.cjs',
      'dist/runtime/ryugi-ui.js',
      'dist/viewer/index.css',
      'dist/viewer/index.html',
      'dist/viewer/index.js',
      'package.json',
    ]),
  );
  expect(
    files.filter(
      (file) =>
        !file.startsWith('dist/viewer/') &&
        !file.startsWith('dist/runtime/') &&
        file !== 'dist/server.cjs' &&
        file !== 'package.json',
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
    'skills/artifacts/app/viewer/index.js',
    'skills/artifacts/app/runtime/ryugi-ui.js',
    'artifacts/dist/server.cjs',
    'artifacts/dist/viewer/index.js',
  ]) {
    expect(() => execFileSync('git', ['check-ignore', '-q', rel], { cwd: repoRoot }), rel).not.toThrow();
  }
});
