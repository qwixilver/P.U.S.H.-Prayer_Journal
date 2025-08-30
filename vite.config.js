// vite.config.js
// Vite config for React + PWA, prepared for GitHub Pages deployment.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  /**
   * IMPORTANT for GitHub Pages:
   * Your site will be served from:
   *   https://qwixilver.github.io/P.U.S.H.-Prayer_Journal/
   * The base must include leading and trailing slashes.
   */
  base: '/P.U.S.H.-Prayer_Journal/',

  plugins: [
    react(),

    /**
     * vite-plugin-pwa:
     * - Injects manifest + SW registration automatically
     * - Generates manifest.webmanifest and the SW with the correct base path
     */
    VitePWA({
      // Auto-register and auto-update the SW
      injectRegister: 'auto',
      registerType: 'autoUpdate',

      /**
       * Use relative start_url/scope and **no leading slash** on icon paths
       * so the PWA works under the GitHub Pages base path.
       */
      manifest: {
        name: 'Prayer Journal',
        short_name: 'Journal',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#1A202C',
        theme_color: '#1A202C',
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
        ],
      },

      /**
       * Keep PWA enabled in dev so you can sanity-check the manifest/SW locally.
       * Optional: set to false later if you prefer.
       */
      devOptions: {
        enabled: true,
      },

      /**
       * SPA fallback for Workbox (runtime on Pages).
       * This makes deep links reload correctly.
       */
      workbox: {
        navigateFallback: '/P.U.S.H.-Prayer_Journal/index.html',
      },
    }),
  ],

  // Dev server setup (unchanged)
  server: {
    host: true,
    port: 3000,
  },

  // Optional alias for cleaner imports
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
