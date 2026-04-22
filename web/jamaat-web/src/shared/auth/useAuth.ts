import { useSyncExternalStore } from 'react';
import { authStore, type AuthUser } from './authStore';

function snapshot(): AuthUser | null {
  return authStore.getUser();
}

export function useAuth() {
  const user = useSyncExternalStore(authStore.subscribe, snapshot, snapshot);
  return {
    user,
    isAuthenticated: !!user,
    hasPermission: (p: string) => authStore.hasPermission(p),
    logout: () => authStore.clear(),
  };
}
