import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: { port: 5180, open: false },
  build: { outDir: 'dist', assetsDir: 'assets', sourcemap: false },
  // Strip console/debugger from production bundles only; dev-server output
  // (npm run dev / npm run preview's underlying serve) is untouched.
  esbuild: { drop: command === 'build' ? ['console', 'debugger'] : [] },
}));
