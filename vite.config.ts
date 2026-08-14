import { defineConfig } from 'vite'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  clearScreen: false,
  optimizeDeps: {
    exclude: ['kokoro-js', 'phonemizer'],
  },
  build: {
    rolldownOptions: {
      external: ['phonemizer'],
      output: {
        paths: {
          phonemizer: '/vendor/phonemizer.js',
        },
      },
    },
  },
  server: {
    host: host || false,
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
})
