import { api } from '../../shared/api/client';

export type MemberStatus = 1 | 2 | 3 | 4; // Active | Inactive | Deceased | Suspended

export const MemberStatusLabel: Record<MemberStatus, string> = {
  1: 'Active',
  2: 'Inactive',
  3: 'Deceased',
  4: 'Suspended',
};

export type VerificationStatus = 0 | 1 | 2 | 3; // NotStarted | Pending | Verified | Rejected

export type Member = {
  id: string;
  itsNumber: string;
  fullName: string;
  fullNameArabic?: string | null;
  fullNameHindi?: string | null;
  fullNameUrdu?: string | null;
  familyId?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  status: MemberStatus;
  externalUserId?: string | null;
  lastSyncedAtUtc?: string | null;
  createdAtUtc: string;
  updatedAtUtc?: string | null;
  dataVerificationStatus: VerificationStatus;
  dataVerifiedOn?: string | null;
};

export type PagedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type MemberListQuery = {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'Asc' | 'Desc';
  search?: string;
  status?: MemberStatus;
  dataVerificationStatus?: VerificationStatus;
};

export type CreateMemberInput = {
  itsNumber: string;
  fullName: string;
  fullNameArabic?: string;
  fullNameHindi?: string;
  fullNameUrdu?: string;
  familyId?: string | null;
  phone?: string;
  email?: string;
  address?: string;
};

export type UpdateMemberInput = Omit<CreateMemberInput, 'itsNumber'> & { status: MemberStatus };

export const membersApi = {
  list: async (query: MemberListQuery): Promise<PagedResult<Member>> => {
    const { data } = await api.get<PagedResult<Member>>('/api/v1/members', { params: query });
    return data;
  },
  get: async (id: string): Promise<Member> => {
    const { data } = await api.get<Member>(`/api/v1/members/${id}`);
    return data;
  },
  create: async (input: CreateMemberInput): Promise<Member> => {
    const { data } = await api.post<Member>('/api/v1/members', input);
    return data;
  },
  update: async (id: string, input: UpdateMemberInput): Promise<Member> => {
    const { data } = await api.put<Member>(`/api/v1/members/${id}`, input);
    return data;
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/members/${id}`);
  },
};
