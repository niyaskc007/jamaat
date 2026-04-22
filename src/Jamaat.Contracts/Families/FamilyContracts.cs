using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.Families;

public sealed record FamilyDto(
    Guid Id, string Code, string FamilyName,
    Guid? HeadMemberId, string? HeadItsNumber, string? HeadName,
    string? ContactPhone, string? ContactEmail, string? Address, string? Notes,
    bool IsActive, int MemberCount, DateTimeOffset CreatedAtUtc);

public sealed record FamilyMemberDto(
    Guid Id, string ItsNumber, string FullName, FamilyRole? FamilyRole, bool IsHead);

public sealed record FamilyDetailDto(
    FamilyDto Family,
    IReadOnlyList<FamilyMemberDto> Members);

public sealed record CreateFamilyDto(
    string FamilyName,
    Guid HeadMemberId,
    string? ContactPhone = null,
    string? ContactEmail = null,
    string? Address = null,
    string? Notes = null);

public sealed record UpdateFamilyDto(
    string FamilyName,
    string? ContactPhone,
    string? ContactEmail,
    string? Address,
    string? Notes,
    bool IsActive);

public sealed record AssignMemberToFamilyDto(
    Guid MemberId, FamilyRole Role);

public sealed record TransferHeadshipDto(Guid NewHeadMemberId);

public sealed record FamilyListQuery(
    int Page = 1, int PageSize = 25, string? Search = null, bool? Active = null);
