import { defineConfig, loadEnv } from 'vite'
import type { ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import glsl from 'vite-plugin-glsl';
import tailwind from '@tailwindcss/vite';
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const ollamaHost = env.VITE_OLLAMA_HOST ?? 'http://127.0.0.1:11434';
  const adminApiHost = env.VITE_ADMIN_API_HOST ?? 'http://127.0.0.1:3000';
  const r2PublicBaseUrl = env.VITE_R2_PUBLIC_BASE_URL;
  const preserveTenantHost = env.VITE_SUBDOMAIN_TENANT_ROUTING_ENABLED === 'true';
  const apiProxy: ProxyOptions = {
    target: adminApiHost,
    changeOrigin: !preserveTenantHost,
    // Browsers omit the Origin header on same-origin GETs. Supply the local
    // origin for both Vite dev and production-preview parity servers, without
    // overriding a real Origin or subdomain-routing requests.
    ...(preserveTenantHost
      ? {}
      : {
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              if (!req.headers.origin) {
                const host = req.headers.host ?? 'localhost:5173';
                proxyReq.setHeader('origin', `http://${host}`);
              }
            });
          },
        }),
  };
  const proxy: Record<string, string | ProxyOptions> = {
    '/api': apiProxy,
    ...(r2PublicBaseUrl
      ? {
          '/r2': {
            target: r2PublicBaseUrl,
            changeOrigin: true,
            rewrite: (path: string) => path.replace(/^\/r2/, ''),
          },
        }
      : {}),
    '/ollama': {
      target: ollamaHost,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/ollama/, ''),
    },
    '/deepseek-api': {
      target: 'https://api.deepseek.com',
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/deepseek-api/, ''),
    },
  };

  return {
    plugins: [react(), glsl(), tailwind()],
    resolve: {
      alias: {
        "@": "/src",
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy,
    },
    preview: {
      port: 5173,
      strictPort: true,
      proxy,
    },
  };
})
