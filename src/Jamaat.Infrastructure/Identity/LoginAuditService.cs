using Jamaat.Application.Identity;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Enums;
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
    IGeolocationService geo, INotificationSender notify,
    ILogger<LoginAuditService> logger) : ILoginAuditService
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

            // New-device detection. Fire a NewDeviceLogin notification when this is a
            // successful login from an IP we have NOT seen for this user before, AND the
            // user has at least one prior successful login (otherwise the very first
            // login - immediately after the welcome email - would always trigger this and
            // be noisy). Best-effort: any failure here must not affect the auth flow.
            if (success && userId is Guid uid && !string.IsNullOrEmpty(ip))
            {
                try { await MaybeNotifyNewDeviceAsync(uid, ip, attempt.GeoCountry, attempt.GeoCity, attempt.UserAgent, ct); }
                catch (Exception ex) { logger.LogDebug(ex, "New-device notification check failed"); }
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to record login attempt for {Identifier}", identifier);
        }
    }

    private async Task MaybeNotifyNewDeviceAsync(Guid userId, string ip, string? country, string? city,
        string? userAgent, CancellationToken ct)
    {
        // Has this user had ANY successful login before this one (excluding the just-recorded row)?
        // If no, it's their first login - skip the notification (welcome email already covers it).
        var hasPriorSuccess = await db.LoginAttempts.AsNoTracking()
            .AnyAsync(x => x.UserId == userId && x.Success
                        && x.AttemptedAtUtc < clock.UtcNow.AddSeconds(-1), ct);
        if (!hasPriorSuccess) return;

        // Has this IP been seen on a prior successful attempt for this user?
        var ipKnown = await db.LoginAttempts.AsNoTracking()
            .AnyAsync(x => x.UserId == userId && x.Success && x.IpAddress == ip
                        && x.AttemptedAtUtc < clock.UtcNow.AddSeconds(-1), ct);
        if (ipKnown) return;

        // Resolve the user's email + locale. Service-internal fetch (UserManager isn't in
        // scope here; the ApplicationUser table is reachable via JamaatDbContext).
        var user = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.Email, u.FullName, u.PhoneE164 })
            .FirstOrDefaultAsync(ct);
        if (user is null || string.IsNullOrEmpty(user.Email)) return;

        var location = (country, city) switch
        {
            (null, null) => "an unknown location",
            (string c, null) => c,
            (null, string ci) => ci,
            (string c, string ci) => $"{ci}, {c}",
        };

        try
        {
            await notify.SendAsync(new NotificationMessage(
                Kind: NotificationKind.NewDeviceLogin,
                Subject: "New sign-in to your Jamaat account",
                Body: $"Salaam {user.FullName},\n\n" +
                      $"A new sign-in to your account was just recorded from {location} (IP {ip}).\n" +
                      $"Browser: {Truncate(userAgent, 200) ?? "unknown"}\n\n" +
                      $"If this was you, no action needed. If you do not recognise this sign-in, " +
                      $"change your password immediately and contact your committee.",
                RecipientEmail: user.Email,
                RecipientUserId: userId,
                SourceId: userId,
                SourceReference: $"new-device:{ip}",
                RecipientPhoneE164: user.PhoneE164), ct);
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "NewDeviceLogin send failed for {UserId}", userId);
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
