namespace Jamaat.Domain.Entities;

/// <summary>
/// Append-only record of a system-level alert that was raised by the alert evaluator. Distinct
/// from ErrorLog (which tracks exceptions) and AuditLog (which tracks domain mutations) -
/// SystemAlert is the operations log: "we noticed X, we paged Y, here's when".
///
/// Not tenant-scoped. Alerts are about the whole install (the box, the database, the queue),
/// not about a particular jamaat. SuperAdmin sees them all.
/// </summary>
public sealed class SystemAlert
{
    public long Id { get; private set; }

    /// <summary>Stable identifier for the rule that fired (e.g. "high.failed.logins",
    /// "drive.full.C", "queue.dropping"). Used for de-duplication: if the same fingerprint
    /// fires within the cooldown window we update LastSeenAtUtc + bump RepeatCount instead
    /// of inserting a new row + sending another email. Keeps the alerts table compact and
    /// the SuperAdmin's inbox sane.</summary>
    public string Fingerprint { get; private set; } = string.Empty;

    /// <summary>Coarse rule type, surfaced as a chip on the UI.</summary>
    public string Kind { get; private set; } = string.Empty;

    /// <summary>"Critical" / "Warning" / "Info". Drives icon + colour on the UI and the
    /// "[CRITICAL]"-style prefix in the email subject.</summary>
    public string Severity { get; private set; } = string.Empty;

    /// <summary>Single-line headline (~80 chars). Email subject + UI table headline.</summary>
    public string Title { get; private set; } = string.Empty;

    /// <summary>Multi-line detail. Email body + UI tooltip.</summary>
    public string Detail { get; private set; } = string.Empty;

    public DateTimeOffset FirstSeenAtUtc { get; private set; }
    public DateTimeOffset LastSeenAtUtc { get; private set; }
    public int RepeatCount { get; private set; }

    /// <summary>How many recipients we attempted to notify on the most recent fire. Useful
    /// for spotting "we raised an alert but nobody got the email" misconfigurations.</summary>
    public int RecipientCount { get; private set; }

    /// <summary>True once a SuperAdmin marks it acknowledged from the UI. Acknowledged alerts
    /// are deprioritised but not deleted - the audit trail stays intact.</summary>
    public bool Acknowledged { get; private set; }
    public DateTimeOffset? AcknowledgedAtUtc { get; private set; }
    public Guid? AcknowledgedByUserId { get; private set; }

    private SystemAlert() { }

    public static SystemAlert Open(string fingerprint, string kind, string severity,
        string title, string detail, int recipientCount, DateTimeOffset at) => new()
    {
        Fingerprint = Cap(fingerprint, 128),
        Kind = Cap(kind, 64),
        Severity = Cap(severity, 16),
        Title = Cap(title, 256),
        Detail = Cap(detail, 4000),
        FirstSeenAtUtc = at,
        LastSeenAtUtc = at,
        RepeatCount = 1,
        RecipientCount = recipientCount,
    };

    /// <summary>Bumps an existing alert: updates the title/detail (rule may have refined the
    /// numbers), updates LastSeenAtUtc, increments RepeatCount.</summary>
    public void Repeat(string title, string detail, int recipientCount, DateTimeOffset at)
    {
        Title = Cap(title, 256);
        Detail = Cap(detail, 4000);
        LastSeenAtUtc = at;
        RepeatCount++;
        RecipientCount = recipientCount;
        // A repeat re-opens the alert from the operator's perspective - they need to look again.
        Acknowledged = false;
        AcknowledgedAtUtc = null;
        AcknowledgedByUserId = null;
    }

    public void Acknowledge(Guid userId, DateTimeOffset at)
    {
        Acknowledged = true;
        AcknowledgedAtUtc = at;
        AcknowledgedByUserId = userId;
    }

    private static string Cap(string s, int max) =>
        string.IsNullOrEmpty(s) ? string.Empty : (s.Length <= max ? s : s[..max]);
}
