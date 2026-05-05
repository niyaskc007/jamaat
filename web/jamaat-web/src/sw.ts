/// <reference lib="webworker" />
//
// Custom service worker for the Jamaat PWA. injectManifest strategy means vite-plugin-pwa
// injects `self.__WB_MANIFEST` (the precache manifest) at build time and we own everything
// else. Why we need a hand-written SW: workbox's generateSW mode doesn't expose hooks for
// the `push` event listener that Phase N requires.
//
// Responsibilities:
//   1. Precache the SPA shell (workbox-precaching).
//   2. Runtime-cache portal data, CMS, locales, and profile images.
//   3. Take over uncontrolled tabs when the SPA prompts for an update (skipWaiting).
//   4. Render Web Push notifications + handle clicks to focus/open the portal route.
//
// Type assertion at top: TS doesn't know `self` is a ServiceWorkerGlobalScope inside the
// worker context unless we tell it.
//
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

// ---- Precache + cleanup of stale caches from prior deploys ---------------
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ---- Runtime caches ------------------------------------------------------
// Member portal data: 5s NetworkFirst with offline-cache fallback. Each URL gets its
// own entry up to 30; 24h TTL.
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/portal/me'),
  new NetworkFirst({
    cacheName: 'portal-me-v1',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// CMS blocks (login copy + notification templates). 7-day SWR.
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/cms/blocks'),
  new StaleWhileRevalidate({
    cacheName: 'cms-blocks-v1',
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// Public CMS pages (terms, privacy, FAQ). 30-day SWR.
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/cms/pages'),
  new StaleWhileRevalidate({
    cacheName: 'cms-pages-v1',
    plugins: [
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// Locale JSON files. 30-day SWR.
registerRoute(
  ({ url }) => /\/locales\/.*\.json$/.test(url.pathname),
  new StaleWhileRevalidate({
    cacheName: 'locales-v1',
    plugins: [
      new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// Profile + event photos. CacheFirst since the binary doesn't change for a given URL.
registerRoute(
  ({ url }) => /\/api\/v1\/(members|events)\/[^/]+\/[^/]+\/(photo|cover|file)/.test(url.pathname),
  new CacheFirst({
    cacheName: 'profile-images-v1',
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// Web fonts (if any are referenced via Google CDN).
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'web-fonts-v1',
    plugins: [
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// ---- Update flow ---------------------------------------------------------
// The SPA UpdateToast posts {type:'SKIP_WAITING'} when the user clicks "Reload now".
self.addEventListener('message', (event) => {
  if (event.data && (event.data as { type?: string }).type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

// ---- Web Push (Phase N) --------------------------------------------------
// The server sends a JSON payload like { title, body, clickUrl }. We render a native
// system notification; clicking it focuses an existing portal tab or opens a new one.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload: { title?: string; body?: string; clickUrl?: string } = {};
  try { payload = event.data.json(); }
  catch { payload = { body: event.data.text() }; }

  const title = payload.title || 'Jamaat';
  const body = payload.body || '';
  const data = { clickUrl: payload.clickUrl || '/portal/me' };

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'jamaat-push', // collapse repeated notifications
      data,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data?.clickUrl as string) || '/portal/me';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Prefer focusing an existing portal tab over opening a new one.
    for (const client of all) {
      if (client.url.includes('/portal/me') && 'focus' in client) {
        await client.focus();
        if ('navigate' in client) await (client as WindowClient).navigate(target).catch(() => {});
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
