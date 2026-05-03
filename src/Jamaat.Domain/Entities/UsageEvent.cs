using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

/// <summary>
/// Append-only telemetry row written for every user-facing interaction. Two `Kind`s today:
///   - "page"   - SPA route navigations, posted by the React app on every route change.
///   - "action" - controller action invocations, emitted by an MVC filter on every successful
///                authenticated request.
///
/// Why a separate entity rather than re-using AuditLog: AuditLog tracks domain mutations
/// (created/updated/deleted rows). UsageEvent tracks engagement (which screens are looked at,
/// which features are used, by whom, for how long). Keeping them separate keeps the AuditLog
/// table small and queryable for compliance, and lets us age UsageEvent rows aggressively
/// (90 days by default) without losing audit history.
///
/// Tenant-scoped (ITenantScoped) so the SuperAdmin sees across all tenants but a tenant
/// admin only sees their own usage if we ever surface the data outside the system page.
/// </summary>
public sealed class UsageEvent : ITenantScoped
{
    public long Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid? UserId { get; private set; }

    /// <summary>"page" or "action".</summary>
    public string Kind { get; private set; } = string.Empty;

    /// <summary>For Kind=page: the SPA route (e.g. "/members/abc-123"). For Kind=action: the
    /// MVC route template (e.g. "api/v1/members/{id}").</summary>
    public string Path { get; private set; } = string.Empty;

    /// <summary>Coarse module bucket - first segment of Path (e.g. "members", "events").
    /// Pre-computed at write time so the analytics aggregations don't have to string-split
    /// across millions of rows.</summary>
    public string Module { get; private set; } = string.Empty;

    /// <summary>For Kind=action: "Controller.Method" (e.g. "MembersController.GetById").
    /// For Kind=page: null.</summary>
    public string? Action { get; private set; }

    /// <summary>HTTP method for action events; null for page events.</summary>
    public string? HttpMethod { get; private set; }

    /// <summary>HTTP status code for action events; null for page events.</summary>
    public int? StatusCode { get; private set; }

    /// <summary>Server-side measured duration in ms for action events. For page events the
    /// SPA can post a duration measured between this nav and the next.</summary>
    public int? DurationMs { get; private set; }

    public string? IpAddress { get; private set; }
    public string? UserAgent { get; private set; }
    public DateTimeOffset OccurredAtUtc { get; private set; }

    private UsageEvent() { }

    public static UsageEvent ForPage(Guid tenantId, Guid? userId, string path, string module,
        int? durationMs, string? ipAddress, string? userAgent, DateTimeOffset occurredAtUtc) => new()
        {
            TenantId = tenantId,
            UserId = userId,
            Kind = "page",
            Path = Cap(path, 256),
            Module = Cap(module, 64),
            DurationMs = durationMs,
            IpAddress = CapN(ipAddress, 64),
            UserAgent = CapN(userAgent, 512),
            OccurredAtUtc = occurredAtUtc,
        };

    public static UsageEvent ForAction(Guid tenantId, Guid? userId, string path, string module,
        string action, string httpMethod, int statusCode, int durationMs,
        string? ipAddress, string? userAgent, DateTimeOffset occurredAtUtc) => new()
        {
            TenantId = tenantId,
            UserId = userId,
            Kind = "action",
            Path = Cap(path, 256),
            Module = Cap(module, 64),
            Action = Cap(action, 128),
            HttpMethod = Cap(httpMethod, 8),
            StatusCode = statusCode,
            DurationMs = durationMs,
            IpAddress = CapN(ipAddress, 64),
            UserAgent = CapN(userAgent, 512),
            OccurredAtUtc = occurredAtUtc,
        };

    private static string Cap(string s, int max) =>
        string.IsNullOrEmpty(s) ? string.Empty : (s.Length <= max ? s : s[..max]);

    private static string? CapN(string? s, int max) =>
        s is null ? null : (s.Length <= max ? s : s[..max]);
}
