using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.FundTypes;

public sealed record FundTypeCustomFieldDto(
    Guid Id, Guid FundTypeId,
    string FieldKey, string Label, string? HelpText,
    CustomFieldType FieldType, bool IsRequired,
    string? OptionsCsv, string? DefaultValue,
    int SortOrder, bool IsActive,
    DateTimeOffset CreatedAtUtc);

public sealed record CreateFundTypeCustomFieldDto(
    Guid FundTypeId, string FieldKey, string Label,
    CustomFieldType FieldType, bool IsRequired = false,
    string? HelpText = null, string? OptionsCsv = null, string? DefaultValue = null,
    int SortOrder = 0);

public sealed record UpdateFundTypeCustomFieldDto(
    string Label, CustomFieldType FieldType, bool IsRequired,
    string? HelpText, string? OptionsCsv, string? DefaultValue,
    int SortOrder, bool IsActive);
