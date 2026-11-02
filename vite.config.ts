import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths: the same build runs under a sub-path
  // (GitHub Pages: /basketli/) and later on its own domain.
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['manifold-3d'] },
});
