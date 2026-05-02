using Jamaat.Application.Common;
using Jamaat.Contracts.Ledger;
using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Application.Accounting;

public interface ILedgerService
{
    Task<PagedResult<LedgerEntryDto>> ListAsync(LedgerEntryQuery q, CancellationToken ct = default);
    Task<IReadOnlyList<AccountBalanceDto>> BalancesAsync(DateOnly? asOf, CancellationToken ct = default);
}

public interface IPeriodService
{
    Task<IReadOnlyList<FinancialPeriodDto>> ListAsync(CancellationToken ct = default);
    Task<Result<FinancialPeriodDto>> CreateAsync(CreateFinancialPeriodDto dto, CancellationToken ct = default);
    Task<Result> CloseAsync(Guid id, CancellationToken ct = default);
    Task<Result> ReopenAsync(Guid id, CancellationToken ct = default);
}

public interface IReportsService
{
    Task<IReadOnlyList<ReportDailyCollectionDto>> DailyCollectionAsync(DateOnly from, DateOnly to, CancellationToken ct = default);
    Task<IReadOnlyList<ReportFundWiseDto>> FundWiseAsync(DateOnly from, DateOnly to, CancellationToken ct = default);
    /// <summary>FundWise overload with event/category filters - lets the report scope to a single
    /// function/event (Section 8 of the fund-management spec) or a category bucket.</summary>
    Task<IReadOnlyList<ReportFundWiseDto>> FundWiseAsync(ReportFundWiseQuery q, CancellationToken ct = default);
    Task<IReadOnlyList<ReportDailyPaymentDto>> DailyPaymentsAsync(DateOnly from, DateOnly to, CancellationToken ct = default);
    Task<IReadOnlyList<ReportCashBookRow>> CashBookAsync(Guid accountId, DateOnly from, DateOnly to, CancellationToken ct = default);
    Task<IReadOnlyList<ReportMemberContributionRow>> MemberContributionAsync(Guid memberId, DateOnly from, DateOnly to, CancellationToken ct = default);
    Task<IReadOnlyList<ReportChequeWiseRow>> ChequeWiseAsync(DateOnly from, DateOnly to, CancellationToken ct = default);
    /// <summary>Dual-balance view of a single fund: total cash received (permanent + returnable)
    /// vs net fund strength (after subtracting outstanding return obligations).</summary>
    Task<ReportFundBalanceDto> FundBalanceAsync(Guid fundTypeId, CancellationToken ct = default);
    /// <summary>List every returnable receipt with maturity status + remaining balance.</summary>
    Task<IReadOnlyList<ReportReturnableContributionRow>> ReturnableContributionsAsync(Guid? fundTypeId, CancellationToken ct = default);
    /// <summary>QH loans with non-zero outstanding balance + age + overdue-instalment count.</summary>
    Task<IReadOnlyList<ReportOutstandingLoanRow>> OutstandingLoansAsync(ReportOutstandingLoansQuery q, CancellationToken ct = default);
    /// <summary>Active commitments still owing money (open instalments), with overdue + next-due summary.</summary>
    Task<IReadOnlyList<ReportPendingCommitmentRow>> PendingCommitmentsAsync(ReportPendingCommitmentsQuery q, CancellationToken ct = default);
    /// <summary>Returnable receipts past maturity that still have outstanding balance.</summary>
    Task<IReadOnlyList<ReportOverdueReturnRow>> OverdueReturnsAsync(ReportOverdueReturnsQuery q, CancellationToken ct = default);
}

public interface IDashboardService
{
    Task<DashboardStatsDto> StatsAsync(CancellationToken ct = default);
    Task<IReadOnlyList<DashboardActivityDto>> RecentActivityAsync(int take, CancellationToken ct = default);
    Task<IReadOnlyList<DashboardFundSliceDto>> FundSliceAsync(DateOnly from, DateOnly to, CancellationToken ct = default);
    /// <summary>Pre-aggregated BI for the dashboard home: collection trend (last 30 days),
    /// pending obligations strip, cheque pipeline by status. One call for the whole panel
    /// so the page doesn't fan out into 4-5 round-trips on every load.</summary>
    Task<DashboardInsightsDto> InsightsAsync(CancellationToken ct = default);

    /// <summary>Monthly income (receipts) vs expense (vouchers) for the last N months.
    /// Drives the Accounting page's headline trend chart.</summary>
    Task<IReadOnlyList<IncomeExpensePoint>> IncomeExpenseTrendAsync(int months, CancellationToken ct = default);

    /// <summary>Top contributors by total receipt amount in the last N days.</summary>
    Task<IReadOnlyList<TopContributorPoint>> TopContributorsAsync(int days, int take, CancellationToken ct = default);

    /// <summary>Voucher outflow grouped by Voucher.Purpose text. Top N + Other bucket.</summary>
    Task<IReadOnlyList<OutflowByCategoryPoint>> OutflowByCategoryAsync(int days, int take, CancellationToken ct = default);

    /// <summary>Cheques maturing in the next N days (Pledged or Deposited only).</summary>
    Task<IReadOnlyList<UpcomingChequePoint>> UpcomingChequesAsync(int days, CancellationToken ct = default);

