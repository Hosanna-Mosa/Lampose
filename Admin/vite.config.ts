import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // Strip console/debugger from production bundles only; dev-server output
  // (npm run dev) is untouched.
  //
  // This is Vite 8, built on Rolldown: `esbuild` is now an optional peer
  // (installed as a devDependency here just so its types resolve) and its
  // legacy `esbuild.*` config is silently superseded the moment anything
  // sets `config.oxc` — which @vitejs/plugin-react does — so `esbuild.drop`
  // below is kept for intent/back-compat but is NOT what actually strips
  // anything. The live mechanism is Rolldown's own minifier, configured
  // through `build.rolldownOptions.output.minify`; `dropDebugger` already
  // defaults to true there, `dropConsole` does not.
  esbuild: {
    drop: command === 'build' ? ['console', 'debugger'] : [],
  },
  build: {
    rolldownOptions: {
      output: {
        minify: command === 'build'
          ? { compress: { dropConsole: true, dropDebugger: true } }
          : false,
      },
    },
  },
}))

