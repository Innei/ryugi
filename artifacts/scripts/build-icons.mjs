import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { icons } from 'lucide-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = fileURLToPath(new URL('..', import.meta.url));
const glyphs = {};
for (const Icon of Object.values(icons)) {
  const svg = renderToStaticMarkup(createElement(Icon));
  const name = /\blucide-([a-z0-9-]+)/.exec(svg)?.[1];
  if (name) glyphs[name] = svg;
}
glyphs.refresh = glyphs['refresh-cw'];
glyphs.trash = glyphs['trash-2'];
const outfile = path.join(root, 'dist/runtime/ryugi-icons.js');
await build({
  stdin: {
    contents: `import { registerIcons } from './src/runtime/icons'; registerIcons(${JSON.stringify(glyphs)});`,
    resolveDir: root,
    loader: 'ts',
  },
  outfile,
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2022',
  banner: { js: `/*!\n${fs.readFileSync(path.join(root, 'node_modules/lucide-react/LICENSE'), 'utf8')}\n*/` },
});
fs.copyFileSync(outfile, path.join(root, '../skills/artifacts/app/runtime/ryugi-icons.js'));
console.log(JSON.stringify({ icons: Object.keys(glyphs).length, bytes: fs.statSync(outfile).size }));
