using System.Collections.Concurrent;
using Jamaat.Application.SystemMonitor;
using Jamaat.Contracts.SystemMonitor;

namespace Jamaat.Infrastructure.SystemMonitor;

/// <summary>Tracks two kinds of activity:
///   1. Per-user last-seen (used for "users online")
///   2. A timestamped ring of all request hits (used for req/min over the last 60 minutes)
///
/// Both are bounded - the user dictionary self-prunes entries older than 30 min on read,
/// and the request ring is fixed-size 4096 (~70 req/sec for 60s, plenty for this app).</summary>
public sealed class UserActivityTracker : IUserActivityTracker
{
    private readonly ConcurrentDictionary<Guid, UserLastSeen> _users = new();

    // Fixed-size ring buffer of UTC ticks. Reading enumerates the lot (cheap at 4096).
    private const int RequestRingSize = 4096;
    private readonly long[] _requestTicks = new long[RequestRingSize];
    private int _requestCursor; // next slot to write
    private long _totalRequests;

    public void Record(Guid userId, string? userName, string? ipAddress, string? userAgent)
    {
        var now = DateTimeOffset.UtcNow;
        _users.AddOrUpdate(userId,
            _ => new UserLastSeen(userName, ipAddress, userAgent, now, now, 1),
            (_, existing) => existing with
            {
                LastSeenUtc = now,
                LastIp = ipAddress ?? existing.LastIp,
                LastUserAgent = userAgent ?? existing.LastUserAgent,
                UserName = userName ?? existing.UserName,
                RequestCount = existing.RequestCount + 1,
            });
    }

    public void RecordRequest()
    {
        var now = DateTimeOffset.UtcNow.UtcTicks;
        var i = Interlocked.Increment(ref _requestCursor) - 1;
        _requestTicks[((i % RequestRingSize) + RequestRingSize) % RequestRingSize] = now;
        Interlocked.Increment(ref _totalRequests);
    }

    public IReadOnlyList<OnlineUserDto> GetOnline(TimeSpan? within = null)
    {
        var window = within ?? TimeSpan.FromMinutes(5);
        var cutoff = DateTimeOffset.UtcNow - window;
        var list = new List<OnlineUserDto>();

        foreach (var (id, snap) in _users)
        {
            if (snap.LastSeenUtc < cutoff) continue;
            list.Add(new OnlineUserDto(
                UserId: id,
                UserName: snap.UserName ?? "(unknown)",
                FirstSeenUtc: snap.FirstSeenUtc,
                LastSeenUtc: snap.LastSeenUtc,
                IpAddress: snap.LastIp,
                UserAgent: snap.LastUserAgent,
                RequestCount: snap.RequestCount));
        }

        // Self-prune: drop very old entries so the dict doesn't grow unbounded.
        var pruneCutoff = DateTimeOffset.UtcNow - TimeSpan.FromMinutes(30);
        foreach (var (id, snap) in _users)
        {
            if (snap.LastSeenUtc < pruneCutoff) _users.TryRemove(id, out _);
        }

        return list.OrderByDescending(u => u.LastSeenUtc).ToList();
    }

    public RequestRateDto GetRequestRate()
    {
        var now = DateTimeOffset.UtcNow;
        var nowTicks = now.UtcTicks;
        var oneMinAgo = nowTicks - TimeSpan.FromMinutes(1).Ticks;
        var fiveMinAgo = nowTicks - TimeSpan.FromMinutes(5).Ticks;
        var sixtyMinAgo = nowTicks - TimeSpan.FromMinutes(60).Ticks;

        // Build a per-minute histogram for the last 60 minutes for the sparkline.
        var perMinute = new int[60];
        var last1m = 0;
        var last5m = 0;

        for (var i = 0; i < RequestRingSize; i++)
        {
            var t = _requestTicks[i];
            if (t == 0 || t < sixtyMinAgo) continue;

            // Bucket into minute slots (0 = oldest, 59 = current minute).
            var minutesAgo = (int)((nowTicks - t) / TimeSpan.FromMinutes(1).Ticks);
            if (minutesAgo >= 0 && minutesAgo < 60) perMinute[59 - minutesAgo]++;

            if (t >= oneMinAgo) last1m++;
            if (t >= fiveMinAgo) last5m++;
        }

        return new RequestRateDto(
            Last1Min: last1m,
            Last5Min: last5m,
            PerMinuteLast60: perMinute,
            TotalSinceStartup: Interlocked.Read(ref _totalRequests));
    }

    private sealed record UserLastSeen(
        string? UserName,
        string? LastIp,
        string? LastUserAgent,
        DateTimeOffset FirstSeenUtc,
        DateTimeOffset LastSeenUtc,
        long RequestCount);
}
