import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: '/cclab/ParentingBudget/',
  root: fileURLToPath(new URL('./pages', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  css: { postcss: { plugins: [tailwindcss()] } },
  resolve: { alias: { '@': projectRoot } },
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('./pages-dist', import.meta.url)),
    emptyOutDir: true,
  },
});
