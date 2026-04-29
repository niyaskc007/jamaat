import { api } from '../../shared/api/client';
import type { PagedResult } from '../members/membersApi';

export type QhScheme = 0 | 1 | 2;
export const QhSchemeLabel: Record<QhScheme, string> = { 0: 'Other', 1: 'Mohammadi Scheme', 2: 'Hussain Scheme' };

export type QhStatus = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export const QhStatusLabel: Record<QhStatus, string> = {
  1: 'Draft', 2: 'Pending L1', 3: 'Pending L2', 4: 'Approved', 5: 'Disbursed',
  6: 'Active', 7: 'Completed', 8: 'Defaulted', 9: 'Cancelled', 10: 'Rejected',
};
export const QhStatusColor: Record<QhStatus, string> = {
  1: 'default', 2: 'gold', 3: 'gold', 4: 'blue', 5: 'blue',
  6: 'green', 7: 'green', 8: 'red', 9: 'red', 10: 'red',
};

export type QhInstallmentStatus = 1 | 2 | 3 | 4 | 5;
export const QhInstallmentStatusLabel: Record<QhInstallmentStatus, string> = {
  1: 'Pending', 2: 'Partially paid', 3: 'Paid', 4: 'Overdue', 5: 'Waived',
};

export type QhLoan = {
  id: string; code: string;
  memberId: string; memberItsNumber: string; memberName: string;
  familyId?: string | null; familyCode?: string | null;
  scheme: QhScheme;
  amountRequested: number; amountApproved: number; amountDisbursed: number; amountRepaid: number; amountOutstanding: number;
  instalmentsRequested: number; instalmentsApproved: number;
  goldAmount?: number | null;
  currency: string;
  startDate: string; endDate?: string | null;
  status: QhStatus;
  guarantor1MemberId: string; guarantor1Name: string;
  guarantor2MemberId: string; guarantor2Name: string;
  cashflowDocumentUrl?: string | null;
  goldSlipDocumentUrl?: string | null;
  level1ApproverName?: string | null; level1ApprovedAtUtc?: string | null; level1Comments?: string | null;
  level2ApproverName?: string | null; level2ApprovedAtUtc?: string | null; level2Comments?: string | null;
  disbursedOn?: string | null;
  rejectionReason?: string | null; cancellationReason?: string | null;
  progressPercent: number;
  createdAtUtc: string;
};

export type QhInstallment = {
  id: string; installmentNo: number; dueDate: string;
  scheduledAmount: number; paidAmount: number; remainingAmount: number;
  lastPaymentDate?: string | null;
  status: QhInstallmentStatus;
  waiverReason?: string | null;
  waivedAtUtc?: string | null;
  waivedByUserName?: string | null;
};

export type QhLoanDetail = { loan: QhLoan; installments: QhInstallment[] };

export type CreateQhInput = {
  memberId: string;
  familyId?: string;
  scheme: QhScheme;
  amountRequested: number;
  instalmentsRequested: number;
  currency: string;
  startDate: string;
  guarantor1MemberId: string;
  guarantor2MemberId: string;
  goldAmount?: number;
  cashflowDocumentUrl?: string;
  goldSlipDocumentUrl?: string;
};

export const qarzanHasanaApi = {
  list: async (q: { page?: number; pageSize?: number; search?: string; status?: QhStatus; scheme?: QhScheme; memberId?: string }): Promise<PagedResult<QhLoan>> =>
    (await api.get('/api/v1/qarzan-hasana', { params: q })).data,
  get: async (id: string): Promise<QhLoanDetail> => (await api.get(`/api/v1/qarzan-hasana/${id}`)).data,
  create: async (input: CreateQhInput): Promise<QhLoan> => (await api.post('/api/v1/qarzan-hasana', input)).data,
  submit: async (id: string): Promise<QhLoan> => (await api.post(`/api/v1/qarzan-hasana/${id}/submit`)).data,
  approveL1: async (id: string, amountApproved: number, instalmentsApproved: number, comments?: string): Promise<QhLoan> =>
    (await api.post(`/api/v1/qarzan-hasana/${id}/approve-l1`, { amountApproved, instalmentsApproved, comments })).data,
  approveL2: async (id: string, comments?: string): Promise<QhLoan> =>
    (await api.post(`/api/v1/qarzan-hasana/${id}/approve-l2`, { comments })).data,
  reject: async (id: string, reason: string): Promise<QhLoan> => (await api.post(`/api/v1/qarzan-hasana/${id}/reject`, { reason })).data,
  cancel: async (id: string, reason: string): Promise<QhLoan> => (await api.post(`/api/v1/qarzan-hasana/${id}/cancel`, { reason })).data,
  /// Two ways to call:
  ///   - Legacy "link existing voucher" - pass voucherId; loan is marked Disbursed but no GL changes here.
  ///   - "Issue voucher inline" - pass bankAccountId (+ optional payment-mode/cheque info). The service
  ///     creates a QH-disbursement voucher, posts Dr QH Receivable / Cr Bank, and links it to the loan.
  disburse: async (id: string, input: {
    disbursedOn: string;
    voucherId?: string;
    bankAccountId?: string;
    paymentMode?: number;
    chequeNumber?: string;
    chequeDate?: string;
    remarks?: string;
  }): Promise<QhLoan> =>
    (await api.post(`/api/v1/qarzan-hasana/${id}/disburse`, input)).data,
  waive: async (id: string, installmentId: string, reason: string) => {
    await api.post(`/api/v1/qarzan-hasana/${id}/waive-installment`, { installmentId, reason });
  },
};
