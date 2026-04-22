using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.Accounts;

public sealed record AccountDto(
    Guid Id,
    string Code,
    string Name,
    AccountType Type,
    Guid? ParentId,
    string? ParentCode,
    bool IsControl,
    bool IsActive);

public sealed record AccountTreeNodeDto(
    Guid Id,
    string Code,
    string Name,
    AccountType Type,
    Guid? ParentId,
    bool IsControl,
    bool IsActive,
    List<AccountTreeNodeDto> Children);

public sealed record CreateAccountDto(
    string Code,
    string Name,
    AccountType Type,
    Guid? ParentId,
    bool IsControl);

public sealed record UpdateAccountDto(
    string Code,
    string Name,
    AccountType Type,
    Guid? ParentId,
    bool IsControl,
    bool IsActive);

public sealed record AccountListQuery(
    int Page = 1, int PageSize = 100, string? SortBy = null, string? SortDir = null,
    string? Search = null, AccountType? Type = null, bool? Active = null);
