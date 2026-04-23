import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'engine-core': fileURLToPath(new URL('../../packages/engine-core/index.ts', import.meta.url)),
      'rules-sdk': fileURLToPath(new URL('../../packages/rules-sdk/index.ts', import.meta.url)),
      'rules-sdk/hooks': fileURLToPath(new URL('../../packages/rules-sdk/hooks.ts', import.meta.url)),
      'engine-spatial': fileURLToPath(new URL('../../packages/engine-spatial/index.ts', import.meta.url)),
      'engine-entities': fileURLToPath(new URL('../../packages/engine-entities/index.ts', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
