const ACCESS_KEY = 'jamaat.access';
const REFRESH_KEY = 'jamaat.refresh';
const USER_KEY = 'jamaat.user';

/// Ask the active service worker to drop user-scoped runtime caches (portal API
/// responses, member/event photos). Called on every sign-out AND sign-in so a
/// shared device cannot leak the previous user's cached data to the next user.
/// Best-effort: if there is no SW (dev, unsupported browser) the call is a no-op.
function clearUserCachesInServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then((reg) => {
    reg.active?.postMessage({ type: 'CLEAR_USER_CACHES' });
  }).catch(() => { /* SW not registered; ignore */ });
}

export type AuthUser = {
  id: string;
  userName: string;
  fullName: string;
  tenantId: string;
  permissions: string[];
  preferredLanguage?: string;
  // 'Member' / 'Operator' / 'Hybrid'. May be missing on tokens stored before the
  // 2026-05 migration; consumers must handle absence and fall back to permission shape.
  userType?: 'Member' | 'Operator' | 'Hybrid' | null;
};

type Listener = () => void;
const listeners = new Set<Listener>();

// Cache the parsed user so useSyncExternalStore gets a stable reference.
// Only reparse when the underlying localStorage value actually changes.
let cachedRaw: string | null = null;
let cachedUser: AuthUser | null = null;

function readUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (raw === cachedRaw) return cachedUser;
  cachedRaw = raw;
  cachedUser = raw ? (JSON.parse(raw) as AuthUser) : null;
  return cachedUser;
}

export const authStore = {
  getAccessToken: () => localStorage.getItem(ACCESS_KEY),
  getRefreshToken: () => localStorage.getItem(REFRESH_KEY),
  getUser: (): AuthUser | null => readUser(),
  setSession: (access: string, refresh: string, user: AuthUser) => {
    // Purge before writing the new session so the next request sees fresh data.
    // Covers the "shared browser, different user signs in" case where the prior
    // SW cache would otherwise serve the previous user's portal responses.
    clearUserCachesInServiceWorker();
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
    const raw = JSON.stringify(user);
    localStorage.setItem(USER_KEY, raw);
    cachedRaw = raw;
    cachedUser = user;
    listeners.forEach((l) => l());
  },
  clear: () => {
    clearUserCachesInServiceWorker();
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    cachedRaw = null;
    cachedUser = null;
    listeners.forEach((l) => l());
  },
  subscribe: (l: Listener) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  hasPermission: (p: string): boolean => {
    const u = readUser();
    return !!u?.permissions.some((x) => x.toLowerCase() === p.toLowerCase());
  },
};
