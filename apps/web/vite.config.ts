import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Keep Firebase out of the first page load; only AI pages pull it in.
        manualChunks(id: string) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    // Tests never use a developer's local Firebase or API settings.
    env: {
      VITE_FIREBASE_API_KEY: '',
      VITE_FIREBASE_PROJECT_ID: '',
      VITE_FIREBASE_APP_ID: '',
      VITE_API_BASE: '',
    },
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
