import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    host: '127.0.0.1',
    port: 3000,
  },

  resolve: {
    alias: {
      'react-router/dom':
        'react-router/dist/development/dom-export.js',
    },
  },

  test: {
    globals: true,
    environment: 'jsdom',
    root: './frontend',
    setupFiles: './src/setupTests.jsx',
  },
});