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
  status: 1 | 2; closedAtUtc?: string | null;
  closedByUserId?: string | null; closedByUserName?: string | null;
};

export type PagedResult<T> = { items: T[]; total: number; page: number; pageSize: number };

export type LedgerQuery = {
  page?: number; pageSize?: number; search?: string;
  accountId?: string; fundTypeId?: string; sourceType?: LedgerSourceType;
  sourceId?: string;
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
    pendingReceipts: number;
  }>('/api/v1/dashboard/stats')).data,
  recentActivity: async (take = 10) =>
    (await api.get<{ kind: string; reference: string; title: string; amount: number | null; currency: string; status: string; atUtc: string }[]>('/api/v1/dashboard/recent-activity', { params: { take } })).data,
  insights: async () => (await api.get<{
    collectionTrend: { date: string; amount: number; count: number }[];
    outstandingLoanBalance: number;
    outstandingReturnableBalance: number;
    pendingCommitmentBalance: number;
    overdueReturnsCount: number;
    chequePipeline: { status: number; statusLabel: string; count: number; amount: number }[];
    currency: string;
  }>('/api/v1/dashboard/insights')).data,
  fundSlice: async (from: string, to: string) =>
    (await api.get<{ fundTypeId: string; name: string; code: string; amount: number }[]>('/api/v1/dashboard/fund-slice', { params: { from, to } })).data,

  // Phase 6/7 BI additions
  incomeExpense: async (months = 12) =>
    (await api.get<{ year: number; month: number; income: number; expense: number; currency: string }[]>(
      '/api/v1/dashboard/income-expense-trend', { params: { months } })).data,
  topContributors: async (days = 30, take = 5) =>
    (await api.get<{ memberId: string; itsNumber: string; fullName: string; amount: number; receiptCount: number; currency: string }[]>(
      '/api/v1/dashboard/top-contributors', { params: { days, take } })).data,
  outflowByCategory: async (days = 30, take = 5) =>
    (await api.get<{ category: string; amount: number; voucherCount: number; currency: string }[]>(
      '/api/v1/dashboard/outflow-by-category', { params: { days, take } })).data,
  upcomingCheques: async (days = 30) =>
    (await api.get<{ id: string; chequeNumber: string; chequeDate: string; amount: number; memberName: string; status: number; currency: string }[]>(
      '/api/v1/dashboard/upcoming-cheques', { params: { days } })).data,

  qhPortfolio: async () => (await api.get<QhPortfolioDto>('/api/v1/dashboard/qh-portfolio')).data,
  receivablesAging: async () => (await api.get<ReceivablesAgingDto>('/api/v1/dashboard/receivables-aging')).data,
  memberEngagement: async (months = 12) =>
    (await api.get<MemberEngagementDto>('/api/v1/dashboard/member-engagement', { params: { months } })).data,
  compliance: async (days = 30) =>
    (await api.get<ComplianceDashboardDto>('/api/v1/dashboard/compliance', { params: { days } })).data,

  events: async (months = 12) =>
    (await api.get<EventsDashboardDto>('/api/v1/dashboard/events', { params: { months } })).data,
  cheques: async () =>
    (await api.get<ChequesDashboardDto>('/api/v1/dashboard/cheques')).data,
  families: async (months = 12) =>
    (await api.get<FamiliesDashboardDto>('/api/v1/dashboard/families', { params: { months } })).data,
  fundEnrollments: async (months = 12) =>
    (await api.get<FundEnrollmentsDashboardDto>('/api/v1/dashboard/fund-enrollments', { params: { months } })).data,

  eventDetail: async (eventId: string) =>
    (await api.get<EventDetailDashboardDto>(`/api/v1/dashboard/events/${eventId}`)).data,
  fundTypeDetail: async (fundTypeId: string, months = 12) =>
    (await api.get<FundTypeDetailDashboardDto>(`/api/v1/dashboard/fund-types/${fundTypeId}`, { params: { months } })).data,
  cashflow: async (days = 90) =>
    (await api.get<CashflowDashboardDto>('/api/v1/dashboard/cashflow', { params: { days } })).data,
  qhFunnel: async (months = 12) =>
    (await api.get<QhFunnelDashboardDto>('/api/v1/dashboard/qh-funnel', { params: { months } })).data,
  commitmentTypes: async () =>
    (await api.get<CommitmentTypesDashboardDto>('/api/v1/dashboard/commitment-types')).data,

  vouchers: async (from?: string | null, to?: string | null) =>
    (await api.get<VouchersDashboardDto>('/api/v1/dashboard/vouchers', { params: { from, to } })).data,
  receipts: async (from?: string | null, to?: string | null, fundTypeId?: string | null) =>
    (await api.get<ReceiptsDashboardDto>('/api/v1/dashboard/receipts', { params: { from, to, fundTypeId } })).data,
  memberAssets: async (sectorId?: string | null) =>
    (await api.get<MemberAssetsDashboardDto>('/api/v1/dashboard/member-assets', { params: { sectorId } })).data,
  sectors: async () =>
    (await api.get<SectorsDashboardDto>('/api/v1/dashboard/sectors')).data,
  returnables: async (fundTypeId?: string | null) =>
    (await api.get<ReturnablesDashboardDto>('/api/v1/dashboard/returnables', { params: { fundTypeId } })).data,

  memberDetail: async (memberId: string) =>
    (await api.get<MemberDetailDashboardDto>(`/api/v1/dashboard/members/${memberId}`)).data,
  commitmentDetail: async (commitmentId: string) =>
    (await api.get<CommitmentDetailDashboardDto>(`/api/v1/dashboard/commitments/${commitmentId}`)).data,
  notifications: async (from?: string | null, to?: string | null) =>
    (await api.get<NotificationsDashboardDto>('/api/v1/dashboard/notifications', { params: { from, to } })).data,
  userActivity: async (from?: string | null, to?: string | null) =>
    (await api.get<UserActivityDashboardDto>('/api/v1/dashboard/user-activity', { params: { from, to } })).data,

  changeRequests: async (from?: string | null, to?: string | null) =>
    (await api.get<ChangeRequestsDashboardDto>('/api/v1/dashboard/change-requests', { params: { from, to } })).data,
  expenseTypes: async (from?: string | null, to?: string | null) =>
    (await api.get<ExpenseTypesDashboardDto>('/api/v1/dashboard/expense-types', { params: { from, to } })).data,
  periods: async () =>
    (await api.get<PeriodsDashboardDto>('/api/v1/dashboard/periods')).data,
  annualSummary: async (year: number) =>
    (await api.get<AnnualSummaryDto>('/api/v1/dashboard/annual-summary', { params: { year } })).data,
  reconciliation: async () =>
    (await api.get<ReconciliationDashboardDto>('/api/v1/dashboard/reconciliation')).data,
};

