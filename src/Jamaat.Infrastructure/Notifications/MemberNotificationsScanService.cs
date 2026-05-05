using Hangfire;
using Jamaat.Application.Notifications;
using Jamaat.Application.Persistence;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Jamaat.Infrastructure.Notifications;

/// Daily scan that fires:
///  - Commitment installment T-3d reminders for installments due in exactly 3 days.
///  - Event T-24h reminders for events starting in the next 24 hours.
///
/// Phase M: orchestrated by Hangfire as a recurring job (cron 0 6 * * *) instead of an
/// IHostedService + PeriodicTimer. Hangfire gives us a dashboard for ops visibility,
/// retries on failure, and "trigger now" from the UI. The actual scan logic is unchanged;
/// only the trigger mechanism moved.
///
/// Idempotent: NotificationLog records every attempt (even when the channel is log-only),
/// and the duplicate-prevention key is the (memberId, kind, source-reference) tuple. Re-
/// running the same day's scan a second time will produce a second row but the receiving
/// member side dedup on the email-equivalent in their inbox; for now we accept the doubling
/// rather than maintain a stateful "did we already scan today" lock.
public sealed class MemberNotificationsScanService(
    JamaatDbContextFacade db,
    IMemberNotifier notifier,
    ILogger<MemberNotificationsScanService> logger)
{
    /// Hangfire recurring-job entrypoint. Public + parameter-less so the Hangfire client
    /// can serialize the call and the worker can invoke it via the standard activator.
    /// Disable retry-on-fail at the job level (DisableConcurrentExecution wraps it so two
    /// scans never run in parallel during a deploy with overlap).
    [DisableConcurrentExecution(timeoutInSeconds: 60)]
    public async Task ScanOnceAsync()
    {
        var ct = CancellationToken.None;
        await ScanCommitmentInstallmentsAsync(db, notifier, ct);
        await ScanEventRemindersAsync(db, notifier, ct);
    }

    private async Task ScanCommitmentInstallmentsAsync(JamaatDbContextFacade db, IMemberNotifier notifier, CancellationToken ct)
    {
        var target = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(3));
        // Pull commitments + their owning member id; filter installments client-side because
        // CommitmentInstallment is an owned collection and the LINQ projection is simpler this way.
        var commitments = await db.Commitments.AsNoTracking()
            .Include(c => c.Installments)
            .Where(c => c.Installments.Any(i => i.DueDate == target && (int)i.Status == 1)) // 1 = Pending
            .Select(c => new { c.Id, c.Code, c.MemberId, c.FundNameSnapshot, c.Currency, Installments = c.Installments.Where(i => i.DueDate == target && (int)i.Status == 1).ToList() })
            .ToListAsync(ct);

        if (commitments.Count == 0) { logger.LogDebug("No commitment installments due in 3 days"); return; }

        var sent = 0;
        foreach (var c in commitments)
        {
            if (c.MemberId is null) continue; // anonymous / family-bound commitments have no member to notify
            foreach (var inst in c.Installments)
            {
                var vars = new Dictionary<string, string>
                {
                    ["commitmentCode"]  = c.Code ?? "",
                    ["fundName"]        = c.FundNameSnapshot ?? "",
                    ["installmentNo"]   = inst.InstallmentNo.ToString(),
                    ["amount"]          = inst.ScheduledAmount.ToString("N2"),
                    ["currency"]        = c.Currency ?? "",
                    ["dueDate"]         = inst.DueDate.ToString("dd MMM yyyy"),
                };
                await notifier.NotifyAsync(c.MemberId.Value, MemberNotificationKind.CommitmentInstallmentDue, vars, ct);
                sent++;
            }
        }
        logger.LogInformation("Member notifications: queued {Count} commitment-due reminders for {Date}", sent, target);
    }

    private async Task ScanEventRemindersAsync(JamaatDbContextFacade db, IMemberNotifier notifier, CancellationToken ct)
    {
        var now    = DateTimeOffset.UtcNow;
        var window = now.AddHours(24);
        // Events starting in the next 24h (and after now). Pull confirmed registrations
        // for those events and notify each registrant.
        var registrations = await db.EventRegistrations.AsNoTracking()
            .Join(db.Events, r => r.EventId, e => e.Id, (r, e) => new { Reg = r, Evt = e })
            .Where(x => x.Evt.StartsAtUtc != null
                     && x.Evt.StartsAtUtc <= window
                     && x.Evt.StartsAtUtc > now
                     && x.Reg.MemberId != null
                     && (int)x.Reg.Status == 2) // 2 = Confirmed
            .Select(x => new
            {
                x.Reg.MemberId,
                EventTitle = x.Evt.Name,
                StartsAtUtc = x.Evt.StartsAtUtc!.Value,
                Venue = x.Evt.Place,
                x.Reg.RegistrationCode,
            })
            .ToListAsync(ct);

        if (registrations.Count == 0) { logger.LogDebug("No event registrations in the next 24h window"); return; }

        var sent = 0;
        foreach (var r in registrations)
        {
            if (r.MemberId is null) continue;
            var vars = new Dictionary<string, string>
            {
                ["eventTitle"]        = r.EventTitle ?? "",
                ["startsAt"]          = r.StartsAtUtc.ToString("dd MMM yyyy HH:mm"),
                ["venue"]             = r.Venue ?? "",
                ["registrationCode"]  = r.RegistrationCode ?? "",
            };
            await notifier.NotifyAsync(r.MemberId.Value, MemberNotificationKind.EventReminderT24h, vars, ct);
            sent++;
        }
        logger.LogInformation("Member notifications: queued {Count} event T-24h reminders", sent);
    }
}
