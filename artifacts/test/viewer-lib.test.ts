import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

const pkgDir = path.resolve(__dirname, '..');
const lib = path.join(pkgDir, 'dist/viewer-lib');
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as { exports: Record<string, string | { types: string; default: string }> };
const LOCAL_APP = /(?:^|\/)(?:PublishMenu|AutoPublishPrompt|PublicationStatus|PlanLimitDialog|useArtifactSocket|useArtifactFeed|useCloudSync|usePublication|useCloudStatus|useDocumentTransport|ArtifactList|Shell|route|main|preview)\.tsx?$/;
const CLOUD = /(?:^|\/)(?:Cloud[A-Z]\w*|cloud-(?:list|list-menus|shell|publication)|cloudLive|liveConnection|knownHosts|useRelayTransport|useDailyViews|context-menu)\.tsx?$/;

test('the library never reaches local app or cloud modules', async () => {
  const { metafile } = await build({
    entryPoints: Object.values(pkg.exports)
      .flatMap((target) => (typeof target === 'object' ? [target.types] : []))
      .map((types) => path.join(pkgDir, types.replace('./dist/viewer-lib/types/', '').replace(/\.d\.ts$/, '.ts'))),
    bundle: true,
    write: false,
    metafile: true,
    outdir: 'out',
    format: 'esm',
    packages: 'external',
    loader: { '.svg': 'text', '.woff2': 'empty', '.json': 'json' },
    alias: { 'loro-crdt': 'loro-crdt/base64' },
  });
  const inputs = Object.keys(metafile!.inputs).filter((file) => file.startsWith('src/'));
  expect(inputs.length).toBeGreaterThan(50);
  expect(inputs.filter((file) => LOCAL_APP.test(file) || CLOUD.test(file))).toEqual([]);
});

test('library exports point at built files', () => {
  for (const [entry, target] of Object.entries(pkg.exports)) {
    for (const file of typeof target === 'string' ? [target] : [target.types, target.default]) expect(fs.existsSync(path.join(pkgDir, file)), `${entry} → ${file}`).toBe(true);
  }
});

test('library chunks carry their own CSS, ship fonts as files and never call a fixed API path', () => {
  const files = fs.readdirSync(lib);
  const chunks = files.filter((file) => file.endsWith('.js')).map((file) => fs.readFileSync(path.join(lib, file), 'utf8'));
  const sheets = files.filter((file) => file.endsWith('.css'));
  expect(sheets.length).toBeGreaterThan(0);
  for (const sheet of sheets) {
    expect(chunks.some((code) => code.includes(`import './${sheet}';`)), `${sheet} must be imported by its chunk`).toBe(true);
    expect(fs.readFileSync(path.join(lib, sheet), 'utf8')).not.toMatch(/url\(["']?data:font\//);
  }
  expect(chunks.filter((code) => /["'`]\/api\//.test(code))).toEqual([]);
});
