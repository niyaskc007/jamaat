using Jamaat.Domain.Enums;

namespace Jamaat.Contracts.Ledger;

public sealed record LedgerEntryDto(
    long Id,
    DateOnly PostingDate,
    Guid FinancialPeriodId,
    string? FinancialPeriodName,
    LedgerSourceType SourceType,
    Guid SourceId,
    string SourceReference,
    int LineNo,
    Guid AccountId,
    string AccountCode,
    string AccountName,
    Guid? FundTypeId,
    string? FundTypeName,
    decimal Debit,
    decimal Credit,
    string Currency,
    string? Narration,
    long? ReversalOfEntryId,
    DateTimeOffset PostedAtUtc);

public sealed record LedgerEntryQuery(
    int Page = 1, int PageSize = 50, string? SortBy = null, string? SortDir = null,
    string? Search = null, Guid? AccountId = null, Guid? FundTypeId = null,
    LedgerSourceType? SourceType = null, DateOnly? FromDate = null, DateOnly? ToDate = null,
    /// <summary>Filter to entries whose Source aggregate has this Id - lets a detail page
    /// show the GL postings produced by a specific receipt/voucher/journal.</summary>
    Guid? SourceId = null);

public sealed record AccountBalanceDto(
    Guid AccountId, string AccountCode, string AccountName,
    decimal Debit, decimal Credit, decimal Balance);

public sealed record FinancialPeriodDto(
    Guid Id, string Name, DateOnly StartDate, DateOnly EndDate,
    PeriodStatus Status, DateTimeOffset? ClosedAtUtc, string? ClosedByUserName);

public sealed record CreateFinancialPeriodDto(string Name, DateOnly StartDate, DateOnly EndDate);
public sealed record CloseFinancialPeriodDto();

public sealed record ReportDailyCollectionDto(DateOnly Date, int ReceiptCount, decimal AmountTotal, string Currency);
public sealed record ReportFundWiseDto(
    Guid FundTypeId, string FundTypeCode, string FundTypeName,
    int LineCount, decimal AmountTotal,
    // Per-mode breakdown so the report can answer "how much of this fund came as cheques vs cash".
    decimal AmountCash, decimal AmountCheque, decimal AmountBankTransfer, decimal AmountCard,
    decimal AmountOnline, decimal AmountUpi);
public sealed record ReportFundWiseQuery(DateOnly From, DateOnly To, Guid? EventId = null, Guid? FundCategoryId = null);
public sealed record ReportDailyPaymentDto(DateOnly Date, int VoucherCount, decimal AmountTotal, string Currency);
public sealed record ReportCashBookRow(DateOnly Date, string Reference, string Narration, decimal Debit, decimal Credit, decimal Balance);

/// One row per receipt-line for a given member; lets the report break a total
/// contribution down by fund + period. Powers /api/v1/reports/member-contribution.
public sealed record ReportMemberContributionRow(
    DateOnly ReceiptDate, string ReceiptNumber, string FundCode, string FundName,
    string? PeriodReference, string? Purpose, decimal Amount, string Currency,
    decimal BaseAmount, string BaseCurrency);

/// One row per cheque-mode receipt. Powers the bank-reconciliation workflow.
public sealed record ReportChequeWiseRow(
    DateOnly ReceiptDate, string? ReceiptNumber,
    string ItsNumber, string MemberName,
    string? ChequeNumber, DateOnly? ChequeDate, string? BankAccountName,
    decimal Amount, string Currency, string Status);

/// Dual-balance view of a fund. <see cref="TotalCashReceived"/> is everything that came in
/// (permanent + returnable). <see cref="OutstandingReturnObligation"/> is the remaining
/// returnable money still owed to contributors. <see cref="NetFundStrength"/> = total - obligation.
public sealed record ReportFundBalanceDto(
    Guid FundTypeId, string FundTypeCode, string FundTypeName, string Currency,
    decimal TotalCashReceived,
    decimal PermanentReceived,
    decimal ReturnableReceived,
    decimal AlreadyReturned,
    decimal OutstandingReturnObligation,
    decimal NetFundStrength,
    int ReceiptCount);

/// One row per returnable receipt - used by the returnable-inflows / maturity report.
public sealed record ReportReturnableContributionRow(
    Guid ReceiptId, string? ReceiptNumber, DateOnly ReceiptDate,
    string ItsNumber, string MemberName,
    string FundTypeCode, string FundTypeName,
    decimal AmountTotal, decimal AmountReturned, decimal AmountReturnable,
    string Currency,
    DateOnly? MaturityDate, bool IsMatured,
    string? AgreementReference,
    string? NiyyathNote);

/// One row per active QH loan: principal, repaid, outstanding, last-payment date, status,
/// age in days. Powers the Outstanding Loan Balances report - fills the gap that QH
/// outstanding wasn't visible in the GL until the per-fund accounts work lands.
public sealed record ReportOutstandingLoanRow(
    Guid LoanId, string Code,
    Guid MemberId, string MemberItsNumber, string MemberName,
    decimal AmountDisbursed, decimal AmountRepaid, decimal AmountOutstanding,
    decimal ProgressPercent,
    string Currency,
    DateOnly? DisbursedOn, DateOnly? LastPaymentDate, int? AgeDays,
    int InstallmentCount, int OverdueInstallments,
    QarzanHasanaStatus Status);

public sealed record ReportOutstandingLoansQuery(
    Guid? MemberId = null,
    QarzanHasanaStatus? Status = null,
    bool? OverdueOnly = null);

/// One row per active commitment with open instalments. Powers the Pending Commitments
/// report so admins can chase missing payments without opening each commitment.
public sealed record ReportPendingCommitmentRow(
    Guid CommitmentId, string Code,
    CommitmentPartyType PartyType,
    Guid? MemberId, string? MemberItsNumber,
    Guid? FamilyId, string? FamilyCode,
    string PartyName,
    Guid FundTypeId, string FundTypeCode, string FundTypeName,
    string Currency,
    decimal TotalAmount, decimal PaidAmount, decimal RemainingAmount,
    decimal ProgressPercent,
    int InstallmentCount, int PaidInstallments, int OverdueInstallments,
    DateOnly? NextDueDate,
    CommitmentStatus Status);

public sealed record ReportPendingCommitmentsQuery(
    CommitmentStatus? Status = null,
    Guid? MemberId = null,
    Guid? FamilyId = null,
    Guid? FundTypeId = null,
    bool? OverdueOnly = null);

/// One row per returnable receipt where today >= maturityDate AND outstanding > 0. The
/// "exit-door" cousin of the return-contribution flow - tells the cashier exactly who's
/// owed money the Jamaat hasn't paid back yet.
public sealed record ReportOverdueReturnRow(
    Guid ReceiptId, string? ReceiptNumber, DateOnly ReceiptDate,
    Guid MemberId, string ItsNumber, string MemberName,
    Guid FundTypeId, string FundTypeCode, string FundTypeName,
    decimal AmountTotal, decimal AmountReturned, decimal AmountOutstanding,
    string Currency,
    DateOnly MaturityDate, int DaysOverdue,
    string? AgreementReference,
    string? NiyyathNote);

public sealed record ReportOverdueReturnsQuery(
    Guid? MemberId = null,
    Guid? FundTypeId = null,
    int? MinDaysOverdue = null);
