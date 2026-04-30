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

/// <summary>Decision-support bundle for a QH approver. One round-trip; the panel
/// shows borrower behavior + active commitments + donation history + past loans + fund
/// position so the approver doesn't have to navigate four other pages to make a call.</summary>
public sealed record LoanDecisionSupportDto(
    Guid LoanId,
    LoanReliabilitySummary Reliability,
    LoanCommitmentSummary Commitments,
    LoanDonationSummary Donations,
    LoanPastLoansSummary PastLoans,
    LoanFundPosition FundPosition);

public sealed record LoanReliabilitySummary(
    string Grade, decimal? TotalScore, bool LoanReady, string? LoanReadyReason,
    IReadOnlyList<LoanReliabilityFactor> Factors);

public sealed record LoanReliabilityFactor(string Key, string Name, decimal? Score, bool Excluded, string Raw);

public sealed record LoanCommitmentSummary(
    int ActiveCount, decimal TotalAmount, decimal PaidAmount, decimal OutstandingAmount,
    IReadOnlyList<LoanCommitmentLine> Top);

public sealed record LoanCommitmentLine(string Code, string FundName, decimal TotalAmount, decimal OutstandingAmount);

public sealed record LoanDonationSummary(
    int Months, decimal TotalAmount, int ReceiptCount,
    IReadOnlyList<LoanDonationFundLine> ByFund);

public sealed record LoanDonationFundLine(string FundName, decimal Amount, int ReceiptCount);

public sealed record LoanPastLoansSummary(
    int LoanCount, int CompletedCount, int DefaultedCount,
    decimal TotalDisbursed, decimal TotalRepaid,
    decimal OnTimeRepaymentPercent);

/// <summary>Position of the QH fund pool. CurrentNetBalance = total received to loan-category
/// funds minus current outstanding loan balances. ProjectedAfterDisbursement = current minus
/// the amount this loan would consume. Highlight red when PercentRemainingAfter &lt; 10%.</summary>
public sealed record LoanFundPosition(
    string Currency,
    decimal CurrentNetBalance,
    decimal RequestedAmount,
    decimal ProjectedAfterDisbursement,
    decimal PercentRemainingAfter);
