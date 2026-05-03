using Jamaat.Contracts.SystemMonitor;

namespace Jamaat.Application.SystemMonitor;

/// <summary>In-memory tracker of authenticated user activity. Updated by middleware on every
/// request that carries a JWT; the System Monitor consults the snapshot to populate the
/// "users online" tile. Lives in DI as a singleton so all requests write to the same dict.
///
/// Why in-memory rather than a DB write per request: at this app's traffic level a write to
/// every authenticated request would show up in the SQL profile for no operational benefit.
/// The tracker is a soft signal - if the API restarts, "online" empties for a few minutes
/// until activity repopulates it. That's fine for a monitoring view.</summary>
public interface IUserActivityTracker
{
    /// <summary>Record that a user just made a request. Cheap; called from middleware.</summary>
    void Record(Guid userId, string? userName, string? ipAddress, string? userAgent);

    /// <summary>Snapshot of users active within the supplied window (default 5 min).</summary>
    IReadOnlyList<OnlineUserDto> GetOnline(TimeSpan? within = null);

    /// <summary>Aggregate request counters (sliding window).</summary>
    RequestRateDto GetRequestRate();

    /// <summary>Bump the request counter (cheap; called from middleware on every request,
    /// authenticated or not).</summary>
    void RecordRequest();
}
