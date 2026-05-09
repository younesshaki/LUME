import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import glsl from 'vite-plugin-glsl';
import tailwind from '@tailwindcss/vite';
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const ollamaHost = env.VITE_OLLAMA_HOST ?? 'http://127.0.0.1:11434';

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
        '/ollama': {
          target: ollamaHost,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ollama/, ''),
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            animation: ["gsap", "motion"],
            react: ["react", "react-dom"],
            supabase: ["@supabase/supabase-js"],
            three: [
              "three",
              "three-stdlib",
              "@react-three/fiber",
              "@react-three/drei",
              "@react-three/postprocessing",
              "postprocessing",
            ],
          },
        },
      },
    },
  };
})
