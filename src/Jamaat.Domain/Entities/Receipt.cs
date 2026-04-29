using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

public sealed class Receipt : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private readonly List<ReceiptLine> _lines = [];

    private Receipt() { }

    public Receipt(Guid id, Guid tenantId, DateOnly receiptDate, Guid memberId, string itsNumberSnapshot, string memberNameSnapshot, string currency)
    {
        Id = id;
        TenantId = tenantId;
        ReceiptDate = receiptDate;
        MemberId = memberId;
        ItsNumberSnapshot = itsNumberSnapshot;
        MemberNameSnapshot = memberNameSnapshot;
        Currency = currency;
        Status = ReceiptStatus.Draft;
        PaymentMode = PaymentMode.Cash;
    }

    public Guid TenantId { get; private set; }
    public string? ReceiptNumber { get; private set; } // assigned on Confirm
    public DateOnly ReceiptDate { get; private set; }
    public Guid MemberId { get; private set; }
    public string ItsNumberSnapshot { get; private set; } = default!;
    public string MemberNameSnapshot { get; private set; } = default!;
    public string Currency { get; private set; } = "AED";
    public decimal AmountTotal { get; private set; }
    public decimal FxRate { get; private set; } = 1m;
    public string BaseCurrency { get; private set; } = "AED";
    public decimal BaseAmountTotal { get; private set; }
    public PaymentMode PaymentMode { get; private set; }
    public string? ChequeNumber { get; private set; }
    public DateOnly? ChequeDate { get; private set; }
    public Guid? BankAccountId { get; private set; }
    public string? PaymentReference { get; private set; }
    public string? Remarks { get; private set; }
    /// Optional - receipt is attributed to a family context (e.g., head paying for the whole family).
    public Guid? FamilyId { get; private set; }
    public string? FamilyNameSnapshot { get; private set; }
    /// JSON array of member ids this payment is on behalf of (when paying for family members).
    public string? OnBehalfOfMemberIdsJson { get; private set; }
    public ReceiptStatus Status { get; private set; }
    public DateTimeOffset? ConfirmedAtUtc { get; private set; }
    public Guid? ConfirmedByUserId { get; private set; }
    public string? ConfirmedByUserName { get; private set; }
    public DateTimeOffset? CancelledAtUtc { get; private set; }
    public Guid? CancelledByUserId { get; private set; }
    public string? CancellationReason { get; private set; }
    public DateTimeOffset? ReversedAtUtc { get; private set; }
    public string? ReversalReason { get; private set; }
    public Guid? FinancialPeriodId { get; private set; }
    public Guid? NumberingSeriesId { get; private set; }

    // --- Returnable contribution tracking (batch 2 of fund-management uplift) ----
    /// <summary>Default Permanent. Set to Returnable when the contributor expects the money back.</summary>
    public ContributionIntention Intention { get; private set; } = ContributionIntention.Permanent;
    /// <summary>Structured Niyyath note - required when the chosen FundType has RequiresNiyyath=true.</summary>
    public string? NiyyathNote { get; private set; }
    /// <summary>For returnable contributions: the date from which the contributor can request return.</summary>
    public DateOnly? MaturityDate { get; private set; }
    /// <summary>Reference / id to a stored agreement document.</summary>
    public string? AgreementReference { get; private set; }
    /// <summary>Running total of how much of this returnable receipt has been returned to the contributor.</summary>
    public decimal AmountReturned { get; private set; }
    /// <summary>JSON map of custom-field key → captured value. Populated when the chosen FundType has admin-defined custom fields.</summary>
    public string? CustomFieldsJson { get; private set; }

    public bool IsReturnable => Intention == ContributionIntention.Returnable;
    public decimal AmountReturnable => IsReturnable ? Math.Max(0m, AmountTotal - AmountReturned) : 0m;
    public bool IsMatured(DateOnly today) => MaturityDate is null || today >= MaturityDate.Value;

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public IReadOnlyCollection<ReceiptLine> Lines => _lines.AsReadOnly();

    public void SetPayment(PaymentMode mode, Guid? bankAccountId, string? chequeNumber, DateOnly? chequeDate, string? reference)
    {
        PaymentMode = mode;
        BankAccountId = bankAccountId;
        ChequeNumber = chequeNumber;
        ChequeDate = chequeDate;
        PaymentReference = reference;
    }

    public void SetRemarks(string? remarks) => Remarks = remarks;

    public void SetFamilyContext(Guid? familyId, string? familyName, string? onBehalfOfMemberIdsJson)
    {
        FamilyId = familyId;
        FamilyNameSnapshot = familyName;
        OnBehalfOfMemberIdsJson = onBehalfOfMemberIdsJson;
    }

    /// <summary>Capture admin-defined custom field values. ReceiptService validates required fields up-front.</summary>
    public void SetCustomFields(string? customFieldsJson) => CustomFieldsJson = customFieldsJson;

    /// <summary>Capture the contributor's intention + agreement details. ReceiptService validates
    /// the combination against the chosen FundType's IsReturnable / RequiresNiyyath / RequiresMaturityTracking
    /// / RequiresAgreement flags before this is invoked.</summary>
    public void SetContributionIntention(ContributionIntention intention, string? niyyathNote, DateOnly? maturityDate, string? agreementReference)
    {
        if (Status != ReceiptStatus.Draft) throw new InvalidOperationException("Cannot change intention after confirmation.");
        Intention = intention;
        NiyyathNote = niyyathNote;
        MaturityDate = intention == ContributionIntention.Returnable ? maturityDate : null;
        AgreementReference = agreementReference;
    }

    /// <summary>Record a partial or full return to the contributor. The voucher that issues the cash
    /// is created separately by the ReturnContribution flow; this only updates the running total.</summary>
    public void RecordReturn(decimal amount)
    {
        if (!IsReturnable) throw new InvalidOperationException("Receipt is not returnable.");
        if (amount <= 0) throw new ArgumentException("Amount must be positive.", nameof(amount));
        if (amount > AmountReturnable) throw new InvalidOperationException("Return exceeds remaining returnable balance.");
        AmountReturned += amount;
    }

    public void ReplaceLines(IEnumerable<ReceiptLine> lines)
    {
        if (Status != ReceiptStatus.Draft) throw new InvalidOperationException("Cannot edit lines after confirmation.");
        _lines.Clear();
        _lines.AddRange(lines);
        RecomputeTotal();
    }

    internal void RecomputeTotal() => AmountTotal = _lines.Sum(l => l.Amount);

    public void ApplyFxConversion(string baseCurrency, decimal fxRate, decimal baseAmountTotal)
    {
        if (fxRate <= 0) throw new ArgumentException("FX rate must be positive.", nameof(fxRate));
        BaseCurrency = baseCurrency.ToUpperInvariant();
        FxRate = fxRate;
        BaseAmountTotal = baseAmountTotal;
    }

    public void Confirm(string receiptNumber, Guid periodId, Guid numberingSeriesId, Guid userId, string userName, DateTimeOffset at)
    {
        if (Status != ReceiptStatus.Draft) throw new InvalidOperationException("Only drafts can be confirmed.");
        if (_lines.Count == 0) throw new InvalidOperationException("A receipt must have at least one line.");
        ReceiptNumber = receiptNumber;
        FinancialPeriodId = periodId;
        NumberingSeriesId = numberingSeriesId;
        Status = ReceiptStatus.Confirmed;
        ConfirmedAtUtc = at;
        ConfirmedByUserId = userId;
        ConfirmedByUserName = userName;
    }

    public void Cancel(string reason, Guid userId, DateTimeOffset at)
    {
        if (Status == ReceiptStatus.Cancelled || Status == ReceiptStatus.Reversed) return;
        Status = ReceiptStatus.Cancelled;
        CancelledAtUtc = at;
        CancelledByUserId = userId;
        CancellationReason = reason;
    }

    public void MarkReversed(string reason, DateTimeOffset at)
    {
        Status = ReceiptStatus.Reversed;
        ReversedAtUtc = at;
        ReversalReason = reason;
    }
}

