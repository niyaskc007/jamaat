using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.FundCategories;

public sealed record FundCategoryDto(
    Guid Id, string Code, string Name, FundCategoryKind Kind,
    string? Description, int SortOrder, bool IsActive,
    int FundTypeCount, int SubCategoryCount,
    DateTimeOffset CreatedAtUtc);

public sealed record CreateFundCategoryDto(string Code, string Name, FundCategoryKind Kind, string? Description, int SortOrder = 0);
public sealed record UpdateFundCategoryDto(string Name, FundCategoryKind Kind, string? Description, int SortOrder, bool IsActive);

public sealed record FundSubCategoryDto(
    Guid Id, Guid FundCategoryId, string FundCategoryCode, string FundCategoryName,
    string Code, string Name, string? Description, int SortOrder, bool IsActive,
    int FundTypeCount,
    DateTimeOffset CreatedAtUtc);

public sealed record CreateFundSubCategoryDto(Guid FundCategoryId, string Code, string Name, string? Description, int SortOrder = 0);
public sealed record UpdateFundSubCategoryDto(Guid FundCategoryId, string Name, string? Description, int SortOrder, bool IsActive);
