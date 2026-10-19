import { fileURLToPath } from 'node:url';
import stylex from '@stylexjs/unplugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: '/',
  plugins: [
    stylex.vite({
      useCSSLayers: true,
      unstable_moduleResolution: { type: 'commonJS', rootDir: root },
    }),
    react(),
  ],
  resolve: { alias: { 'loro-crdt': 'loro-crdt/base64' } },
  build: {
    outDir: fileURLToPath(new URL('dist/viewer', import.meta.url)),
    emptyOutDir: true,
    assetsDir: '',
    rolldownOptions: {
      output: {
        entryFileNames: 'index.js',
        chunkFileNames: '[name]-[hash].js',
        // StyleX emits an intermediate index.css (with originalFileNames) that is later merged away; naming it too makes the survivor index2.css.
        assetFileNames: (asset) => (asset.names[0]?.endsWith('.css') && asset.originalFileNames.length === 0 ? 'index.css' : '[name]-[hash][extname]'),
      },
    },
  },
});
