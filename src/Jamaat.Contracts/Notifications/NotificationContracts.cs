using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.Notifications;

public sealed record NotificationLogDto(
    long Id,
    NotificationKind Kind,
    NotificationChannel Channel,
    NotificationStatus Status,
    string Subject,
    string Body,
    string? Recipient,
    Guid? SourceId,
    string? SourceReference,
    string? FailureReason,
    DateTimeOffset AttemptedAtUtc);

public sealed record NotificationLogQuery(
    int Page = 1, int PageSize = 50,
    NotificationKind? Kind = null,
    NotificationStatus? Status = null,
    NotificationChannel? Channel = null,
    DateOnly? FromDate = null,
    DateOnly? ToDate = null,
    string? Search = null);
