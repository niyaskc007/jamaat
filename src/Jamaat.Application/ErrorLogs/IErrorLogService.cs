using Jamaat.Application.Common;
using Jamaat.Contracts.ErrorLogs;
using Jamaat.Domain.Common;

namespace Jamaat.Application.ErrorLogs;

public interface IErrorLogService
{
    Task<PagedResult<ErrorLogDto>> ListAsync(ErrorLogListQuery query, CancellationToken ct = default);
    Task<Result<ErrorLogDto>> GetAsync(long id, CancellationToken ct = default);
    Task<ErrorLogStatsDto> StatsAsync(CancellationToken ct = default);
    Task<Result> MarkReviewedAsync(long id, CancellationToken ct = default);
    Task<Result> MarkResolvedAsync(long id, ResolveErrorLogDto dto, CancellationToken ct = default);
    Task<Result> IgnoreAsync(long id, CancellationToken ct = default);
    Task<long> RecordAsync(RecordErrorRequest request, CancellationToken ct = default);
}

/// Internal contract for writers (middleware, client error endpoint, background jobs).
public sealed record RecordErrorRequest(
    Jamaat.Domain.Enums.ErrorSource Source,
    Jamaat.Domain.Enums.ErrorSeverity Severity,
    string Message,
    string? ExceptionType,
    string? StackTrace,
    string? Endpoint,
    string? HttpMethod,
    int? HttpStatus,
    string? CorrelationId,
    string? UserAgent,
    string? IpAddress);
