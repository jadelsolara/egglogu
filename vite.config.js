import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // FarmLogU-ready path aliases — new code can use these
      '@core': path.resolve(__dirname, 'core/frontend/lib'),
      '@shell': path.resolve(__dirname, 'core/frontend/shell'),
      '@auth': path.resolve(__dirname, 'core/frontend/auth'),
      '@components': path.resolve(__dirname, 'core/frontend/components'),
      '@egg': path.resolve(__dirname, 'modules/egg/frontend'),
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: 'src/main.js',
      output: {
        entryFileNames: 'egglogu-app.js',
        format: 'es'
      }
    }
  }
});
