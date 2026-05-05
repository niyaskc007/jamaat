import { api } from '../../shared/api/client';

export type UserType = 'Member' | 'Operator' | 'Hybrid';

export type UserInfo = {
  id: string;
  userName: string;
  fullName: string;
  email?: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
  preferredLanguage?: string;
  // May be null on tokens issued before the 2026-05 migration; SPA falls back to
  // permission-shape inference in that case.
  userType?: UserType | null;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAtUtc: string;
  user: UserInfo;
};

/// Returned by /auth/login when the supplied credentials were correct AND the user must change
/// their password before they can use the app. The shape is disjoint from AuthResponse - clients
/// should branch on `mustChangePassword` to decide whether they got a JWT or a redirect signal.
export type PasswordChangeRequiredResponse = {
  userId: string;
  userName: string;
  mustChangePassword: true;
  temporaryPasswordExpiresAtUtc?: string | null;
  reason: string;
};

export type LoginResult = AuthResponse | PasswordChangeRequiredResponse;

export const authApi = {
  login: async (email: string, password: string): Promise<LoginResult> => {
    const { data } = await api.post<LoginResult>('/api/v1/auth/login', { email, password });
    return data;
  },
  /// Used after a /login that returned PasswordChangeRequiredResponse. Verifies the temp password
  /// once more, sets the new permanent one, and returns a real AuthResponse on success.
  completeFirstLogin: async (identifier: string, currentPassword: string, newPassword: string): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>('/api/v1/auth/complete-first-login', {
      identifier, currentPassword, newPassword,
    });
    return data;
  },
  /// Free-form rotation by an authenticated user.
  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    await api.post('/api/v1/auth/change-password', { currentPassword, newPassword });
  },
  me: async () => {
    const { data } = await api.get<UserInfo>('/api/v1/auth/me');
    return data;
  },
  logout: async (refreshToken: string) => {
    await api.post('/api/v1/auth/logout', { refreshToken });
  },
};

/// Type-narrowing helper used by LoginPage / ChangePasswordPage to branch on the response shape.
export function isPasswordChangeRequired(r: LoginResult): r is PasswordChangeRequiredResponse {
  return (r as PasswordChangeRequiredResponse).mustChangePassword === true;
}
