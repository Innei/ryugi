import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

// The runtime ships as one script, so fonts marked ?no-inline for the viewer library must still be inlined here.
function inlineFonts(): Plugin {
  return {
    name: 'runtime-inline-fonts',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.css') || !code.includes('?no-inline')) return null;
      return { code: code.replaceAll('?no-inline', ''), map: null };
    },
  };
}

export default defineConfig({
  plugins: [inlineFonts(), react()],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist/runtime',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    lib: {
      entry: 'src/runtime/index.tsx',
      formats: ['iife'],
      name: 'RyugiUI',
      fileName: () => 'ryugi-ui.js',
    },
    rolldownOptions: {
      output: { assetFileNames: 'ryugi-ui.css' },
    },
  },
});
