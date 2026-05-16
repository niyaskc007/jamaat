import { api } from '../../../shared/api/client';

/// Mirrors Jamaat.Contracts.Admin.TransactionDeletionRequestDto.
/// `status` is a string ("Pending" | "Approved" | "Rejected" | "Expired") rather than the
/// underlying int enum so the SPA can switch on it directly.
export type TransactionDeletionRequest = {
  id: string;
  targetType: 'Receipt' | 'Voucher';
  targetId: string;
  targetCode: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Expired';
  reason: string;
  requesterUserId: string | null;
  requesterUserName: string;
  requestedAtUtc: string;
  expiresAtUtc: string;
  approverUserId: string | null;
  approverUserName: string | null;
  approvedAtUtc: string | null;
  decisionNote: string | null;
};

/// Two-person SuperAdmin deletion for posted Receipt/Voucher documents. See
/// ITransactionDeletionService for the workflow. Errors propagate as axios rejections.
export const transactionDeletionApi = {
  /// Initiate a deletion request. Returns the persisted row with status=Pending.
  request: async (targetType: 'Receipt' | 'Voucher', targetId: string, reason: string): Promise<TransactionDeletionRequest> => {
    const { data } = await api.post<TransactionDeletionRequest>(
      '/api/v1/admin/transaction-deletion-requests',
      { targetType, targetId, reason },
    );
    return data;
  },

  /// Second SuperAdmin approves. Two-person rule (requester ≠ approver) enforced server-side.
  approve: async (id: string, note?: string): Promise<TransactionDeletionRequest> => {
    const { data } = await api.post<TransactionDeletionRequest>(
      `/api/v1/admin/transaction-deletion-requests/${id}/approve`,
      { note: note ?? null },
    );
    return data;
  },

  /// Reject or withdraw. Note is required (min 10 chars).
  reject: async (id: string, note: string): Promise<TransactionDeletionRequest> => {
    const { data } = await api.post<TransactionDeletionRequest>(
      `/api/v1/admin/transaction-deletion-requests/${id}/reject`,
      { note },
    );
    return data;
  },

  /// Inbox. Optional status filter ('Pending' | 'Approved' | 'Rejected' | 'Expired').
  list: async (status?: TransactionDeletionRequest['status']): Promise<TransactionDeletionRequest[]> => {
    const params = status ? { status } : undefined;
    const { data } = await api.get<TransactionDeletionRequest[]>(
      '/api/v1/admin/transaction-deletion-requests',
      { params },
    );
    return data;
  },

  get: async (id: string): Promise<TransactionDeletionRequest> => {
    const { data } = await api.get<TransactionDeletionRequest>(
      `/api/v1/admin/transaction-deletion-requests/${id}`,
    );
    return data;
  },
};
