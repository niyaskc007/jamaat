namespace Jamaat.Contracts.Members;

/// Body for the public POST /api/v1/portal/register endpoint.
public sealed record SubmitMemberApplicationDto(
    string FullName,
    string ItsNumber,
    string? Email,
    string? PhoneE164,
    string? Notes);

public sealed record MemberApplicationDto(
    Guid Id,
    Guid TenantId,
    string FullName,
    string ItsNumber,
    string? Email,
    string? PhoneE164,
    string? Notes,
    int Status,
    string? IpAddress,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? ReviewedAtUtc,
    string? ReviewedByUserName,
    string? ReviewerNote,
    Guid? CreatedUserId,
    Guid? LinkedMemberId);

public sealed record MemberApplicationListQuery(
    int Page = 1, int PageSize = 25, int? Status = null, string? Search = null);

public sealed record ReviewMemberApplicationDto(string? Note);

/// Response shape for the public submit. Returns a tracking id and a friendly status the
/// SPA can show on its "thanks for applying" screen. Never echoes back internal ids.
public sealed record MemberApplicationReceiptDto(
    Guid ApplicationId,
    DateTimeOffset SubmittedAtUtc,
    string Message);
