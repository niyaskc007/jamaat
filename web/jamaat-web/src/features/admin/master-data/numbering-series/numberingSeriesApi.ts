import { api } from '../../../../shared/api/client';
import type { PagedResult, SortDir } from '../shared';

export type NumberingSeries = {
  id: string;
  scope: number;
  name: string;
  fundTypeId?: string | null;
  fundTypeName?: string | null;
  prefix: string;
  padLength: number;
  yearReset: boolean;
  currentValue: number;
  currentYear: number;
  isActive: boolean;
  preview: string;
};

export type NumberingSeriesQuery = {
  page?: number; pageSize?: number; sortBy?: string; sortDir?: SortDir;
  search?: string; scope?: number; active?: boolean;
};

export type CreateNumberingSeries = {
  scope: number; name: string; fundTypeId?: string | null; prefix: string; padLength: number; yearReset: boolean;
};
export type UpdateNumberingSeries = { name: string; prefix: string; padLength: number; yearReset: boolean; isActive: boolean };

export const numberingSeriesApi = {
  list: async (q: NumberingSeriesQuery) => (await api.get<PagedResult<NumberingSeries>>('/api/v1/numbering-series', { params: q })).data,
  create: async (input: CreateNumberingSeries) => (await api.post<NumberingSeries>('/api/v1/numbering-series', input)).data,
  update: async (id: string, input: UpdateNumberingSeries) => (await api.put<NumberingSeries>(`/api/v1/numbering-series/${id}`, input)).data,
  remove: async (id: string) => { await api.delete(`/api/v1/numbering-series/${id}`); },
};
