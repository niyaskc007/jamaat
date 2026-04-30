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
  // Borrower's case + guarantor consent (added with the form uplift)
  purpose?: string | null;
  repaymentPlan?: string | null;
  sourceOfIncome?: string | null;
  otherObligations?: string | null;
  guarantorsAcknowledged: boolean;
  guarantorsAcknowledgedAtUtc?: string | null;
  guarantorsAcknowledgedByUserName?: string | null;
  // Structured cashflow / gold / income tags (v2)
  monthlyIncome?: number | null;
  monthlyExpenses?: number | null;
  monthlyExistingEmis?: number | null;
  goldWeightGrams?: number | null;
  goldPurityKarat?: number | null;
  goldHeldAt?: string | null;
  incomeSources?: string | null;
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
  purpose?: string;
  repaymentPlan?: string;
  sourceOfIncome?: string;
  otherObligations?: string;
  guarantorsAcknowledged?: boolean;
  monthlyIncome?: number;
  monthlyExpenses?: number;
  monthlyExistingEmis?: number;
  goldWeightGrams?: number;
  goldPurityKarat?: number;
  goldHeldAt?: string;
  incomeSources?: string;
};

// --- Income source enum ---
/// Fixed list shown as a multi-select on the new-loan form. Values match the backend
/// IncomeSources string column (comma-separated codes).
export const IncomeSourceOptions: { value: string; label: string }[] = [
  { value: 'SALARY', label: 'Salary / Employment' },
  { value: 'BUSINESS', label: 'Business / Self-employed' },
  { value: 'INVESTMENT', label: 'Investment returns' },
  { value: 'SHARE_MARKET', label: 'Share market / Stocks' },
  { value: 'REAL_ESTATE', label: 'Real estate' },
  { value: 'RENTAL', label: 'Rental income' },
  { value: 'PENSION', label: 'Pension / Retirement' },
  { value: 'FAMILY', label: 'Family support' },
  { value: 'AGRICULTURE', label: 'Agriculture' },
  { value: 'FREELANCE', label: 'Freelance / Consulting' },
  { value: 'OTHER', label: 'Other' },
];
export const IncomeSourceLabel = Object.fromEntries(
  IncomeSourceOptions.map((o) => [o.value, o.label]),
) as Record<string, string>;

// --- Guarantor eligibility ---
export type EligibilityCheck = {
  key: string;
  label: string;
  passed: boolean;
  hard: boolean;
  detail: string;
};
export type GuarantorEligibility = {
  memberId: string;
  fullName: string;
  itsNumber: string;
  eligible: boolean;
  hasSoftWarnings: boolean;
  checks: EligibilityCheck[];
};
export type GuarantorTrackRecord = {
  memberId: string;
  itsNumber: string;
  fullName: string;
  grade: string;
  totalScore: number | null;
  activeGuaranteesCount: number;
  pastLoansCount: number;
  defaultedCount: number;
  currentlyEligible: boolean;
  ineligibilityReason: string | null;
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
  decisionSupport: async (id: string): Promise<LoanDecisionSupport> =>
    (await api.get(`/api/v1/qarzan-hasana/${id}/decision-support`)).data,

  /// Probe whether a member is eligible to guarantee a new loan. Used inline on the new-loan form.
  checkGuarantor: async (params: { memberId: string; borrowerId: string; otherGuarantorId?: string; excludeLoanId?: string }): Promise<GuarantorEligibility> => {
    const { memberId, borrowerId, otherGuarantorId, excludeLoanId } = params;
    const q: Record<string, string> = { borrowerId };
    if (otherGuarantorId) q.otherGuarantorId = otherGuarantorId;
    if (excludeLoanId) q.excludeLoanId = excludeLoanId;
    return (await api.get(`/api/v1/qarzan-hasana/check-guarantor/${memberId}`, { params: q })).data;
  },

  /// Upload a cashflow document for an existing draft loan. Returns the updated loan.
  uploadCashflow: async (id: string, file: File): Promise<QhLoan> => {
    const fd = new FormData();
    fd.append('file', file);
    return (await api.post(`/api/v1/qarzan-hasana/${id}/cashflow-document`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },
  /// Upload a gold-slip document for an existing draft loan.
  uploadGoldSlip: async (id: string, file: File): Promise<QhLoan> => {
    const fd = new FormData();
    fd.append('file', file);
    return (await api.post(`/api/v1/qarzan-hasana/${id}/gold-slip-document`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },

  /// Per-guarantor consent rows (token + status + timestamps). Used on the detail page
  /// so the operator can copy the public consent link and resend it.
  guarantorConsents: async (id: string): Promise<GuarantorConsent[]> =>
    (await api.get(`/api/v1/qarzan-hasana/${id}/guarantor-consents`)).data,
};

// --- Guarantor consent (remote portal flow) ---
export type GuarantorConsent = {
  id: string;
  guarantorMemberId: string;
  guarantorName: string;
  guarantorItsNumber: string;
  token: string;
  status: 1 | 2 | 3; // Pending / Accepted / Declined
  respondedAtUtc: string | null;
  responderIpAddress: string | null;
  notificationSentAtUtc: string | null;
};
export const GuarantorConsentStatusLabel: Record<number, string> = {
  1: 'Pending', 2: 'Accepted', 3: 'Declined',
};
export const GuarantorConsentStatusColor: Record<number, string> = {
  1: 'orange', 2: 'green', 3: 'red',
};

export type GuarantorConsentPortal = {
  loanId: string;
  loanCode: string;
  borrowerName: string;
  borrowerItsNumber: string;
  amountRequested: number;
  currency: string;
  instalmentsRequested: number;
  purpose: string | null;
  status: 1 | 2 | 3;
  respondedAtUtc: string | null;
  guarantorName: string;
};

export const guarantorConsentPortalApi = {
  get: async (token: string): Promise<GuarantorConsentPortal> =>
    (await api.get(`/api/v1/portal/qh-consent/${token}`)).data,
  accept: async (token: string): Promise<GuarantorConsentPortal> =>
    (await api.post(`/api/v1/portal/qh-consent/${token}/accept`)).data,
  decline: async (token: string): Promise<GuarantorConsentPortal> =>
    (await api.post(`/api/v1/portal/qh-consent/${token}/decline`)).data,
};

// --- Decision-support DTOs ---
export type LoanReliabilitySummary = {
  grade: string;
  totalScore: number | null;
  loanReady: boolean;
  loanReadyReason: string | null;
  factors: { key: string; name: string; score: number | null; excluded: boolean; raw: string }[];
};
export type LoanCommitmentSummary = {
  activeCount: number;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  top: { code: string; fundName: string; totalAmount: number; outstandingAmount: number }[];
};
export type LoanDonationSummary = {
  months: number;
  totalAmount: number;
  receiptCount: number;
  byFund: { fundName: string; amount: number; receiptCount: number }[];
};
export type LoanPastLoansSummary = {
  loanCount: number;
  completedCount: number;
  defaultedCount: number;
  totalDisbursed: number;
  totalRepaid: number;
  onTimeRepaymentPercent: number;
};
export type LoanFundPosition = {
  currency: string;
  currentNetBalance: number;
  requestedAmount: number;
  projectedAfterDisbursement: number;
  percentRemainingAfter: number;
};
export type LoanDecisionSupport = {
  loanId: string;
  reliability: LoanReliabilitySummary;
  commitments: LoanCommitmentSummary;
  donations: LoanDonationSummary;
  pastLoans: LoanPastLoansSummary;
  fundPosition: LoanFundPosition;
  guarantors: GuarantorTrackRecord[];
};
