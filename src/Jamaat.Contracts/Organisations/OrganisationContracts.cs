namespace Jamaat.Contracts.Organisations;

public sealed record OrganisationDto(
    Guid Id, string Code, string Name, string? NameArabic, string? Category,
    string? Notes, bool IsActive, int MemberCount, DateTimeOffset CreatedAtUtc);

public sealed record CreateOrganisationDto(string Code, string Name, string? NameArabic = null, string? Category = null, string? Notes = null);
public sealed record UpdateOrganisationDto(string Name, string? NameArabic, string? Category, string? Notes, bool IsActive);
public sealed record OrganisationListQuery(int Page = 1, int PageSize = 50, string? Search = null, string? Category = null, bool? Active = null);

public sealed record MemberOrgMembershipDto(
    Guid Id, Guid MemberId, string MemberItsNumber, string MemberName,
    Guid OrganisationId, string OrganisationCode, string OrganisationName,
    string Role, DateOnly? StartDate, DateOnly? EndDate, bool IsActive, string? Notes, DateTimeOffset CreatedAtUtc);

public sealed record CreateMembershipDto(Guid MemberId, Guid OrganisationId, string Role, DateOnly? StartDate = null, DateOnly? EndDate = null, string? Notes = null);
public sealed record UpdateMembershipDto(string Role, DateOnly? StartDate, DateOnly? EndDate, string? Notes, bool IsActive);
public sealed record MembershipListQuery(int Page = 1, int PageSize = 50, Guid? MemberId = null, Guid? OrganisationId = null, bool? Active = null);
