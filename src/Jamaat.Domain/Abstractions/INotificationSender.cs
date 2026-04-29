using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Abstractions;

/// <summary>
/// Pluggable notification delivery. Application services call SendAsync with a fully-rendered
/// message; the implementation decides whether to email, SMS, log-only, etc. and writes the
/// outcome to NotificationLog. Failures must NOT throw - notification work is fire-and-forget
/// in the calling transaction so a flaky SMTP can never block a receipt confirmation.
/// </summary>
public interface INotificationSender
{
    Task SendAsync(NotificationMessage message, CancellationToken ct = default);
}

/// <summary>The fully-rendered notification payload. Subject + body are pre-formatted by the
/// caller (with TransactionLabel substitution etc); the sender just delivers it.</summary>
public sealed record NotificationMessage(
    NotificationKind Kind,
    string Subject,
    string Body,
    string? RecipientEmail,
    Guid? RecipientUserId,
    Guid? SourceId,
    string? SourceReference);
