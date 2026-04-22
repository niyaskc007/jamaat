using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.NumberingSeries;

public sealed record NumberingSeriesDto(
    Guid Id,
    NumberingScope Scope,
    string Name,
    Guid? FundTypeId,
    string? FundTypeName,
    string Prefix,
    int PadLength,
    bool YearReset,
    long CurrentValue,
    int CurrentYear,
    bool IsActive,
    string Preview);

public sealed record CreateNumberingSeriesDto(
    NumberingScope Scope,
    string Name,
    Guid? FundTypeId,
    string Prefix,
    int PadLength,
    bool YearReset);

public sealed record UpdateNumberingSeriesDto(
    string Name,
    string Prefix,
    int PadLength,
    bool YearReset,
    bool IsActive);

public sealed record NumberingSeriesListQuery(
    int Page = 1, int PageSize = 25, string? SortBy = null, string? SortDir = null,
    string? Search = null, NumberingScope? Scope = null, bool? Active = null);
