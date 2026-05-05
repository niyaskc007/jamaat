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
        // Phase L: prompt-on-update instead of autoUpdate so the user sees a "new
        // version available" toast and can accept or defer. registerSW.ts wires the
        // toast UI; if registerSW returns a needRefresh callback the SPA renders it.
        registerType: 'prompt',
        // Phase N: injectManifest strategy lets us own the SW source code so we can add
        // a `push` event listener (workbox's generateSW mode bakes the SW for us and
        // doesn't expose hooks). The custom SW is at src/sw.ts; vite-plugin-pwa injects
        // the precache manifest into self.__WB_MANIFEST at build time.
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        // Generated SW lives in dist/sw.js; devOptions enables it under `vite dev`
        // for smoke testing. In prod the SW is rebuilt on every deploy.
        devOptions: { enabled: true, type: 'module' },
        injectManifest: {
          // The main bundle is large after operator-app code-split; lift the precache
          // limit so the SW manifest covers it.
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        },
        includeAssets: [
          'favicon.svg', 'icons.svg',
          'icons/*.png',
          'locales/**/*.json',
        ],
        manifest: {
          name: 'Jamaat Member Portal',
          short_name: 'Jamaat',
          description: 'Self-service portal for Jamaat members - contributions, commitments, Qarzan Hasana, events.',
          theme_color: '#0B6E63',
          background_color: '#FAFAFA',
          display: 'standalone',
          orientation: 'portrait',
          // Members landing on the portal see /portal/me, not the operator dashboard.
          // Operators who add to home screen also land here; they can navigate to
          // /dashboard from inside the app if they want.
          start_url: '/portal/me',
          scope: '/',
          lang: 'en',
          // Multiple icon entries so browsers pick the right size and purpose. The
          // maskable variants have a 10% safe-zone padding so circle-cropping by
          // launchers (Android, iOS standalone) keeps the brand readable.
          icons: [
            { src: '/icons/icon-192.png',          sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png',          sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: '/favicon.svg',                 sizes: 'any',     type: 'image/svg+xml', purpose: 'any' },
          ],
          // Shortcuts that show in the long-press menu on installed apps (Android).
          shortcuts: [
            { name: 'My profile',     url: '/portal/me/profile',     description: 'Edit my profile' },
            { name: 'Contributions',  url: '/portal/me/contributions', description: 'My contribution history' },
            { name: 'Events',         url: '/portal/me/events',      description: 'My event registrations' },
          ],
        },
        // Workbox config moved into src/sw.ts because injectManifest strategy gives us
        // hand-written control of the SW (needed for the `push` event handler in Phase N).
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
