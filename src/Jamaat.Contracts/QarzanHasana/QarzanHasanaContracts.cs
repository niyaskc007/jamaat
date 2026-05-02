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
    Guid? Level1ApproverUserId, string? Level1ApproverName, DateTimeOffset? Level1ApprovedAtUtc, string? Level1Comments,
    Guid? Level2ApproverUserId, string? Level2ApproverName, DateTimeOffset? Level2ApprovedAtUtc, string? Level2Comments,
    DateOnly? DisbursedOn,
    string? RejectionReason, string? CancellationReason,
    decimal ProgressPercent,
    DateTimeOffset CreatedAtUtc,
    // --- Borrower's case + guarantor acknowledgment (added v2) ---
    string? Purpose, string? RepaymentPlan, string? SourceOfIncome, string? OtherObligations,
    bool GuarantorsAcknowledged, DateTimeOffset? GuarantorsAcknowledgedAtUtc, Guid? GuarantorsAcknowledgedByUserId, string? GuarantorsAcknowledgedByUserName,
    // --- Structured cashflow / gold / income tags (added v2.1) ---
    decimal? MonthlyIncome, decimal? MonthlyExpenses, decimal? MonthlyExistingEmis,
    decimal? GoldWeightGrams, int? GoldPurityKarat, string? GoldHeldAt,
    string? IncomeSources);

public sealed record QarzanHasanaInstallmentDto(
    Guid Id, int InstallmentNo, DateOnly DueDate,
    decimal ScheduledAmount, decimal PaidAmount, decimal RemainingAmount,
    DateOnly? LastPaymentDate, QarzanHasanaInstallmentStatus Status,
    string? WaiverReason, DateTimeOffset? WaivedAtUtc, Guid? WaivedByUserId, string? WaivedByUserName);

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
    string? GoldSlipDocumentUrl = null,
    /// <summary>What the loan is for. Required for new submissions.</summary>
    string? Purpose = null,
    /// <summary>How the borrower plans to repay each instalment. Required.</summary>
    string? RepaymentPlan = null,
    /// <summary>Free-text elaboration of income sources. Optional.</summary>
    string? SourceOfIncome = null,
    /// <summary>Other current obligations outside this jamaat. Optional.</summary>
    string? OtherObligations = null,
    /// <summary>Operator confirms both guarantors are present and have agreed to act as kafil.</summary>
    bool GuarantorsAcknowledged = false,
    // Structured cashflow / gold / income source tags (v2)
    decimal? MonthlyIncome = null,
    decimal? MonthlyExpenses = null,
    decimal? MonthlyExistingEmis = null,
    decimal? GoldWeightGrams = null,
    int? GoldPurityKarat = null,
    string? GoldHeldAt = null,
    /// <summary>Comma-separated tags from the income-source enum (SALARY, BUSINESS, INVESTMENT,
    /// SHARE_MARKET, REAL_ESTATE, RENTAL, PENSION, FAMILY, AGRICULTURE, FREELANCE, OTHER).</summary>
    string? IncomeSources = null);

public sealed record UpdateQarzanHasanaDraftDto(
    decimal AmountRequested,
    int InstalmentsRequested,
    decimal? GoldAmount,
    DateOnly StartDate,
    Guid Guarantor1MemberId,
    Guid Guarantor2MemberId,
    Guid? FamilyId,
    string? CashflowDocumentUrl,
    string? GoldSlipDocumentUrl,
    string? Purpose = null,
    string? RepaymentPlan = null,
    string? SourceOfIncome = null,
    string? OtherObligations = null,
    bool GuarantorsAcknowledged = false,
    decimal? MonthlyIncome = null,
    decimal? MonthlyExpenses = null,
    decimal? MonthlyExistingEmis = null,
    decimal? GoldWeightGrams = null,
    int? GoldPurityKarat = null,
    string? GoldHeldAt = null,
    string? IncomeSources = null);

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
    LoanFundPosition FundPosition,
    /// <summary>Per-guarantor track record (reliability + load + history). Two entries per loan.</summary>
    IReadOnlyList<GuarantorTrackRecord> Guarantors);

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

/// <summary>Result of an upfront guarantor-eligibility probe. Each <see cref="EligibilityCheck"/>
/// reports a specific rule's pass/fail with a human-readable detail. Hard checks (the ones that
/// block submission) are flagged via <see cref="EligibilityCheck.Hard"/>.</summary>
public sealed record GuarantorEligibilityDto(
    Guid MemberId,
    string FullName,
    string ItsNumber,
    bool Eligible,
    bool HasSoftWarnings,
    IReadOnlyList<EligibilityCheck> Checks);

public sealed record EligibilityCheck(
    string Key,
    string Label,
    bool Passed,
    bool Hard,
    string Detail);

/// <summary>Compact track record for a guarantor, surfaced on the L1/L2 decision-support panel
/// so an approver can verify the kafil's reliability + load + history at a glance.</summary>
public sealed record GuarantorTrackRecord(
    Guid MemberId,
    string ItsNumber,
    string FullName,
    string Grade,
    decimal? TotalScore,
    int ActiveGuaranteesCount,
    int PastLoansCount,
    int DefaultedCount,
    bool CurrentlyEligible,
    string? IneligibilityReason);

/// <summary>Per-guarantor consent record summary surfaced on the loan detail page so the
/// operator can see who has accepted, copy the link, and resend if needed.</summary>
public sealed record GuarantorConsentDto(
    Guid Id,
    Guid GuarantorMemberId,
    string GuarantorName,
    string GuarantorItsNumber,
    string Token,
    int Status,                                 // 1=Pending / 2=Accepted / 3=Declined
    DateTimeOffset? RespondedAtUtc,
    string? ResponderIpAddress,
    DateTimeOffset? NotificationSentAtUtc);

/// <summary>Public-facing loan summary served from the consent portal. No sensitive numbers
/// (no fund balance / commitments / etc.) - just enough for the guarantor to recognise the
/// loan they're being asked to back.</summary>
public sealed record GuarantorConsentPortalDto(
    Guid LoanId,
    string LoanCode,
    string BorrowerName,
    string BorrowerItsNumber,
    decimal AmountRequested,
    string Currency,
    int InstalmentsRequested,
    string? Purpose,
    int Status,                                 // 1=Pending / 2=Accepted / 3=Declined
    DateTimeOffset? RespondedAtUtc,
    string GuarantorName);

public sealed record RecordConsentResponseDto(string? IpAddress, string? UserAgent);
