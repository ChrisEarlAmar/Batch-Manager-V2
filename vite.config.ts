import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Fixed + strict so the Electron main process (which loads this exact
    // origin in dev) never silently ends up pointed at a different app
    // because 5173 was already taken by another project on the machine.
    port: 5327,
    strictPort: true,
    watch: {
      // electron-builder writes a full Electron distribution (100MB+,
      // hundreds of files) into release/ — without this, every build
      // triggers a storm of HMR file-change events and forces full page
      // reloads while the app is actively being used.
      ignored: ['**/release/**'],
    },
  },
})
