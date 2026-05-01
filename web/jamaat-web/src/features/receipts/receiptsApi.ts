import { api } from '../../shared/api/client';

export type PaymentMode = 1 | 2 | 4 | 8 | 16 | 32;
export const PaymentModeLabel: Record<number, string> = {
  1: 'Cash', 2: 'Cheque', 4: 'Bank Transfer', 8: 'Card', 16: 'Online', 32: 'UPI',
};
/// 1=Draft, 2=Confirmed, 3=Cancelled, 4=Reversed, 5=PendingClearance (held until a future-dated
/// cheque clears - no number, no GL post until then).
export type ReceiptStatus = 1 | 2 | 3 | 4 | 5;
export const ReceiptStatusLabel: Record<ReceiptStatus, string> = {
  1: 'Draft', 2: 'Confirmed', 3: 'Cancelled', 4: 'Reversed', 5: 'Pending clearance',
};
export const ReceiptStatusColor: Record<ReceiptStatus, string> = {
  1: 'default', 2: 'green', 3: 'red', 4: 'volcano', 5: 'gold',
};

export type ReceiptLine = {
  id: string; lineNo: number; fundTypeId: string; fundTypeCode: string; fundTypeName: string;
  amount: number; purpose?: string | null; periodReference?: string | null;
  commitmentId?: string | null; commitmentCode?: string | null;
  commitmentInstallmentId?: string | null; installmentNo?: number | null;
  fundEnrollmentId?: string | null; fundEnrollmentCode?: string | null;
  qarzanHasanaLoanId?: string | null; qarzanHasanaLoanCode?: string | null;
  qarzanHasanaInstallmentId?: string | null; qarzanHasanaInstallmentNo?: number | null;
};

/// 1=Permanent (default), 2=Returnable. Drives whether the receipt creates a return obligation.
export type ContributionIntention = 1 | 2;
export const ContributionIntentionLabel: Record<ContributionIntention, string> = { 1: 'Permanent', 2: 'Returnable' };

/// Stored maturity-state snapshot for returnable receipts.
/// 0=NotApplicable (permanent), 1=NotMatured, 2=Matured, 3=PartiallyReturned, 4=FullyReturned.
export type ReturnableMaturityState = 0 | 1 | 2 | 3 | 4;
export const ReturnableMaturityStateLabel: Record<ReturnableMaturityState, string> = {
  0: 'Not applicable', 1: 'Not yet matured', 2: 'Matured',
  3: 'Partially returned', 4: 'Fully returned',
};
export const ReturnableMaturityStateColor: Record<ReturnableMaturityState, string> = {
  0: 'default', 1: 'gold', 2: 'green', 3: 'blue', 4: 'default',
};

export type Receipt = {
  id: string; receiptNumber?: string | null; receiptDate: string;
  memberId: string; itsNumberSnapshot: string; memberNameSnapshot: string;
  amountTotal: number; currency: string;
  fxRate: number; baseCurrency: string; baseAmountTotal: number;
  paymentMode: PaymentMode; chequeNumber?: string | null; chequeDate?: string | null;
  drawnOnBank?: string | null;
  bankAccountId?: string | null; bankAccountName?: string | null;
  paymentReference?: string | null; remarks?: string | null;
  status: ReceiptStatus; confirmedAtUtc?: string | null; confirmedByUserName?: string | null;
  /// Set when status === PendingClearance: the linked PostDatedCheque tracking the future-dated cheque.
  pendingPostDatedChequeId?: string | null;
  createdAtUtc: string;
  lines: ReceiptLine[];
  // Batch-2 returnable-contribution fields
  intention: ContributionIntention;
  niyyathNote?: string | null;
  maturityDate?: string | null;
  agreementReference?: string | null;
  amountReturned: number;
  maturityState: ReturnableMaturityState;
  agreementDocumentUrl?: string | null;
};

export type ReceiptListItem = {
  id: string; receiptNumber?: string | null; receiptDate: string;
  itsNumberSnapshot: string; memberNameSnapshot: string;
  amountTotal: number; currency: string;
  paymentMode: PaymentMode; status: ReceiptStatus; createdAtUtc: string;
};

