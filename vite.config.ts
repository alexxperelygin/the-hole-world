import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import pkg from './package.json';

// Public origin of the deployed site: used for share links, OG tags and the manifest. Override per environment with VITE_SITE_URL.
const SITE_URL = (process.env.VITE_SITE_URL || 'https://thehole.world').replace(/\/$/, '');

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __SITE_URL__: JSON.stringify(SITE_URL) },
  build: { target: 'es2020', sourcemap: false, assetsInlineLimit: 0 },
  // dev only: the API lives in worker/ (`npm run dev` there, port 8787). `vite preview` has no proxy, so the e2e run exercises the demo fallback.
  server: { proxy: { '/api': 'http://127.0.0.1:8787', '/og': 'http://127.0.0.1:8787' } },
  preview: { proxy: {} },
  plugins: [
    { name: 'site-url', transformIndexHtml: html => html.replace(/https:\/\/thehole\.world/g, SITE_URL) },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'og.png'],
      manifest: {
        name: 'The Hole World',
        short_name: 'Hole World',
        description: 'The whole world digs one hole. Tap to dig through the Earth.',
        theme_color: '#1b120d',
        background_color: '#1b120d',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/?src=pwa',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,webp,png,svg,json,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/(terms|privacy|refund)/, /^\/api\//, /^\/og/],
      },
    }),
  ],
});
