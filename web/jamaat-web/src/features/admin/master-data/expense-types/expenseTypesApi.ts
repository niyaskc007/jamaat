import { api } from '../../../../shared/api/client';
import type { PagedResult, SortDir } from '../shared';

export type ExpenseType = {
  id: string; code: string; name: string; description?: string | null;
  debitAccountId?: string | null; debitAccountName?: string | null;
  requiresApproval: boolean; approvalThreshold?: number | null; isActive: boolean;
};

export type ExpenseTypeQuery = {
  page?: number; pageSize?: number; sortBy?: string; sortDir?: SortDir;
  search?: string; active?: boolean;
};

export type UpsertExpenseType = {
  code?: string; name: string; description?: string;
  debitAccountId?: string | null;
  requiresApproval: boolean; approvalThreshold?: number | null;
  isActive?: boolean;
};

export const expenseTypesApi = {
  list: async (q: ExpenseTypeQuery) => (await api.get<PagedResult<ExpenseType>>('/api/v1/expense-types', { params: q })).data,
  create: async (input: UpsertExpenseType) => (await api.post<ExpenseType>('/api/v1/expense-types', input)).data,
  update: async (id: string, input: UpsertExpenseType) => (await api.put<ExpenseType>(`/api/v1/expense-types/${id}`, input)).data,
  remove: async (id: string) => { await api.delete(`/api/v1/expense-types/${id}`); },
};
