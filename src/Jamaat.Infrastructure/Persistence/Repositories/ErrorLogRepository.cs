using Jamaat.Application.Common;
using Jamaat.Application.ErrorLogs;
using Jamaat.Contracts.ErrorLogs;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Infrastructure.Persistence.Repositories;

public sealed class ErrorLogRepository(JamaatDbContext db) : IErrorLogRepository
{
    private readonly JamaatDbContext _db = db;

    public Task<ErrorLog?> GetByIdAsync(long id, CancellationToken ct = default) =>
        _db.ErrorLogs.FirstOrDefaultAsync(e => e.Id == id, ct);

    public async Task<PagedResult<ErrorLogDto>> ListAsync(ErrorLogListQuery query, CancellationToken ct = default)
    {
        IQueryable<ErrorLog> q = _db.ErrorLogs.AsNoTracking();

        if (query.Source is not null) q = q.Where(e => e.Source == query.Source);
        if (query.Severity is not null) q = q.Where(e => e.Severity == query.Severity);
        if (query.Status is not null) q = q.Where(e => e.Status == query.Status);
        if (query.FromUtc is not null) q = q.Where(e => e.OccurredAtUtc >= query.FromUtc);
        if (query.ToUtc is not null) q = q.Where(e => e.OccurredAtUtc <= query.ToUtc);
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var s = query.Search.Trim();
            q = q.Where(e => EF.Functions.Like(e.Message, $"%{s}%")
                          || (e.Endpoint != null && EF.Functions.Like(e.Endpoint, $"%{s}%"))
                          || (e.CorrelationId != null && EF.Functions.Like(e.CorrelationId, $"%{s}%"))
                          || (e.ExceptionType != null && EF.Functions.Like(e.ExceptionType, $"%{s}%")));
        }

        if (query.GroupSimilar)
        {
            // Keep only the newest row per fingerprint. EF Core can't translate a
            // GroupBy().Select(First) projection, so we pick the latest Id per group
            // (Id is auto-increment, so newest = max Id) and filter by that set.
            var latestIds = _db.ErrorLogs
                .GroupBy(e => e.Fingerprint)
                .Select(g => g.Max(e => e.Id));
            q = q.Where(e => latestIds.Contains(e.Id));
        }

        var sortDir = string.Equals(query.SortDir, "Asc", StringComparison.OrdinalIgnoreCase)
            ? SortDirection.Asc : SortDirection.Desc;
        q = (query.SortBy?.ToLowerInvariant(), sortDir) switch
        {
            ("severity", SortDirection.Asc) => q.OrderBy(e => e.Severity),
            ("severity", _) => q.OrderByDescending(e => e.Severity),
            ("status", SortDirection.Asc) => q.OrderBy(e => e.Status),
            ("status", _) => q.OrderByDescending(e => e.Status),
            ("source", SortDirection.Asc) => q.OrderBy(e => e.Source),
            ("source", _) => q.OrderByDescending(e => e.Source),
            (_, SortDirection.Asc) => q.OrderBy(e => e.OccurredAtUtc),
            _ => q.OrderByDescending(e => e.OccurredAtUtc),
        };

        var total = await q.CountAsync(ct);
        var items = await q
            .Skip(Math.Max(0, (query.Page - 1) * query.PageSize))
            .Take(Math.Clamp(query.PageSize, 1, 500))
            .Select(e => new ErrorLogDto(
                e.Id, e.TenantId, e.Source, e.Severity, e.Status, e.Message,
                e.ExceptionType, e.StackTrace, e.Endpoint, e.HttpMethod, e.HttpStatus,
                e.CorrelationId, e.UserId, e.UserName, e.UserRole, e.IpAddress, e.UserAgent,
                e.Fingerprint, e.OccurredAtUtc,
                e.ReviewedAtUtc, e.ReviewedByUserName,
                e.ResolvedAtUtc, e.ResolvedByUserName, e.ResolutionNote))
            .ToListAsync(ct);

        return new PagedResult<ErrorLogDto>(items, total, query.Page, query.PageSize);
    }

    public async Task<ErrorLogStatsDto> StatsAsync(CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;
        var todayStart = new DateTimeOffset(now.Year, now.Month, now.Day, 0, 0, 0, now.Offset);
        var sevenDaysAgo = now.AddDays(-7);

        var baseQ = _db.ErrorLogs.AsNoTracking();
        var today = await baseQ.CountAsync(e => e.OccurredAtUtc >= todayStart, ct);
        var last7 = await baseQ.CountAsync(e => e.OccurredAtUtc >= sevenDaysAgo, ct);
        var total = await baseQ.CountAsync(ct);
        var open = await baseQ.CountAsync(e => e.Status == ErrorStatus.Reported, ct);
        var reviewed = await baseQ.CountAsync(e => e.Status == ErrorStatus.Reviewed, ct);
        var resolved = await baseQ.CountAsync(e => e.Status == ErrorStatus.Resolved, ct);

        return new ErrorLogStatsDto(today, last7, total, open, reviewed, resolved);
    }

    public Task AddAsync(ErrorLog entity, CancellationToken ct = default) =>
        _db.ErrorLogs.AddAsync(entity, ct).AsTask();

    public void Update(ErrorLog entity) => _db.ErrorLogs.Update(entity);
}
