namespace Jamaat.Contracts.QarzanHasana;

public sealed record QhSchemeDto(
    Guid Id,
    string Code,
    string Name,
    string? Description,
    Guid? ParentSchemeId,
    string? ParentSchemeName,
    bool RequiresGoldCollateral,
    int SortOrder,
    bool IsActive,
    int LegacySchemeValue);

public sealed record CreateQhSchemeDto(
    string Code,
    string Name,
    string? Description,
    Guid? ParentSchemeId,
    bool RequiresGoldCollateral,
    int SortOrder,
    int LegacySchemeValue = 0);

public sealed record UpdateQhSchemeDto(
    string Name,
    string? Description,
    Guid? ParentSchemeId,
    bool RequiresGoldCollateral,
    int SortOrder,
    bool IsActive,
    int LegacySchemeValue);
