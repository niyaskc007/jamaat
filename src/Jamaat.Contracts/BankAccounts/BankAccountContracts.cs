namespace Jamaat.Contracts.BankAccounts;

public sealed record BankAccountDto(
    Guid Id,
    string Name,
    string BankName,
    string AccountNumber,
    string? Branch,
    string? Ifsc,
    string? SwiftCode,
    string Currency,
    Guid? AccountingAccountId,
    string? AccountingAccountName,
    bool IsActive);

public sealed record CreateBankAccountDto(
    string Name,
    string BankName,
    string AccountNumber,
    string? Branch,
    string? Ifsc,
    string? SwiftCode,
    string Currency,
    Guid? AccountingAccountId);

public sealed record UpdateBankAccountDto(
    string Name,
    string BankName,
    string AccountNumber,
    string? Branch,
    string? Ifsc,
    string? SwiftCode,
    string Currency,
    Guid? AccountingAccountId,
    bool IsActive);

public sealed record BankAccountListQuery(
    int Page = 1, int PageSize = 25, string? SortBy = null, string? SortDir = null,
    string? Search = null, bool? Active = null);
