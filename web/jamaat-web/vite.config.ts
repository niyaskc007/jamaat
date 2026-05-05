import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// In dev the SPA runs on :5173 and the API on a separate port (default :5174). Image src URLs
// returned by the API are relative ("/api/v1/events/{id}/cover/file" etc.) so the browser
// resolves them against :5173 and hits Vite's 404. Production deployments serve API + SPA from
// one origin so relative URLs work natively; dev needs an explicit proxy that mirrors that.
// Target is read from VITE_API_BASE_URL so it tracks whatever .env.development configures.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBase = env.VITE_API_BASE_URL || 'http://localhost:5174';
  return {
    plugins: [
      react(),
      // Phase E: PWA shell. Service worker precaches the static SPA bundle + locale files,
      // and runtime-caches GET /api/v1/portal/me/* so members opening the portal offline see
      // their last-fetched data instead of a network error. registerType=autoUpdate installs
      // a fresh SW on every deploy without prompting; clients refresh on next navigation.
      VitePWA({
        registerType: 'autoUpdate',
        // Generated SW lives in dist/sw.js; client registration is wired via registerSW.ts
        // (default behaviour). devOptions enables the SW in dev so we can smoke-test offline.
        devOptions: { enabled: true },
        includeAssets: ['favicon.svg', 'icons.svg', 'locales/**/*.json'],
        manifest: {
          name: 'Jamaat Member Portal',
          short_name: 'Jamaat',
          description: 'Self-service portal for Jamaat members.',
          theme_color: '#0B6E63',
          background_color: '#FAFAFA',
          display: 'standalone',
          // Members landing on the portal should see /portal/me, not the operator dashboard.
          // Operators who add to home screen also land here; they can navigate to /dashboard
          // from inside the app if they want.
          start_url: '/portal/me',
          scope: '/',
          icons: [
            { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
          ],
        },
        workbox: {
          // The main bundle is ~3 MB today (lazy-loading the portal helps members but the
          // operator bundle dominates). Lift the precache limit so workbox bundles the SPA
          // shell into the SW cache; without it, offline shell rendering fails because the
          // JS chunk isn't cached. Future: code-split further so this limit can drop.
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          // Cache the most recent /api/v1/portal/me/* responses with NetworkFirst (5s timeout)
          // so the offline shell shows real data when reachable, falls back to cache when not.
          // Operator endpoints are intentionally NOT cached - operators need fresh data.
          runtimeCaching: [
            {
              urlPattern: /\/api\/v1\/portal\/me(\/|$).*/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'portal-me-v1',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /\/api\/v1\/cms\/blocks(\/|\?|$).*/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'cms-blocks-v1',
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    server: {
      proxy: {
        '/api': {
          target: apiBase,
          changeOrigin: true,
          secure: false,
          // Forward the original client IP so the API's login-audit + geolocation see the real
          // browser address instead of the Vite proxy's loopback. Production behind nginx/IIS
          // gets this for free; this makes dev consistent.
          xfwd: true,
        },
      },
    },
  };
});
