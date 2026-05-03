namespace Jamaat.Domain.Enums;

/// <summary>The kind of event that triggered a notification. Drives which template gets
/// rendered + which TransactionLabelType is consulted for the subject line.</summary>
public enum NotificationKind
{
    /// <summary>A receipt was confirmed - notify the contributor that we got their money.</summary>
    ReceiptConfirmed = 1,
    /// <summary>A receipt is sitting in Draft awaiting approval - notify approvers.</summary>
    ReceiptPendingApproval = 2,
    /// <summary>A voucher is sitting in PendingApproval - notify approvers.</summary>
    VoucherPendingApproval = 3,
    /// <summary>A returnable contribution was returned - notify the contributor.</summary>
    ContributionReturned = 4,
    /// <summary>A QH loan was disbursed - notify the borrower.</summary>
    QhLoanDisbursed = 5,
    /// <summary>A new self-service login was enabled for a member - send their welcome
    /// message with their temporary password and the portal URL.</summary>
    UserWelcome = 6,
    /// <summary>An admin re-issued a temporary password - notify the user that their old
    /// temp pw is no longer valid and share the new one.</summary>
    TempPasswordIssued = 7,
    /// <summary>System-level operational alert raised by the SuperAdmin alert evaluator.
    /// Subject + body are pre-formatted by the evaluator; recipients are SuperAdmin role
    /// members (or the explicit list in Alerts:Recipients).</summary>
    SystemAlert = 8,
}

/// <summary>How the notification was delivered (or attempted). Multiple channels can be
/// added later (SMS, push, in-app); start with email + the audit-only "log" channel.</summary>
public enum NotificationChannel
{
    /// <summary>No outbound delivery - written to NotificationLog only. Default when no SMTP
    /// is configured, so the audit trail is captured even before a real transport is wired.</summary>
    LogOnly = 1,
    Email = 2,
    /// <summary>Sent through the active SMS provider (Twilio / Unifonic / Infobip / Plivo).</summary>
    Sms = 3,
    /// <summary>Sent through the active WhatsApp provider (Twilio Business API).</summary>
    WhatsApp = 4,
}

/// <summary>Outcome of an attempt. Logged so admins can see the failure rate at a glance.</summary>
public enum NotificationStatus
{
    /// <summary>Successfully handed off to the channel (queued by SMTP, etc.).</summary>
    Sent = 1,
    /// <summary>Channel failed - e.g. SMTP returned an error, or the recipient had no email
    /// on file. The detail is in NotificationLog.FailureReason.</summary>
    Failed = 2,
    /// <summary>Skipped intentionally - typically because no recipient address was on file.
    /// Distinct from Failed so dashboards don't alert on missing-email-not-an-error cases.</summary>
    Skipped = 3,
}
