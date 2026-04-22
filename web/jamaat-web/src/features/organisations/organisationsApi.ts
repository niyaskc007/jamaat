import { api } from '../../shared/api/client';
import type { PagedResult } from '../members/membersApi';

export type Organisation = {
  id: string;
  code: string;
  name: string;
  nameArabic?: string | null;
  category?: string | null;
  notes?: string | null;
  isActive: boolean;
  memberCount: number;
  createdAtUtc: string;
};

export type MemberOrgMembership = {
  id: string;
  memberId: string;
  memberItsNumber: string;
  memberName: string;
  organisationId: string;
  organisationCode: string;
  organisationName: string;
  role: string;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  notes?: string | null;
  createdAtUtc: string;
};

export type CreateOrganisationInput = { code: string; name: string; nameArabic?: string; category?: string; notes?: string };
export type UpdateOrganisationInput = { name: string; nameArabic?: string | null; category?: string | null; notes?: string | null; isActive: boolean };

export type CreateMembershipInput = { memberId: string; organisationId: string; role: string; startDate?: string; endDate?: string; notes?: string };
export type UpdateMembershipInput = { role: string; startDate?: string | null; endDate?: string | null; notes?: string | null; isActive: boolean };

export const organisationsApi = {
  list: async (q: { page?: number; pageSize?: number; search?: string; category?: string; active?: boolean }): Promise<PagedResult<Organisation>> =>
    (await api.get('/api/v1/organisations', { params: q })).data,
  get: async (id: string): Promise<Organisation> => (await api.get(`/api/v1/organisations/${id}`)).data,
  create: async (input: CreateOrganisationInput): Promise<Organisation> => (await api.post('/api/v1/organisations', input)).data,
  update: async (id: string, input: UpdateOrganisationInput): Promise<Organisation> => (await api.put(`/api/v1/organisations/${id}`, input)).data,
  remove: async (id: string) => { await api.delete(`/api/v1/organisations/${id}`); },

  listMemberships: async (q: { page?: number; pageSize?: number; memberId?: string; organisationId?: string; active?: boolean }): Promise<PagedResult<MemberOrgMembership>> =>
    (await api.get('/api/v1/organisations/memberships', { params: q })).data,
  createMembership: async (input: CreateMembershipInput): Promise<MemberOrgMembership> =>
    (await api.post('/api/v1/organisations/memberships', input)).data,
  updateMembership: async (id: string, input: UpdateMembershipInput): Promise<MemberOrgMembership> =>
    (await api.put(`/api/v1/organisations/memberships/${id}`, input)).data,
  removeMembership: async (id: string) => { await api.delete(`/api/v1/organisations/memberships/${id}`); },
};