export type QhStatusBucket = { status: number; label: string; count: number; outstanding: number };
export type QhMonthlyPoint = { year: number; month: number; disbursed: number; repaid: number };
export type QhBorrowerRow = { memberId: string; itsNumber: string; fullName: string; outstanding: number; loanCount: number };
export type QhUpcomingInstallment = {
  loanId: string; loanCode: string; memberId: string; memberName: string;
  installmentNo: number; dueDate: string; remainingAmount: number;
};
export type QhPortfolioDto = {
  currency: string;
  totalLoans: number; activeCount: number; completedCount: number; defaultedCount: number; inApprovalCount: number;
  totalDisbursed: number; totalRepaid: number; totalOutstanding: number;
  defaultRatePercent: number;
  byStatus: QhStatusBucket[];
  repaymentTrend: QhMonthlyPoint[];
  topBorrowers: QhBorrowerRow[];
  upcomingInstallments: QhUpcomingInstallment[];
  averageLoanSize: number; averageInstallments: number;
  goldBackedTotal: number; goldBackedCount: number;
  bySchemeMix: QhStatusBucket[];
  overdueInstallmentsTotal: number; overduePrincipal: number;
};

export type AgingBucket = { label: string; count: number; amount: number };
export type OldestObligationRow = { kind: string; reference: string; memberName: string; dueDate: string; daysOverdue: number; amount: number };
export type ChequePipelinePoint = { status: number; statusLabel: string; count: number; amount: number };
export type UpcomingMaturityRow = { receiptId: string; receiptNumber: string; memberName: string; maturityDate: string; outstanding: number };
export type ReceivablesAgingDto = {
  currency: string;
  commitmentsOutstanding: number; commitmentsOverdueCount: number;
  returnablesOutstanding: number; returnablesOverdueCount: number;
  chequesPledgedAmount: number; chequesPledgedCount: number;
  commitmentBuckets: AgingBucket[];
  returnableBuckets: AgingBucket[];
  oldestObligations: OldestObligationRow[];
  chequePipeline: ChequePipelinePoint[];
  upcomingMaturities: UpcomingMaturityRow[];
  commitmentsByFund: NamedCountPoint[];
};