    /// <summary>QH loan portfolio - status distribution + outstanding + repayment trend +
    /// top borrowers + upcoming installments. Backs the /dashboards/qh-portfolio page.</summary>
    Task<QhPortfolioDto> QhPortfolioAsync(CancellationToken ct = default);

    /// <summary>Aging breakdown for outstanding commitments + returnable receipts. Backs
    /// the /dashboards/receivables page.</summary>
    Task<ReceivablesAgingDto> ReceivablesAgingAsync(CancellationToken ct = default);

    /// <summary>New-member trend (last N months) + status breakdown + verification breakdown.
    /// Backs the /dashboards/member-engagement page.</summary>
    Task<MemberEngagementDto> MemberEngagementAsync(int months, CancellationToken ct = default);

    /// <summary>Audit volume + error counts + queues. Backs the /dashboards/compliance page.
    /// `days` controls the audit/error trend window.</summary>
    Task<ComplianceDashboardDto> ComplianceAsync(int days = 30, CancellationToken ct = default);

    /// <summary>Events portfolio - upcoming events, registration mix, fill rates,
    /// monthly registration trend. Backs /dashboards/events.</summary>
    Task<EventsDashboardDto> EventsAsync(int months = 12, CancellationToken ct = default);

    /// <summary>Post-dated cheque portfolio - status mix, bank distribution, maturity timeline,
    /// recent bounces. Backs /dashboards/cheques.</summary>
    Task<ChequesDashboardDto> ChequesAsync(CancellationToken ct = default);

    /// <summary>Families analytics - size distribution, top contributors, growth trend.
    /// Backs /dashboards/families.</summary>
    Task<FamiliesDashboardDto> FamiliesAsync(int months = 12, CancellationToken ct = default);

    /// <summary>Fund enrollments overview - status, recurrence, fund-type mix, monthly trend.
    /// Backs /dashboards/fund-enrollments.</summary>
    Task<FundEnrollmentsDashboardDto> FundEnrollmentsAsync(int months = 12, CancellationToken ct = default);

    /// <summary>Drill into a single event - status mix, age-band breakdown, daily registration
    /// curve, check-in funnel. Returns null when the event doesn't exist or isn't visible.</summary>
    Task<EventDetailDashboardDto?> EventDetailAsync(Guid eventId, CancellationToken ct = default);

    /// <summary>Drill into a single fund type - monthly inflow trend, top contributors, enrollment
    /// mix, returnable maturity. Returns null when the fund type doesn't exist.</summary>
    Task<FundTypeDetailDashboardDto?> FundTypeDetailAsync(Guid fundTypeId, int months = 12, CancellationToken ct = default);

    /// <summary>System-wide cashflow - inflows (Receipts) vs outflows (Vouchers) over the last
    /// N days, plus daily curve, voucher-category mix, top inflow funds.</summary>
    Task<CashflowDashboardDto> CashflowAsync(int days = 90, CancellationToken ct = default);

    /// <summary>Qarzan Hasana funnel - loan requests, approvals, disbursements, repayments. Includes
    /// monthly request-vs-disbursement bars, status funnel, default rate, average-time-to-disburse.</summary>
    Task<QhFunnelDashboardDto> QhFunnelAsync(int months = 12, CancellationToken ct = default);

    /// <summary>Commitment templates analysis - per-template counts, committed amount, paid,
    /// completion %, default rate. Backs /dashboards/commitment-types.</summary>
    Task<CommitmentTypesDashboardDto> CommitmentTypesAsync(CancellationToken ct = default);

    /// <summary>Vouchers dashboard - status mix, payment-mode mix, by-purpose, by-payee,
    /// approval SLA, monthly outflow trend. Optional date-range filter via `from`/`to`.</summary>
    Task<VouchersDashboardDto> VouchersAsync(DateOnly? from, DateOnly? to, CancellationToken ct = default);

    /// <summary>Receipts dashboard - inflow analysis: mode mix, intention split, top contributors,
    /// average size, daily curve, by-fund mix. Optional fund filter to scope to a single fund.</summary>
    Task<ReceiptsDashboardDto> ReceiptsAsync(DateOnly? from, DateOnly? to, Guid? fundTypeId, CancellationToken ct = default);

    /// <summary>Member assets portfolio - total value, by-kind breakdown, top members by holdings,
    /// asset count trend. Optional sector filter to scope to one sector.</summary>
    Task<MemberAssetsDashboardDto> MemberAssetsAsync(Guid? sectorId, CancellationToken ct = default);

    /// <summary>Sectors dashboard - per-sector member counts, contribution totals, attendance rate.
    /// Single overview view; no per-sector filter (would defeat the purpose).</summary>
    Task<SectorsDashboardDto> SectorsAsync(CancellationToken ct = default);

    /// <summary>Returnable receipts portfolio - maturity timeline, age buckets, return progress,
    /// top holders, by-fund split. Optional fund filter.</summary>
    Task<ReturnablesDashboardDto> ReturnablesAsync(Guid? fundTypeId, CancellationToken ct = default);

    /// <summary>Per-member drill-in. 360 view: profile + financial summary + commitments + QH loans
    /// + family + recent activity. Returns null when the member doesn't exist.</summary>
    Task<MemberDetailDashboardDto?> MemberDetailAsync(Guid memberId, CancellationToken ct = default);

