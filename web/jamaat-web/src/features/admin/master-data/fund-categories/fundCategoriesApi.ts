import { api } from '../../../../shared/api/client';

/// Mirror of Domain.Enums.FundCategoryKind. Drives behaviour: PermanentIncome → income;
/// TemporaryIncome → liability; LoanFund → can issue loans + accept returnable money.
export type FundCategoryKind = 1 | 2 | 3 | 4 | 5 | 99;

export const FundCategoryKindLabel: Record<FundCategoryKind, string> = {
  1: 'Permanent Income',
  2: 'Temporary Income',
  3: 'Loan Fund',
  4: 'Commitment Scheme',
  5: 'Function-based',
  99: 'Other',
};

export type FundCategory = {
  id: string;
  code: string;
  name: string;
  kind: FundCategoryKind;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
  fundTypeCount: number;
  subCategoryCount: number;
  createdAtUtc: string;
};

export type FundSubCategory = {
  id: string;
  fundCategoryId: string;
  fundCategoryCode: string;
  fundCategoryName: string;
  code: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
  fundTypeCount: number;
  createdAtUtc: string;
};

export const fundCategoriesApi = {
  list: async (activeOnly?: boolean): Promise<FundCategory[]> =>
    (await api.get<FundCategory[]>('/api/v1/fund-categories', { params: { activeOnly } })).data,
  create: async (input: { code: string; name: string; kind: FundCategoryKind; description?: string; sortOrder?: number }) =>
    (await api.post<FundCategory>('/api/v1/fund-categories', input)).data,
  update: async (id: string, input: { name: string; kind: FundCategoryKind; description?: string; sortOrder: number; isActive: boolean }) =>
    (await api.put<FundCategory>(`/api/v1/fund-categories/${id}`, input)).data,
  remove: async (id: string) => { await api.delete(`/api/v1/fund-categories/${id}`); },

  listSubs: async (fundCategoryId?: string, activeOnly?: boolean): Promise<FundSubCategory[]> =>
    (await api.get<FundSubCategory[]>('/api/v1/fund-sub-categories', { params: { fundCategoryId, activeOnly } })).data,
  createSub: async (input: { fundCategoryId: string; code: string; name: string; description?: string; sortOrder?: number }) =>
    (await api.post<FundSubCategory>('/api/v1/fund-sub-categories', input)).data,
  updateSub: async (id: string, input: { fundCategoryId: string; name: string; description?: string; sortOrder: number; isActive: boolean }) =>
    (await api.put<FundSubCategory>(`/api/v1/fund-sub-categories/${id}`, input)).data,
  removeSub: async (id: string) => { await api.delete(`/api/v1/fund-sub-categories/${id}`); },
};
