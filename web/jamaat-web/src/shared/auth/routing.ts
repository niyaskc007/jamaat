import type { AuthUser } from './authStore';

/// Decide where a freshly-logged-in user should land. Drives off the new `userType`
/// claim once it's present; falls back to permission-shape inference for tokens issued
/// before the 2026-05 migration. Operator-side `from` (e.g. a returnTo URL after a 401
/// redirect) wins for operators and hybrids; members are always sent to /portal/me
/// because returnTo into an admin URL would land them on a permission-denied screen.
export function defaultLandingFor(user: AuthUser, from: string): string {
  const type = resolveUserType(user);
  if (type === 'Member') return '/portal/me';
  return from && from !== '/login' ? from : '/dashboard';
}

/// Returns the resolved user type. Prefers the server-stamped claim; falls back to
/// permission-shape inference for backwards compat. Exported so admin UI can show
/// a "type unknown" state for legacy tokens.
export function resolveUserType(user: AuthUser): 'Member' | 'Operator' | 'Hybrid' {
  if (user.userType === 'Member' || user.userType === 'Operator' || user.userType === 'Hybrid') {
    return user.userType;
  }
  // Legacy fallback: a user with ONLY portal.* perms (plus a couple of self-service ones)
  // is treated as a Member. Anyone else is treated as Operator. We don't infer Hybrid here -
  // the new claim is required for that distinction. This branch should disappear in the
  // release after every active token has been re-issued.
  const perms = user.permissions ?? [];
  if (perms.length === 0) return 'Operator';
  const portalOnly = perms.every(
    (p) => p.startsWith('portal.') || p === 'member.self.update' || p === 'member.wealth.view',
  );
  return portalOnly ? 'Member' : 'Operator';
}
