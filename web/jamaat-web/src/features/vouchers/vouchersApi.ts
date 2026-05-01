import { api } from '../../shared/api/client';

export type PaymentMode = 1 | 2 | 4 | 8 | 16 | 32;
export const PaymentModeLabel: Record<number, string> = {
  1: 'Cash', 2: 'Cheque', 4: 'Bank Transfer', 8: 'Card', 16: 'Online', 32: 'UPI',
};
/// 1=Draft, 2=PendingApproval, 3=Approved, 4=Paid, 5=Cancelled, 6=Reversed,
/// 7=PendingClearance (held until a future-dated cheque clears - no number, no GL post until then).
export type VoucherStatus = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const VoucherStatusLabel: Record<VoucherStatus, string> = {
  1: 'Draft', 2: 'Pending Approval', 3: 'Approved', 4: 'Paid', 5: 'Cancelled', 6: 'Reversed', 7: 'Pending clearance',
};
export const VoucherStatusColor: Record<VoucherStatus, string> = {
  1: 'default', 2: 'gold', 3: 'blue', 4: 'green', 5: 'red', 6: 'volcano', 7: 'gold',
};

export type VoucherLine = {
  id: string; lineNo: number; expenseTypeId: string; expenseTypeCode: string; expenseTypeName: string;
  amount: number; narration?: string | null;
};

export type Voucher = {
  id: string; voucherNumber?: string | null; voucherDate: string;
  payTo: string; payeeItsNumber?: string | null; purpose: string;
  amountTotal: number; currency: string;
  fxRate: number; baseCurrency: string; baseAmountTotal: number;
  paymentMode: PaymentMode; chequeNumber?: string | null; chequeDate?: string | null;
  drawnOnBank?: string | null; bankAccountId?: string | null; bankAccountName?: string | null;
  paymentDate?: string | null; remarks?: string | null; status: VoucherStatus;
  approvedByUserName?: string | null; approvedAtUtc?: string | null;
  paidByUserName?: string | null; paidAtUtc?: string | null;
  createdAtUtc: string;
  lines: VoucherLine[];
  /// Set when status === PendingClearance: the linked PostDatedCheque tracking the future-dated cheque.
  pendingPostDatedChequeId?: string | null;
};

export type VoucherListItem = {
  id: string; voucherNumber?: string | null; voucherDate: string; payTo: string;
  amountTotal: number; currency: string; paymentMode: PaymentMode;
  status: VoucherStatus; createdAtUtc: string;
};

export type PagedResult<T> = { items: T[]; total: number; page: number; pageSize: number };

export type VoucherListQuery = {
  page?: number; pageSize?: number; sortBy?: string; sortDir?: 'Asc' | 'Desc';
  search?: string; status?: VoucherStatus; paymentMode?: PaymentMode;
  fromDate?: string; toDate?: string;
};

export type CreateVoucher = {
  voucherDate: string; payTo: string; payeeItsNumber?: string; purpose?: string;
  currency?: string;
  paymentMode: PaymentMode; bankAccountId?: string | null;
  chequeNumber?: string; chequeDate?: string; drawnOnBank?: string; paymentDate?: string;
  remarks?: string;
  lines: { expenseTypeId: string; amount: number; narration?: string }[];
};

import { openAuthenticatedPdf } from '../../shared/api/pdf';

export type VoucherSummary = {
  paidThisMonth: number;
  paidThisMonthCount: number;
  pendingApprovalCount: number;
  draftCount: number;
  paidThisYear: number;
  paidThisYearCount: number;
  currency: string;
};

export const vouchersApi = {
  list: async (q: VoucherListQuery) => (await api.get<PagedResult<VoucherListItem>>('/api/v1/vouchers', { params: q })).data,
  get: async (id: string) => (await api.get<Voucher>(`/api/v1/vouchers/${id}`)).data,
  summary: async () => (await api.get<VoucherSummary>('/api/v1/vouchers/summary')).data,
  create: async (input: CreateVoucher) => (await api.post<Voucher>('/api/v1/vouchers', input)).data,
  approve: async (id: string) => (await api.post<Voucher>(`/api/v1/vouchers/${id}/approve`)).data,
  cancel: async (id: string, reason: string) => (await api.post<Voucher>(`/api/v1/vouchers/${id}/cancel`, { reason })).data,
  reverse: async (id: string, reason: string) => (await api.post<Voucher>(`/api/v1/vouchers/${id}/reverse`, { reason })).data,
  /** Opens PDF via blob+auth. */
  openPdf: (id: string) => openAuthenticatedPdf(`/api/v1/vouchers/${id}/pdf`, `voucher-${id}.pdf`),
};
