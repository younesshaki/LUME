import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import glsl from 'vite-plugin-glsl';
import tailwind from '@tailwindcss/vite';
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), glsl(), tailwind()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
})
