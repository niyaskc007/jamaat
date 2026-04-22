using Jamaat.Application.Common;
using Jamaat.Contracts.ErrorLogs;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;

namespace Jamaat.Application.ErrorLogs;

public sealed class ErrorLogService : IErrorLogService
{
    private readonly IErrorLogRepository _repo;
    private readonly IUnitOfWork _uow;
    private readonly ITenantContext _tenant;
    private readonly ICurrentUser _currentUser;
    private readonly IClock _clock;

    public ErrorLogService(
        IErrorLogRepository repo,
        IUnitOfWork uow,
        ITenantContext tenant,
        ICurrentUser currentUser,
        IClock clock)
    {
        _repo = repo;
        _uow = uow;
        _tenant = tenant;
        _currentUser = currentUser;
        _clock = clock;
    }

    public Task<PagedResult<ErrorLogDto>> ListAsync(ErrorLogListQuery query, CancellationToken ct = default) =>
        _repo.ListAsync(query, ct);

    public async Task<Result<ErrorLogDto>> GetAsync(long id, CancellationToken ct = default)
    {
        var entity = await _repo.GetByIdAsync(id, ct);
        if (entity is null) return Error.NotFound("errorlog.not_found", "Error log entry not found.");
        return Map(entity);
    }

    public Task<ErrorLogStatsDto> StatsAsync(CancellationToken ct = default) => _repo.StatsAsync(ct);

    public async Task<Result> MarkReviewedAsync(long id, CancellationToken ct = default)
    {
        var entity = await _repo.GetByIdAsync(id, ct);
        if (entity is null) return Result.Failure(Error.NotFound("errorlog.not_found", "Not found."));
        entity.MarkReviewed(_currentUser.UserId ?? Guid.Empty, _currentUser.UserName ?? "system", _clock.UtcNow);
        _repo.Update(entity);
        await _uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<Result> MarkResolvedAsync(long id, ResolveErrorLogDto dto, CancellationToken ct = default)
    {
        var entity = await _repo.GetByIdAsync(id, ct);
        if (entity is null) return Result.Failure(Error.NotFound("errorlog.not_found", "Not found."));
        entity.MarkResolved(_currentUser.UserId ?? Guid.Empty, _currentUser.UserName ?? "system", _clock.UtcNow, dto.Note);
        _repo.Update(entity);
        await _uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<Result> IgnoreAsync(long id, CancellationToken ct = default)
    {
        var entity = await _repo.GetByIdAsync(id, ct);
        if (entity is null) return Result.Failure(Error.NotFound("errorlog.not_found", "Not found."));
        entity.Ignore(_currentUser.UserId ?? Guid.Empty, _currentUser.UserName ?? "system", _clock.UtcNow);
        _repo.Update(entity);
        await _uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<long> RecordAsync(RecordErrorRequest request, CancellationToken ct = default)
    {
        var fingerprint = Fingerprinter.Compute(request.ExceptionType, request.Message, request.StackTrace);
        var entity = new ErrorLog(
            tenantId: _tenant.IsResolved ? _tenant.TenantId : null,
            source: request.Source,
            severity: request.Severity,
            message: Truncate(request.Message, 2000),
            exceptionType: request.ExceptionType,
            stackTrace: request.StackTrace,
            endpoint: Truncate(request.Endpoint, 500),
            httpMethod: request.HttpMethod,
            httpStatus: request.HttpStatus,
            correlationId: request.CorrelationId,
            userId: _currentUser.UserId,
            userName: _currentUser.UserName,
            userRole: null,
            ipAddress: request.IpAddress,
            userAgent: Truncate(request.UserAgent, 500),
            fingerprint: fingerprint,
            occurredAtUtc: _clock.UtcNow);

        await _repo.AddAsync(entity, ct);
        await _uow.SaveChangesAsync(ct);
        return entity.Id;
    }

    private static string Truncate(string? value, int max) =>
        string.IsNullOrEmpty(value) ? string.Empty : value.Length <= max ? value : value[..max];

    internal static ErrorLogDto Map(ErrorLog e) => new(
        e.Id,
        e.TenantId,
        e.Source,
        e.Severity,
        e.Status,
        e.Message,
        e.ExceptionType,
        e.StackTrace,
        e.Endpoint,
        e.HttpMethod,
        e.HttpStatus,
        e.CorrelationId,
        e.UserId,
        e.UserName,
        e.UserRole,
        e.IpAddress,
        e.UserAgent,
        e.Fingerprint,
        e.OccurredAtUtc,
        e.ReviewedAtUtc,
        e.ReviewedByUserName,
        e.ResolvedAtUtc,
        e.ResolvedByUserName,
        e.ResolutionNote);
}

public interface IErrorLogRepository
{
    Task<ErrorLog?> GetByIdAsync(long id, CancellationToken ct = default);
    Task<PagedResult<ErrorLogDto>> ListAsync(ErrorLogListQuery query, CancellationToken ct = default);
    Task<ErrorLogStatsDto> StatsAsync(CancellationToken ct = default);
    Task AddAsync(ErrorLog entity, CancellationToken ct = default);
    void Update(ErrorLog entity);
}