    /// <summary>Per-commitment drill-in. Schedule, payment progress, default risk. Returns null
    /// when the commitment id is unknown.</summary>
    Task<CommitmentDetailDashboardDto?> CommitmentDetailAsync(Guid commitmentId, CancellationToken ct = default);

    /// <summary>Notifications engagement - sent vs failed vs skipped, channel mix, kind mix,
    /// daily volume, top failure reasons.</summary>
    Task<NotificationsDashboardDto> NotificationsAsync(DateOnly? from, DateOnly? to, CancellationToken ct = default);

    /// <summary>Admin user activity - top users by audit-event count, action mix, hour-of-day
    /// heatmap, top entities touched.</summary>
    Task<UserActivityDashboardDto> UserActivityAsync(DateOnly? from, DateOnly? to, CancellationToken ct = default);

    /// <summary>Member change-request queue - pending vs reviewed, by section, by requester,
    /// oldest open requests, monthly trend.</summary>
    Task<ChangeRequestsDashboardDto> ChangeRequestsAsync(DateOnly? from, DateOnly? to, CancellationToken ct = default);

    /// <summary>Expense-type analytics - voucher outflow grouped by ExpenseType, top types,
    /// trend over last 12 months. Backs /dashboards/expense-types.</summary>
    Task<ExpenseTypesDashboardDto> ExpenseTypesAsync(DateOnly? from, DateOnly? to, CancellationToken ct = default);

    /// <summary>Periods management overview - all financial periods + open/closed status + age,
    /// readiness signals (no draft receipts in window, no pending vouchers, etc.).</summary>
    Task<PeriodsDashboardDto> PeriodsAsync(CancellationToken ct = default);

    /// <summary>Annual summary report - per-month receipts vs vouchers per fund for the year.
    /// Drives the Annual Summary export.</summary>
    Task<AnnualSummaryDto> AnnualSummaryAsync(int year, CancellationToken ct = default);

    /// <summary>Account reconciliation overview - bank accounts with cash balances + in-transit
    /// cheques + pending vouchers, plus the COA balance grid annotated with last-activity dates
    /// and stale flags. The treasurer drives the month-end close from this view.</summary>
    Task<ReconciliationDashboardDto> ReconciliationAsync(CancellationToken ct = default);
}

public sealed record QhPortfolioDto(
    string Currency,
    int TotalLoans, int ActiveCount, int CompletedCount, int DefaultedCount, int InApprovalCount,
    decimal TotalDisbursed, decimal TotalRepaid, decimal TotalOutstanding,
    decimal DefaultRatePercent,
    IReadOnlyList<QhStatusBucket> ByStatus,
    IReadOnlyList<QhMonthlyPoint> RepaymentTrend,
    IReadOnlyList<QhBorrowerRow> TopBorrowers,
    IReadOnlyList<QhUpcomingInstallment> UpcomingInstallments,
    decimal AverageLoanSize, int AverageInstallments,
    decimal GoldBackedTotal, int GoldBackedCount,
    IReadOnlyList<QhStatusBucket> BySchemeMix,
    int OverdueInstallmentsTotal, decimal OverduePrincipal);

public sealed record QhStatusBucket(int Status, string Label, int Count, decimal Outstanding);
public sealed record QhMonthlyPoint(int Year, int Month, decimal Disbursed, decimal Repaid);
public sealed record QhBorrowerRow(Guid MemberId, string ItsNumber, string FullName, decimal Outstanding, int LoanCount);
public sealed record QhUpcomingInstallment(Guid LoanId, string LoanCode, Guid MemberId, string MemberName,
    int InstallmentNo, DateOnly DueDate, decimal RemainingAmount);

public sealed record ReceivablesAgingDto(
    string Currency,
    decimal CommitmentsOutstanding, int CommitmentsOverdueCount,
    decimal ReturnablesOutstanding, int ReturnablesOverdueCount,
    decimal ChequesPledgedAmount, int ChequesPledgedCount,
    IReadOnlyList<AgingBucket> CommitmentBuckets,
    IReadOnlyList<AgingBucket> ReturnableBuckets,
    IReadOnlyList<OldestObligationRow> OldestObligations,
    IReadOnlyList<ChequePipelinePoint> ChequePipeline,
    IReadOnlyList<UpcomingMaturityRow> UpcomingMaturities,
    IReadOnlyList<NamedCountPoint> CommitmentsByFund);

public sealed record AgingBucket(string Label, int Count, decimal Amount);
public sealed record OldestObligationRow(string Kind, string Reference, string MemberName, DateOnly DueDate, int DaysOverdue, decimal Amount);
public sealed record UpcomingMaturityRow(Guid ReceiptId, string ReceiptNumber, string MemberName, DateOnly MaturityDate, decimal Outstanding);

