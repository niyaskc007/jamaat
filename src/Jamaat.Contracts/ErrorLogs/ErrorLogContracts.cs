using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.ErrorLogs;

public sealed record ErrorLogDto(
    long Id,
    Guid? TenantId,
    ErrorSource Source,
    ErrorSeverity Severity,
    ErrorStatus Status,
    string Message,
    string? ExceptionType,
    string? StackTrace,
    string? Endpoint,
    string? HttpMethod,
    int? HttpStatus,
    string? CorrelationId,
    Guid? UserId,
    string? UserName,
    string? UserRole,
    string? IpAddress,
    string? UserAgent,
    string Fingerprint,
    DateTimeOffset OccurredAtUtc,
    DateTimeOffset? ReviewedAtUtc,
    string? ReviewedByUserName,
    DateTimeOffset? ResolvedAtUtc,
    string? ResolvedByUserName,
    string? ResolutionNote);

public sealed record ErrorLogListQuery(
    int Page = 1,
    int PageSize = 25,
    string? SortBy = null,
    string? SortDir = null,
    string? Search = null,
    ErrorSource? Source = null,
    ErrorSeverity? Severity = null,
    ErrorStatus? Status = null,
    DateTimeOffset? FromUtc = null,
    DateTimeOffset? ToUtc = null,
    bool GroupSimilar = false);

public sealed record ErrorLogStatsDto(
    int Today,
    int Last7Days,
    int Total,
    int Open,
    int Reviewed,
    int Resolved);

public sealed record ReportClientErrorDto(
    ErrorSeverity Severity,
    string Message,
    string? ExceptionType,
    string? StackTrace,
    string? Endpoint,
    string? HttpMethod,
    int? HttpStatus,
    string? CorrelationId,
    string? UserAgent);

public sealed record ResolveErrorLogDto(string? Note);
