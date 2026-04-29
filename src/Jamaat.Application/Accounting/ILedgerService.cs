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
    Task<IReadOnlyList<ReportDailyPaymentDto>> DailyPaymentsAsync(DateOnly from, DateOnly to, CancellationToken ct = default);
    Task<IReadOnlyList<ReportCashBookRow>> CashBookAsync(Guid accountId, DateOnly from, DateOnly to, CancellationToken ct = default);
    Task<IReadOnlyList<ReportMemberContributionRow>> MemberContributionAsync(Guid memberId, DateOnly from, DateOnly to, CancellationToken ct = default);
    Task<IReadOnlyList<ReportChequeWiseRow>> ChequeWiseAsync(DateOnly from, DateOnly to, CancellationToken ct = default);
    /// <summary>Dual-balance view of a single fund: total cash received (permanent + returnable)
    /// vs net fund strength (after subtracting outstanding return obligations).</summary>
    Task<ReportFundBalanceDto> FundBalanceAsync(Guid fundTypeId, CancellationToken ct = default);
    /// <summary>List every returnable receipt with maturity status + remaining balance.</summary>
    Task<IReadOnlyList<ReportReturnableContributionRow>> ReturnableContributionsAsync(Guid? fundTypeId, CancellationToken ct = default);
}

public interface IDashboardService
{
    Task<DashboardStatsDto> StatsAsync(CancellationToken ct = default);
    Task<IReadOnlyList<DashboardActivityDto>> RecentActivityAsync(int take, CancellationToken ct = default);
    Task<IReadOnlyList<DashboardFundSliceDto>> FundSliceAsync(DateOnly from, DateOnly to, CancellationToken ct = default);
}

public sealed record DashboardStatsDto(
    decimal TodayCollection, int ReceiptsToday, int ActiveMembers, decimal MtdCollection,
    decimal? YesterdayCollection, int? ReceiptsYesterday, int PendingApprovals, int SyncErrors, string Currency);

public sealed record DashboardActivityDto(
    string Kind, string Reference, string Title, decimal? Amount, string Currency,
    string Status, DateTimeOffset AtUtc);

public sealed record DashboardFundSliceDto(Guid FundTypeId, string Name, string Code, decimal Amount);
