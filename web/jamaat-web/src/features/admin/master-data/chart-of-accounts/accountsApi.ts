import { api } from '../../../../shared/api/client';
import type { PagedResult, SortDir } from '../shared';

export type AccountType = 1 | 2 | 3 | 4 | 5 | 6;

export type Account = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentId?: string | null;
  parentCode?: string | null;
  isControl: boolean;
  isActive: boolean;
};

export type AccountTreeNode = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentId?: string | null;
  isControl: boolean;
  isActive: boolean;
  children: AccountTreeNode[];
};

export type AccountQuery = {
  page?: number; pageSize?: number; sortBy?: string; sortDir?: SortDir;
  search?: string; type?: AccountType; active?: boolean;
};

export type UpsertAccount = {
  code: string;
  name: string;
  type: AccountType;
  parentId?: string | null;
  isControl: boolean;
  isActive?: boolean;
};

export const accountsApi = {
  list: async (q: AccountQuery) => (await api.get<PagedResult<Account>>('/api/v1/accounts', { params: q })).data,
  tree: async () => (await api.get<AccountTreeNode[]>('/api/v1/accounts/tree')).data,
  create: async (input: UpsertAccount) => (await api.post<Account>('/api/v1/accounts', input)).data,
  update: async (id: string, input: UpsertAccount) => (await api.put<Account>(`/api/v1/accounts/${id}`, input)).data,
  remove: async (id: string) => { await api.delete(`/api/v1/accounts/${id}`); },
};
