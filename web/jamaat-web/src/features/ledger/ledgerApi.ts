import { api } from '../../shared/api/client';

export type LedgerSourceType = 1 | 2 | 3 | 4 | 5;
export const LedgerSourceLabel: Record<LedgerSourceType, string> = {
  1: 'Receipt', 2: 'Voucher', 3: 'Journal', 4: 'Reversal', 5: 'Opening',
};

export type LedgerEntry = {
  id: number; postingDate: string; financialPeriodId: string; financialPeriodName?: string | null;
  sourceType: LedgerSourceType; sourceId: string; sourceReference: string; lineNo: number;
  accountId: string; accountCode: string; accountName: string;
  fundTypeId?: string | null; fundTypeName?: string | null;
  debit: number; credit: number; currency: string;
  narration?: string | null; reversalOfEntryId?: number | null; postedAtUtc: string;
};

export type AccountBalance = {
  accountId: string; accountCode: string; accountName: string;
  debit: number; credit: number; balance: number;
};

export type FinancialPeriod = {
  id: string; name: string; startDate: string; endDate: string;
  status: 1 | 2; closedAtUtc?: string | null; closedByUserName?: string | null;
};

export type PagedResult<T> = { items: T[]; total: number; page: number; pageSize: number };

export type LedgerQuery = {
  page?: number; pageSize?: number; search?: string;
  accountId?: string; fundTypeId?: string; sourceType?: LedgerSourceType;
  fromDate?: string; toDate?: string;
};

export const ledgerApi = {
  list: async (q: LedgerQuery) => (await api.get<PagedResult<LedgerEntry>>('/api/v1/ledger/entries', { params: q })).data,
  balances: async (asOf?: string) => (await api.get<AccountBalance[]>('/api/v1/ledger/balances', { params: { asOf } })).data,
};

export const periodsApi = {
  list: async () => (await api.get<FinancialPeriod[]>('/api/v1/periods')).data,
  create: async (input: { name: string; startDate: string; endDate: string }) =>
    (await api.post<FinancialPeriod>('/api/v1/periods', input)).data,
  close: async (id: string) => { await api.post(`/api/v1/periods/${id}/close`); },
  reopen: async (id: string) => { await api.post(`/api/v1/periods/${id}/reopen`); },
};