export type PagedResult<T> = { items: T[]; total: number; page: number; pageSize: number };

export type ReceiptListQuery = {
  page?: number; pageSize?: number; sortBy?: string; sortDir?: 'Asc' | 'Desc';
  search?: string; status?: ReceiptStatus; paymentMode?: PaymentMode;
  fromDate?: string; toDate?: string; fundTypeId?: string; memberId?: string;
};

export type CreateReceiptLine = {
  fundTypeId: string;
  amount: number;
  purpose?: string;
  periodReference?: string;
  commitmentId?: string;
  commitmentInstallmentId?: string;
  fundEnrollmentId?: string;
  qarzanHasanaLoanId?: string;
  qarzanHasanaInstallmentId?: string;
};

export type CreateReceipt = {
  receiptDate: string; memberId: string;
  currency?: string;
  paymentMode: PaymentMode; bankAccountId?: string | null;
  chequeNumber?: string; chequeDate?: string;
  /// Contributor's drawee bank. Required when chequeDate is in the future (post-dated cheque
  /// tracking); optional otherwise (kept for bank reconciliation).
  drawnOnBank?: string;
  paymentReference?: string; remarks?: string;
  lines: CreateReceiptLine[];
  familyId?: string;
  onBehalfOfMemberIds?: string[];
  // Batch-2 returnable-contribution fields
  intention?: ContributionIntention;
  niyyathNote?: string;
  maturityDate?: string; // yyyy-MM-dd
  agreementReference?: string;
};

import { openAuthenticatedPdf } from '../../shared/api/pdf';

export type ReturnContribution = {
  receiptId: string;
  amount: number;
  returnDate: string; // yyyy-MM-dd
  paymentMode: PaymentMode;
  bankAccountId?: string | null;
  chequeNumber?: string;
  chequeDate?: string; // yyyy-MM-dd
  reason?: string;
};

export const receiptsApi = {
  list: async (q: ReceiptListQuery) => (await api.get<PagedResult<ReceiptListItem>>('/api/v1/receipts', { params: q })).data,
  get: async (id: string) => (await api.get<Receipt>(`/api/v1/receipts/${id}`)).data,
  create: async (input: CreateReceipt) => (await api.post<Receipt>('/api/v1/receipts', input)).data,
  cancel: async (id: string, reason: string) => (await api.post<Receipt>(`/api/v1/receipts/${id}/cancel`, { reason })).data,
  reverse: async (id: string, reason: string) => (await api.post<Receipt>(`/api/v1/receipts/${id}/reverse`, { reason })).data,
  approve: async (id: string) => (await api.post<Receipt>(`/api/v1/receipts/${id}/approve`)).data,
  returnContribution: async (id: string, input: ReturnContribution) =>
    (await api.post<Receipt>(`/api/v1/receipts/${id}/return-contribution`, input)).data,
  uploadAgreementDocument: async (id: string, file: File): Promise<Receipt> => {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await api.post<Receipt>(`/api/v1/receipts/${id}/agreement-document`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
  deleteAgreementDocument: async (id: string): Promise<Receipt> =>
    (await api.delete<Receipt>(`/api/v1/receipts/${id}/agreement-document`)).data,
  /** Opens the uploaded agreement doc in a new tab via the auth-aware blob trick. */
  openAgreementDocument: (id: string) =>
    openAuthenticatedPdf(`/api/v1/receipts/${id}/agreement-document`, `agreement-${id}.pdf`),
  /** Opens the PDF in a new tab using the blob+auth trick (native window.open would drop the Authorization header). */
  openPdf: (id: string, reprint = false) =>
    openAuthenticatedPdf(`/api/v1/receipts/${id}/pdf${reprint ? '?reprint=true' : ''}`, `receipt-${id}.pdf`),
  logReprint: async (id: string, reason?: string) => { await api.post(`/api/v1/receipts/${id}/reprint-log`, { reason }); },
};
