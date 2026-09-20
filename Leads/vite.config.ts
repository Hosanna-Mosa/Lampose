import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            // Silently suppress ECONNREFUSED logs during backend restarts
          });
        }
      }
    }
  },
  // Strip console/debugger from production bundles only; dev-server output
  // (npm run dev) is untouched.
  esbuild: {
    drop: command === 'build' ? ['console', 'debugger'] : [],
  },
}));
