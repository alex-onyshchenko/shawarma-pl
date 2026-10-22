import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '');
  if (process.env.VERCEL && env.VITE_MENU_PREVIEW !== 'true') {
    let api;
    try { api = new URL(env.VITE_SYNC_API_URL); } catch { /* Report configuration below. */ }
    if (!api || api.protocol !== 'https:' || /^(localhost|127\.|\[::1\])/.test(api.hostname) || api.username || api.password || api.search || api.hash || api.pathname !== '/') {
      throw new Error('Set VITE_SYNC_API_URL to the public HTTPS origin of Sync, e.g. https://sync.your-domain.com (without /api). See DEPLOYMENT.md.');
    }
  }
  const proxy = {
    '/api': {
      target: env.SYNC_API_TARGET || 'http://127.0.0.1:3002',
      changeOrigin: true,
    },
  };
  return {
    plugins: [react()],
    server: { host: '0.0.0.0', port: 3000, strictPort: true, proxy },
    preview: { host: '0.0.0.0', port: 3000, strictPort: true, proxy },
  };
});
