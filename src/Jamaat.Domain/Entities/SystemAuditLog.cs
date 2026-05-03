namespace Jamaat.Domain.Entities;

/// <summary>
/// Append-only record of operator actions taken via the System Monitor / SuperAdmin surface.
/// Distinct from <see cref="AuditLog"/>:
///   - AuditLog tracks domain mutations on tenant-scoped entities (members, receipts, etc.)
///     via the AuditInterceptor.
///   - SystemAuditLog tracks SuperAdmin-level operator actions (acknowledge alert, restart
///     service, force GC, purge logs). These don't mutate domain data; they affect the
///     install. Every system.* write endpoint writes one row here.
///
/// Not tenant-scoped. SuperAdmin acts across the install, so the row carries no TenantId.
/// </summary>
public sealed class SystemAuditLog
{
    public long Id { get; private set; }

    /// <summary>Stable action key in dotted form ("alert.acknowledge", "service.restart",
    /// "logs.purge", "config.update"). Used for filtering on the operator-audit page.</summary>
    public string ActionKey { get; private set; } = string.Empty;

    /// <summary>Free-text headline (~120 chars) describing what happened in human terms.
    /// Rendered in the audit feed without further interpretation.</summary>
    public string Summary { get; private set; } = string.Empty;

    /// <summary>Optional reference to the thing acted on (alert id, service name, drive
    /// letter, etc.). Stringly-typed because the targets are heterogeneous.</summary>
    public string? TargetRef { get; private set; }

    /// <summary>Optional JSON payload with extra context (before/after config, dropped row
    /// count, etc.). Bounded to 4 KB to keep the table compact.</summary>
    public string? DetailJson { get; private set; }

    public Guid? UserId { get; private set; }
    public string UserName { get; private set; } = string.Empty;
    public string? CorrelationId { get; private set; }
    public string? IpAddress { get; private set; }
    public string? UserAgent { get; private set; }
    public DateTimeOffset AtUtc { get; private set; }

    private SystemAuditLog() { }

    public static SystemAuditLog Record(
        string actionKey,
        string summary,
        string? targetRef,
        string? detailJson,
        Guid? userId,
        string userName,
        string? correlationId,
        string? ipAddress,
        string? userAgent,
        DateTimeOffset atUtc) => new()
        {
            ActionKey = Cap(actionKey, 64),
            Summary = Cap(summary, 256),
            TargetRef = CapN(targetRef, 128),
            DetailJson = CapN(detailJson, 4000),
            UserId = userId,
            UserName = Cap(userName, 256),
            CorrelationId = CapN(correlationId, 64),
            IpAddress = CapN(ipAddress, 64),
            UserAgent = CapN(userAgent, 512),
            AtUtc = atUtc,
        };

    private static string Cap(string s, int max) =>
        string.IsNullOrEmpty(s) ? string.Empty : (s.Length <= max ? s : s[..max]);
    private static string? CapN(string? s, int max) =>
        s is null ? null : (s.Length <= max ? s : s[..max]);
}
