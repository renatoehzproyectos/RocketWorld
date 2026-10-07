import { defineConfig } from 'vite';

export default defineConfig({
  // Root paths for Vercel production
  base: '/',
  server: {
    headers: {},
  },
  preview: {
    headers: {},
  },
  assetsInclude: ['**/*.wasm'],
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium'),
  },
  optimizeDeps: {
    exclude: ['cesium'],
  },
});
