import { api } from '../../shared/api/client';
import type { PagedResult } from '../members/membersApi';

export type FamilyRole =
  | 1 /* Head */ | 2 /* Spouse */ | 3 /* Father */ | 4 /* Mother */
  | 5 /* Son */ | 6 /* Daughter */ | 7 /* Brother */ | 8 /* Sister */
  | 9 /* GrandFather */ | 10 /* GrandMother */ | 11 /* GrandSon */ | 12 /* GrandDaughter */
  | 13 /* SonInLaw */ | 14 /* DaughterInLaw */ | 15 /* Uncle */ | 16 /* Aunt */
  | 17 /* Nephew */ | 18 /* Niece */ | 99 /* Other */;

export const FamilyRoleLabel: Record<FamilyRole, string> = {
  1: 'Head',
  2: 'Spouse',
  3: 'Father',
  4: 'Mother',
  5: 'Son',
  6: 'Daughter',
  7: 'Brother',
  8: 'Sister',
  9: 'Grand Father',
  10: 'Grand Mother',
  11: 'Grand Son',
  12: 'Grand Daughter',
  13: 'Son-in-Law',
  14: 'Daughter-in-Law',
  15: 'Uncle',
  16: 'Aunt',
  17: 'Nephew',
  18: 'Niece',
  99: 'Other',
};

export type Family = {
  id: string;
  code: string;
  familyName: string;
  headMemberId?: string | null;
  headItsNumber?: string | null;
  headName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
  memberCount: number;
  createdAtUtc: string;
};

export type FamilyMember = {
  id: string;
  itsNumber: string;
  fullName: string;
  familyRole?: FamilyRole | null;
  isHead: boolean;
};

export type FamilyDetail = {
  family: Family;
  members: FamilyMember[];
};

export type FamilyListQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  active?: boolean;
};

export type CreateFamilyInput = {
  familyName: string;
  headMemberId: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  notes?: string;
};

export type UpdateFamilyInput = {
  familyName: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
};

export type AssignMemberInput = { memberId: string; role: FamilyRole };

export const familiesApi = {
  list: async (q: FamilyListQuery): Promise<PagedResult<Family>> => {
    const { data } = await api.get<PagedResult<Family>>('/api/v1/families', { params: q });
    return data;
  },
  get: async (id: string): Promise<FamilyDetail> => {
    const { data } = await api.get<FamilyDetail>(`/api/v1/families/${id}`);
    return data;
  },
  create: async (input: CreateFamilyInput): Promise<Family> => {
    const { data } = await api.post<Family>('/api/v1/families', input);
    return data;
  },
  update: async (id: string, input: UpdateFamilyInput): Promise<Family> => {
    const { data } = await api.put<Family>(`/api/v1/families/${id}`, input);
    return data;
  },
  assignMember: async (id: string, input: AssignMemberInput): Promise<void> => {
    await api.post(`/api/v1/families/${id}/members`, input);
  },
  removeMember: async (id: string, memberId: string): Promise<void> => {
    await api.delete(`/api/v1/families/${id}/members/${memberId}`);
  },
  transferHeadship: async (id: string, newHeadMemberId: string): Promise<void> => {
    await api.post(`/api/v1/families/${id}/transfer-headship`, { newHeadMemberId });
  },
};
