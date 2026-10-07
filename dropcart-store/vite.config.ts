import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Local dev server uses PORT if set, otherwise Vite's default (5173).
// Vercel only runs `vite build`, which never touches this block.
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;

// Base path for the built assets. Defaults to "/" for a normal deployment
// (Vercel, Render, etc). Only override BASE_PATH if you're serving the app
// from a sub-path.
const basePath = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss({ optimize: false })],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: true,
  },
  server: {
    port,
    strictPort: false,
    host: '0.0.0.0',
  },
  preview: {
    port,
    host: '0.0.0.0',
  },
});
