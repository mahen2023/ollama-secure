import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND = 'http://localhost:3001';
const proxyTo = { target: BACKEND, changeOrigin: true };

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Android app serves the build from the WebView root; the web build lives under /chat
  base: mode === 'mobile' ? '/' : '/chat',
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
}));
