using System.Security.Claims;
using System.Text.Json;
using Jamaat.Application.SystemMonitor;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Entities;
using Jamaat.Infrastructure.Common;
using Jamaat.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace Jamaat.Infrastructure.SystemMonitor;

public sealed class SystemAuditLogger(
    JamaatDbContext db,
    IHttpContextAccessor httpAccessor,
    ICorrelationContext correlation,
    IClock clock,
    ILogger<SystemAuditLogger> logger) : ISystemAuditLogger
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = false,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    public async Task RecordAsync(string actionKey, string summary, string? targetRef = null, object? detail = null, CancellationToken ct = default)
    {
        try
        {
            var http = httpAccessor.HttpContext;
            var (userId, userName) = ResolveUser(http);
            var ip = http?.Connection.RemoteIpAddress?.ToString();
            var ua = http?.Request.Headers.UserAgent.ToString();
            if (string.IsNullOrWhiteSpace(ua)) ua = null;

            string? detailJson = null;
            if (detail is not null)
            {
                try { detailJson = JsonSerializer.Serialize(detail, JsonOpts); }
                catch (Exception ex) { logger.LogDebug(ex, "Failed to serialise SystemAuditLog detail."); }
            }

            var row = SystemAuditLog.Record(
                actionKey: actionKey,
                summary: summary,
                targetRef: targetRef,
                detailJson: detailJson,
                userId: userId,
                userName: userName,
                correlationId: correlation.CorrelationId,
                ipAddress: ip,
                userAgent: ua,
                atUtc: clock.UtcNow);
            db.Set<SystemAuditLog>().Add(row);
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            // Audit must never break the calling action. Log + swallow.
            logger.LogError(ex, "Failed to write SystemAuditLog row for action {ActionKey}.", actionKey);
        }
    }

    private static (Guid? UserId, string UserName) ResolveUser(HttpContext? http)
    {
        if (http?.User.Identity?.IsAuthenticated != true) return (null, "(anonymous)");
        var idClaim = http.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                      ?? http.User.FindFirst("sub")?.Value;
        var name = http.User.FindFirst(ClaimTypes.Name)?.Value
                   ?? http.User.FindFirst(ClaimTypes.Email)?.Value
                   ?? http.User.FindFirst("email")?.Value
                   ?? "(unknown)";
        return (Guid.TryParse(idClaim, out var u) ? u : null, name);
    }
}
