import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for the popup React app
export default defineConfig({
  root: 'src/popup',
  plugins: [react()],
  build: {
    // Build into the project root's dist/popup so tools/pack.mjs
    // can find the popup at <project>/dist/popup
    // Note: outDir is resolved relative to the root ('src/popup'),
    // so we need to go up two levels: src/popup -> src -> project root.
    outDir: '../../dist/popup',
    emptyOutDir: true
  }
});
