import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the built site from docs/ at /nisha-gallery/.
export default defineConfig({ plugins: [react()], base: './', build: { outDir: 'docs', emptyOutDir: true } });
