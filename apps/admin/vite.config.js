import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '');
  const proxy = {
    '/media': { target: env.SYNC_API_TARGET || 'http://127.0.0.1:3002', changeOrigin: false },
    '/api': {
      target: env.SYNC_API_TARGET || 'http://127.0.0.1:3002',
      changeOrigin: false,
    },
  };
  return {
    base: mode === 'prod' ? '/admin/' : '/',
    plugins: [react()],
    server: { host: '0.0.0.0', port: 3004, strictPort: true, proxy },
    preview: { host: '0.0.0.0', port: 3004, strictPort: true, proxy },
  };
});
