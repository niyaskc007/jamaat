import type { AuthUser } from './authStore';

/// Decide where a freshly-logged-in user should land. Gates on permission claims
/// rather than the userType hint: a user with no operator-side perm (member.view)
/// goes straight to /portal/me; everyone else gets the operator-side default
/// (the `from` returnTo URL after a 401 redirect, falling back to /dashboard).
///
/// Why perms not userType: the userType claim is server-stamped at login time
/// and at role-change time, but a user whose JWT is still the pre-flip version
/// would otherwise be misrouted. Perms in the JWT are the actual capability
/// truth; userType is a routing hint that can lag.
export function defaultLandingFor(user: AuthUser, from: string): string {
  const hasOperatorPerm = (user.permissions ?? []).some((p) => p.toLowerCase() === 'member.view');
  if (!hasOperatorPerm) return '/portal/me';
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
