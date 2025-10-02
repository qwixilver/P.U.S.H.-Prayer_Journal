// vite.config.js
// Pages-safe PWA config for repo: /P.U.S.H.-Prayer_Journal/
// - Correct `base` so build assets & the service worker live under the repo path
// - VitePWA handles manifest injection and SW registration (no manual SW code in index.html)

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// IMPORTANT: must match your GitHub repo name exactly
const base = '/P.U.S.H.-Prayer_Journal/';

export default defineConfig({
  base,

  plugins: [
    react(),
    VitePWA({
      // Auto-register & update the SW; no manual code needed in index.html
      registerType: 'autoUpdate',

      // Where the PWA is allowed to control pages
      // (critical for GitHub Pages which serves under /<repo>/)
      scope: base,
      base, // ensure workbox/globs resolve under the base path

      // Cache strategy (default is fine; we include common asset types)
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // For SPA routes on Pages, fallback to your base/index.html:
        navigateFallback: `${base}index.html`,
      },

      // The Web App Manifest
      manifest: {
        name: 'Prayer Journal',
        short_name: 'Journal',
        lang: 'en',
        display: 'standalone',
        background_color: '#1A202C',
        theme_color: '#1A202C',

        // VERY IMPORTANT ON PAGES:
        // Start URL and scope MUST be your repo base, not "/"
        start_url: base,
        scope: base,

        // Use relative icon paths so they resolve under the manifest’s URL (/P.U.S.H.-Prayer_Journal/)
        icons: [
          {
            src: 'assets/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'assets/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            // maskable lets Android produce nicer adaptive icons
            src: 'assets/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],

  server: {
    host: true,
    port: 3000,
  },

  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
