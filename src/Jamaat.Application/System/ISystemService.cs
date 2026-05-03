using Jamaat.Contracts.SystemMonitor;

namespace Jamaat.Application.SystemMonitor;

/// <summary>SuperAdmin-facing diagnostics. None of these methods touch tenant-scoped data so
/// they bypass the tenant filter implicitly (no-op queries vs. raw SQL).</summary>
public interface ISystemService
{
    Task<ServerStatsDto> GetServerStatsAsync(CancellationToken ct = default);
    Task<DatabaseStatsDto> GetDatabaseStatsAsync(CancellationToken ct = default);
    Task<LogTailDto?> GetRecentLogsAsync(int take = 200, CancellationToken ct = default);
    Task<IReadOnlyList<TenantSummaryDto>> GetTenantsAsync(CancellationToken ct = default);
    Task<SystemOverviewDto> GetOverviewAsync(int logTake = 200, CancellationToken ct = default);
}
