import { api } from '../../../shared/api/client';

/// One line in the impact preview - server-grouped by `kind` so the SPA can
/// render an icon + colour per kind without baking the taxonomy in.
export type DeletionLine = {
  kind: string;
  count: number;
  description: string;
};

/// Result of GET /api/v1/admin/delete-impact/{entityType}/{id}.
export type DeletionImpact = {
  entityType: string;
  id: string;
  label: string;
  blockers: DeletionLine[];
  cascades: DeletionLine[];
  redactions: DeletionLine[];
};

/// Row in the Trash list at GET /api/v1/admin/trash.
export type TrashRow = {
  entityType: string;
  id: string;
  label: string;
  deletedAtUtc: string;
  deletedByUserId: string | null;
  deletedByUserName: string | null;
  deletionReason: string | null;
  retentionUntilUtc: string | null;
};

/// Thin wrapper over /api/v1/admin/delete-* endpoints. Errors propagate as axios
/// rejections so callers can pattern-match on response.status (400/422/404 etc).
export const deletionApi = {
  /// Static allowlist of entity types the server can soft-delete. Cached by
  /// TanStack Query in callers - the list rarely changes (re-fetch on app load
  /// is enough).
  supportedTypes: async (): Promise<string[]> => {
    const { data } = await api.get<string[]>('/api/v1/admin/delete-supported-types');
    return data;
  },

  /// Preview the blast radius before confirming the delete. No side effects.
  impact: async (entityType: string, id: string): Promise<DeletionImpact> => {
    const { data } = await api.get<DeletionImpact>(`/api/v1/admin/delete-impact/${entityType}/${id}`);
    return data;
  },

  /// Move the row to the trash. Reason is required (≥ 10 chars enforced server-side).
  softDelete: async (entityType: string, id: string, reason: string): Promise<void> => {
    await api.post(`/api/v1/admin/soft-delete/${entityType}/${id}`, { reason });
  },

  /// Pull a row back out of the trash before its retention deadline.
  restore: async (entityType: string, id: string): Promise<void> => {
    await api.post(`/api/v1/admin/restore/${entityType}/${id}`);
  },

  /// Hard-delete NOW, bypassing the 30-day timer. Used by the "Purge now" button
  /// in the trash UI - presents a second confirmation in the modal because the
  /// effect is irreversible.
  purge: async (entityType: string, id: string): Promise<void> => {
    await api.post(`/api/v1/admin/purge/${entityType}/${id}`);
  },

  /// Trash list. Optional filter by entity type.
  trash: async (entityType?: string): Promise<TrashRow[]> => {
    const params = entityType ? { entityType } : undefined;
    const { data } = await api.get<TrashRow[]>('/api/v1/admin/trash', { params });
    return data;
  },
};