public sealed record MemberEngagementDto(
    int TotalMembers, int ActiveMembers, int InactiveMembers, int DeceasedMembers, int SuspendedMembers,
    int VerifiedMembers, int VerificationPendingMembers, int VerificationNotStartedMembers, int VerificationRejectedMembers,
    int NewThisMonth, int NewThisYear,
    IReadOnlyList<MemberMonthlyPoint> NewMemberTrend,
    IReadOnlyList<NamedCountPoint> GenderSplit,
    IReadOnlyList<NamedCountPoint> MaritalSplit,
    IReadOnlyList<NamedCountPoint> AgeBrackets,
    IReadOnlyList<NamedCountPoint> HajjSplit,
    IReadOnlyList<NamedCountPoint> MisaqSplit,
    IReadOnlyList<NamedCountPoint> SectorSplit,
    IReadOnlyList<NamedCountPoint> FamilyRoleSplit);

public sealed record MemberMonthlyPoint(int Year, int Month, int Count);

public sealed record ComplianceDashboardDto(
    int AuditEventsTotal,
    int OpenErrors,
    int PendingChangeRequests,
    int PendingVoucherApprovals,
    int DraftReceipts,
    int UnverifiedMembers,
    bool HasOpenPeriod,
    string? OpenPeriodName,
    int? PeriodOpenDays,
    IReadOnlyList<DailyCountPoint> AuditTrend,
    IReadOnlyList<NamedCountPoint> ErrorsBySeverity,
    IReadOnlyList<NamedCountPoint> ChangeRequestsByStatus,
    IReadOnlyList<NamedCountPoint> TopUsersByAudit,
    IReadOnlyList<NamedCountPoint> TopEntitiesByAudit,
    IReadOnlyList<DailyCountPoint> ErrorTrend,
    IReadOnlyList<NamedCountPoint> ErrorsBySource,
    int WindowDays);

public sealed record DailyCountPoint(DateOnly Date, int Count);
public sealed record NamedCountPoint(string Label, int Count);

public sealed record IncomeExpensePoint(int Year, int Month, decimal Income, decimal Expense, string Currency);
public sealed record TopContributorPoint(Guid MemberId, string ItsNumber, string FullName, decimal Amount, int ReceiptCount, string Currency);
public sealed record OutflowByCategoryPoint(string Category, decimal Amount, int VoucherCount, string Currency);
public sealed record UpcomingChequePoint(Guid Id, string ChequeNumber, DateOnly ChequeDate, decimal Amount, string MemberName, int Status, string Currency);

public sealed record DashboardInsightsDto(
    IReadOnlyList<DailyCollectionPoint> CollectionTrend,
    decimal OutstandingLoanBalance,
    decimal OutstandingReturnableBalance,
    decimal PendingCommitmentBalance,
    int OverdueReturnsCount,
    IReadOnlyList<ChequePipelinePoint> ChequePipeline,
    string Currency);

public sealed record DailyCollectionPoint(DateOnly Date, decimal Amount, int Count);

public sealed record ChequePipelinePoint(int Status, string StatusLabel, int Count, decimal Amount);

public sealed record DashboardStatsDto(
    decimal TodayCollection, int ReceiptsToday, int ActiveMembers, decimal MtdCollection,
    decimal? YesterdayCollection, int? ReceiptsYesterday, int PendingApprovals, int SyncErrors, string Currency,
    // Number of Draft receipts waiting for an approver. Distinct from PendingApprovals which
    // counts vouchers - shown side-by-side on the dashboard so an approver sees both queues.
    int PendingReceipts = 0);

public sealed record DashboardActivityDto(
    string Kind, string Reference, string Title, decimal? Amount, string Currency,
    string Status, DateTimeOffset AtUtc);

public sealed record DashboardFundSliceDto(Guid FundTypeId, string Name, string Code, decimal Amount);

// -- Events dashboard --------------------------------------------------------

public sealed record EventsDashboardDto(
    int TotalEvents, int ActiveEvents, int UpcomingEvents, int PastEvents,
    int TotalRegistrations, int ConfirmedRegistrations, int CheckedInRegistrations, int CancelledRegistrations,
    int RegistrationsThisMonth,
    int AverageFillPercent,
    IReadOnlyList<NamedCountPoint> RegistrationsByStatus,
    IReadOnlyList<NamedCountPoint> EventsByCategory,
    IReadOnlyList<MemberMonthlyPoint> RegistrationTrend,
    IReadOnlyList<TopEventRow> TopEvents,
    IReadOnlyList<UpcomingEventRow> UpcomingEventsList);

public sealed record TopEventRow(Guid EventId, string Slug, string Name, DateOnly EventDate,
    int RegistrationCount, int CheckedInCount, int? Capacity, int FillPercent);
public sealed record UpcomingEventRow(Guid EventId, string Slug, string Name, DateOnly EventDate,
    string Category, int RegistrationCount, int? Capacity);

// -- Cheques dashboard -------------------------------------------------------

public sealed record ChequesDashboardDto(
    string Currency,
    int TotalCheques, int PledgedCount, int DepositedCount, int ClearedCount, int BouncedCount, int CancelledCount,
    decimal PledgedAmount, decimal DepositedAmount, decimal ClearedAmount, decimal BouncedAmount,
    int OverdueDepositCount, decimal OverdueDepositAmount,
    int UpcomingMaturityCount, decimal UpcomingMaturityAmount,
    IReadOnlyList<NamedAmountPoint> StatusMix,
    IReadOnlyList<NamedAmountPoint> ByBank,
    IReadOnlyList<MaturityWeekPoint> MaturityTimeline,
    IReadOnlyList<RecentBounceRow> RecentBounces,
    IReadOnlyList<TopPledgerRow> TopPledgers);

