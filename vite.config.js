// vite.config.js
// Pages-safe PWA config for the closetprayer.com custom domain.
// VitePWA handles manifest injection and service-worker registration.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = '/';

const shortcutIcon = {
  src: 'assets/icons/icon-192x192.png',
  sizes: '192x192',
  type: 'image/png',
};

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      scope: base,
      base,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: `${base}index.html`,
      },
      manifest: {
        name: 'Prayer Journal',
        short_name: 'Journal',
        lang: 'en',
        display: 'standalone',
        background_color: '#1A202C',
        theme_color: '#1A202C',
        start_url: base,
        scope: base,
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
            src: 'assets/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Pray Now',
            short_name: 'Pray',
            description: 'Open a randomized prayer request.',
            url: '?action=pray-now#single',
            icons: [shortcutIcon],
          },
          {
            name: 'Add Prayer',
            short_name: 'Add Prayer',
            description: 'Open the form to add a new prayer request.',
            url: '?action=add-prayer#daily',
            icons: [shortcutIcon],
          },
          {
            name: 'Daily List',
            short_name: 'Daily',
            description: 'Open the daily prayer list.',
            url: '#daily',
            icons: [shortcutIcon],
          },
          {
            name: 'New Journal Entry',
            short_name: 'Journal',
            description: 'Open the form to write a new journal entry.',
            url: '?action=add-journal#journal',
            icons: [shortcutIcon],
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
