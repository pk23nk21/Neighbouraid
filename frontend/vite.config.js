/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
  // Split the bundle by responsibility so the user only downloads the
  // map-related code on first visit to /map, not on /login. Cuts the
  // initial JS payload roughly in half on the auth pages.
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'leaflet-vendor': ['leaflet', 'react-leaflet'],
          'auth-vendor': ['axios', 'jwt-decode'],
        },
      },
    },
    // Lift the warning ceiling to a sane level after splitting; below
    // this size each chunk loads in ~1 RTT on a 3G connection.
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
    // Don't dive into node_modules / dist — keeps the run fast and avoids
    // accidentally including third-party __tests__ folders.
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/**/*.test.{js,jsx}', 'src/test/**', 'src/main.jsx'],
    },
  },
})