public sealed record NamedAmountPoint(string Label, int Count, decimal Amount);
public sealed record MaturityWeekPoint(DateOnly WeekStart, int Count, decimal Amount);
public sealed record RecentBounceRow(Guid ChequeId, string ChequeNumber, string MemberName, string DrawnOnBank,
    decimal Amount, DateOnly BouncedOn, string? Reason);
public sealed record TopPledgerRow(Guid? MemberId, string MemberName, int ChequeCount, decimal TotalAmount);

// -- Families dashboard ------------------------------------------------------

public sealed record FamiliesDashboardDto(
    string Currency,
    int TotalFamilies, int ActiveFamilies, int InactiveFamilies,
    int TotalLinkedMembers, decimal AverageFamilySize,
    int FamiliesWithHead, int FamiliesWithoutHead,
    int FamiliesWithContributionsYtd,
    decimal TotalContributionsYtd,
    IReadOnlyList<NamedCountPoint> SizeBuckets,
    IReadOnlyList<MemberMonthlyPoint> NewFamiliesTrend,
    IReadOnlyList<TopFamilyRow> TopFamiliesByContribution,
    IReadOnlyList<TopFamilyRow> LargestFamilies);

public sealed record TopFamilyRow(Guid FamilyId, string Code, string FamilyName, int MemberCount, decimal TotalAmount);

// -- Fund Enrollments dashboard ---------------------------------------------

public sealed record FundEnrollmentsDashboardDto(
    int TotalEnrollments, int ActiveCount, int DraftCount, int PausedCount, int CancelledCount, int ExpiredCount,
    int NewThisMonth, int NewThisYear,
    int RecurringActive, int OneTimeActive,
    IReadOnlyList<NamedCountPoint> StatusMix,
    IReadOnlyList<NamedCountPoint> RecurrenceMix,
    IReadOnlyList<NamedCountPoint> ByFundType,
    IReadOnlyList<MemberMonthlyPoint> EnrollmentTrend,
    IReadOnlyList<TopFundEnrollmentRow> TopFundsByActiveCount);

public sealed record TopFundEnrollmentRow(Guid FundTypeId, string FundCode, string FundName, int ActiveEnrollments, int TotalEnrollments);

// -- Per-event detail --------------------------------------------------------

public sealed record EventDetailDashboardDto(
    Guid EventId, string Slug, string Name, DateOnly EventDate, string Category,
    string? Place, int? Capacity, bool IsActive, bool RegistrationsEnabled,
    int TotalRegistrations, int Confirmed, int CheckedIn, int Cancelled, int Waitlisted, int NoShow, int Pending,
    int TotalSeats, int FillPercent,
    int TotalGuests, int CheckedInGuests,
    int DaysUntilEvent,
    IReadOnlyList<NamedCountPoint> StatusMix,
    IReadOnlyList<NamedCountPoint> AgeBandMix,
    IReadOnlyList<NamedCountPoint> RelationshipMix,
    IReadOnlyList<DailyCountPoint> RegistrationCurve,
    IReadOnlyList<HourlyCountPoint> CheckInArrivalPattern);

public sealed record HourlyCountPoint(int Hour, int Count);

// -- Per-fund-type detail ---------------------------------------------------

public sealed record FundTypeDetailDashboardDto(
    Guid FundTypeId, string Code, string Name, bool IsReturnable, bool IsActive,
    string Currency,
    decimal TotalReceived, decimal ReceivedThisMonth, decimal ReceivedThisYear,
    int ReceiptCount, int ReceiptCountThisMonth, decimal AverageReceipt,
    int ActiveEnrollments, int TotalEnrollments, int UniqueContributors,
    decimal ReturnableOutstanding, decimal ReturnableMatured,
    IReadOnlyList<MonthlyAmountPoint> MonthlyInflowTrend,
    IReadOnlyList<TopContributorPoint> TopContributors,
    IReadOnlyList<NamedCountPoint> EnrollmentRecurrenceMix,
    IReadOnlyList<NamedCountPoint> EnrollmentStatusMix);

public sealed record MonthlyAmountPoint(int Year, int Month, decimal Amount, int Count);

// -- Cashflow dashboard ------------------------------------------------------

public sealed record CashflowDashboardDto(
    string Currency, int WindowDays,
    decimal TotalInflow, decimal TotalOutflow, decimal NetCashflow,
    decimal PendingOutflow, decimal PendingClearanceOutflow,
    decimal InflowThisMonth, decimal OutflowThisMonth,
    decimal InflowMtdPriorMonth, decimal OutflowMtdPriorMonth,
    int InflowReceiptCount, int OutflowVoucherCount,
    IReadOnlyList<DailyCashflowPoint> DailyCurve,
    IReadOnlyList<NamedAmountPoint> InflowByFund,
    IReadOnlyList<NamedAmountPoint> OutflowByPurpose,
    IReadOnlyList<NamedAmountPoint> InflowByPaymentMode,
    IReadOnlyList<NamedAmountPoint> OutflowByPaymentMode);

