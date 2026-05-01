using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.Vouchers;

public sealed record VoucherDto(
    Guid Id,
    string? VoucherNumber,
    DateOnly VoucherDate,
    string PayTo,
    string? PayeeItsNumber,
    string Purpose,
    decimal AmountTotal,
    string Currency,
    decimal FxRate,
    string BaseCurrency,
    decimal BaseAmountTotal,
    PaymentMode PaymentMode,
    string? ChequeNumber,
    DateOnly? ChequeDate,
    string? DrawnOnBank,
    Guid? BankAccountId,
    string? BankAccountName,
    DateOnly? PaymentDate,
    string? Remarks,
    VoucherStatus Status,
    string? ApprovedByUserName,
    DateTimeOffset? ApprovedAtUtc,
    string? PaidByUserName,
    DateTimeOffset? PaidAtUtc,
    DateTimeOffset CreatedAtUtc,
    IReadOnlyList<VoucherLineDto> Lines,
    /// <summary>Set when Status == PendingClearance: the linked PostDatedCheque tracking the
    /// future-dated cheque that's holding this voucher unposted.</summary>
    Guid? PendingPostDatedChequeId = null);

public sealed record VoucherLineDto(
    Guid Id, int LineNo, Guid ExpenseTypeId, string ExpenseTypeCode, string ExpenseTypeName,
    decimal Amount, string? Narration);

public sealed record VoucherListItemDto(
    Guid Id, string? VoucherNumber, DateOnly VoucherDate, string PayTo, decimal AmountTotal,
    string Currency, PaymentMode PaymentMode, VoucherStatus Status, DateTimeOffset CreatedAtUtc);

public sealed record CreateVoucherLineDto(Guid ExpenseTypeId, decimal Amount, string? Narration);

public sealed record CreateVoucherDto(
    DateOnly VoucherDate,
    string PayTo,
    string? PayeeItsNumber,
    string Purpose,
    PaymentMode PaymentMode,
    Guid? BankAccountId,
    string? ChequeNumber,
    DateOnly? ChequeDate,
    string? DrawnOnBank,
    DateOnly? PaymentDate,
    string? Remarks,
    IReadOnlyList<CreateVoucherLineDto> Lines,
    string? Currency = null);

public sealed record CancelVoucherDto(string Reason);
public sealed record ReverseVoucherDto(string Reason);
public sealed record ApproveVoucherDto();

public sealed record VoucherListQuery(
    int Page = 1, int PageSize = 25, string? SortBy = null, string? SortDir = null,
    string? Search = null, VoucherStatus? Status = null, PaymentMode? PaymentMode = null,
    DateOnly? FromDate = null, DateOnly? ToDate = null);
