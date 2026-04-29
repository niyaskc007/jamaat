using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Notifications;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.Notifications;

public sealed class NotificationQueryService(JamaatDbContextFacade db) : INotificationQueryService
{
    public async Task<PagedResult<NotificationLogDto>> ListAsync(NotificationLogQuery q, CancellationToken ct = default)
    {
        var query = db.NotificationLogs.AsNoTracking().AsQueryable();
        if (q.Kind is not null) query = query.Where(x => x.Kind == q.Kind);
        if (q.Status is not null) query = query.Where(x => x.Status == q.Status);
        if (q.Channel is not null) query = query.Where(x => x.Channel == q.Channel);
        if (q.FromDate is not null)
        {
            var from = q.FromDate.Value.ToDateTime(TimeOnly.MinValue);
            query = query.Where(x => x.AttemptedAtUtc >= from);
        }
        if (q.ToDate is not null)
        {
            var to = q.ToDate.Value.ToDateTime(TimeOnly.MaxValue);
            query = query.Where(x => x.AttemptedAtUtc <= to);
        }
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(x => EF.Functions.Like(x.Subject, $"%{s}%")
                || (x.Recipient != null && EF.Functions.Like(x.Recipient, $"%{s}%"))
                || (x.SourceReference != null && EF.Functions.Like(x.SourceReference, $"%{s}%")));
        }

        var total = await query.CountAsync(ct);
        var page = Math.Max(1, q.Page);
        var pageSize = Math.Clamp(q.PageSize, 1, 500);
        var items = await query
            .OrderByDescending(x => x.AttemptedAtUtc)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new NotificationLogDto(
                x.Id, x.Kind, x.Channel, x.Status,
                x.Subject, x.Body, x.Recipient,
                x.SourceId, x.SourceReference, x.FailureReason,
                x.AttemptedAtUtc))
            .ToListAsync(ct);
        return new PagedResult<NotificationLogDto>(items, total, page, pageSize);
    }
}
