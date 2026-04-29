using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

/// <summary>
/// Platform-wide error log. Unlike AuditLog (which tracks mutations), this tracks
/// exceptions and surfaced errors - API unhandled exceptions, client-reported runtime
/// errors, axios failures, background job failures, etc.
///
/// Grouped via a deterministic Fingerprint (exception type + normalized message +
/// top stack frames). Triaged via Status (Reported -> Reviewed -> Resolved).
/// </summary>
public sealed class ErrorLog : Entity<long>
{
    private ErrorLog() { }

    public ErrorLog(
        Guid? tenantId,
        ErrorSource source,
        ErrorSeverity severity,
        string message,
        string? exceptionType,
        string? stackTrace,
        string? endpoint,
        string? httpMethod,
        int? httpStatus,
        string? correlationId,
        Guid? userId,
        string? userName,
        string? userRole,
        string? ipAddress,
        string? userAgent,
        string fingerprint,
        DateTimeOffset occurredAtUtc)
    {
        TenantId = tenantId;
        Source = source;
        Severity = severity;
        Status = ErrorStatus.Reported;
        Message = message;
        ExceptionType = exceptionType;
        StackTrace = stackTrace;
        Endpoint = endpoint;
        HttpMethod = httpMethod;
        HttpStatus = httpStatus;
        CorrelationId = correlationId;
        UserId = userId;
        UserName = userName;
        UserRole = userRole;
        IpAddress = ipAddress;
        UserAgent = userAgent;
        Fingerprint = fingerprint;
        OccurredAtUtc = occurredAtUtc;
    }

    public Guid? TenantId { get; private set; }
    public ErrorSource Source { get; private set; }
    public ErrorSeverity Severity { get; private set; }
    public ErrorStatus Status { get; private set; }
    public string Message { get; private set; } = default!;
    public string? ExceptionType { get; private set; }
    public string? StackTrace { get; private set; }
    public string? Endpoint { get; private set; }
    public string? HttpMethod { get; private set; }
    public int? HttpStatus { get; private set; }
    public string? CorrelationId { get; private set; }
    public Guid? UserId { get; private set; }
    public string? UserName { get; private set; }
    public string? UserRole { get; private set; }
    public string? IpAddress { get; private set; }
    public string? UserAgent { get; private set; }
    /// SHA-256 hex of (ExceptionType|normalizedMessage|top3StackFrames). Used for grouping.
    public string Fingerprint { get; private set; } = default!;
    public DateTimeOffset OccurredAtUtc { get; private set; }

    public DateTimeOffset? ReviewedAtUtc { get; private set; }
    public Guid? ReviewedByUserId { get; private set; }
    public string? ReviewedByUserName { get; private set; }

    public DateTimeOffset? ResolvedAtUtc { get; private set; }
    public Guid? ResolvedByUserId { get; private set; }
    public string? ResolvedByUserName { get; private set; }
    public string? ResolutionNote { get; private set; }

    public void MarkReviewed(Guid userId, string userName, DateTimeOffset at)
    {
        if (Status == ErrorStatus.Resolved) return;
        Status = ErrorStatus.Reviewed;
        ReviewedAtUtc = at;
        ReviewedByUserId = userId;
        ReviewedByUserName = userName;
    }

    public void MarkResolved(Guid userId, string userName, DateTimeOffset at, string? note)
    {
        Status = ErrorStatus.Resolved;
        ResolvedAtUtc = at;
        ResolvedByUserId = userId;
        ResolvedByUserName = userName;
        ResolutionNote = note;
        if (ReviewedAtUtc is null)
        {
            ReviewedAtUtc = at;
            ReviewedByUserId = userId;
            ReviewedByUserName = userName;
        }
    }

    public void Ignore(Guid userId, string userName, DateTimeOffset at)
    {
        Status = ErrorStatus.Ignored;
        ResolvedAtUtc = at;
        ResolvedByUserId = userId;
        ResolvedByUserName = userName;
    }
}
