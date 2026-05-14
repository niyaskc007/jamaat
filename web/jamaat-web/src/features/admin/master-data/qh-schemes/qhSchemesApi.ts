import { api } from '../../../../shared/api/client';

/// Admin-managed QH scheme master-data. Replaces the legacy hardcoded
/// Mohammadi/Hussain enum so a Jamaat can author 10+ schemes (with up to
/// one level of subcategories) without code changes.

export type QhScheme = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  parentSchemeId: string | null;
  parentSchemeName: string | null;
  /// Drives the conditional "gold collateral details" panel on the QH form.
  requiresGoldCollateral: boolean;
  sortOrder: number;
  isActive: boolean;
  /// Maps back to the legacy int Scheme column (1=Mohammadi, 2=Hussain, 0=Other)
  /// so historical reports + display code that branches on the int still work.
  legacySchemeValue: number;
};

export type CreateQhScheme = {
  code: string;
  name: string;
  description?: string | null;
  parentSchemeId?: string | null;
  requiresGoldCollateral: boolean;
  sortOrder: number;
  legacySchemeValue?: number;
};

export type UpdateQhScheme = {
  name: string;
  description?: string | null;
  parentSchemeId?: string | null;
  requiresGoldCollateral: boolean;
  sortOrder: number;
  isActive: boolean;
  legacySchemeValue: number;
};

export const qhSchemesApi = {
  list: async (includeInactive = true): Promise<QhScheme[]> =>
    (await api.get<QhScheme[]>(`/api/v1/qh-schemes`, { params: { includeInactive } })).data,
  get: async (id: string): Promise<QhScheme> =>
    (await api.get<QhScheme>(`/api/v1/qh-schemes/${id}`)).data,
  create: async (body: CreateQhScheme): Promise<QhScheme> =>
    (await api.post<QhScheme>(`/api/v1/qh-schemes`, body)).data,
  update: async (id: string, body: UpdateQhScheme): Promise<QhScheme> =>
    (await api.put<QhScheme>(`/api/v1/qh-schemes/${id}`, body)).data,
  remove: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/qh-schemes/${id}`);
  },
};