export type MemberMonthlyPoint = { year: number; month: number; count: number };
export type MemberEngagementDto = {
  totalMembers: number; activeMembers: number; inactiveMembers: number; deceasedMembers: number; suspendedMembers: number;
  verifiedMembers: number; verificationPendingMembers: number; verificationNotStartedMembers: number; verificationRejectedMembers: number;
  newThisMonth: number; newThisYear: number;
  newMemberTrend: MemberMonthlyPoint[];
  genderSplit: NamedCountPoint[];
  maritalSplit: NamedCountPoint[];
  ageBrackets: NamedCountPoint[];
  hajjSplit: NamedCountPoint[];
  misaqSplit: NamedCountPoint[];
  sectorSplit: NamedCountPoint[];
  familyRoleSplit: NamedCountPoint[];
};

export type DailyCountPoint = { date: string; count: number };
export type NamedCountPoint = { label: string; count: number };
export type ComplianceDashboardDto = {
  auditEventsTotal: number;
  openErrors: number;
  pendingChangeRequests: number;
  pendingVoucherApprovals: number;
  draftReceipts: number;
  unverifiedMembers: number;
  hasOpenPeriod: boolean;
  openPeriodName: string | null;
  periodOpenDays: number | null;
  auditTrend: DailyCountPoint[];
  errorsBySeverity: NamedCountPoint[];
  changeRequestsByStatus: NamedCountPoint[];
  topUsersByAudit: NamedCountPoint[];
  topEntitiesByAudit: NamedCountPoint[];
  errorTrend: DailyCountPoint[];
  errorsBySource: NamedCountPoint[];
  windowDays: number;
};

// -- Events dashboard --------------------------------------------------------

export type TopEventRow = {
  eventId: string; slug: string; name: string; eventDate: string;
  registrationCount: number; checkedInCount: number; capacity: number | null; fillPercent: number;
};
export type UpcomingEventRow = {
  eventId: string; slug: string; name: string; eventDate: string;
  category: string; registrationCount: number; capacity: number | null;
};
export type EventsDashboardDto = {
  totalEvents: number; activeEvents: number; upcomingEvents: number; pastEvents: number;
  totalRegistrations: number; confirmedRegistrations: number; checkedInRegistrations: number; cancelledRegistrations: number;
  registrationsThisMonth: number;
  averageFillPercent: number;
  registrationsByStatus: NamedCountPoint[];
  eventsByCategory: NamedCountPoint[];
  registrationTrend: MemberMonthlyPoint[];
  topEvents: TopEventRow[];
  upcomingEventsList: UpcomingEventRow[];
};

// -- Cheques dashboard -------------------------------------------------------

export type NamedAmountPoint = { label: string; count: number; amount: number };
export type MaturityWeekPoint = { weekStart: string; count: number; amount: number };
export type RecentBounceRow = {
  chequeId: string; chequeNumber: string; memberName: string; drawnOnBank: string;
  amount: number; bouncedOn: string; reason: string | null;
};
export type TopPledgerRow = {
  memberId: string | null; memberName: string; chequeCount: number; totalAmount: number;
};
export type ChequesDashboardDto = {
  currency: string;
  totalCheques: number;
  pledgedCount: number; depositedCount: number; clearedCount: number; bouncedCount: number; cancelledCount: number;
  pledgedAmount: number; depositedAmount: number; clearedAmount: number; bouncedAmount: number;
  overdueDepositCount: number; overdueDepositAmount: number;
  upcomingMaturityCount: number; upcomingMaturityAmount: number;
  statusMix: NamedAmountPoint[];
  byBank: NamedAmountPoint[];
  maturityTimeline: MaturityWeekPoint[];
  recentBounces: RecentBounceRow[];
  topPledgers: TopPledgerRow[];
};

// -- Families dashboard ------------------------------------------------------

