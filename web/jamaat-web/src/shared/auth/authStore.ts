const ACCESS_KEY = 'jamaat.access';
const REFRESH_KEY = 'jamaat.refresh';
const USER_KEY = 'jamaat.user';

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
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
    const raw = JSON.stringify(user);
    localStorage.setItem(USER_KEY, raw);
    cachedRaw = raw;
    cachedUser = user;
    listeners.forEach((l) => l());
  },
  clear: () => {
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