public sealed record DailyCashflowPoint(DateOnly Date, decimal Inflow, decimal Outflow, decimal Net);

// -- QH funnel dashboard -----------------------------------------------------

public sealed record QhFunnelDashboardDto(
    string Currency,
    int TotalRequests, int Pending, int Approved, int Disbursed, int Active,
    int Completed, int Defaulted, int Rejected, int Cancelled,
    decimal TotalRequestedAmount, decimal TotalApprovedAmount, decimal TotalDisbursedAmount, decimal TotalRepaidAmount,
    int ApprovalRatePercent, int DisbursementRatePercent,
    decimal ContributionsToLoanPool, decimal AvailablePool,
    decimal AverageDaysToApprove, decimal AverageDaysToDisburse,
    IReadOnlyList<MonthlyRequestVsDisbursementPoint> MonthlyTrend,
    IReadOnlyList<NamedAmountPoint> StatusFunnel,
    IReadOnlyList<QhBorrowerRow> TopBorrowers);

public sealed record MonthlyRequestVsDisbursementPoint(int Year, int Month, int Requests, int Disbursements, decimal Requested, decimal Disbursed);

// -- Commitment types dashboard ---------------------------------------------

public sealed record CommitmentTypesDashboardDto(
    string Currency,
    int TotalCommitments, int ActiveCount, int CompletedCount, int DefaultedCount, int CancelledCount,
    decimal TotalCommitted, decimal TotalPaid, decimal TotalRemaining,
    int OverallProgressPercent,
    IReadOnlyList<CommitmentTemplateRow> ByTemplate,
    IReadOnlyList<CommitmentByFundRow> ByFund,
    IReadOnlyList<NamedCountPoint> StatusMix,
    IReadOnlyList<MemberMonthlyPoint> CreationTrend);

public sealed record CommitmentTemplateRow(Guid? TemplateId, string TemplateName, int Count, int ActiveCount,
    decimal Committed, decimal Paid, int ProgressPercent, int DefaultedCount);

public sealed record CommitmentByFundRow(Guid FundTypeId, string FundCode, string FundName, int Count,
    decimal Committed, decimal Paid);

// -- Vouchers dashboard ------------------------------------------------------

public sealed record VouchersDashboardDto(
    string Currency,
    int TotalVouchers, int DraftCount, int PendingApprovalCount, int ApprovedCount, int PaidCount,
    int CancelledCount, int ReversedCount, int PendingClearanceCount,
    decimal TotalPaidAmount, decimal PendingApprovalAmount, decimal ApprovedNotPaidAmount,
    decimal AverageVoucherAmount, decimal MaxVoucherAmount,
    DateOnly? WindowFrom, DateOnly? WindowTo,
    IReadOnlyList<NamedAmountPoint> StatusMix,
    IReadOnlyList<NamedAmountPoint> ByPaymentMode,
    IReadOnlyList<NamedAmountPoint> ByPurpose,
    IReadOnlyList<NamedAmountPoint> ByExpenseType,
    IReadOnlyList<NamedAmountPoint> TopPayees,
    IReadOnlyList<DailyAmountPoint> DailyOutflow,
    IReadOnlyList<MemberMonthlyPoint> MonthlyVoucherCount);

public sealed record DailyAmountPoint(DateOnly Date, int Count, decimal Amount);

// -- Receipts dashboard ------------------------------------------------------

public sealed record ReceiptsDashboardDto(
    string Currency,
    int TotalReceipts, int Confirmed, int Draft, int Cancelled, int Reversed, int PendingClearance,
    decimal TotalAmount, decimal PermanentAmount, decimal ReturnableAmount,
    decimal AverageReceipt, decimal LargestReceipt,
    int UniqueContributors,
    DateOnly? WindowFrom, DateOnly? WindowTo,
    Guid? ScopedFundTypeId, string? ScopedFundName,
    IReadOnlyList<NamedAmountPoint> ByPaymentMode,
    IReadOnlyList<NamedAmountPoint> ByFund,
    IReadOnlyList<NamedAmountPoint> IntentionSplit,
    IReadOnlyList<DailyAmountPoint> DailyInflow,
    IReadOnlyList<MemberMonthlyPoint> MonthlyReceiptCount,
    IReadOnlyList<TopContributorPoint> TopContributors);

// -- Member assets dashboard -------------------------------------------------

public sealed record MemberAssetsDashboardDto(
    string Currency,
    int TotalAssets, int MembersWithAssets,
    decimal TotalEstimatedValue, decimal AverageAssetValue, decimal LargestAssetValue,
    Guid? ScopedSectorId, string? ScopedSectorName,
    IReadOnlyList<NamedAmountPoint> ByKind,
    IReadOnlyList<TopAssetMemberRow> TopMembersByValue,
    IReadOnlyList<MemberMonthlyPoint> CreationTrend,
    IReadOnlyList<NamedCountPoint> AssetsBySector);

public sealed record TopAssetMemberRow(Guid MemberId, string ItsNumber, string FullName,
    int AssetCount, decimal TotalValue);

// -- Sectors dashboard -------------------------------------------------------

