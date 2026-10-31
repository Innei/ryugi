import fs from 'node:fs';
import path from 'node:path';

import { build } from 'esbuild';
import { expect, test } from 'vitest';

const pkgDir = path.resolve(__dirname, '..');
const lib = path.join(pkgDir, 'dist/viewer-lib');
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as {
  exports: Record<string, string | { types: string; default: string }>;
};
const LOCAL_APP =
  /(?:^|\/)(?:PublishMenu|AutoPublishPrompt|PlanLimitDialog|useArtifactSocket|useArtifactFeed|useCloudSync|usePublication|useCloudStatus|useDocumentTransport|ArtifactList|Shell|route|main|preview)\.tsx?$/;
const CLOUD =
  /(?:^|\/)(?:Cloud[A-Z]\w*|cloud-(?:list|list-menus|shell|publication)|cloudLive|liveConnection|knownHosts|useRelayTransport|useDailyViews|context-menu)\.tsx?$/;

test('the library never reaches local app or cloud modules', async () => {
  const { metafile } = await build({
    entryPoints: Object.values(pkg.exports)
      .flatMap((target) => (typeof target === 'object' ? [target.types] : []))
      .map((types) =>
        path.join(pkgDir, types.replace('./dist/viewer-lib/types/', '').replace(/\.d\.ts$/, '.ts')),
      ),
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
    for (const file of typeof target === 'string' ? [target] : [target.types, target.default])
      expect(fs.existsSync(path.join(pkgDir, file)), `${entry} → ${file}`).toBe(true);
  }
});

test('library chunks carry their own CSS, ship fonts as files and never call a fixed API path', () => {
  const files = fs.readdirSync(lib);
  const chunks = files
    .filter((file) => file.endsWith('.js'))
    .map((file) => fs.readFileSync(path.join(lib, file), 'utf8'));
  const sheets = files.filter((file) => file.endsWith('.css'));
  expect(sheets.length).toBeGreaterThan(0);
  for (const sheet of sheets) {
    expect(
      chunks.some((code) => code.includes(`import './${sheet}';`)),
      `${sheet} must be imported by its chunk`,
    ).toBe(true);
    const css = fs.readFileSync(path.join(lib, sheet), 'utf8');
    expect(css).not.toMatch(/url\(["']?data:font\//);
    expect(css, `${sheet} must reference its assets relatively`).not.toMatch(/url\(["']?\//);
  }
  expect(chunks.filter((code) => /["'`]\/api\//.test(code))).toEqual([]);
});

test("every UI entry carries the StyleX rules, so one entry renders without another entry's CSS", () => {
  const sheet = fs.readdirSync(lib).find((file) => /^stylex-[\w-]+\.css$/.test(file));
  expect(sheet).toBeDefined();
  for (const entry of ['index.js', 'core.js', 'document.js'])
    expect(fs.readFileSync(path.join(lib, entry), 'utf8'), entry).toContain(`import './${sheet}';`);
});

test('every StyleX variable the library CSS reads is defined in it', () => {
  const css = fs
    .readdirSync(lib)
    .filter((file) => file.endsWith('.css'))
    .map((file) => fs.readFileSync(path.join(lib, file), 'utf8'))
    .join('\n');
  const defined = new Set([...css.matchAll(/(--x[\w-]+)\s*:/g)].map(([, name]) => name));
  const undefinedVars = [
    ...new Set([...css.matchAll(/var\((--x[\w-]+)\)/g)].map(([, name]) => name!)),
  ].filter((name) => !defined.has(name));
  expect(undefinedVars).toEqual([]);
});

test('bundled CommonJS reaches peers through imports, never a runtime require', () => {
  const peers = Object.keys(
    (
      JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as {
        peerDependencies: Record<string, string>;
      }
    ).peerDependencies,
  );
  const require = new RegExp(
    `\\b[\\w$]{1,3}\\(["'](?:${peers.map((name) => name.replaceAll(/[/.]/g, '\\$&')).join('|')})(?:/[^"']*)?["']\\)`,
  );
  const offenders = fs
    .readdirSync(lib)
    .filter(
      (file) => file.endsWith('.js') && require.test(fs.readFileSync(path.join(lib, file), 'utf8')),
    );
  expect(offenders).toEqual([]);
});

test('the embedded canvas frame has no border once compiled', () => {
  const files = fs.readdirSync(lib);
  const code = fs.readFileSync(path.join(lib, 'index.js'), 'utf8');
  const region = code.slice(code.indexOf('//#region src/viewer/components/EmbeddedCanvas.tsx'));
  const classes = /className: "([^"]+)"/.exec(region)![1]!.split(' ');
  const css = files
    .filter((file) => /^stylex(?:-[\w-]+)?\.css$/.test(file))
    .map((file) => fs.readFileSync(path.join(lib, file), 'utf8'))
    .join('');
  const rules = classes.map(
    (name) => new RegExp(`\\.${name}[^{]*\\{([^}]*)\\}`).exec(css)?.[1] ?? '',
  );
  expect(rules.some((rule) => /border(?:-width)?:\s*0/.test(rule))).toBe(true);
});