export type TopFamilyRow = {
  familyId: string; code: string; familyName: string; memberCount: number; totalAmount: number;
};
export type FamiliesDashboardDto = {
  currency: string;
  totalFamilies: number; activeFamilies: number; inactiveFamilies: number;
  totalLinkedMembers: number; averageFamilySize: number;
  familiesWithHead: number; familiesWithoutHead: number;
  familiesWithContributionsYtd: number;
  totalContributionsYtd: number;
  sizeBuckets: NamedCountPoint[];
  newFamiliesTrend: MemberMonthlyPoint[];
  topFamiliesByContribution: TopFamilyRow[];
  largestFamilies: TopFamilyRow[];
};

// -- Fund Enrollments dashboard ---------------------------------------------

export type TopFundEnrollmentRow = {
  fundTypeId: string; fundCode: string; fundName: string;
  activeEnrollments: number; totalEnrollments: number;
};
export type FundEnrollmentsDashboardDto = {
  totalEnrollments: number;
  activeCount: number; draftCount: number; pausedCount: number; cancelledCount: number; expiredCount: number;
  newThisMonth: number; newThisYear: number;
  recurringActive: number; oneTimeActive: number;
  statusMix: NamedCountPoint[];
  recurrenceMix: NamedCountPoint[];
  byFundType: NamedCountPoint[];
  enrollmentTrend: MemberMonthlyPoint[];
  topFundsByActiveCount: TopFundEnrollmentRow[];
};

// -- Per-event detail --------------------------------------------------------

export type HourlyCountPoint = { hour: number; count: number };
export type EventDetailDashboardDto = {
  eventId: string; slug: string; name: string; eventDate: string; category: string;
  place: string | null; capacity: number | null; isActive: boolean; registrationsEnabled: boolean;
  totalRegistrations: number;
  confirmed: number; checkedIn: number; cancelled: number; waitlisted: number; noShow: number; pending: number;
  totalSeats: number; fillPercent: number;
  totalGuests: number; checkedInGuests: number;
  daysUntilEvent: number;
  statusMix: NamedCountPoint[];
  ageBandMix: NamedCountPoint[];
  relationshipMix: NamedCountPoint[];
  registrationCurve: DailyCountPoint[];
  checkInArrivalPattern: HourlyCountPoint[];
};

// -- Per-fund-type detail ---------------------------------------------------

export type MonthlyAmountPoint = { year: number; month: number; amount: number; count: number };
export type FundTypeDetailDashboardDto = {
  fundTypeId: string; code: string; name: string; isReturnable: boolean; isActive: boolean;
  currency: string;
  totalReceived: number; receivedThisMonth: number; receivedThisYear: number;
  receiptCount: number; receiptCountThisMonth: number; averageReceipt: number;
  activeEnrollments: number; totalEnrollments: number; uniqueContributors: number;
  returnableOutstanding: number; returnableMatured: number;
  monthlyInflowTrend: MonthlyAmountPoint[];
  topContributors: { memberId: string; itsNumber: string; fullName: string; amount: number; receiptCount: number; currency: string }[];
  enrollmentRecurrenceMix: NamedCountPoint[];
  enrollmentStatusMix: NamedCountPoint[];
};

// -- Cashflow dashboard ------------------------------------------------------

export type DailyCashflowPoint = { date: string; inflow: number; outflow: number; net: number };
export type CashflowDashboardDto = {
  currency: string; windowDays: number;
  totalInflow: number; totalOutflow: number; netCashflow: number;
  pendingOutflow: number; pendingClearanceOutflow: number;
  inflowThisMonth: number; outflowThisMonth: number;
  inflowMtdPriorMonth: number; outflowMtdPriorMonth: number;
  inflowReceiptCount: number; outflowVoucherCount: number;
  dailyCurve: DailyCashflowPoint[];
  inflowByFund: NamedAmountPoint[];
  outflowByPurpose: NamedAmountPoint[];
  inflowByPaymentMode: NamedAmountPoint[];
  outflowByPaymentMode: NamedAmountPoint[];
};

// -- QH funnel ---------------------------------------------------------------

export type MonthlyRequestVsDisbursementPoint = {
  year: number; month: number; requests: number; disbursements: number; requested: number; disbursed: number;
};
export type QhFunnelDashboardDto = {
  currency: string;
  totalRequests: number;
  pending: number; approved: number; disbursed: number; active: number; completed: number;
  defaulted: number; rejected: number; cancelled: number;
  totalRequestedAmount: number; totalApprovedAmount: number; totalDisbursedAmount: number; totalRepaidAmount: number;
  approvalRatePercent: number; disbursementRatePercent: number;
  contributionsToLoanPool: number; availablePool: number;
  averageDaysToApprove: number; averageDaysToDisburse: number;
  monthlyTrend: MonthlyRequestVsDisbursementPoint[];
  statusFunnel: NamedAmountPoint[];
  topBorrowers: QhBorrowerRow[];
};

