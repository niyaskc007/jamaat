import { api } from '../../../../shared/api/client';
import type { PagedResult, SortDir } from '../shared';

export type BankAccount = {
  id: string;
  name: string;
  bankName: string;
  accountNumber: string;
  branch?: string | null;
  ifsc?: string | null;
  swiftCode?: string | null;
  currency: string;
  accountingAccountId?: string | null;
  accountingAccountName?: string | null;
  isActive: boolean;
};

export type BankAccountQuery = {
  page?: number; pageSize?: number; sortBy?: string; sortDir?: SortDir; search?: string; active?: boolean;
};

export type UpsertBankAccount = {
  name: string; bankName: string; accountNumber: string;
  branch?: string; ifsc?: string; swiftCode?: string;
  currency: string; accountingAccountId?: string | null;
  isActive?: boolean;
};

export const bankAccountsApi = {
  list: async (q: BankAccountQuery) => (await api.get<PagedResult<BankAccount>>('/api/v1/bank-accounts', { params: q })).data,
  create: async (input: UpsertBankAccount) => (await api.post<BankAccount>('/api/v1/bank-accounts', input)).data,
  update: async (id: string, input: UpsertBankAccount) => (await api.put<BankAccount>(`/api/v1/bank-accounts/${id}`, input)).data,
  remove: async (id: string) => { await api.delete(`/api/v1/bank-accounts/${id}`); },
};
