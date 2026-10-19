import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

const pkgDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(pkgDir, '..');
const localApp = path.join(repoRoot, 'skills/artifacts/app');

test('the published package holds the server and the viewer under fixed names and nothing else', () => {
  const [pack] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: pkgDir, encoding: 'utf8' }));
  const files = (pack.files as { path: string }[]).map((f) => f.path).sort();
  expect(files).toEqual([
    'dist/server.cjs',
    'dist/viewer/index.css',
    'dist/viewer/index.html',
    'dist/viewer/index.js',
    'package.json',
  ]);
});

test('the viewer is a production build even when built from the test runner', () => {
  expect(fs.readFileSync(path.join(pkgDir, 'dist/viewer/index.js'), 'utf8')).not.toContain('react.dev/link');
});

test('the server and viewer builds are mirrored into the plugin for local development', () => {
  expect(fs.existsSync(path.join(localApp, 'server.cjs'))).toBe(true);
  expect(fs.readdirSync(path.join(localApp, 'viewer')).sort()).toEqual(['index.css', 'index.html', 'index.js']);
});

test('build output is never committed', () => {
  for (const rel of [
    'skills/artifacts/app/server.cjs',
    'skills/artifacts/app/viewer/index.js',
    'artifacts/dist/server.cjs',
    'artifacts/dist/viewer/index.js',
  ]) {
    expect(() => execFileSync('git', ['check-ignore', '-q', rel], { cwd: repoRoot }), rel).not.toThrow();
  }
});
