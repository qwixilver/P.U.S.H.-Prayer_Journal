// vite.config.js
// Pages-safe PWA config for Closet Prayer.
// Use `npm run dev -- --mode mobile` for phone testing when Vite HMR reloads
// would otherwise interrupt file-picker state or other long-running UI tests.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = '/';

export default defineConfig(({ mode }) => {
  const mobileTestMode = mode === 'mobile';

  return {
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
        },
      }),
    ],
    server: {
      host: true,
      port: 3000,
      ...(mobileTestMode ? { hmr: false } : {}),
    },
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  };
});
