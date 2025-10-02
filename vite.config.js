// vite.config.js
// Temporary config to rule out PWA/SW issues on GitHub Pages.
// We KEEP the correct base for Pages, but REMOVE the VitePWA plugin for now.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// IMPORTANT: this must match your repo name for GH Pages
const base = '/P.U.S.H.-Prayer_Journal/';

export default defineConfig({
  base,
  plugins: [
    react(),
    // VitePWA temporarily disabled while we debug blank-tab issue on Pages.
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
