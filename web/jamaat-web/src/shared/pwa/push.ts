import { api } from '../api/client';

/// Phase N - browser-side Web Push subscribe / unsubscribe helpers. The actual SW push
/// handler lives in src/sw.ts; this file is the bridge between the React UI and the
/// browser PushManager API + our /api/v1/portal/me/push endpoints.
///
/// Usage: from a React component on the notifications-prefs tab,
///   const { state, enable, disable } = usePushSubscription();
/// Renders a switch that triggers `enable()` (asks permission, registers, POSTs to
/// server) or `disable()` (unsubs locally + DELETEs server-side).

export type PushState =
  | 'unsupported'         // browser has no PushManager / Notification API
  | 'denied'              // user clicked "block" in the permission prompt
  | 'not-subscribed'      // available but the user hasn't subscribed yet
  | 'subscribed';         // active subscription registered with the server

/// Convert the URL-safe base64 VAPID public key into the Uint8Array format that
/// `pushManager.subscribe` requires. Pure utility - no I/O.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export async function getPushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'subscribed' : 'not-subscribed';
}

export async function enablePush(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';

  // Permission first (this is the prompt the user sees).
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'not-subscribed';

  // Pull the VAPID public key from the server. If it's not configured (503), bail.
  let publicKey: string;
  try {
    const r = await api.get<{ key: string }>('/api/v1/portal/me/push/vapid-public-key');
    publicKey = r.data.key;
  } catch {
    return 'not-subscribed';
  }

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  // Send the subscription details to the server. PushManager.toJSON() gives the shape
  // the WebPush library expects: { endpoint, keys: { p256dh, auth } }.
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return 'not-subscribed';
  await api.post('/api/v1/portal/me/push/subscribe', {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  });
  return 'subscribed';
}

export async function disablePush(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    try { await api.delete('/api/v1/portal/me/push/subscribe', { data: { endpoint: sub.endpoint } }); }
    catch { /* server may already have cleaned up; continue with the local unsubscribe */ }
    await sub.unsubscribe();
  }
  return 'not-subscribed';
}
