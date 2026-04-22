import { api } from '../../shared/api/client';

export type UserInfo = {
  id: string;
  userName: string;
  fullName: string;
  email?: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
  preferredLanguage?: string;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAtUtc: string;
  user: UserInfo;
};

export const authApi = {
  login: async (email: string, password: string) => {
    const { data } = await api.post<AuthResponse>('/api/v1/auth/login', { email, password });
    return data;
  },
  me: async () => {
    const { data } = await api.get<UserInfo>('/api/v1/me');
    return data;
  },
  logout: async (refreshToken: string) => {
    await api.post('/api/v1/auth/logout', { refreshToken });
  },
};
