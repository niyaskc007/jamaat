using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.QarzanHasana;

public sealed record QarzanHasanaLoanDto(
    Guid Id, string Code,
    Guid MemberId, string MemberItsNumber, string MemberName,
    Guid? FamilyId, string? FamilyCode,
    QarzanHasanaScheme Scheme,
    decimal AmountRequested, decimal AmountApproved, decimal AmountDisbursed, decimal AmountRepaid, decimal AmountOutstanding,
    int InstalmentsRequested, int InstalmentsApproved,
    decimal? GoldAmount,
    string Currency,
    DateOnly StartDate, DateOnly? EndDate,
    QarzanHasanaStatus Status,
    Guid Guarantor1MemberId, string Guarantor1Name,
    Guid Guarantor2MemberId, string Guarantor2Name,
    string? CashflowDocumentUrl, string? GoldSlipDocumentUrl,
    string? Level1ApproverName, DateTimeOffset? Level1ApprovedAtUtc, string? Level1Comments,
    string? Level2ApproverName, DateTimeOffset? Level2ApprovedAtUtc, string? Level2Comments,
    DateOnly? DisbursedOn,
    string? RejectionReason, string? CancellationReason,
    decimal ProgressPercent,
    DateTimeOffset CreatedAtUtc);

public sealed record QarzanHasanaInstallmentDto(
    Guid Id, int InstallmentNo, DateOnly DueDate,
    decimal ScheduledAmount, decimal PaidAmount, decimal RemainingAmount,
    DateOnly? LastPaymentDate, QarzanHasanaInstallmentStatus Status,
    string? WaiverReason, DateTimeOffset? WaivedAtUtc, string? WaivedByUserName);

public sealed record QarzanHasanaLoanDetailDto(
    QarzanHasanaLoanDto Loan,
    IReadOnlyList<QarzanHasanaInstallmentDto> Installments);

public sealed record CreateQarzanHasanaDto(
    Guid MemberId,
    Guid? FamilyId,
    QarzanHasanaScheme Scheme,
    decimal AmountRequested,
    int InstalmentsRequested,
    string Currency,
    DateOnly StartDate,
    Guid Guarantor1MemberId,
    Guid Guarantor2MemberId,
    decimal? GoldAmount = null,
    string? CashflowDocumentUrl = null,
    string? GoldSlipDocumentUrl = null);

public sealed record UpdateQarzanHasanaDraftDto(
    decimal AmountRequested,
    int InstalmentsRequested,
    decimal? GoldAmount,
    DateOnly StartDate,
    Guid Guarantor1MemberId,
    Guid Guarantor2MemberId,
    Guid? FamilyId,
    string? CashflowDocumentUrl,
    string? GoldSlipDocumentUrl);

public sealed record ApproveL1Dto(decimal AmountApproved, int InstalmentsApproved, string? Comments);
public sealed record ApproveL2Dto(string? Comments);
public sealed record RejectQhDto(string Reason);
public sealed record CancelQhDto(string Reason);
/// Disbursement input. When <see cref="BankAccountId"/> is provided the service issues a
/// QH-disbursement voucher inline (payment method defaults to the bank account's natural
/// mode) and posts the GL: Dr QH Receivable / Cr Bank. When <see cref="VoucherId"/> is
/// provided instead, the loan links to a pre-existing voucher (legacy flow, no posting).
public sealed record DisburseQhDto(
    DateOnly DisbursedOn,
    Guid? VoucherId = null,
    Guid? BankAccountId = null,
    PaymentMode? PaymentMode = null,
    string? ChequeNumber = null,
    DateOnly? ChequeDate = null,
    string? Remarks = null);
public sealed record WaiveQhInstallmentDto(Guid InstallmentId, string Reason);

public sealed record QarzanHasanaListQuery(
    int Page = 1, int PageSize = 25,
    string? Search = null,
    QarzanHasanaStatus? Status = null,
    QarzanHasanaScheme? Scheme = null,
    Guid? MemberId = null);
