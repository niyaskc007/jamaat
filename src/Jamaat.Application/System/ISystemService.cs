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

    /// <summary>"Live ops": users online (in-memory tracker), recent logins (last 25 from
    /// LoginAttempt), recent errors (last 25 from ErrorLog), and request-rate trend.
    /// Designed to be polled at the same cadence as the rest of the monitor.</summary>
    Task<LiveOpsDto> GetLiveOpsAsync(CancellationToken ct = default);
}
