using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.Members;

public sealed record MemberDto(
    Guid Id,
    string ItsNumber,
    string FullName,
    string? FullNameArabic,
    string? FullNameHindi,
    string? FullNameUrdu,
    Guid? FamilyId,
    string? Phone,
    string? Email,
    string? Address,
    MemberStatus Status,
    string? ExternalUserId,
    DateTimeOffset? LastSyncedAtUtc,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? UpdatedAtUtc,
    VerificationStatus DataVerificationStatus = VerificationStatus.NotStarted,
    DateOnly? DataVerifiedOn = null);

public sealed record CreateMemberDto(
    string ItsNumber,
    string FullName,
    string? FullNameArabic,
    string? FullNameHindi,
    string? FullNameUrdu,
    Guid? FamilyId,
    string? Phone,
    string? Email,
    string? Address);

public sealed record UpdateMemberDto(
    string FullName,
    string? FullNameArabic,
    string? FullNameHindi,
    string? FullNameUrdu,
    Guid? FamilyId,
    string? Phone,
    string? Email,
    string? Address,
    MemberStatus Status);

public sealed record MemberListQuery(
    int Page = 1,
    int PageSize = 25,
    string? SortBy = null,
    string? SortDir = null,
    string? Search = null,
    MemberStatus? Status = null,
    VerificationStatus? DataVerificationStatus = null);
