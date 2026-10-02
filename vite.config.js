import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// @ -> src
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: { port: 3100 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  test: { environment: 'node', include: ['test/**/*.test.js'], restoreMocks: true },
});