// -- Commitment types --------------------------------------------------------

export type CommitmentTemplateRow = {
  templateId: string | null; templateName: string;
  count: number; activeCount: number;
  committed: number; paid: number; progressPercent: number; defaultedCount: number;
};
export type CommitmentByFundRow = {
  fundTypeId: string; fundCode: string; fundName: string;
  count: number; committed: number; paid: number;
};
export type CommitmentTypesDashboardDto = {
  currency: string;
  totalCommitments: number;
  activeCount: number; completedCount: number; defaultedCount: number; cancelledCount: number;
  totalCommitted: number; totalPaid: number; totalRemaining: number;
  overallProgressPercent: number;
  byTemplate: CommitmentTemplateRow[];
  byFund: CommitmentByFundRow[];
  statusMix: NamedCountPoint[];
  creationTrend: MemberMonthlyPoint[];
};

// -- Vouchers ---------------------------------------------------------------

export type DailyAmountPoint = { date: string; count: number; amount: number };
export type VouchersDashboardDto = {
  currency: string;
  totalVouchers: number;
  draftCount: number; pendingApprovalCount: number; approvedCount: number; paidCount: number;
  cancelledCount: number; reversedCount: number; pendingClearanceCount: number;
  totalPaidAmount: number; pendingApprovalAmount: number; approvedNotPaidAmount: number;
  averageVoucherAmount: number; maxVoucherAmount: number;
  windowFrom: string | null; windowTo: string | null;
  statusMix: NamedAmountPoint[];
  byPaymentMode: NamedAmountPoint[];
  byPurpose: NamedAmountPoint[];
  byExpenseType: NamedAmountPoint[];
  topPayees: NamedAmountPoint[];
  dailyOutflow: DailyAmountPoint[];
  monthlyVoucherCount: MemberMonthlyPoint[];
};

// -- Receipts ---------------------------------------------------------------

export type ReceiptsDashboardDto = {
  currency: string;
  totalReceipts: number;
  confirmed: number; draft: number; cancelled: number; reversed: number; pendingClearance: number;
  totalAmount: number; permanentAmount: number; returnableAmount: number;
  averageReceipt: number; largestReceipt: number;
  uniqueContributors: number;
  windowFrom: string | null; windowTo: string | null;
  scopedFundTypeId: string | null; scopedFundName: string | null;
  byPaymentMode: NamedAmountPoint[];
  byFund: NamedAmountPoint[];
  intentionSplit: NamedAmountPoint[];
  dailyInflow: DailyAmountPoint[];
  monthlyReceiptCount: MemberMonthlyPoint[];
  topContributors: { memberId: string; itsNumber: string; fullName: string; amount: number; receiptCount: number; currency: string }[];
};

// -- Member assets ----------------------------------------------------------

export type TopAssetMemberRow = { memberId: string; itsNumber: string; fullName: string; assetCount: number; totalValue: number };
export type MemberAssetsDashboardDto = {
  currency: string;
  totalAssets: number; membersWithAssets: number;
  totalEstimatedValue: number; averageAssetValue: number; largestAssetValue: number;
  scopedSectorId: string | null; scopedSectorName: string | null;
  byKind: NamedAmountPoint[];
  topMembersByValue: TopAssetMemberRow[];
  creationTrend: MemberMonthlyPoint[];
  assetsBySector: NamedCountPoint[];
};

// -- Sectors ----------------------------------------------------------------

export type SectorRow = {
  sectorId: string; code: string; name: string; isActive: boolean;
  memberCount: number; activeMembers: number; verifiedMembers: number;
  familyCount: number; commitmentCount: number;
  contributionsYtd: number; assetValue: number;
};
export type SectorsDashboardDto = {
  currency: string;
  totalSectors: number; activeSectors: number;
  totalMembers: number; membersWithoutSector: number;
  totalContributionsYtd: number;
  sectors: SectorRow[];
};

// -- Returnable receipts ----------------------------------------------------

