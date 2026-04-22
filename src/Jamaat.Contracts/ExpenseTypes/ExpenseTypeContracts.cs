namespace Jamaat.Contracts.ExpenseTypes;

public sealed record ExpenseTypeDto(
    Guid Id, string Code, string Name, string? Description,
    Guid? DebitAccountId, string? DebitAccountName,
    bool RequiresApproval, decimal? ApprovalThreshold, bool IsActive);

public sealed record CreateExpenseTypeDto(
    string Code, string Name, string? Description,
    Guid? DebitAccountId, bool RequiresApproval, decimal? ApprovalThreshold);

public sealed record UpdateExpenseTypeDto(
    string Name, string? Description,
    Guid? DebitAccountId, bool RequiresApproval, decimal? ApprovalThreshold, bool IsActive);

public sealed record ExpenseTypeListQuery(
    int Page = 1, int PageSize = 25, string? SortBy = null, string? SortDir = null,
    string? Search = null, bool? Active = null);