public sealed class ReceiptLine : Entity<Guid>
{
    private ReceiptLine() { }

    public ReceiptLine(Guid id, int lineNo, Guid fundTypeId, decimal amount, string? purpose, string? periodReference,
        Guid? commitmentId = null, Guid? commitmentInstallmentId = null,
        Guid? fundEnrollmentId = null,
        Guid? qarzanHasanaLoanId = null, Guid? qarzanHasanaInstallmentId = null)
    {
        Id = id;
        LineNo = lineNo;
        FundTypeId = fundTypeId;
        Amount = amount;
        Purpose = purpose;
        PeriodReference = periodReference;
        CommitmentId = commitmentId;
        CommitmentInstallmentId = commitmentInstallmentId;
        FundEnrollmentId = fundEnrollmentId;
        QarzanHasanaLoanId = qarzanHasanaLoanId;
        QarzanHasanaInstallmentId = qarzanHasanaInstallmentId;
    }

    public Guid ReceiptId { get; private set; }
    public int LineNo { get; private set; }
    public Guid FundTypeId { get; private set; }
    public decimal Amount { get; private set; }
    public string? Purpose { get; private set; }
    public string? PeriodReference { get; private set; }
    /// Optional link: this line pays (or partially pays) a specific commitment installment.
    public Guid? CommitmentId { get; private set; }
    public Guid? CommitmentInstallmentId { get; private set; }
    /// Optional link: this line is a collection against a long-lived fund enrollment (Sabil/Wajebaat/Mutafariq/Niyaz).
    public Guid? FundEnrollmentId { get; private set; }
    /// Optional link: this line is a repayment against a Qarzan Hasana loan installment.
    public Guid? QarzanHasanaLoanId { get; private set; }
    public Guid? QarzanHasanaInstallmentId { get; private set; }
}
