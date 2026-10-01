import { defineConfig } from 'vite'

export default defineConfig({
  // Relative base so `npm run build` output runs from any static host or file path.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // vendor code changes rarely: keep it in its own long-cacheable files
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three'
        },
      },
    },
  },
  server: {
    port: 5180,
    strictPort: false,
  },
})
