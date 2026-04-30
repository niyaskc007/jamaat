import { api } from '../../../../shared/api/client';

export type Lookup = {
  id: string;
  category: string;
  code: string;
  name: string;
  nameArabic?: string | null;
  sortOrder: number;
  isActive: boolean;
  notes?: string | null;
  createdAtUtc: string;
};

export const lookupsApi = {
  list: async (q: { page?: number; pageSize?: number; search?: string; category?: string; activeOnly?: boolean }) =>
    (await api.get('/api/v1/lookups', { params: q })).data as { items: Lookup[]; total: number },
  categories: async () => (await api.get('/api/v1/lookups/categories')).data as string[],
  create: async (input: Record<string, unknown>) => (await api.post('/api/v1/lookups', input)).data as Lookup,
  update: async (id: string, input: Record<string, unknown>) => (await api.put(`/api/v1/lookups/${id}`, input)).data as Lookup,
  remove: async (id: string) => { await api.delete(`/api/v1/lookups/${id}`); },
};

/// Standardised category constants used by the member profile + admin panels.
/// Lookup rows under these categories drive the dropdowns on /members/:id.
export const MemberLookupCategory = {
  Category: 'MEMBER_CATEGORY',
  Idara: 'MEMBER_IDARA',
  Vatan: 'MEMBER_VATAN',
  Nationality: 'MEMBER_NATIONALITY',
  Jamaat: 'MEMBER_JAMAAT',
  Jamiaat: 'MEMBER_JAMIAAT',
} as const;
