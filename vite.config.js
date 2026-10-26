import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The C toolchain (public/toolchain/...) is served as static files and loaded
// at run time by the compiler worker, so it is not processed by Vite.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 2500 },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
});
