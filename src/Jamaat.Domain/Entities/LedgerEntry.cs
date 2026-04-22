using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

/// Append-only. Never edited, never deleted. Reversals are new balancing rows.
public sealed class LedgerEntry : Entity<long>, ITenantScoped
{
    private LedgerEntry() { }

    public LedgerEntry(
        Guid tenantId,
        DateOnly postingDate,
        Guid financialPeriodId,
        LedgerSourceType sourceType,
        Guid sourceId,
        string sourceReference,
        int lineNo,
        Guid accountId,
        Guid? fundTypeId,
        decimal debit,
        decimal credit,
        string currency,
        string? narration,
        long? reversalOfEntryId,
        DateTimeOffset at,
        Guid? userId)
    {
        if (debit < 0 || credit < 0) throw new ArgumentException("Debit/credit must be non-negative.");
        if (debit > 0 && credit > 0) throw new ArgumentException("A row is either debit or credit, not both.");
        TenantId = tenantId;
        PostingDate = postingDate;
        FinancialPeriodId = financialPeriodId;
        SourceType = sourceType;
        SourceId = sourceId;
        SourceReference = sourceReference;
        LineNo = lineNo;
        AccountId = accountId;
        FundTypeId = fundTypeId;
        Debit = debit;
        Credit = credit;
        Currency = currency;
        Narration = narration;
        ReversalOfEntryId = reversalOfEntryId;
        PostedAtUtc = at;
        PostedByUserId = userId;
    }

    public Guid TenantId { get; private set; }
    public DateOnly PostingDate { get; private set; }
    public Guid FinancialPeriodId { get; private set; }
    public LedgerSourceType SourceType { get; private set; }
    public Guid SourceId { get; private set; }
    public string SourceReference { get; private set; } = default!;
    public int LineNo { get; private set; }
    public Guid AccountId { get; private set; }
    public Guid? FundTypeId { get; private set; }
    public decimal Debit { get; private set; }
    public decimal Credit { get; private set; }
    public string Currency { get; private set; } = "INR";
    public string? Narration { get; private set; }
    public long? ReversalOfEntryId { get; private set; }
    public DateTimeOffset PostedAtUtc { get; private set; }
    public Guid? PostedByUserId { get; private set; }
}
