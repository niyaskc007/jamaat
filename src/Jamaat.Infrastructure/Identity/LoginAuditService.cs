using Jamaat.Application.Identity;
using Jamaat.Domain.Abstractions;
using Jamaat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Jamaat.Infrastructure.Identity;

public interface ILoginAuditService
{
    Task RecordAsync(Guid? userId, string identifier, bool success, string? failureReason,
        string? ip, string? userAgent, CancellationToken ct = default);

    Task<IReadOnlyList<LoginAttempt>> ListForUserAsync(Guid userId, int max = 50, CancellationToken ct = default);
    Task<IReadOnlyList<LoginAttempt>> ListForTenantAsync(int max = 200, CancellationToken ct = default);
}

/// Fire-and-forget login audit. Never throws into the auth path - if recording fails (DB down,
/// disk full), we log and continue so a temporary infra issue doesn't lock all users out.
public sealed class LoginAuditService(JamaatDbContext db, ITenantContext tenant, IClock clock,
    IGeolocationService geo, ILogger<LoginAuditService> logger) : ILoginAuditService
{
    public async Task RecordAsync(Guid? userId, string identifier, bool success, string? failureReason,
        string? ip, string? userAgent, CancellationToken ct = default)
    {
        try
        {
            var attempt = LoginAttempt.Record(tenant.TenantId, userId, identifier, success, failureReason,
                ip, Truncate(userAgent, 512), clock.UtcNow);

            // Best-effort geo enrichment - never blocks the auth path. Lookup is in-process
            // (offline MaxMind by default), single-digit-ms cached path; even an outright
            // failure is swallowed to keep login responsive.
            try
            {
                var hit = await geo.LookupAsync(ip, ct);
                if (hit is not null) attempt.EnrichGeo(hit.Country, hit.City);
            }
            catch (Exception ex)
            {
                logger.LogDebug(ex, "Geolocation enrichment failed for {Ip}", ip);
            }

            db.LoginAttempts.Add(attempt);
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to record login attempt for {Identifier}", identifier);
        }
    }

    public async Task<IReadOnlyList<LoginAttempt>> ListForUserAsync(Guid userId, int max = 50, CancellationToken ct = default)
    {
        return await db.LoginAttempts.AsNoTracking()
            .Where(x => x.UserId == userId)
            .OrderByDescending(x => x.AttemptedAtUtc)
            .Take(Math.Clamp(max, 1, 500))
            .ToListAsync(ct);
    }

    public async Task<IReadOnlyList<LoginAttempt>> ListForTenantAsync(int max = 200, CancellationToken ct = default)
    {
        return await db.LoginAttempts.AsNoTracking()
            .OrderByDescending(x => x.AttemptedAtUtc)
            .Take(Math.Clamp(max, 1, 1000))
            .ToListAsync(ct);
    }

    private static string? Truncate(string? s, int max) =>
        s is null ? null : (s.Length <= max ? s : s[..max]);
}