public sealed record SectorsDashboardDto(
    string Currency,
    int TotalSectors, int ActiveSectors,
    int TotalMembers, int MembersWithoutSector,
    decimal TotalContributionsYtd,
    IReadOnlyList<SectorRow> Sectors);

public sealed record SectorRow(Guid SectorId, string Code, string Name, bool IsActive,
    int MemberCount, int ActiveMembers, int VerifiedMembers,
    int FamilyCount, int CommitmentCount,
    decimal ContributionsYtd, decimal AssetValue);

// -- Returnable receipts dashboard ------------------------------------------

public sealed record ReturnablesDashboardDto(
    string Currency,
    int TotalReturnable, decimal TotalIssued, decimal TotalReturned, decimal Outstanding,
    int OverdueCount, decimal OverdueAmount,
    int MaturedNotReturnedCount, decimal MaturedNotReturnedAmount,
    Guid? ScopedFundTypeId, string? ScopedFundName,
    IReadOnlyList<NamedAmountPoint> AgeBuckets,
    IReadOnlyList<NamedAmountPoint> ByFund,
    IReadOnlyList<NamedAmountPoint> MaturityStateMix,
    IReadOnlyList<TopReturnableHolderRow> TopHolders,
    IReadOnlyList<MaturityWeekPoint> UpcomingMaturityTimeline);

public sealed record TopReturnableHolderRow(Guid MemberId, string MemberName, string ItsNumber,
    int ReceiptCount, decimal TotalIssued, decimal Outstanding);

// -- Per-member drill-in -----------------------------------------------------

public sealed record MemberDetailDashboardDto(
    Guid MemberId, string ItsNumber, string FullName,
    int Status, string? Phone, string? Email, DateOnly? DateOfBirth,
    int VerificationStatus, int MisaqStatus, int HajjStatus,
    Guid? FamilyId, string? FamilyName, string? FamilyCode, int FamilyRole,
    Guid? SectorId, string? SectorName,
    string Currency,
    decimal LifetimeContribution, decimal YtdContribution, decimal MonthContribution,
    int LifetimeReceiptCount, int YtdReceiptCount,
    int CommitmentCount, decimal CommittedTotal, decimal CommittedPaid, int CommitmentDefaultedCount,
    int LoanCount, decimal LoansDisbursed, decimal LoansRepaid, decimal LoansOutstanding,
    int AssetCount, decimal AssetValue,
    int EventRegistrationCount, int EventCheckedInCount,
    IReadOnlyList<MonthlyAmountPoint> MonthlyContributionTrend,
    IReadOnlyList<NamedAmountPoint> ContributionByFund,
    IReadOnlyList<MemberCommitmentRow> Commitments,
    IReadOnlyList<MemberLoanRow> Loans,
    IReadOnlyList<MemberRecentReceiptRow> RecentReceipts);

public sealed record MemberCommitmentRow(Guid CommitmentId, string FundName, decimal TotalAmount,
    decimal PaidAmount, int Status, int InstallmentsTotal, int InstallmentsPaid, int OverdueInstallments);
public sealed record MemberLoanRow(Guid LoanId, string LoanCode, int Status,
    decimal AmountDisbursed, decimal AmountRepaid, decimal AmountOutstanding, DateOnly? DisbursedOn);
public sealed record MemberRecentReceiptRow(Guid ReceiptId, string? ReceiptNumber, DateOnly ReceiptDate,
    decimal Amount, int Status, int PaymentMode);

// -- Per-commitment drill-in -------------------------------------------------

public sealed record CommitmentDetailDashboardDto(
    Guid CommitmentId, string Currency,
    Guid? MemberId, string? MemberName, string? MemberItsNumber,
    Guid FundTypeId, string FundCode, string FundName,
    Guid? TemplateId, string? TemplateName,
    int Status, decimal TotalAmount, decimal PaidAmount, decimal RemainingAmount,
    int ProgressPercent,
    int InstallmentsTotal, int InstallmentsPaid, int InstallmentsPending, int InstallmentsOverdue,
    DateOnly? NextDueDate, decimal? NextDueAmount,
    DateOnly CreatedDate,
    IReadOnlyList<CommitmentInstallmentRow> Schedule,
    IReadOnlyList<CommitmentPaymentRow> Payments);

public sealed record CommitmentInstallmentRow(Guid InstallmentId, int InstallmentNo, DateOnly DueDate,
    decimal ScheduledAmount, decimal PaidAmount, decimal RemainingAmount, int Status, int DaysOverdue);
public sealed record CommitmentPaymentRow(Guid ReceiptId, string? ReceiptNumber, DateOnly ReceiptDate,
    int InstallmentNo, decimal Amount);

// -- Notifications dashboard -------------------------------------------------

public sealed record NotificationsDashboardDto(
    int Total, int SentCount, int FailedCount, int SkippedCount,
    int DeliveryRatePercent,
    DateOnly? WindowFrom, DateOnly? WindowTo,
    IReadOnlyList<NamedCountPoint> ByChannel,
    IReadOnlyList<NamedCountPoint> ByStatus,
    IReadOnlyList<NamedCountPoint> ByKind,
    IReadOnlyList<NamedCountPoint> TopFailureReasons,
    IReadOnlyList<DailyCountPoint> DailyVolume,
    IReadOnlyList<NotificationFailureRow> RecentFailures);

