using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.AuditLogs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize(Policy = "admin.audit")]
[Route("api/v1/audit-logs")]
public sealed class AuditLogsController(JamaatDbContextFacade db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] AuditLogListQuery q, CancellationToken ct)
    {
        var query = db.AuditLogs.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(q.EntityName)) query = query.Where(x => x.EntityName == q.EntityName);
        if (!string.IsNullOrWhiteSpace(q.Action)) query = query.Where(x => x.Action == q.Action);
        if (q.UserId is not null) query = query.Where(x => x.UserId == q.UserId);
        if (q.FromUtc is not null) query = query.Where(x => x.AtUtc >= q.FromUtc);
        if (q.ToUtc is not null) query = query.Where(x => x.AtUtc <= q.ToUtc);
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(x => EF.Functions.Like(x.UserName, $"%{s}%")
                                  || EF.Functions.Like(x.EntityName, $"%{s}%")
                                  || EF.Functions.Like(x.EntityId, $"%{s}%")
                                  || EF.Functions.Like(x.CorrelationId, $"%{s}%"));
        }

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(x => x.AtUtc)
            .Skip((q.Page - 1) * q.PageSize).Take(q.PageSize)
            .Select(x => new AuditLogDto(
                x.Id, x.TenantId, x.UserId, x.UserName, x.CorrelationId,
                x.Action, x.EntityName, x.EntityId, x.Screen,
                x.BeforeJson, x.AfterJson, x.IpAddress, x.UserAgent, x.AtUtc))
            .ToListAsync(ct);
        return Ok(new PagedResult<AuditLogDto>(items, total, q.Page, q.PageSize));
    }
}
