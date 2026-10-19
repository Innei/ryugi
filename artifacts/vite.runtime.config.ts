import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
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
