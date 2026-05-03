import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import glsl from 'vite-plugin-glsl';
import tailwind from '@tailwindcss/vite';
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const ollamaHost = env.VITE_OLLAMA_HOST ?? 'http://192.168.11.118:11434';

  return {
    plugins: [react(), glsl(), tailwind()],
    resolve: {
      alias: {
        "@": "/src",
      },
    },
    server: {
      proxy: {
        '/ollama': {
          target: ollamaHost,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ollama/, ''),
        },
      },
    },
  };
})
