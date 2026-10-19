import { fileURLToPath } from 'node:url';
import stylex from '@stylexjs/unplugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  plugins: [
    stylex.vite({
      useCSSLayers: true,
      unstable_moduleResolution: { type: 'commonJS', rootDir: root },
    }),
    react(),
  ],
  build: {
    outDir: fileURLToPath(new URL('../skills/brainstorming/artboard/viewer', import.meta.url)),
    emptyOutDir: true,
  },
});
