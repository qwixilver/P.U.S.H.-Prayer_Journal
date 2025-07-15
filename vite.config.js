// vite.config.js
// Configuration file for Vite build tool, optimizing fast development and build for React + PWA.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Register plugins: React support and PWA capabilities
  plugins: [
    react(), // Enables JSX transformation and fast refresh for React
    VitePWA({
      // Generates service worker and manifest automatically
      registerType: 'autoUpdate', // auto-update service worker when new content is available
      manifest: {
        name: 'Prayer Journal',
        short_name: 'Journal',
        start_url: '/',
        display: 'standalone',
        background_color: '#1A202C',
        theme_color: '#1A202C',
        icons: [
          {
            src: '/assets/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/assets/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],

  // Development server configuration
  server: {
    host: true, // allow network access (e.g., to test on mobile)
    port: 3000, // default port for local dev
  },

  // Path resolution aliases for cleaner imports
  resolve: {
    alias: {
      '@': '/src', // import components like `import Comp from '@/components/Comp';`
    },
  },
});
