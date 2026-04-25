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
    LedgerSourceType? SourceType = null, DateOnly? FromDate = null, DateOnly? ToDate = null);

public sealed record AccountBalanceDto(
    Guid AccountId, string AccountCode, string AccountName,
    decimal Debit, decimal Credit, decimal Balance);

public sealed record FinancialPeriodDto(
    Guid Id, string Name, DateOnly StartDate, DateOnly EndDate,
    PeriodStatus Status, DateTimeOffset? ClosedAtUtc, string? ClosedByUserName);

public sealed record CreateFinancialPeriodDto(string Name, DateOnly StartDate, DateOnly EndDate);
public sealed record CloseFinancialPeriodDto();

public sealed record ReportDailyCollectionDto(DateOnly Date, int ReceiptCount, decimal AmountTotal, string Currency);
public sealed record ReportFundWiseDto(Guid FundTypeId, string FundTypeCode, string FundTypeName, int LineCount, decimal AmountTotal);
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
