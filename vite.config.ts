import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // Fixed + strict so the Electron main process (which loads this exact
    // origin in dev) never silently ends up pointed at a different app
    // because 5173 was already taken by another project on the machine.
    port: 5327,
    strictPort: true,
  },
})
