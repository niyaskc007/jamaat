using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.FundTypes;

public sealed record FundTypeDto(
    Guid Id,
    string Code,
    string NameEnglish,
    string? NameArabic,
    string? NameHindi,
    string? NameUrdu,
    string? Description,
    bool IsActive,
    bool RequiresItsNumber,
    bool RequiresPeriodReference,
    FundCategory Category,
    bool IsLoan,
    int AllowedPaymentModes,
    Guid? CreditAccountId,
    string? CreditAccountName,
    Guid? DefaultTemplateId,
    string? RulesJson,
    DateTimeOffset CreatedAtUtc);

public sealed record CreateFundTypeDto(
    string Code,
    string NameEnglish,
    string? NameArabic,
    string? NameHindi,
    string? NameUrdu,
    string? Description,
    bool RequiresItsNumber,
    bool RequiresPeriodReference,
    PaymentMode AllowedPaymentModes,
    Guid? CreditAccountId,
    string? RulesJson,
    FundCategory Category = FundCategory.Donation);

public sealed record UpdateFundTypeDto(
    string NameEnglish,
    string? NameArabic,
    string? NameHindi,
    string? NameUrdu,
    string? Description,
    bool RequiresItsNumber,
    bool RequiresPeriodReference,
    PaymentMode AllowedPaymentModes,
    Guid? CreditAccountId,
    string? RulesJson,
    bool IsActive,
    FundCategory Category = FundCategory.Donation);

public sealed record FundTypeListQuery(
    int Page = 1, int PageSize = 25, string? SortBy = null, string? SortDir = null,
    string? Search = null, bool? Active = null, FundCategory? Category = null);
