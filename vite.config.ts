import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import glsl from 'vite-plugin-glsl';
import tailwind from '@tailwindcss/vite';
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const ollamaHost = env.VITE_OLLAMA_HOST ?? 'http://127.0.0.1:11434';
  const adminApiHost = env.VITE_ADMIN_API_HOST ?? 'http://127.0.0.1:3000';
  const r2PublicBaseUrl = env.VITE_R2_PUBLIC_BASE_URL;

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
      proxy: {
        '/api': {
          target: adminApiHost,
          changeOrigin: true,
        },
        ...(r2PublicBaseUrl
          ? {
              '/r2': {
                target: r2PublicBaseUrl,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/r2/, ''),
              },
            }
          : {}),
        '/ollama': {
          target: ollamaHost,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ollama/, ''),
        },
        '/deepseek-api': {
          target: 'https://api.deepseek.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/deepseek-api/, ''),
        },
      },
    },
  };
})
