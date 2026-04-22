import { api } from '../../shared/api/client';
import type { PagedResult } from '../members/membersApi';

export type Sector = {
  id: string;
  code: string;
  name: string;
  maleInchargeMemberId?: string | null;
  maleInchargeItsNumber?: string | null;
  maleInchargeName?: string | null;
  femaleInchargeMemberId?: string | null;
  femaleInchargeItsNumber?: string | null;
  femaleInchargeName?: string | null;
  notes?: string | null;
  isActive: boolean;
  subSectorCount: number;
  memberCount: number;
  createdAtUtc: string;
};

export type SubSector = {
  id: string;
  sectorId: string;
  sectorCode: string;
  sectorName: string;
  code: string;
  name: string;
  maleInchargeMemberId?: string | null;
  maleInchargeName?: string | null;
  femaleInchargeMemberId?: string | null;
  femaleInchargeName?: string | null;
  notes?: string | null;
  isActive: boolean;
  memberCount: number;
  createdAtUtc: string;
};

export type CreateSectorInput = {
  code: string; name: string;
  maleInchargeMemberId?: string | null;
  femaleInchargeMemberId?: string | null;
  notes?: string | null;
};

export type UpdateSectorInput = {
  name: string;
  maleInchargeMemberId?: string | null;
  femaleInchargeMemberId?: string | null;
  notes?: string | null;
  isActive: boolean;
};

export type CreateSubSectorInput = CreateSectorInput & { sectorId: string };
export type UpdateSubSectorInput = UpdateSectorInput;

export const sectorsApi = {
  list: async (q: { page?: number; pageSize?: number; search?: string; active?: boolean }): Promise<PagedResult<Sector>> =>
    (await api.get('/api/v1/sectors', { params: q })).data,
  get: async (id: string): Promise<Sector> => (await api.get(`/api/v1/sectors/${id}`)).data,
  create: async (input: CreateSectorInput): Promise<Sector> => (await api.post('/api/v1/sectors', input)).data,
  update: async (id: string, input: UpdateSectorInput): Promise<Sector> => (await api.put(`/api/v1/sectors/${id}`, input)).data,
  remove: async (id: string) => { await api.delete(`/api/v1/sectors/${id}`); },
};

export const subSectorsApi = {
  list: async (q: { page?: number; pageSize?: number; sectorId?: string; search?: string; active?: boolean }): Promise<PagedResult<SubSector>> =>
    (await api.get('/api/v1/sub-sectors', { params: q })).data,
  get: async (id: string): Promise<SubSector> => (await api.get(`/api/v1/sub-sectors/${id}`)).data,
  create: async (input: CreateSubSectorInput): Promise<SubSector> => (await api.post('/api/v1/sub-sectors', input)).data,
  update: async (id: string, input: UpdateSubSectorInput): Promise<SubSector> => (await api.put(`/api/v1/sub-sectors/${id}`, input)).data,
  remove: async (id: string) => { await api.delete(`/api/v1/sub-sectors/${id}`); },
};
