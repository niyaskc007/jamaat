import { api } from '../../../shared/api/client';

export type Role = {
  id: string;
  name: string;
  description?: string | null;
  permissions: string[];
};

export type UserPermissionsDetail = {
  id: string;
  userName: string;
  email?: string | null;
  fullName?: string | null;
  isActive: boolean;
  roles: string[];
  directPermissions: string[];
};

export const rolesApi = {
  allPermissions: () => api.get<string[]>('/api/v1/permissions').then((r) => r.data),
  list: () => api.get<Role[]>('/api/v1/roles').then((r) => r.data),
  addPermission: (role: string, permission: string) =>
    api.post(`/api/v1/roles/${encodeURIComponent(role)}/permissions`, { permission }).then((r) => r.data),
  removePermission: (role: string, permission: string) =>
    api.delete(`/api/v1/roles/${encodeURIComponent(role)}/permissions/${encodeURIComponent(permission)}`).then((r) => r.data),

  userPermissions: (userId: string) =>
    api.get<UserPermissionsDetail>(`/api/v1/users/${userId}/permissions`).then((r) => r.data),
  addUserPermission: (userId: string, permission: string) =>
    api.post(`/api/v1/users/${userId}/permissions`, { permission }).then((r) => r.data),
  removeUserPermission: (userId: string, permission: string) =>
    api.delete(`/api/v1/users/${userId}/permissions/${encodeURIComponent(permission)}`).then((r) => r.data),
};

/// Group permission strings ("commitment.update") by their dot prefix so the matrix renders
/// one section per resource without us hard-coding every section.
export function groupPermissions(all: string[]) {
  const buckets = new Map<string, string[]>();
  for (const p of all) {
    const dot = p.indexOf('.');
    const key = dot > 0 ? p.slice(0, dot) : p;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(p);
  }
  return Array.from(buckets.entries())
    .map(([k, v]) => ({ resource: k, permissions: v.sort() }))
    .sort((a, b) => a.resource.localeCompare(b.resource));
}
