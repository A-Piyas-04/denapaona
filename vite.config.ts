import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-maskable.svg'],
      manifest: {
        name: 'দেনা পাওনা',
        short_name: 'Dena Pauna',
        description: 'Consent-based debt ledger for friend groups',
        theme_color: '#12100E',
        background_color: '#12100E',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/groups',
        scope: '/',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Offline shell only (§15 Phase 5).  Data is never served from a stale
        // cache as if it were live: money figures come from the network, and
        // TanStack Query's in-memory cache backs the "saved data" banner.
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          data: ['@supabase/supabase-js', '@tanstack/react-query'],
        },
      },
    },
  },
  resolve: {
    alias: { '@': '/src' },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