export type TopReturnableHolderRow = {
  memberId: string; memberName: string; itsNumber: string;
  receiptCount: number; totalIssued: number; outstanding: number;
};
export type ReturnablesDashboardDto = {
  currency: string;
  totalReturnable: number; totalIssued: number; totalReturned: number; outstanding: number;
  overdueCount: number; overdueAmount: number;
  maturedNotReturnedCount: number; maturedNotReturnedAmount: number;
  scopedFundTypeId: string | null; scopedFundName: string | null;
  ageBuckets: NamedAmountPoint[];
  byFund: NamedAmountPoint[];
  maturityStateMix: NamedAmountPoint[];
  topHolders: TopReturnableHolderRow[];
  upcomingMaturityTimeline: MaturityWeekPoint[];
};

// -- Per-member drill-in -----------------------------------------------------

export type MemberCommitmentRow = {
  commitmentId: string; fundName: string;
  totalAmount: number; paidAmount: number; status: number;
  installmentsTotal: number; installmentsPaid: number; overdueInstallments: number;
};
export type MemberLoanRow = {
  loanId: string; loanCode: string; status: number;
  amountDisbursed: number; amountRepaid: number; amountOutstanding: number;
  disbursedOn: string | null;
};
export type MemberRecentReceiptRow = {
  receiptId: string; receiptNumber: string | null; receiptDate: string;
  amount: number; status: number; paymentMode: number;
};
export type MemberDetailDashboardDto = {
  memberId: string; itsNumber: string; fullName: string;
  status: number; phone: string | null; email: string | null; dateOfBirth: string | null;
  verificationStatus: number; misaqStatus: number; hajjStatus: number;
  familyId: string | null; familyName: string | null; familyCode: string | null; familyRole: number;
  sectorId: string | null; sectorName: string | null;
  currency: string;
  lifetimeContribution: number; ytdContribution: number; monthContribution: number;
  lifetimeReceiptCount: number; ytdReceiptCount: number;
  commitmentCount: number; committedTotal: number; committedPaid: number; commitmentDefaultedCount: number;
  loanCount: number; loansDisbursed: number; loansRepaid: number; loansOutstanding: number;
  assetCount: number; assetValue: number;
  eventRegistrationCount: number; eventCheckedInCount: number;
  monthlyContributionTrend: MonthlyAmountPoint[];
  contributionByFund: NamedAmountPoint[];
  commitments: MemberCommitmentRow[];
  loans: MemberLoanRow[];
  recentReceipts: MemberRecentReceiptRow[];
};

// -- Per-commitment drill-in -------------------------------------------------

export type CommitmentInstallmentRow = {
  installmentId: string; installmentNo: number; dueDate: string;
  scheduledAmount: number; paidAmount: number; remainingAmount: number;
  status: number; daysOverdue: number;
};
export type CommitmentPaymentRow = {
  receiptId: string; receiptNumber: string | null; receiptDate: string;
  installmentNo: number; amount: number;
};
export type CommitmentDetailDashboardDto = {
  commitmentId: string; currency: string;
  memberId: string | null; memberName: string | null; memberItsNumber: string | null;
  fundTypeId: string; fundCode: string; fundName: string;
  templateId: string | null; templateName: string | null;
  status: number; totalAmount: number; paidAmount: number; remainingAmount: number;
  progressPercent: number;
  installmentsTotal: number; installmentsPaid: number; installmentsPending: number; installmentsOverdue: number;
  nextDueDate: string | null; nextDueAmount: number | null;
  createdDate: string;
  schedule: CommitmentInstallmentRow[];
  payments: CommitmentPaymentRow[];
};

// -- Notifications dashboard -------------------------------------------------

export type NotificationFailureRow = {
  id: number; attemptedAtUtc: string;
  channel: number; kind: number; failureReason: string | null; subject: string;
};
export type NotificationsDashboardDto = {
  total: number; sentCount: number; failedCount: number; skippedCount: number;
  deliveryRatePercent: number;
  windowFrom: string | null; windowTo: string | null;
  byChannel: NamedCountPoint[];
  byStatus: NamedCountPoint[];
  byKind: NamedCountPoint[];
  topFailureReasons: NamedCountPoint[];
  dailyVolume: DailyCountPoint[];
  recentFailures: NotificationFailureRow[];
};

// -- User activity dashboard -------------------------------------------------

