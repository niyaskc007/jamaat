using System.Security.Claims;
using Jamaat.Application.Analytics;
using Jamaat.Contracts.Analytics;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Entities;
using Jamaat.Infrastructure.Identity;
using Jamaat.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Infrastructure.Analytics;

public sealed class AnalyticsService(
    JamaatDbContext db,
    IUsageEventQueue queue,
    ITenantContext tenant,
    UserManager<ApplicationUser> userMgr,
    IHttpContextAccessor httpAccessor) : IAnalyticsService
{
    public Task TrackPageViewAsync(string path, int? durationMs, CancellationToken ct = default)
    {
        var http = httpAccessor.HttpContext;
        if (http is null) return Task.CompletedTask;
        if (http.User.Identity?.IsAuthenticated != true) return Task.CompletedTask;

        var tid = tenant.TenantId;
        if (tid == Guid.Empty) return Task.CompletedTask;

        Guid? userId = null;
        var idClaim = http.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                      ?? http.User.FindFirst("sub")?.Value;
        if (Guid.TryParse(idClaim, out var u)) userId = u;

        var module = ExtractModuleFromSpaPath(path);
        var ip = http.Connection.RemoteIpAddress?.ToString();
        var ua = http.Request.Headers.UserAgent.ToString();
        if (string.IsNullOrWhiteSpace(ua)) ua = null;

        var evt = UsageEvent.ForPage(
            tenantId: tid,
            userId: userId,
            path: path ?? "/",
            module: module,
            durationMs: durationMs,
            ipAddress: ip,
            userAgent: ua,
            occurredAtUtc: DateTimeOffset.UtcNow);

        queue.TryEnqueue(evt);
        return Task.CompletedTask;
    }

    public async Task<AnalyticsOverviewDto> GetOverviewAsync(DateOnly from, DateOnly to, Guid? tenantId = null, CancellationToken ct = default)
    {
        var topPages = await TopPagesAsync(from, to, 10, tenantId, ct);
        var topActions = await TopActionsAsync(from, to, 10, tenantId, ct);
        var dau = await DailyActiveUsersAsync(from, to, tenantId, ct);
        var heatmap = await HourlyHeatmapAsync(from, to, tenantId, ct);
        var topUsers = await TopUsersAsync(from, to, 10, tenantId, ct);

        var fromUtc = from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var toUtc = to.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc);
        var fromDto = new DateTimeOffset(fromUtc, TimeSpan.Zero);
        var toDto = new DateTimeOffset(toUtc, TimeSpan.Zero);

        var baseQ = db.UsageEvents.IgnoreQueryFilters()
            .Where(e => e.OccurredAtUtc >= fromDto && e.OccurredAtUtc <= toDto);
        if (tenantId is { } tid) baseQ = baseQ.Where(e => e.TenantId == tid);

        var totalPageViews = await baseQ.LongCountAsync(e => e.Kind == "page", ct);
        var totalActionCalls = await baseQ.LongCountAsync(e => e.Kind == "action", ct);
        var uniqueUsers = await baseQ.Where(e => e.UserId != null).Select(e => e.UserId).Distinct().CountAsync(ct);
        // "sessions" approximation = distinct (user, calendar-date) pairs in range.
        // Same EF limitation - DateTimeOffset.UtcDateTime.Date doesn't translate. Project the
        // Y/M/D triple instead so SQL Server can DISTINCT on those plus the user id.
        var uniqueSessions = await baseQ
            .Where(e => e.UserId != null)
            .Select(e => new { e.UserId, e.OccurredAtUtc.Year, e.OccurredAtUtc.Month, e.OccurredAtUtc.Day })
            .Distinct()
            .CountAsync(ct);
        var totalEvents = totalPageViews + totalActionCalls;
        var avgPerUser = uniqueUsers <= 0 ? 0 : (int)(totalEvents / uniqueUsers);

        var summary = new AnalyticsSummaryDto(from, to, totalPageViews, totalActionCalls, uniqueUsers, uniqueSessions, avgPerUser);

        var qstats = queue.GetStats();
        var qDto = new UsageQueueStatsDto(qstats.CurrentDepth, qstats.TotalEnqueued, qstats.TotalDropped, qstats.TotalFlushed);

        return new AnalyticsOverviewDto(summary, topPages, topActions, dau, heatmap, topUsers, qDto);
    }

    public async Task<IReadOnlyList<TopPageDto>> TopPagesAsync(DateOnly from, DateOnly to, int take, Guid? tenantId, CancellationToken ct)
    {
        var (fromDto, toDto) = Range(from, to);
        var q = db.UsageEvents.IgnoreQueryFilters()
            .Where(e => e.Kind == "page" && e.OccurredAtUtc >= fromDto && e.OccurredAtUtc <= toDto);
        if (tenantId is { } tid) q = q.Where(e => e.TenantId == tid);

        // Two-pass: first the view counts (cheap), then the distinct-user counts for the top
        // N paths. EF Core can't translate nested .Where(...).Select(...).Distinct().Count()
        // inside a GroupBy projection, but two simple queries hit the same indexes and stay fast.
        var topPaths = await q.GroupBy(e => new { e.Path, e.Module })
            .Select(g => new { g.Key.Path, g.Key.Module, Views = g.LongCount() })
            .OrderByDescending(x => x.Views)
            .Take(take)
            .ToListAsync(ct);

        if (topPaths.Count == 0) return [];

        var paths = topPaths.Select(p => p.Path).ToHashSet();
        var userCountsByPath = await q
            .Where(e => paths.Contains(e.Path) && e.UserId != null)
            .GroupBy(e => e.Path)
            .Select(g => new { Path = g.Key, Users = g.Select(x => x.UserId).Distinct().Count() })
            .ToDictionaryAsync(x => x.Path, x => x.Users, ct);

        return topPaths.Select(p => new TopPageDto(
            p.Path,
            p.Module,
            p.Views,
            userCountsByPath.GetValueOrDefault(p.Path, 0))).ToList();
    }

    public async Task<IReadOnlyList<TopActionDto>> TopActionsAsync(DateOnly from, DateOnly to, int take, Guid? tenantId, CancellationToken ct)
    {
        var (fromDto, toDto) = Range(from, to);
        var q = db.UsageEvents.IgnoreQueryFilters()
            .Where(e => e.Kind == "action" && e.Action != null && e.OccurredAtUtc >= fromDto && e.OccurredAtUtc <= toDto);
        if (tenantId is { } tid) q = q.Where(e => e.TenantId == tid);

        // Pass 1: top actions by call count, with avg duration. Avoids nested-distinct.
        var grouped = await q.GroupBy(e => new { e.Action, e.Module, e.HttpMethod })
            .Select(g => new
            {
                g.Key.Action,
                g.Key.Module,
                g.Key.HttpMethod,
                Calls = g.LongCount(),
                AvgMs = g.Where(e => e.DurationMs != null).Average(e => (double?)e.DurationMs) ?? 0,
                MaxMs = g.Where(e => e.DurationMs != null).Max(e => (int?)e.DurationMs) ?? 0,
            })
            .OrderByDescending(x => x.Calls)
            .Take(take)
            .ToListAsync(ct);

        if (grouped.Count == 0) return [];

        // Pass 2: distinct-user count per action (split because EF won't translate nested
        // .Where(...).Select(...).Distinct().Count() inside a GroupBy projection).
        var actionNames = grouped.Select(g => g.Action).Where(a => a != null).ToHashSet();
        var userCounts = await q
            .Where(e => actionNames.Contains(e.Action) && e.UserId != null)
            .GroupBy(e => e.Action)
            .Select(g => new { Action = g.Key, Users = g.Select(x => x.UserId).Distinct().Count() })
            .ToDictionaryAsync(x => x.Action!, x => x.Users, ct);

        return grouped.Select(g => new TopActionDto(
            g.Action ?? "",
            g.Module,
            g.HttpMethod ?? "",
            g.Calls,
            userCounts.GetValueOrDefault(g.Action ?? "", 0),
            (int)g.AvgMs,
            // p95 stand-in: EF Core doesn't translate ntile. Use Max for now; revisit with raw
            // SQL via Database.SqlQuery<...>() if real p95 matters.
            g.MaxMs)).ToList();
    }

    public async Task<IReadOnlyList<DailyActiveUsersDto>> DailyActiveUsersAsync(DateOnly from, DateOnly to, Guid? tenantId, CancellationToken ct)
    {
        var (fromDto, toDto) = Range(from, to);
        var q = db.UsageEvents.IgnoreQueryFilters()
            .Where(e => e.OccurredAtUtc >= fromDto && e.OccurredAtUtc <= toDto);
        if (tenantId is { } tid) q = q.Where(e => e.TenantId == tid);

        // Pass 1: page + action counts per day. EF Core can't translate
        // DateTimeOffset.UtcDateTime.Date or .Date on the GroupBy key, but it does translate
        // .Year / .Month / .Day to DATEPART, so we group by that triple and reconstruct the
        // calendar date client-side.
        var totals = await q
            .GroupBy(e => new { e.OccurredAtUtc.Year, e.OccurredAtUtc.Month, e.OccurredAtUtc.Day })
            .Select(g => new
            {
                g.Key.Year,
                g.Key.Month,
                g.Key.Day,
                Pages = g.LongCount(e => e.Kind == "page"),
                Actions = g.LongCount(e => e.Kind == "action"),
            })
            .ToListAsync(ct);

        // Pass 2: distinct-user count per day. Same EF limitation - select the (Y/M/D, user)
        // pairs distinct, reconstruct the date client-side.
        var dauPairs = await q
            .Where(e => e.UserId != null)
            .Select(e => new { e.OccurredAtUtc.Year, e.OccurredAtUtc.Month, e.OccurredAtUtc.Day, e.UserId })
            .Distinct()
            .ToListAsync(ct);

        var dauByDate = dauPairs
            .GroupBy(p => new DateOnly(p.Year, p.Month, p.Day))
            .ToDictionary(g => g.Key, g => g.Count());
        var totalsByDate = totals.ToDictionary(t => new DateOnly(t.Year, t.Month, t.Day));

        // Fill gaps so the chart line is continuous even on quiet days.
        var result = new List<DailyActiveUsersDto>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var dau = dauByDate.GetValueOrDefault(d, 0);
            if (totalsByDate.TryGetValue(d, out var hit))
                result.Add(new DailyActiveUsersDto(d, dau, hit.Pages, hit.Actions));
            else
                result.Add(new DailyActiveUsersDto(d, dau, 0, 0));
        }
        return result;
    }

    public async Task<IReadOnlyList<HourlyActivityDto>> HourlyHeatmapAsync(DateOnly from, DateOnly to, Guid? tenantId, CancellationToken ct)
    {
        var (fromDto, toDto) = Range(from, to);
        var q = db.UsageEvents.IgnoreQueryFilters()
            .Where(e => e.OccurredAtUtc >= fromDto && e.OccurredAtUtc <= toDto);
        if (tenantId is { } tid) q = q.Where(e => e.TenantId == tid);

        // EF translates DateTimeOffset.Hour to DATEPART(hour, ...). DayOfWeek doesn't translate
        // to a clean SQL idiom, so we project Year/Month/Day/Hour and bucket client-side.
        var raw = await q
            .Select(e => new { e.OccurredAtUtc.Year, e.OccurredAtUtc.Month, e.OccurredAtUtc.Day, e.OccurredAtUtc.Hour })
            .ToListAsync(ct);

        var bucketed = raw
            .GroupBy(r => new { Day = (int)new DateTime(r.Year, r.Month, r.Day).DayOfWeek, r.Hour })
            .Select(g => new HourlyActivityDto(g.Key.Day, g.Key.Hour, g.LongCount()))
            .ToList();
        var grouped = bucketed;

        // Backfill zero cells so the heatmap always renders 7x24 = 168 cells.
        var byKey = grouped.ToDictionary(h => (h.DayOfWeek, h.Hour));
        var result = new List<HourlyActivityDto>(168);
        for (var d = 0; d < 7; d++)
            for (var h = 0; h < 24; h++)
                result.Add(byKey.TryGetValue((d, h), out var hit) ? hit : new HourlyActivityDto(d, h, 0));
        return result;
    }

    public async Task<IReadOnlyList<TopUserDto>> TopUsersAsync(DateOnly from, DateOnly to, int take, Guid? tenantId, CancellationToken ct)
    {
        var (fromDto, toDto) = Range(from, to);
        var q = db.UsageEvents.IgnoreQueryFilters()
            .Where(e => e.UserId != null && e.OccurredAtUtc >= fromDto && e.OccurredAtUtc <= toDto);
        if (tenantId is { } tid) q = q.Where(e => e.TenantId == tid);

        var rows = await q.GroupBy(e => e.UserId!.Value)
            .Select(g => new
            {
                UserId = g.Key,
                Pages = g.LongCount(e => e.Kind == "page"),
                Actions = g.LongCount(e => e.Kind == "action"),
                LastSeen = g.Max(e => e.OccurredAtUtc),
            })
            .OrderByDescending(x => x.Pages + x.Actions)
            .Take(take)
            .ToListAsync(ct);

        if (rows.Count == 0) return [];

        // Resolve names via UserManager. Could be denormalised to UsageEvent later if this
        // becomes hot.
        var userIds = rows.Select(r => r.UserId).ToHashSet();
        var nameMap = await userMgr.Users
            .Where(u => userIds.Contains(u.Id))
            .Select(u => new { u.Id, Name = u.FullName ?? u.Email ?? "(unknown)" })
            .ToDictionaryAsync(x => x.Id, x => x.Name, ct);

        return rows.Select(r => new TopUserDto(
            r.UserId,
            nameMap.GetValueOrDefault(r.UserId, "(unknown)"),
            r.Pages,
            r.Actions,
            r.LastSeen)).ToList();
    }

    private static (DateTimeOffset From, DateTimeOffset To) Range(DateOnly from, DateOnly to) =>
        (new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero),
         new DateTimeOffset(to.ToDateTime(TimeOnly.MaxValue), TimeSpan.Zero));

    /// <summary>"/members/abc-123" -> "members". For SPA paths, no /api/vN/ prefix.</summary>
    private static string ExtractModuleFromSpaPath(string? path)
    {
        if (string.IsNullOrEmpty(path)) return "";
        var s = path.AsSpan();
        if (s.StartsWith("/")) s = s[1..];
        var slash = s.IndexOf('/');
        var seg = slash > 0 ? s[..slash].ToString() : s.ToString();
        return string.IsNullOrEmpty(seg) ? "dashboard" : seg;
    }
}
