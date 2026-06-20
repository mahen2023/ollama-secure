import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND = 'http://localhost:3001';
const proxyTo = { target: BACKEND, changeOrigin: true };

export default defineConfig({
  plugins: [react()],
  base: '/chat',
  server: {
    port: 5173,
    proxy: {
      '/api':      proxyTo,
      '/v1':       proxyTo,
      '/auth':     proxyTo,
      '/chats':    proxyTo,
      '/settings': proxyTo,
      '/apikeys':  proxyTo,
      '/admin':    proxyTo,
    },
  },
});
