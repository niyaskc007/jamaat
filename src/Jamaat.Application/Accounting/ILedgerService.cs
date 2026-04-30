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

    /// <summary>Audit volume + error counts + queues. Backs the /dashboards/compliance page.</summary>
    Task<ComplianceDashboardDto> ComplianceAsync(CancellationToken ct = default);
}

public sealed record QhPortfolioDto(
    string Currency,
    int TotalLoans, int ActiveCount, int CompletedCount, int DefaultedCount, int InApprovalCount,
    decimal TotalDisbursed, decimal TotalRepaid, decimal TotalOutstanding,
    decimal DefaultRatePercent,
    IReadOnlyList<QhStatusBucket> ByStatus,
    IReadOnlyList<QhMonthlyPoint> RepaymentTrend,
    IReadOnlyList<QhBorrowerRow> TopBorrowers,
    IReadOnlyList<QhUpcomingInstallment> UpcomingInstallments);

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
    IReadOnlyList<OldestObligationRow> OldestObligations);

public sealed record AgingBucket(string Label, int Count, decimal Amount);
public sealed record OldestObligationRow(string Kind, string Reference, string MemberName, DateOnly DueDate, int DaysOverdue, decimal Amount);

public sealed record MemberEngagementDto(
    int TotalMembers, int ActiveMembers, int InactiveMembers, int DeceasedMembers, int SuspendedMembers,
    int VerifiedMembers, int VerificationPendingMembers, int VerificationNotStartedMembers, int VerificationRejectedMembers,
    int NewThisMonth, int NewThisYear,
    IReadOnlyList<MemberMonthlyPoint> NewMemberTrend);

public sealed record MemberMonthlyPoint(int Year, int Month, int Count);

public sealed record ComplianceDashboardDto(
    int AuditEvents30d,
    int OpenErrors,
    int PendingChangeRequests,
    int PendingVoucherApprovals,
    int DraftReceipts,
    int UnverifiedMembers,
    bool HasOpenPeriod,
    string? OpenPeriodName,
    IReadOnlyList<DailyCountPoint> AuditTrend30d,
    IReadOnlyList<NamedCountPoint> ErrorsBySeverity,
    IReadOnlyList<NamedCountPoint> ChangeRequestsByStatus);

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
