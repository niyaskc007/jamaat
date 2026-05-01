using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.Families;

public sealed record FamilyDto(
    Guid Id, string Code, string FamilyName,
    Guid? HeadMemberId, string? HeadItsNumber, string? HeadName,
    string? ContactPhone, string? ContactEmail, string? Address, string? Notes,
    bool IsActive, int MemberCount, DateTimeOffset CreatedAtUtc);

public sealed record FamilyMemberDto(
    Guid Id, string ItsNumber, string FullName, FamilyRole? FamilyRole, bool IsHead);

/// <summary>An extended-kinship link to a member who lives in a different household. Carries
/// the linked member's primary household details so the UI can render "Saifee Husaini · Lives
/// in F-002" with a click-through to that family.</summary>
public sealed record FamilyExtendedLinkDto(
    Guid LinkId,
    Guid MemberId,
    string ItsNumber,
    string FullName,
    FamilyRole Role,
    Guid? CurrentFamilyId,
    string? CurrentFamilyCode,
    string? CurrentFamilyName);

public sealed record FamilyDetailDto(
    FamilyDto Family,
    IReadOnlyList<FamilyMemberDto> Members,
    IReadOnlyList<FamilyExtendedLinkDto> ExtendedLinks);

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

/// <summary>Add a member to a family. When <see cref="LinkOnly"/> is false (default) the
/// member is moved into this household (their <c>FamilyId</c> changes to this family). When
/// true, an extended-kinship link row is created instead and the member's primary household
/// stays put - lets the operator capture "this is the uncle of Family X" without yanking the
/// uncle out of his own home.</summary>
public sealed record AssignMemberToFamilyDto(
    Guid MemberId, FamilyRole Role, bool LinkOnly = false);

public sealed record TransferHeadshipDto(Guid NewHeadMemberId);

public sealed record FamilyListQuery(
    int Page = 1, int PageSize = 25, string? Search = null, bool? Active = null);

/// <summary>Spin a member out of an existing family into a brand-new household. Used when a
/// son marries and starts his own home, a divorced/widowed member moves out, etc. The
/// member's parent ITS pointers are preserved so the extended-tree view still threads the
/// new household back to the source family. Optionally also moves a spouse with them and
/// stamps the mutual SpouseItsNumber link if either side is missing it.</summary>
public sealed record SpinOffFamilyDto(
    Guid NewHeadMemberId,
    string FamilyName,
    Guid? SpouseMemberId = null,
    string? ContactPhone = null,
    string? ContactEmail = null,
    string? Address = null,
    string? Notes = null);

/// <summary>One person in the extended family tree. The recursion sits in
/// <see cref="Descendants"/>; <see cref="CurrentFamilyId"/> is non-null when this person has
/// moved to a different household, allowing the UI to render a "lives in F-002" tag and
/// link to that family without losing the lineage edge.
/// <para>
/// <see cref="SpouseName"/> + <see cref="SpouseItsNumber"/> are populated when the person has
/// a known partner, even if that partner isn't in this family - lets the UI render an inline
/// "❤ Wife's name" badge on a descendant card without forcing a full sub-tree expansion.
/// </para></summary>
public sealed record FamilyTreePersonDto(
    Guid MemberId,
    string ItsNumber,
    string FullName,
    string Relation,
    Guid? CurrentFamilyId,
    string? CurrentFamilyCode,
    string? CurrentFamilyName,
    bool IsInThisFamily,
    IReadOnlyList<FamilyTreePersonDto> Descendants,
    string? SpouseItsNumber = null,
    string? SpouseName = null);

/// <summary>Extended family tree rooted at a household's head. Walks parents up via the
/// head's ITS pointers, walks descendants down by reverse-resolving every member whose
/// FatherItsNumber/MotherItsNumber matches an ancestor in the chain. Crosses household
/// boundaries: a grand-daughter who lives in her parents' spun-off home still appears here.</summary>
public sealed record FamilyExtendedTreeDto(
    Guid FamilyId,
    string FamilyCode,
    string FamilyName,
    FamilyTreePersonDto? Father,
    FamilyTreePersonDto? Mother,
    FamilyTreePersonDto? Head,
    FamilyTreePersonDto? Spouse);
