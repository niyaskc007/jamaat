using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.TransactionLabels;

public sealed record TransactionLabelDto(
    Guid Id,
    Guid? FundTypeId, string? FundTypeCode, string? FundTypeName,
    TransactionLabelType LabelType,
    string Label, string? Notes, bool IsActive,
    DateTimeOffset CreatedAtUtc);

public sealed record CreateTransactionLabelDto(
    Guid? FundTypeId, TransactionLabelType LabelType, string Label, string? Notes = null);

public sealed record UpdateTransactionLabelDto(string Label, string? Notes, bool IsActive);
