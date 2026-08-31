import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 3000,
    allowedHosts: 'all',
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        proxyTimeout: 10000,
        timeout: 10000,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if (err.message.includes('ECONNREFUSED')) return;
            console.error('Proxy error:', err.message);
          });
        },
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        configure: (proxy) => { proxy.on('error', () => {}); },
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
        configure: (proxy) => { proxy.on('error', () => {}); },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: mode !== 'production', // tắt sourcemap khi production để nhỏ file
  },
}));
