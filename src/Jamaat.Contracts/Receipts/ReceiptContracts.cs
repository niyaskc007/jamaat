using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.Receipts;

public sealed record ReceiptDto(
    Guid Id,
    string? ReceiptNumber,
    DateOnly ReceiptDate,
    Guid MemberId,
    string ItsNumberSnapshot,
    string MemberNameSnapshot,
    decimal AmountTotal,
    string Currency,
    decimal FxRate,
    string BaseCurrency,
    decimal BaseAmountTotal,
    PaymentMode PaymentMode,
    string? ChequeNumber,
    DateOnly? ChequeDate,
    Guid? BankAccountId,
    string? BankAccountName,
    string? PaymentReference,
    string? Remarks,
    ReceiptStatus Status,
    DateTimeOffset? ConfirmedAtUtc,
    string? ConfirmedByUserName,
    DateTimeOffset CreatedAtUtc,
    IReadOnlyList<ReceiptLineDto> Lines);

public sealed record ReceiptLineDto(
    Guid Id,
    int LineNo,
    Guid FundTypeId,
    string FundTypeCode,
    string FundTypeName,
    decimal Amount,
    string? Purpose,
    string? PeriodReference,
    Guid? CommitmentId = null,
    string? CommitmentCode = null,
    Guid? CommitmentInstallmentId = null,
    int? InstallmentNo = null,
    Guid? FundEnrollmentId = null,
    string? FundEnrollmentCode = null,
    Guid? QarzanHasanaLoanId = null,
    string? QarzanHasanaLoanCode = null,
    Guid? QarzanHasanaInstallmentId = null,
    int? QarzanHasanaInstallmentNo = null);

public sealed record ReceiptListItemDto(
    Guid Id,
    string? ReceiptNumber,
    DateOnly ReceiptDate,
    string ItsNumberSnapshot,
    string MemberNameSnapshot,
    decimal AmountTotal,
    string Currency,
    PaymentMode PaymentMode,
    ReceiptStatus Status,
    DateTimeOffset CreatedAtUtc);

public sealed record CreateReceiptLineDto(
    Guid FundTypeId,
    decimal Amount,
    string? Purpose,
    string? PeriodReference,
    Guid? CommitmentId = null,
    Guid? CommitmentInstallmentId = null,
    Guid? FundEnrollmentId = null,
    Guid? QarzanHasanaLoanId = null,
    Guid? QarzanHasanaInstallmentId = null);

public sealed record CreateReceiptDto(
    DateOnly ReceiptDate,
    Guid MemberId,
    PaymentMode PaymentMode,
    Guid? BankAccountId,
    string? ChequeNumber,
    DateOnly? ChequeDate,
    string? PaymentReference,
    string? Remarks,
    IReadOnlyList<CreateReceiptLineDto> Lines,
    string? Currency = null,
    Guid? FamilyId = null,
    IReadOnlyList<Guid>? OnBehalfOfMemberIds = null);

public sealed record ConfirmReceiptDto();

public sealed record ReverseReceiptDto(string Reason);

public sealed record CancelReceiptDto(string Reason);

public sealed record ReprintReceiptDto(string? Reason);

public sealed record ReceiptListQuery(
    int Page = 1,
    int PageSize = 25,
    string? SortBy = null,
    string? SortDir = null,
    string? Search = null,
    ReceiptStatus? Status = null,
    PaymentMode? PaymentMode = null,
    DateOnly? FromDate = null,
    DateOnly? ToDate = null,
    Guid? FundTypeId = null,
    Guid? MemberId = null);
