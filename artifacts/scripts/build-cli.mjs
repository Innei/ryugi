import fs from 'node:fs';
import { build } from 'esbuild';

const { version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
await build({
  entryPoints: ['src/cli/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  banner: { js: '#!/usr/bin/env node' },
  define: { CLI_VERSION: JSON.stringify(version) },
  outfile: 'dist/cli.cjs',
});
fs.copyFileSync('dist/cli.cjs', '../skills/artifacts/app/cli.cjs');
