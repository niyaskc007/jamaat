namespace Jamaat.Contracts.Analytics;

/// <summary>SPA-posted page-view event. The frontend fires this on every route change with
/// the destination path; the previous page's measured time-on-page (millis) is included
/// when known. Server stamps user / tenant / IP / user-agent so the SPA cannot spoof those.</summary>
public sealed record TrackPageViewDto(
    string Path,
    int? DurationMs);

// ----------------------------------------------------------------------------
// Aggregated analytics returned to the dashboard.
// ----------------------------------------------------------------------------

public sealed record TopPageDto(
    string Path,
    string Module,
    long Views,
    int UniqueUsers);

public sealed record TopActionDto(
    string Action,
    string Module,
    string HttpMethod,
    long Calls,
    int UniqueUsers,
    int AvgDurationMs,
    int P95DurationMs);

public sealed record DailyActiveUsersDto(
    DateOnly Date,
    int DailyActiveUsers,
    long PageViews,
    long ActionCalls);

public sealed record HourlyActivityDto(
    /// <summary>0=Sunday..6=Saturday (DateTime.DayOfWeek convention).</summary>
    int DayOfWeek,
    /// <summary>0..23 in UTC.</summary>
    int Hour,
    long EventCount);

public sealed record TopUserDto(
    Guid UserId,
    string UserName,
    long PageViews,
    long ActionCalls,
    DateTimeOffset LastSeenUtc);

public sealed record AnalyticsSummaryDto(
    DateOnly From,
    DateOnly To,
    long TotalPageViews,
    long TotalActionCalls,
    int UniqueUsers,
    int UniqueSessions,
    int AvgEventsPerUser);

public sealed record AnalyticsOverviewDto(
    AnalyticsSummaryDto Summary,
    IReadOnlyList<TopPageDto> TopPages,
    IReadOnlyList<TopActionDto> TopActions,
    IReadOnlyList<DailyActiveUsersDto> DauTrend,
    IReadOnlyList<HourlyActivityDto> Heatmap,
    IReadOnlyList<TopUserDto> TopUsers,
    UsageQueueStatsDto Queue);

public sealed record UsageQueueStatsDto(
    int CurrentDepth,
    long TotalEnqueued,
    long TotalDropped,
    long TotalFlushed);
