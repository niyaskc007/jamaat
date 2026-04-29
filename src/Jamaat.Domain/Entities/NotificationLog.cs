using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

/// <summary>
/// One row per notification attempted by the system. Captures the rendered subject + body,
/// recipient, channel, outcome, and a back-link to the source aggregate (Receipt/Voucher/QH).
/// Even when no real transport is configured, every notification is written here so an admin
/// can audit "did the system actually try to tell the contributor?".
/// </summary>
public sealed class NotificationLog : Entity<long>, ITenantScoped
{
    private NotificationLog() { }

    public NotificationLog(
        Guid tenantId,
        NotificationKind kind,
        NotificationChannel channel,
        NotificationStatus status,
        string subject,
        string body,
        string? recipient,
        Guid? recipientUserId,
        Guid? sourceId,
        string? sourceReference,
        string? failureReason,
        DateTimeOffset attemptedAtUtc)
    {
        TenantId = tenantId;
        Kind = kind;
        Channel = channel;
        Status = status;
        Subject = subject;
        Body = body;
        Recipient = recipient;
        RecipientUserId = recipientUserId;
        SourceId = sourceId;
        SourceReference = sourceReference;
        FailureReason = failureReason;
        AttemptedAtUtc = attemptedAtUtc;
    }

    public Guid TenantId { get; private set; }
    public NotificationKind Kind { get; private set; }
    public NotificationChannel Channel { get; private set; }
    public NotificationStatus Status { get; private set; }
    public string Subject { get; private set; } = default!;
    public string Body { get; private set; } = default!;
    /// <summary>Email address (or future SMS/push handle). Null when Status=Skipped because
    /// the source aggregate had no recipient on file.</summary>
    public string? Recipient { get; private set; }
    public Guid? RecipientUserId { get; private set; }
    /// <summary>Foreign-id back to the triggering aggregate (Receipt.Id / Voucher.Id / QarzanHasanaLoan.Id).
    /// Stored loosely as Guid? without an FK so deleting the source doesn't cascade-clear
    /// the audit trail.</summary>
    public Guid? SourceId { get; private set; }
    public string? SourceReference { get; private set; }
    public string? FailureReason { get; private set; }
    public DateTimeOffset AttemptedAtUtc { get; private set; }
}
