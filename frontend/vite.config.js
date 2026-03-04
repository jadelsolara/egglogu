import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // Single bundle output (replaces monolithic egglogu.js)
    rollupOptions: {
      input: resolve(__dirname, 'src/app.js'),
      output: {
        entryFileNames: 'egglogu.js',
        // Code splitting for lazy-loaded modules
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // Manual chunk grouping for optimal loading
        manualChunks: {
          'core': [
            './src/core/event-bus.js',
            './src/core/utils.js',
            './src/core/security.js',
            './src/core/api-service.js',
            './src/core/translations.js',
            './src/core/route-bridge.js',
            './src/core/feature-flags.js',
            './src/core/datatable-bridge.js',
            './src/core/render-utils.js',
          ],
          'data': [
            './src/core/data.js',
            './src/core/sync.js',
          ],
        },
      },
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // Keep console for error tracking
        pure_funcs: ['console.debug'],
      },
    },
    sourcemap: true,
    // Target modern browsers (PWA requires service worker support anyway)
    target: 'es2020',
  },
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@modules': resolve(__dirname, 'src/modules'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
});
