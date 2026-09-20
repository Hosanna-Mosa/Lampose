import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  },
  // Strip console/debugger from production bundles only; dev-server output
  // (npm run dev) is untouched.
  esbuild: {
    drop: command === 'build' ? ['console', 'debugger'] : [],
  },
}));