public sealed record NotificationFailureRow(long Id, DateTimeOffset AttemptedAtUtc,
    int Channel, int Kind, string? FailureReason, string Subject);

// -- User activity dashboard -------------------------------------------------

public sealed record UserActivityDashboardDto(
    int TotalEvents, int UniqueUsers, int UniqueEntities,
    DateOnly? WindowFrom, DateOnly? WindowTo,
    IReadOnlyList<NamedCountPoint> TopUsers,
    IReadOnlyList<NamedCountPoint> TopEntities,
    IReadOnlyList<NamedCountPoint> ActionMix,
    IReadOnlyList<DailyCountPoint> DailyVolume,
    IReadOnlyList<HourlyCountPoint> HourOfDayHeatmap,
    IReadOnlyList<UserActivityRecentRow> RecentEvents);

public sealed record UserActivityRecentRow(DateTimeOffset AtUtc, Guid? UserId, string UserName, string EntityName,
    string Action, string? EntityId);

// -- Change requests dashboard ----------------------------------------------

public sealed record ChangeRequestsDashboardDto(
    int Total, int Pending, int Approved, int Rejected,
    int OldestPendingDays,
    DateOnly? WindowFrom, DateOnly? WindowTo,
    IReadOnlyList<NamedCountPoint> BySection,
    IReadOnlyList<NamedCountPoint> ByStatus,
    IReadOnlyList<NamedCountPoint> ByRequester,
    IReadOnlyList<DailyCountPoint> DailyVolume,
    IReadOnlyList<ChangeRequestRow> OldestPending);

public sealed record ChangeRequestRow(Guid Id, Guid MemberId, string MemberName, string ItsNumber,
    string Section, Guid? RequestedByUserId, string RequestedByUserName, DateTimeOffset RequestedAtUtc, int AgeDays);

// -- Expense types dashboard -------------------------------------------------

public sealed record ExpenseTypesDashboardDto(
    string Currency,
    int TotalExpenseTypes, int ActiveExpenseTypes, int UsedExpenseTypes,
    decimal TotalSpend,
    DateOnly? WindowFrom, DateOnly? WindowTo,
    IReadOnlyList<ExpenseTypeRow> Rows,
    IReadOnlyList<MonthlyAmountPoint> MonthlyTrend);

public sealed record ExpenseTypeRow(Guid ExpenseTypeId, string Code, string Name, bool IsActive,
    int VoucherCount, decimal TotalAmount, decimal AverageAmount, DateOnly? LastUsed);

// -- Periods management dashboard -------------------------------------------

public sealed record PeriodsDashboardDto(
    int TotalPeriods, int OpenPeriods, int ClosedPeriods,
    Guid? CurrentPeriodId, string? CurrentPeriodName,
    int? CurrentPeriodOpenDays,
    int DraftReceiptsInOpenPeriod, int PendingVoucherApprovalsInOpenPeriod,
    bool ReadyToClose,
    IReadOnlyList<PeriodRow> Periods);

public sealed record PeriodRow(Guid Id, string Name, DateOnly StartDate, DateOnly EndDate,
    int Status, int AgeDays, DateTimeOffset? ClosedAtUtc, string? ClosedByUserName);

// -- Annual summary report ---------------------------------------------------

public sealed record AnnualSummaryDto(
    int Year, string Currency,
    decimal TotalIncome, decimal TotalExpense, decimal Net,
    IReadOnlyList<MonthlyIncomeExpensePoint> Monthly,
    IReadOnlyList<AnnualByFundRow> ByFund,
    IReadOnlyList<NamedAmountPoint> ByVoucherPurpose);

public sealed record MonthlyIncomeExpensePoint(int Month, decimal Income, decimal Expense, decimal Net);
public sealed record AnnualByFundRow(Guid FundTypeId, string FundCode, string FundName,
    decimal Income, int ReceiptCount);

// -- Account reconciliation dashboard ---------------------------------------

public sealed record ReconciliationDashboardDto(
    string Currency,
    int BankAccountCount, int ActiveBankAccountCount,
    decimal TotalBankBalance, decimal InTransitAmount, int InTransitChequeCount,
    decimal PendingVoucherAmount, int PendingVoucherCount,
    int CoaAccountsCount, int StaleAccountsCount,
    IReadOnlyList<BankAccountReconciliationRow> BankAccounts,
    IReadOnlyList<CoaAccountReconciliationRow> CoaAccounts);

public sealed record BankAccountReconciliationRow(
    Guid Id, string Name, string BankName, string AccountNumberMasked, string Currency,
    bool IsActive,
    Guid? AccountingAccountId, string? AccountingAccountCode, string? AccountingAccountName,
    decimal LedgerBalance,
    int InTransitChequeCount, decimal InTransitChequeAmount,
    int PendingVoucherCount, decimal PendingVoucherAmount,
    DateOnly? LastEntryDate, int? DaysSinceLastEntry,
    string ReadinessLabel);

public sealed record CoaAccountReconciliationRow(
    Guid AccountId, string Code, string Name, int AccountType,
    decimal Balance, int EntryCount,
    DateOnly? LastEntryDate, int? DaysSinceLastEntry,
    bool IsStale);