export type UserActivityRecentRow = {
  atUtc: string;
  userId: string | null; userName: string;
  entityName: string; action: string; entityId: string | null;
};
export type UserActivityDashboardDto = {
  totalEvents: number; uniqueUsers: number; uniqueEntities: number;
  windowFrom: string | null; windowTo: string | null;
  topUsers: NamedCountPoint[];
  topEntities: NamedCountPoint[];
  actionMix: NamedCountPoint[];
  dailyVolume: DailyCountPoint[];
  hourOfDayHeatmap: HourlyCountPoint[];
  recentEvents: UserActivityRecentRow[];
};

// -- Change requests dashboard ----------------------------------------------

export type ChangeRequestRow = {
  id: string; memberId: string; memberName: string; itsNumber: string;
  section: string;
  requestedByUserId: string | null; requestedByUserName: string;
  requestedAtUtc: string; ageDays: number;
};
export type ChangeRequestsDashboardDto = {
  total: number; pending: number; approved: number; rejected: number;
  oldestPendingDays: number;
  windowFrom: string | null; windowTo: string | null;
  bySection: NamedCountPoint[];
  byStatus: NamedCountPoint[];
  byRequester: NamedCountPoint[];
  dailyVolume: DailyCountPoint[];
  oldestPending: ChangeRequestRow[];
};

// -- Expense types dashboard ------------------------------------------------

export type ExpenseTypeRow = {
  expenseTypeId: string; code: string; name: string; isActive: boolean;
  voucherCount: number; totalAmount: number; averageAmount: number;
  lastUsed: string | null;
};
export type ExpenseTypesDashboardDto = {
  currency: string;
  totalExpenseTypes: number; activeExpenseTypes: number; usedExpenseTypes: number;
  totalSpend: number;
  windowFrom: string | null; windowTo: string | null;
  rows: ExpenseTypeRow[];
  monthlyTrend: MonthlyAmountPoint[];
};

// -- Periods management dashboard -------------------------------------------

export type PeriodRow = {
  id: string; name: string; startDate: string; endDate: string;
  status: number; ageDays: number;
  closedAtUtc: string | null; closedByUserName: string | null;
};
export type PeriodsDashboardDto = {
  totalPeriods: number; openPeriods: number; closedPeriods: number;
  currentPeriodId: string | null; currentPeriodName: string | null;
  currentPeriodOpenDays: number | null;
  draftReceiptsInOpenPeriod: number; pendingVoucherApprovalsInOpenPeriod: number;
  readyToClose: boolean;
  periods: PeriodRow[];
};

// -- Annual summary report --------------------------------------------------

export type MonthlyIncomeExpensePoint = { month: number; income: number; expense: number; net: number };
export type AnnualByFundRow = {
  fundTypeId: string; fundCode: string; fundName: string;
  income: number; receiptCount: number;
};
export type AnnualSummaryDto = {
  year: number; currency: string;
  totalIncome: number; totalExpense: number; net: number;
  monthly: MonthlyIncomeExpensePoint[];
  byFund: AnnualByFundRow[];
  byVoucherPurpose: NamedAmountPoint[];
};

// -- Account reconciliation dashboard ---------------------------------------

export type BankAccountReconciliationRow = {
  id: string; name: string; bankName: string; accountNumberMasked: string; currency: string;
  isActive: boolean;
  accountingAccountId: string | null; accountingAccountCode: string | null; accountingAccountName: string | null;
  ledgerBalance: number;
  inTransitChequeCount: number; inTransitChequeAmount: number;
  pendingVoucherCount: number; pendingVoucherAmount: number;
  lastEntryDate: string | null; daysSinceLastEntry: number | null;
  readinessLabel: string;
};
export type CoaAccountReconciliationRow = {
  accountId: string; code: string; name: string; accountType: number;
  balance: number; entryCount: number;
  lastEntryDate: string | null; daysSinceLastEntry: number | null;
  isStale: boolean;
};
export type ReconciliationDashboardDto = {
  currency: string;
  bankAccountCount: number; activeBankAccountCount: number;
  totalBankBalance: number;
  inTransitAmount: number; inTransitChequeCount: number;
  pendingVoucherAmount: number; pendingVoucherCount: number;
  coaAccountsCount: number; staleAccountsCount: number;
  bankAccounts: BankAccountReconciliationRow[];
  coaAccounts: CoaAccountReconciliationRow[];
};
