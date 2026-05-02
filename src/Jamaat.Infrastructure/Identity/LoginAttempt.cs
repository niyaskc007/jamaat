using Jamaat.Domain.Common;

namespace Jamaat.Infrastructure.Identity;

/// Append-only audit row for every login attempt. Captures user identity, success/failure,
/// failure reason, IP, user agent, and (best-effort) geo enrichment. Tenant-scoped so members
/// can only see their own history and admins see only their tenant's. Never mutated; older rows
/// are aged out via a future maintenance job rather than UPDATE.
public sealed class LoginAttempt : ITenantScoped
{
    public long Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid? UserId { get; private set; }
    public string Identifier { get; private set; } = string.Empty; // email or ITS as supplied
    public DateTimeOffset AttemptedAtUtc { get; private set; }
    public bool Success { get; private set; }
    public string? FailureReason { get; private set; }
    public string? IpAddress { get; private set; }
    public string? UserAgent { get; private set; }
    public string? GeoCountry { get; private set; }
    public string? GeoCity { get; private set; }

    private LoginAttempt() { }

    public static LoginAttempt Record(Guid tenantId, Guid? userId, string identifier, bool success,
        string? failureReason, string? ip, string? userAgent, DateTimeOffset attemptedAtUtc) => new()
    {
        TenantId = tenantId,
        UserId = userId,
        Identifier = identifier ?? string.Empty,
        Success = success,
        FailureReason = failureReason,
        IpAddress = ip,
        UserAgent = userAgent,
        AttemptedAtUtc = attemptedAtUtc,
    };

    public void EnrichGeo(string? country, string? city)
    {
        GeoCountry = country;
        GeoCity = city;
    }
}
