import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import stylex from '@stylexjs/unplugin';
import react from '@vitejs/plugin-react';
import { defineConfig, esmExternalRequirePlugin, type Plugin } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const PEERS = [
  'react',
  'react-dom',
  '@lobehub/ui',
  'i18next',
  'react-i18next',
  'motion',
  'lucide-react',
];
// StyleX inlines @lobehub/ui's cssVar constants only when it compiles their module, so those stay in the bundle.
const PEER_IDS = PEERS.map(
  (name) => new RegExp(`^${name.replace(/[/.]/g, '\\$&')}(?!/stylex/)(?:/|$)`),
);
const LAZY_CSS = 'lazy-css:';
const DYNAMIC_CSS = /import\((['"])([^'"]+\.css)\1\)/g;
const FONT = /url\((["']?)data:(font\/[\w-]+);base64,([A-Za-z0-9+/=]+)\1\)/g;

const digest = (value: string | Buffer, length: number) =>
  createHash('sha256').update(value).digest('hex').slice(0, length);

// Library builds drop dynamic CSS imports (Excalidraw loads its sheet that way); a JS wrapper keeps the sheet attached to a lazy chunk.
function lazyCss(): Plugin {
  const sheets = new Map<string, string>();
  return {
    name: 'viewer-lib-lazy-css',
    apply: 'build',
    transform(code, id) {
      if (!/\.[cm]?[jt]sx?$/.test(id) || !code.includes('.css')) return null;
      const next = code.replace(
        DYNAMIC_CSS,
        (_match, quote: string, spec: string) => `import(${quote}${LAZY_CSS}${spec}${quote})`,
      );
      return next === code ? null : { code: next, map: null };
    },
    async resolveId(source, importer) {
      if (!source.startsWith(LAZY_CSS)) return null;
      const resolved = await this.resolve(source.slice(LAZY_CSS.length), importer, {
        skipSelf: true,
      });
      if (!resolved) return null;
      const key = digest(resolved.id, 8);
      sheets.set(key, resolved.id);
      return `\0${LAZY_CSS}${key}.js`;
    },
    load(id) {
      const sheet = id.startsWith(`\0${LAZY_CSS}`)
        ? sheets.get(id.slice(LAZY_CSS.length + 1, -3))
        : undefined;
      return sheet ? `import ${JSON.stringify(sheet)};\nexport default true;\n` : null;
    },
  };
}

const STYLEX_SHEET = 'stylex.css';

// StyleX appends every library rule to one existing sheet; a dedicated sheet lets each entry import the rules without another entry's CSS.
function stylexSheet(): Plugin {
  return {
    name: 'viewer-lib-stylex-sheet',
    apply: 'build',
    generateBundle: {
      order: 'pre',
      handler() {
        this.emitFile({ type: 'asset', fileName: STYLEX_SHEET, source: '' });
      },
    },
  };
}

// Library mode inlines every asset and leaves CSS unreferenced; consumers need font files and per-chunk CSS imports so their own bundler can split them.
function consumableOutput(): Plugin {
  return {
    name: 'viewer-lib-consumable-output',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.css')) continue;
        file.source = String(file.source).replace(
          FONT,
          (_match, _quote, mime: string, data: string) => {
            const bytes = Buffer.from(data, 'base64');
            const name = `font-${digest(bytes, 12)}.${mime.slice('font/'.length)}`;
            if (!bundle[name]) this.emitFile({ type: 'asset', fileName: name, source: bytes });
            return `url(./${name})`;
          },
        );
      }
      const stylex = Object.keys(bundle).find((name) => /^stylex(?:-[\w-]+)?\.css$/.test(name));
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const css = [...(chunk.viteMetadata?.importedCss ?? [])];
        if (chunk.isEntry && chunk.name !== 'shims' && stylex && !css.includes(stylex))
          css.unshift(stylex);
        const sheets = css.map((name) => `import './${name}';\n`).join('');
        // StyleX compiles constants into literals but keeps the side-effect import of external .stylex modules.
        chunk.code =
          sheets + chunk.code.replace(/^import ["'][^"']+\.stylex(?:\.js)?["'];\n/gm, '');
      }
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [
    stylexSheet(),
    stylex.vite({
      useCSSLayers: true,
      unstable_moduleResolution: { type: 'commonJS', rootDir: root },
      cssInjectionTarget: (fileName) => fileName === STYLEX_SHEET,
    }),
    react(),
    lazyCss(),
    consumableOutput(),
    esmExternalRequirePlugin({ external: PEER_IDS }),
  ],
  resolve: { alias: { 'loro-crdt': 'loro-crdt/base64' } },
  build: {
    outDir: 'dist/viewer-lib',
    emptyOutDir: true,
    cssCodeSplit: true,
    lib: {
      entry: {
        index: 'src/viewer/library/index.ts',
        core: 'src/viewer/library/core.ts',
        document: 'src/viewer/library/document.ts',
        shims: 'src/viewer/document/shims.ts',
      },
      formats: ['es'],
    },
    rolldownOptions: {
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash][extname]',
      },
    },
  },
});
