import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxyTarget = process.env.API_PROXY_TARGET || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': apiProxyTarget,
      '/twilio': apiProxyTarget
    }
  },
  preview: {
    port: 4173,
    allowedHosts: true,
    proxy: {
      '/api': apiProxyTarget,
      '/twilio': apiProxyTarget
    }
  }
});
