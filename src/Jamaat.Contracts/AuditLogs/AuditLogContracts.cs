namespace Jamaat.Contracts.AuditLogs;

public sealed record AuditLogDto(
    long Id, Guid? TenantId, Guid? UserId, string UserName, string CorrelationId,
    string Action, string EntityName, string EntityId, string? Screen,
    string? BeforeJson, string? AfterJson,
    string? IpAddress, string? UserAgent, DateTimeOffset AtUtc);

public sealed record AuditLogListQuery(
    int Page = 1, int PageSize = 50, string? Search = null,
    string? EntityName = null, string? Action = null, Guid? UserId = null,
    DateTimeOffset? FromUtc = null, DateTimeOffset? ToUtc = null);