export const reportsApi = {
  dailyCollection: async (from: string, to: string) =>
    (await api.get<{ date: string; receiptCount: number; amountTotal: number; currency: string }[]>('/api/v1/reports/daily-collection', { params: { from, to } })).data,
  fundWise: async (from: string, to: string, opts?: { eventId?: string; fundCategoryId?: string }) =>
    (await api.get<{
      fundTypeId: string; fundTypeCode: string; fundTypeName: string;
      lineCount: number; amountTotal: number;
      amountCash: number; amountCheque: number; amountBankTransfer: number;
      amountCard: number; amountOnline: number; amountUpi: number;
    }[]>('/api/v1/reports/fund-wise', { params: { from, to, ...opts } })).data,
  dailyPayments: async (from: string, to: string) =>
    (await api.get<{ date: string; voucherCount: number; amountTotal: number; currency: string }[]>('/api/v1/reports/daily-payments', { params: { from, to } })).data,
  cashBook: async (accountId: string, from: string, to: string) =>
    (await api.get<{ date: string; reference: string; narration: string; debit: number; credit: number; balance: number }[]>('/api/v1/reports/cash-book', { params: { accountId, from, to } })).data,
  memberContribution: async (memberId: string, from: string, to: string) =>
    (await api.get<{
      receiptDate: string; receiptNumber: string; fundCode: string; fundName: string;
      periodReference?: string | null; purpose?: string | null;
      amount: number; currency: string; baseAmount: number; baseCurrency: string;
    }[]>('/api/v1/reports/member-contribution', { params: { memberId, from, to } })).data,
  chequeWise: async (from: string, to: string) =>
    (await api.get<{
      receiptDate: string; receiptNumber?: string | null;
      itsNumber: string; memberName: string;
      chequeNumber?: string | null; chequeDate?: string | null; bankAccountName?: string | null;
      amount: number; currency: string; status: string;
    }[]>('/api/v1/reports/cheque-wise', { params: { from, to } })).data,
  /// Dual-balance view of a fund (batch 5 of fund-management uplift).
  fundBalance: async (fundTypeId: string) =>
    (await api.get<{
      fundTypeId: string; fundTypeCode: string; fundTypeName: string; currency: string;
      totalCashReceived: number; permanentReceived: number; returnableReceived: number;
      alreadyReturned: number; outstandingReturnObligation: number; netFundStrength: number;
      receiptCount: number;
    }>('/api/v1/reports/fund-balance', { params: { fundTypeId } })).data,
  returnableContributions: async (fundTypeId?: string) =>
    (await api.get<{
      receiptId: string; receiptNumber?: string | null; receiptDate: string;
      itsNumber: string; memberName: string;
      fundTypeCode: string; fundTypeName: string;
      amountTotal: number; amountReturned: number; amountReturnable: number; currency: string;
      maturityDate?: string | null; isMatured: boolean;
      agreementReference?: string | null; niyyathNote?: string | null;
    }[]>('/api/v1/reports/returnable-contributions', { params: { fundTypeId } })).data,
  outstandingLoans: async (q: { memberId?: string; status?: number; overdueOnly?: boolean }) =>
    (await api.get<{
      loanId: string; code: string;
      memberId: string; memberItsNumber: string; memberName: string;
      amountDisbursed: number; amountRepaid: number; amountOutstanding: number; progressPercent: number;
      currency: string;
      disbursedOn?: string | null; lastPaymentDate?: string | null; ageDays?: number | null;
      installmentCount: number; overdueInstallments: number;
      status: number;
    }[]>('/api/v1/reports/outstanding-loans', { params: q })).data,
  pendingCommitments: async (q: { status?: number; memberId?: string; familyId?: string; fundTypeId?: string; overdueOnly?: boolean }) =>
    (await api.get<{
      commitmentId: string; code: string;
      partyType: number;
      memberId?: string | null; memberItsNumber?: string | null;
      familyId?: string | null; familyCode?: string | null;
      partyName: string;
      fundTypeId: string; fundTypeCode: string; fundTypeName: string;
      currency: string;
      totalAmount: number; paidAmount: number; remainingAmount: number; progressPercent: number;
      installmentCount: number; paidInstallments: number; overdueInstallments: number;
      nextDueDate?: string | null;
      status: number;
    }[]>('/api/v1/reports/pending-commitments', { params: q })).data,
  overdueReturns: async (q: { memberId?: string; fundTypeId?: string; minDaysOverdue?: number }) =>
    (await api.get<{
      receiptId: string; receiptNumber?: string | null; receiptDate: string;
      memberId: string; itsNumber: string; memberName: string;
      fundTypeId: string; fundTypeCode: string; fundTypeName: string;
      amountTotal: number; amountReturned: number; amountOutstanding: number; currency: string;
      maturityDate: string; daysOverdue: number;
      agreementReference?: string | null; niyyathNote?: string | null;
    }[]>('/api/v1/reports/overdue-returns', { params: q })).data,
};

export const dashboardApi = {
  stats: async () => (await api.get<{
    todayCollection: number; receiptsToday: number; activeMembers: number;
    mtdCollection: number; yesterdayCollection: number | null; receiptsYesterday: number | null;
    pendingApprovals: number; syncErrors: number; currency: string;
  }>('/api/v1/dashboard/stats')).data,
  recentActivity: async (take = 10) =>
    (await api.get<{ kind: string; reference: string; title: string; amount: number | null; currency: string; status: string; atUtc: string }[]>('/api/v1/dashboard/recent-activity', { params: { take } })).data,
  fundSlice: async (from: string, to: string) =>
    (await api.get<{ fundTypeId: string; name: string; code: string; amount: number }[]>('/api/v1/dashboard/fund-slice', { params: { from, to } })).data,
};
