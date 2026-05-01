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
    /// <summary>The contributor's bank that issued the cheque (different from
    /// <see cref="BankAccountId"/>, which is the Jamaat's deposit account). Required when a
    /// post-dated cheque is being tracked - the cheques workbench groups by drawee bank for
    /// reconciliation.</summary>
    public string? DrawnOnBank { get; private set; }
    public Guid? BankAccountId { get; private set; }
    public string? PaymentReference { get; private set; }
    public string? Remarks { get; private set; }
    /// Optional - receipt is attributed to a family context (e.g., head paying for the whole family).
    public Guid? FamilyId { get; private set; }
    public string? FamilyNameSnapshot { get; private set; }
    /// JSON array of member ids this payment is on behalf of (when paying for family members).
    public string? OnBehalfOfMemberIdsJson { get; private set; }
    public ReceiptStatus Status { get; private set; }
    /// <summary>When set, this receipt is held in <see cref="ReceiptStatus.PendingClearance"/>
    /// awaiting the linked post-dated cheque to clear. The PDC drives the transition to
    /// Confirmed (cleared) or Cancelled (bounced).</summary>
    public Guid? PendingPostDatedChequeId { get; private set; }
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
    /// <summary>URL to the uploaded agreement file (PDF or scanned image). Set by the
    /// receipt-document upload flow; null if the contributor hasn't provided a copy yet.</summary>
    public string? AgreementDocumentUrl { get; private set; }
    /// <summary>Running total of how much of this returnable receipt has been returned to the contributor.</summary>
    public decimal AmountReturned { get; private set; }
    /// <summary>JSON map of custom-field key → captured value. Populated when the chosen FundType has admin-defined custom fields.</summary>
    public string? CustomFieldsJson { get; private set; }
    /// <summary>Stored maturity-state snapshot. Computed from intention/maturity-date/amount-returned
    /// at write time so reports can filter without recomputing from each receipt's three fields.</summary>
    public ReturnableMaturityState MaturityState { get; private set; } = ReturnableMaturityState.NotApplicable;

    public bool IsReturnable => Intention == ContributionIntention.Returnable;
    public decimal AmountReturnable => IsReturnable ? Math.Max(0m, AmountTotal - AmountReturned) : 0m;
    public bool IsMatured(DateOnly today) => MaturityDate is null || today >= MaturityDate.Value;

    /// <summary>Refresh the stored MaturityState from current intention + maturity-date + amount-returned.
    /// Call after any state-changing transition (intent set, return recorded). The "today" parameter
    /// is passed in rather than read from a clock so the entity stays pure - callers supply IClock.Today.</summary>
    public void RefreshMaturityState(DateOnly today)
    {
        if (!IsReturnable) { MaturityState = ReturnableMaturityState.NotApplicable; return; }
        if (AmountReturned >= AmountTotal) { MaturityState = ReturnableMaturityState.FullyReturned; return; }
        if (AmountReturned > 0) { MaturityState = ReturnableMaturityState.PartiallyReturned; return; }
        MaturityState = MaturityDate is null || today >= MaturityDate.Value
            ? ReturnableMaturityState.Matured
            : ReturnableMaturityState.NotMatured;
    }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public IReadOnlyCollection<ReceiptLine> Lines => _lines.AsReadOnly();

    public void SetPayment(PaymentMode mode, Guid? bankAccountId, string? chequeNumber, DateOnly? chequeDate, string? drawnOnBank, string? reference)
    {
        PaymentMode = mode;
        BankAccountId = bankAccountId;
        ChequeNumber = chequeNumber;
        ChequeDate = chequeDate;
        DrawnOnBank = drawnOnBank;
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

    /// <summary>Attach (or detach with null) a stored agreement document URL.</summary>
    public void SetAgreementDocumentUrl(string? url) => AgreementDocumentUrl = url;

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

    /// <summary>Reverse a previously-recorded return. Used when the linked return-voucher is
    /// cancelled or reversed - the running total drops back so the receipt accurately
    /// reflects what's still owed to the contributor and a fresh return can be processed.</summary>
    public void RollbackReturn(decimal amount)
    {
        if (amount <= 0) throw new ArgumentException("Amount must be positive.", nameof(amount));
        if (amount > AmountReturned)
            throw new InvalidOperationException($"Rollback amount {amount} exceeds AmountReturned {AmountReturned}.");
        AmountReturned -= amount;
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
        // Allowed entry states: Draft (the standard cashier flow) and PendingClearance (the
        // PDC-cleared flow - cheque finally cleared, now this method assigns number + posts).
        // Both have full lines + payment data captured already; only the status differs.
        if (Status != ReceiptStatus.Draft && Status != ReceiptStatus.PendingClearance)
            throw new InvalidOperationException($"Only drafts or pending-clearance receipts can be confirmed (current: {Status}).");
        if (_lines.Count == 0) throw new InvalidOperationException("A receipt must have at least one line.");
        ReceiptNumber = receiptNumber;
        FinancialPeriodId = periodId;
        NumberingSeriesId = numberingSeriesId;
        Status = ReceiptStatus.Confirmed;
        ConfirmedAtUtc = at;
        ConfirmedByUserId = userId;
        ConfirmedByUserName = userName;
        // The PDC link no longer needs the receipt as "pending" - clear it so a list filter on
        // PendingPostDatedChequeId IS NOT NULL stays meaningful for "still awaiting clearance".
        PendingPostDatedChequeId = null;
    }

    /// <summary>Transition a fully-built draft into the holding state used while a future-dated
    /// cheque is in flight. No receipt number, no GL posting; only metadata changes. The PDC
    /// row created alongside this drives the eventual confirm-or-cancel.</summary>
    public void MarkPendingClearance(Guid pendingPostDatedChequeId)
    {
        if (Status != ReceiptStatus.Draft)
            throw new InvalidOperationException($"Only drafts can be moved to PendingClearance (current: {Status}).");
        if (_lines.Count == 0) throw new InvalidOperationException("A receipt must have at least one line.");
        if (pendingPostDatedChequeId == Guid.Empty) throw new ArgumentException("PDC id required.", nameof(pendingPostDatedChequeId));
        Status = ReceiptStatus.PendingClearance;
        PendingPostDatedChequeId = pendingPostDatedChequeId;
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
