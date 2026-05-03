using Jamaat.Application.Analytics;
using Jamaat.Application.SystemMonitor;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Jamaat.Infrastructure.Identity;
using Jamaat.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Jamaat.Infrastructure.SystemMonitor;

/// <summary>
/// Polls the system periodically (60s by default), evaluates a fixed set of rules against
/// current state, and raises <see cref="SystemAlert"/> rows when thresholds are crossed.
///
/// Each rule has a stable <c>fingerprint</c> ("high.failed.logins", "drive.full.C", etc.).
/// Within a cooldown window (default 15 min) a re-trigger of the same fingerprint just
/// updates the existing row's LastSeenAtUtc + RepeatCount; outside the window the operator
/// gets re-paged via the configured INotificationSender.
///
/// Recipients: explicit Alerts:Recipients[] in config, otherwise email addresses of every
/// SuperAdmin role member. Either way, one email per alert fire (no fan-out per rule).
/// </summary>
public sealed class SystemAlertEvaluator(
    IServiceScopeFactory scopeFactory,
    IUsageEventQueue usageQueue,
    IOptions<SystemAlertOptions> alertOpts,
    ILogger<SystemAlertEvaluator> logger) : BackgroundService
{
    // Snapshot of last-known queue counters - delta is what we alert on.
    private long _lastQueueDropped;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var opts = alertOpts.Value;
        if (!opts.Enabled)
        {
            logger.LogInformation("SystemAlertEvaluator disabled (Alerts:Enabled=false).");
            return;
        }

        // Warmup: let the API finish startup work before the first evaluation. 30 seconds is
        // enough for migrations + seeders + initial cache fills, without making the operator
        // wait too long on a cold-boot incident.
        try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); }
        catch (OperationCanceledException) { return; }

        // Capture the snapshot the first time so we don't double-count drops from a stale memory.
        _lastQueueDropped = usageQueue.GetStats().TotalDropped;

        var interval = TimeSpan.FromSeconds(Math.Max(15, opts.EvaluationIntervalSeconds));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await EvaluateAsync(opts, stoppingToken);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                logger.LogError(ex, "SystemAlertEvaluator round failed; will retry next cycle.");
            }

            try { await Task.Delay(interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task EvaluateAsync(SystemAlertOptions opts, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<JamaatDbContext>();
        var notify = scope.ServiceProvider.GetRequiredService<INotificationSender>();
        var userMgr = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var clock = scope.ServiceProvider.GetRequiredService<IClock>();

        var fired = new List<(string Fingerprint, string Kind, string Severity, string Title, string Detail)>();

        // Rule 1: failed logins in the last hour. Tuned to spot a brute force.
        var oneHourAgo = clock.UtcNow.AddHours(-1);
        var failed1h = await db.LoginAttempts.IgnoreQueryFilters()
            .CountAsync(la => !la.Success && la.AttemptedAtUtc >= oneHourAgo, ct);
        if (failed1h >= opts.FailedLoginsLastHourThreshold)
        {
            fired.Add(("high.failed.logins", "FailedLogins", "Warning",
                $"High failed-login rate: {failed1h} in the last hour",
                $"{failed1h} failed login attempts logged in the last 60 minutes (threshold: {opts.FailedLoginsLastHourThreshold}). " +
                "Investigate via System Monitor > Recent login attempts. Consider locking the affected account or blocking the source IP."));
        }

        // Rule 2: errors in the last hour.
        var errors1h = await db.ErrorLogs.IgnoreQueryFilters()
            .CountAsync(e => e.OccurredAtUtc >= oneHourAgo, ct);
        if (errors1h >= opts.ErrorsLastHourThreshold)
        {
            fired.Add(("high.error.rate", "ErrorRate", "Warning",
                $"Elevated error rate: {errors1h} errors in the last hour",
                $"{errors1h} ErrorLog entries written in the last 60 minutes (threshold: {opts.ErrorsLastHourThreshold}). " +
                "See System Monitor > Recent errors or the Admin > Error Logs page for the stack traces and triage state."));
        }

        // Rule 3: disk usage. One alert per drive that's hot.
        foreach (var d in EnumerateFixedDrives())
        {
            var usedPct = d.TotalMb <= 0 ? 0 : (d.TotalMb - d.FreeMb) * 100.0 / d.TotalMb;
            if (usedPct >= opts.DiskUsedPercentThreshold)
            {
                var sev = usedPct >= 95 ? "Critical" : "Warning";
                fired.Add(($"drive.full.{d.Name}", "DiskFull", sev,
                    $"Drive {d.Name} is {usedPct:F1}% full",
                    $"Drive {d.Name} ({d.Label}, {d.Format}) has {d.FreeMb:N0} MB free of {d.TotalMb:N0} MB. " +
                    "Free space below 10% can cause migration failures, slow query plans, and service crashes. " +
                    "Run a log purge or extend the volume."));
            }
        }

        // Rule 4: system RAM saturation. Sample via the .NET GC's view of host memory - same
        // call SystemService uses for the dashboard's RAM tile, so the threshold matches what
        // the operator sees on screen.
        var gcInfo = GC.GetGCMemoryInfo();
        var totalRam = gcInfo.TotalAvailableMemoryBytes;
        var memLoad = gcInfo.MemoryLoadBytes;
        var ramPct = totalRam <= 0 ? 0d : (double)memLoad / totalRam * 100.0;
        if (ramPct >= opts.RamUsedPercentThreshold)
        {
            fired.Add(("ram.high", "MemoryPressure", "Warning",
                $"System RAM at {ramPct:F1}%",
                $"Memory load is {memLoad / 1024 / 1024:N0} MB of {totalRam / 1024 / 1024:N0} MB total " +
                $"({ramPct:F1}%, threshold {opts.RamUsedPercentThreshold}%). The host may start swapping or the .NET GC may go aggressive."));
        }

        // Rule 5: telemetry queue drops since last evaluation. Even one drop is signal.
        var qStats = usageQueue.GetStats();
        var dropDelta = qStats.TotalDropped - _lastQueueDropped;
        _lastQueueDropped = qStats.TotalDropped;
        if (dropDelta >= opts.QueueDropsPerEvaluationThreshold)
        {
            fired.Add(("queue.dropping", "TelemetryDrops", "Warning",
                $"Usage-event queue dropped {dropDelta} events",
                $"The bounded usage-event queue dropped {dropDelta} events since the last evaluation " +
                $"(total dropped since startup: {qStats.TotalDropped}). The flush worker fell behind. " +
                "Consider raising Analytics:PurgeBatchSize, the queue capacity, or investigating DB write latency."));
        }

        // Rule 6: database unreachable.
        var canConnect = false;
        try { canConnect = await db.Database.CanConnectAsync(ct); } catch { canConnect = false; }
        if (!canConnect)
        {
            fired.Add(("db.unreachable", "DatabaseDown", "Critical",
                "Database is unreachable",
                "JamaatDbContext.CanConnectAsync returned false. The API can't talk to SQL Server. " +
                "Check the connection string in appsettings.json, the SQL Server service status, and any firewall rules."));
        }

        if (fired.Count == 0) return;

        // Resolve recipients once for this round.
        var recipients = await ResolveRecipientsAsync(opts, userMgr, db, ct);

        foreach (var rule in fired)
        {
            await ProcessFiredRuleAsync(db, notify, clock, opts, recipients, rule, ct);
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task ProcessFiredRuleAsync(
        JamaatDbContext db,
        INotificationSender notify,
        IClock clock,
        SystemAlertOptions opts,
        IReadOnlyList<string> recipients,
        (string Fingerprint, string Kind, string Severity, string Title, string Detail) rule,
        CancellationToken ct)
    {
        var now = clock.UtcNow;
        var cooldownStart = now - TimeSpan.FromMinutes(Math.Max(1, opts.CooldownMinutes));

        // Find the most-recent alert with this fingerprint.
        var existing = await db.SystemAlerts
            .Where(a => a.Fingerprint == rule.Fingerprint)
            .OrderByDescending(a => a.LastSeenAtUtc)
            .FirstOrDefaultAsync(ct);

        var inCooldown = existing is not null && existing.LastSeenAtUtc >= cooldownStart;

        if (inCooldown && existing is not null)
        {
            // Dedupe: bump the existing alert without paging again.
            existing.Repeat(rule.Title, rule.Detail, recipients.Count, now);
            db.SystemAlerts.Update(existing);
            logger.LogDebug("Alert {Fingerprint} repeated within cooldown - no notification.", rule.Fingerprint);
            return;
        }

        // Fresh fire (or out-of-cooldown re-fire). New row.
        var alert = SystemAlert.Open(rule.Fingerprint, rule.Kind, rule.Severity, rule.Title, rule.Detail, recipients.Count, now);
        db.SystemAlerts.Add(alert);

        // Notify recipients (one email per recipient). Fire-and-forget; sender catches its
        // own exceptions and writes a NotificationLog row regardless.
        foreach (var to in recipients)
        {
            var subject = $"[{rule.Severity.ToUpperInvariant()}] Jamaat: {rule.Title}";
            var body = rule.Detail + "\n\n--\nThis is an automated alert from the Jamaat System Monitor.\n" +
                $"Fingerprint: {rule.Fingerprint}\n" +
                $"Time: {now:u}";
            await notify.SendAsync(new NotificationMessage(
                Kind: NotificationKind.SystemAlert,
                Subject: subject,
                Body: body,
                RecipientEmail: to,
                RecipientUserId: null,
                SourceId: null,
                SourceReference: rule.Fingerprint,
                PreferredChannel: NotificationChannel.Email), ct);
        }

        logger.LogInformation("Raised system alert {Fingerprint} ({Severity}) to {RecipientCount} recipients.",
            rule.Fingerprint, rule.Severity, recipients.Count);
    }

    private static async Task<IReadOnlyList<string>> ResolveRecipientsAsync(
        SystemAlertOptions opts,
        UserManager<ApplicationUser> userMgr,
        JamaatDbContext db,
        CancellationToken ct)
    {
        // Explicit list wins.
        if (opts.Recipients.Length > 0)
            return opts.Recipients.Where(e => !string.IsNullOrWhiteSpace(e)).Select(e => e.Trim()).ToList();

        // Fallback: every SuperAdmin role member's email. We can't use UserManager
        // .GetUsersInRoleAsync here because it goes through the tenant-filtered IQueryable
        // and the alert evaluator's scope has no TenantContext set, so the SuperAdmin user
        // (TenantId = default tenant, but role is system-scope) gets filtered out. Bypass
        // with IgnoreQueryFilters and resolve role membership manually.
        var superAdminRoleId = await db.Set<ApplicationRole>().IgnoreQueryFilters()
            .Where(r => r.Name == "SuperAdmin")
            .Select(r => r.Id)
            .FirstOrDefaultAsync(ct);
        if (superAdminRoleId == Guid.Empty) return Array.Empty<string>();

        var emails = await userMgr.Users.IgnoreQueryFilters()
            .Where(u => u.IsActive
                && u.Email != null
                && db.Set<Microsoft.AspNetCore.Identity.IdentityUserRole<Guid>>()
                    .Any(ur => ur.UserId == u.Id && ur.RoleId == superAdminRoleId))
            .Select(u => u.Email!)
            .ToListAsync(ct);

        return emails
            .Where(e => !string.IsNullOrWhiteSpace(e))
            .Select(e => e.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    /// <summary>Snapshot of fixed drives. Mirrors what the System Monitor surface uses; kept
    /// here so the alert evaluator doesn't need to call into ISystemService (avoids a scoped
    /// service from a singleton).</summary>
    private static IEnumerable<(string Name, string Label, string Format, long TotalMb, long FreeMb)> EnumerateFixedDrives()
    {
        foreach (var d in DriveInfo.GetDrives())
        {
            (string, string, string, long, long)? row = null;
            try
            {
                if (!d.IsReady || d.DriveType != DriveType.Fixed) continue;
                row = (
                    d.Name.TrimEnd('\\'),
                    string.IsNullOrWhiteSpace(d.VolumeLabel) ? d.Name.TrimEnd('\\') : d.VolumeLabel,
                    d.DriveFormat ?? "",
                    d.TotalSize / 1024 / 1024,
                    d.AvailableFreeSpace / 1024 / 1024);
            }
            catch { /* skip unreadable */ }
            if (row.HasValue) yield return row.Value;
        }
    }
}
