using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

/// Append-only audit record. Never updated or deleted via application code.
public sealed class AuditLog : Entity<long>
{
    private AuditLog() { }

    public AuditLog(
        Guid? tenantId,
        Guid? userId,
        string userName,
        string correlationId,
        string action,
        string entityName,
        string entityId,
        string? screen,
        string? beforeJson,
        string? afterJson,
        string? ipAddress,
        string? userAgent,
        DateTimeOffset atUtc)
    {
        TenantId = tenantId;
        UserId = userId;
        UserName = userName;
        CorrelationId = correlationId;
        Action = action;
        EntityName = entityName;
        EntityId = entityId;
        Screen = screen;
        BeforeJson = beforeJson;
        AfterJson = afterJson;
        IpAddress = ipAddress;
        UserAgent = userAgent;
        AtUtc = atUtc;
    }

    public Guid? TenantId { get; private set; }
    public Guid? UserId { get; private set; }
    public string UserName { get; private set; } = default!;
    public string CorrelationId { get; private set; } = default!;
    public string Action { get; private set; } = default!;
    public string EntityName { get; private set; } = default!;
    public string EntityId { get; private set; } = default!;
    public string? Screen { get; private set; }
    public string? BeforeJson { get; private set; }
    public string? AfterJson { get; private set; }
    public string? IpAddress { get; private set; }
    public string? UserAgent { get; private set; }
    public DateTimeOffset AtUtc { get; private set; }
}
