import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// The built app is written to docs/v2, which Cloudflare Pages serves at https://devigai.pages.dev/v2/.
// base './' keeps every asset path relative, so the same build also works inside the Capacitor and desktop shells.
export default defineConfig({
  base: './',
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': `${import.meta.dirname}/src` },
  },
  build: {
    outDir: '../docs/v2',
    emptyOutDir: true,
  },
})
