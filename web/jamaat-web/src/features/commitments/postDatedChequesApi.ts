import { api } from '../../shared/api/client';

/// 1=Pledged, 2=Deposited, 3=Cleared, 4=Bounced, 5=Cancelled.
export type PostDatedChequeStatus = 1 | 2 | 3 | 4 | 5;

export const PdcStatusLabel: Record<PostDatedChequeStatus, string> = {
  1: 'Pledged', 2: 'Deposited', 3: 'Cleared', 4: 'Bounced', 5: 'Cancelled',
};

export const PdcStatusColor: Record<PostDatedChequeStatus, string> = {
  1: 'gold', 2: 'blue', 3: 'green', 4: 'red', 5: 'default',
};

export type PostDatedCheque = {
  id: string;
  commitmentId: string; commitmentCode: string; partyName: string;
  commitmentInstallmentId?: string | null; installmentNo?: number | null; installmentDueDate?: string | null;
  memberId: string; memberItsNumber: string; memberName: string;
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
