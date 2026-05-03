using Jamaat.Contracts.Analytics;

namespace Jamaat.Application.Analytics;

/// <summary>Aggregates UsageEvent rows for the SuperAdmin's analytics dashboard.</summary>
public interface IAnalyticsService
{
    Task TrackPageViewAsync(string path, int? durationMs, CancellationToken ct = default);

    Task<AnalyticsOverviewDto> GetOverviewAsync(DateOnly from, DateOnly to, Guid? tenantId = null, CancellationToken ct = default);

    Task<IReadOnlyList<TopPageDto>> TopPagesAsync(DateOnly from, DateOnly to, int take = 20, Guid? tenantId = null, CancellationToken ct = default);
    Task<IReadOnlyList<TopActionDto>> TopActionsAsync(DateOnly from, DateOnly to, int take = 20, Guid? tenantId = null, CancellationToken ct = default);
    Task<IReadOnlyList<DailyActiveUsersDto>> DailyActiveUsersAsync(DateOnly from, DateOnly to, Guid? tenantId = null, CancellationToken ct = default);
    Task<IReadOnlyList<HourlyActivityDto>> HourlyHeatmapAsync(DateOnly from, DateOnly to, Guid? tenantId = null, CancellationToken ct = default);
    Task<IReadOnlyList<TopUserDto>> TopUsersAsync(DateOnly from, DateOnly to, int take = 20, Guid? tenantId = null, CancellationToken ct = default);
}
