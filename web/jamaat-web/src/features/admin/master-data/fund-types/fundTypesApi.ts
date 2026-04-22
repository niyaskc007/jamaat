import { api } from '../../../../shared/api/client';
import type { PagedResult, SortDir } from '../shared';

export type FundCategory = 1 | 2 | 3 | 4 | 99;
export const FundCategoryLabel: Record<FundCategory, string> = {
  1: 'Donation',
  2: 'Loan',
  3: 'Charity',
  4: 'Community Support',
  99: 'Other',
};
export const FundCategoryColor: Record<FundCategory, string> = {
  1: 'green',
  2: 'volcano',
  3: 'purple',
  4: 'blue',
  99: 'default',
};

export type FundType = {
  id: string;
  code: string;
  nameEnglish: string;
  nameArabic?: string | null;
  nameHindi?: string | null;
  nameUrdu?: string | null;
  description?: string | null;
  isActive: boolean;
  requiresItsNumber: boolean;
  requiresPeriodReference: boolean;
  category: FundCategory;
  isLoan: boolean;
  allowedPaymentModes: number;
  creditAccountId?: string | null;
  creditAccountName?: string | null;
  defaultTemplateId?: string | null;
  rulesJson?: string | null;
  createdAtUtc: string;
};

export type FundTypeQuery = {
  page?: number; pageSize?: number; sortBy?: string; sortDir?: SortDir;
  search?: string; active?: boolean; category?: FundCategory;
};

export type CreateFundType = {
  code: string;
  nameEnglish: string;
  nameArabic?: string;
  nameHindi?: string;
  nameUrdu?: string;
  description?: string;
  requiresItsNumber: boolean;
  requiresPeriodReference: boolean;
  allowedPaymentModes: number;
  creditAccountId?: string | null;
  rulesJson?: string;
  category?: FundCategory;
};

export type UpdateFundType = Omit<CreateFundType, 'code'> & { isActive: boolean };

export const fundTypesApi = {
  list: async (q: FundTypeQuery) => (await api.get<PagedResult<FundType>>('/api/v1/fund-types', { params: q })).data,
  get: async (id: string) => (await api.get<FundType>(`/api/v1/fund-types/${id}`)).data,
  create: async (input: CreateFundType) => (await api.post<FundType>('/api/v1/fund-types', input)).data,
  update: async (id: string, input: UpdateFundType) => (await api.put<FundType>(`/api/v1/fund-types/${id}`, input)).data,
  remove: async (id: string) => { await api.delete(`/api/v1/fund-types/${id}`); },
};
