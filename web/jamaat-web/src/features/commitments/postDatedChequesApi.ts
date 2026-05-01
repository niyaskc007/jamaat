import { api } from '../../shared/api/client';

/// 1=Pledged, 2=Deposited, 3=Cleared, 4=Bounced, 5=Cancelled.
export type PostDatedChequeStatus = 1 | 2 | 3 | 4 | 5;

export const PdcStatusLabel: Record<PostDatedChequeStatus, string> = {
  1: 'Pledged', 2: 'Deposited', 3: 'Cleared', 4: 'Bounced', 5: 'Cancelled',
};

export const PdcStatusColor: Record<PostDatedChequeStatus, string> = {
  1: 'gold', 2: 'blue', 3: 'green', 4: 'red', 5: 'default',
};

/// 1=Commitment, 2=Receipt, 3=Voucher. Discriminator on PostDatedCheque - drives which set of
/// source fields is populated and what "cleared" actually does to the source document.
export type PostDatedChequeSource = 1 | 2 | 3;

export const PdcSourceLabel: Record<PostDatedChequeSource, string> = {
  1: 'Commitment', 2: 'Receipt', 3: 'Voucher',
};

export const PdcSourceColor: Record<PostDatedChequeSource, string> = {
  1: 'cyan', 2: 'green', 3: 'purple',
};

export type PostDatedCheque = {
  id: string;
  source: PostDatedChequeSource;
  /// Commitment-source (null otherwise).
  commitmentId?: string | null; commitmentCode?: string | null; partyName?: string | null;
  commitmentInstallmentId?: string | null; installmentNo?: number | null; installmentDueDate?: string | null;
  /// Receipt-source (null otherwise). The receipt is held in PendingClearance until this PDC clears.
  sourceReceiptId?: string | null; sourceReceiptNumber?: string | null;
  /// Voucher-source (null otherwise). The voucher is held in PendingClearance until this PDC clears.
  sourceVoucherId?: string | null; sourceVoucherNumber?: string | null; voucherPayTo?: string | null;
  /// Member context - present for Commitment + Receipt sources, null for Voucher (non-member payees).
  memberId?: string | null; memberItsNumber?: string | null; memberName?: string | null;
  chequeNumber: string; chequeDate: string; drawnOnBank: string;
  amount: number; currency: string;
  status: PostDatedChequeStatus;
  depositedOn?: string | null;
  clearedOn?: string | null; clearedReceiptId?: string | null; clearedReceiptNumber?: string | null;
  bouncedOn?: string | null; bounceReason?: string | null;
  cancelledOn?: string | null; cancellationReason?: string | null;
  replacedByChequeId?: string | null;
  notes?: string | null;
  createdAtUtc: string;
};

export const postDatedChequesApi = {
  listByCommitment: async (commitmentId: string) =>
    (await api.get<PostDatedCheque[]>(`/api/v1/post-dated-cheques/commitment/${commitmentId}`)).data,
  list: async (status?: PostDatedChequeStatus) =>
    (await api.get<PostDatedCheque[]>('/api/v1/post-dated-cheques', { params: { status } })).data,
  add: async (input: {
    commitmentId: string; commitmentInstallmentId?: string;
    chequeNumber: string; chequeDate: string; drawnOnBank: string;
    amount: number; currency?: string; notes?: string;
  }) => (await api.post<PostDatedCheque>('/api/v1/post-dated-cheques', input)).data,
  deposit: async (id: string, depositedOn: string) =>
    (await api.post<PostDatedCheque>(`/api/v1/post-dated-cheques/${id}/deposit`, { depositedOn })).data,
  /// Issues a Receipt + posts the ledger as a side-effect.
  clear: async (id: string, input: { clearedOn: string; bankAccountId: string }) =>
    (await api.post<PostDatedCheque>(`/api/v1/post-dated-cheques/${id}/clear`, input)).data,
  bounce: async (id: string, input: { bouncedOn: string; reason: string }) =>
    (await api.post<PostDatedCheque>(`/api/v1/post-dated-cheques/${id}/bounce`, input)).data,
  cancel: async (id: string, input: { cancelledOn: string; reason: string }) =>
    (await api.post<PostDatedCheque>(`/api/v1/post-dated-cheques/${id}/cancel`, input)).data,
};
