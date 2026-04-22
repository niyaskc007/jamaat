using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

/// <summary>
/// Interest-free loan (Qarzan Hasana). Distinct from Commitment (donation pledge) and FundEnrollment (donation subscription).
/// Has a 2-level approval workflow, up to 2 guarantors, optional gold backing, and disbursement via a Voucher.
/// Repayments arrive as Receipt lines referencing this loan + its installment.
/// </summary>
public sealed class QarzanHasanaLoan : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private readonly List<QarzanHasanaInstallment> _installments = [];

    private QarzanHasanaLoan() { }

    public QarzanHasanaLoan(Guid id, Guid tenantId, string code, Guid memberId,
        QarzanHasanaScheme scheme, decimal amountRequested, int installmentsRequested,
        string currency, DateOnly startDate, Guid guarantor1MemberId, Guid guarantor2MemberId)
    {
        if (amountRequested <= 0) throw new ArgumentException("Amount must be > 0.", nameof(amountRequested));
        if (installmentsRequested <= 0) throw new ArgumentException("Installments must be > 0.", nameof(installmentsRequested));
        if (guarantor1MemberId == Guid.Empty || guarantor2MemberId == Guid.Empty)
            throw new ArgumentException("Two guarantors are required.");
        if (guarantor1MemberId == guarantor2MemberId)
            throw new ArgumentException("Guarantors must be different members.");

        Id = id;
        TenantId = tenantId;
        Code = code;
        MemberId = memberId;
        Scheme = scheme;
        AmountRequested = amountRequested;
        AmountApproved = 0m;
        InstalmentsRequested = installmentsRequested;
        InstalmentsApproved = 0;
        Currency = currency.ToUpperInvariant();
        StartDate = startDate;
        Guarantor1MemberId = guarantor1MemberId;
        Guarantor2MemberId = guarantor2MemberId;
        Status = QarzanHasanaStatus.Draft;
    }

    public Guid TenantId { get; private set; }
    public string Code { get; private set; } = default!;
    public Guid MemberId { get; private set; }
    public Guid? FamilyId { get; private set; }
    public QarzanHasanaScheme Scheme { get; private set; }

    public decimal AmountRequested { get; private set; }
    public decimal AmountApproved { get; private set; }
    public decimal AmountDisbursed { get; private set; }
    public decimal AmountRepaid { get; private set; }
    public int InstalmentsRequested { get; private set; }
    public int InstalmentsApproved { get; private set; }

    public decimal? GoldAmount { get; private set; }

    public string Currency { get; private set; } = "AED";
    public DateOnly StartDate { get; private set; }
    public DateOnly? EndDate { get; private set; }
    public QarzanHasanaStatus Status { get; private set; }

    public Guid Guarantor1MemberId { get; private set; }
    public Guid Guarantor2MemberId { get; private set; }
    public string? CashflowDocumentUrl { get; private set; }
    public string? GoldSlipDocumentUrl { get; private set; }

    public Guid? Level1ApproverUserId { get; private set; }
    public string? Level1ApproverName { get; private set; }
    public DateTimeOffset? Level1ApprovedAtUtc { get; private set; }
    public string? Level1Comments { get; private set; }

    public Guid? Level2ApproverUserId { get; private set; }
    public string? Level2ApproverName { get; private set; }
    public DateTimeOffset? Level2ApprovedAtUtc { get; private set; }
    public string? Level2Comments { get; private set; }

    public Guid? DisbursementVoucherId { get; private set; }
    public DateOnly? DisbursedOn { get; private set; }

    public string? RejectionReason { get; private set; }
    public string? CancellationReason { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public IReadOnlyCollection<QarzanHasanaInstallment> Installments => _installments.AsReadOnly();

    public decimal AmountOutstanding => Math.Max(0, AmountDisbursed - AmountRepaid);
    public decimal ProgressPercent => AmountDisbursed == 0 ? 0 : Math.Round(AmountRepaid / AmountDisbursed * 100m, 2);

    // --- Behaviour ---------------------------------------------------------

    public void UpdateDraft(decimal amountRequested, int installmentsRequested, string? cashflowUrl, string? goldSlipUrl,
        decimal? goldAmount, DateOnly startDate, Guid guarantor1, Guid guarantor2, Guid? familyId)
    {
        if (Status != QarzanHasanaStatus.Draft) throw new InvalidOperationException("Only drafts may be edited.");
        if (amountRequested <= 0) throw new ArgumentException("Amount must be > 0.");
        if (installmentsRequested <= 0) throw new ArgumentException("Installments must be > 0.");
        if (guarantor1 == guarantor2) throw new ArgumentException("Guarantors must be different members.");

        AmountRequested = amountRequested;
        InstalmentsRequested = installmentsRequested;
        CashflowDocumentUrl = cashflowUrl;
        GoldSlipDocumentUrl = goldSlipUrl;
        GoldAmount = goldAmount;
        StartDate = startDate;
        Guarantor1MemberId = guarantor1;
        Guarantor2MemberId = guarantor2;
        FamilyId = familyId;
    }

    public void Submit()
    {
        if (Status != QarzanHasanaStatus.Draft) throw new InvalidOperationException("Only drafts can be submitted.");
        Status = QarzanHasanaStatus.PendingLevel1;
    }

    public void ApproveLevel1(Guid userId, string userName, DateTimeOffset at, decimal amountApproved, int installmentsApproved, string? comments)
    {
        if (Status != QarzanHasanaStatus.PendingLevel1)
            throw new InvalidOperationException($"Level-1 approval requires PendingLevel1 status, not {Status}.");
        if (amountApproved <= 0) throw new ArgumentException("Approved amount must be > 0.");
        if (installmentsApproved <= 0) throw new ArgumentException("Approved installments must be > 0.");
        AmountApproved = amountApproved;
        InstalmentsApproved = installmentsApproved;
        Level1ApproverUserId = userId;
        Level1ApproverName = userName;
        Level1ApprovedAtUtc = at;
        Level1Comments = comments;
        Status = QarzanHasanaStatus.PendingLevel2;
    }

    public void ApproveLevel2(Guid userId, string userName, DateTimeOffset at, string? comments)
    {
        if (Status != QarzanHasanaStatus.PendingLevel2)
            throw new InvalidOperationException($"Level-2 approval requires PendingLevel2 status, not {Status}.");
        Level2ApproverUserId = userId;
        Level2ApproverName = userName;
        Level2ApprovedAtUtc = at;
        Level2Comments = comments;
        Status = QarzanHasanaStatus.Approved;
    }

    public void Reject(string reason, DateTimeOffset at)
    {
        if (Status is QarzanHasanaStatus.Completed or QarzanHasanaStatus.Cancelled or QarzanHasanaStatus.Rejected)
            throw new InvalidOperationException("Cannot reject a closed loan.");
        Status = QarzanHasanaStatus.Rejected;
        RejectionReason = reason;
    }

    public void Cancel(string reason)
    {
        if (Status is QarzanHasanaStatus.Completed or QarzanHasanaStatus.Cancelled)
            return;
        Status = QarzanHasanaStatus.Cancelled;
        CancellationReason = reason;
    }

    public void SetSchedule(IEnumerable<QarzanHasanaInstallment> installments)
    {
        if (Status is not (QarzanHasanaStatus.Approved or QarzanHasanaStatus.PendingLevel2))
            throw new InvalidOperationException("Schedule can only be set on an approved loan.");
        _installments.Clear();
        _installments.AddRange(installments);
        EndDate = _installments.Count == 0 ? null : _installments.Max(i => i.DueDate);
    }

    public void MarkDisbursed(Guid? voucherId, DateOnly disbursedOn)
    {
        if (Status != QarzanHasanaStatus.Approved)
            throw new InvalidOperationException("Loan must be Approved to be disbursed.");
        DisbursementVoucherId = voucherId;
        DisbursedOn = disbursedOn;
        AmountDisbursed = AmountApproved;
        Status = QarzanHasanaStatus.Active;
    }

    public decimal RecordRepayment(Guid installmentId, decimal amount, DateOnly paymentDate)
    {
        if (Status is not (QarzanHasanaStatus.Active or QarzanHasanaStatus.Disbursed))
            throw new InvalidOperationException("Loan is not in a repayable state.");
        var inst = _installments.First(i => i.Id == installmentId);
        if (inst.Status == QarzanHasanaInstallmentStatus.Waived)
            throw new InvalidOperationException("Waived installments cannot be paid.");
        var due = inst.ScheduledAmount - inst.PaidAmount;
        var applied = Math.Min(amount, due);
        inst.ApplyPayment(applied, paymentDate);
        AmountRepaid += applied;
        RefreshStatus();
        return amount - applied;
    }

    public void RollbackRepayment(Guid installmentId, decimal amount)
    {
        var inst = _installments.First(i => i.Id == installmentId);
        var rolled = Math.Min(amount, inst.PaidAmount);
        inst.RollbackPayment(rolled);
        AmountRepaid -= rolled;
        RefreshStatus();
    }

    public void WaiveInstallment(Guid installmentId, string reason, Guid userId, string userName, DateTimeOffset at)
    {
        var inst = _installments.First(i => i.Id == installmentId);
        inst.Waive(reason, userId, userName, at);
        RefreshStatus();
    }

    private void RefreshStatus()
    {
        if (Status is QarzanHasanaStatus.Cancelled or QarzanHasanaStatus.Rejected or QarzanHasanaStatus.Draft)
            return;
        if (_installments.Count > 0 &&
            _installments.All(i => i.Status is QarzanHasanaInstallmentStatus.Paid or QarzanHasanaInstallmentStatus.Waived))
            Status = QarzanHasanaStatus.Completed;
    }
}

public sealed class QarzanHasanaInstallment : Entity<Guid>
{
    private QarzanHasanaInstallment() { }

    public QarzanHasanaInstallment(Guid id, int installmentNo, DateOnly dueDate, decimal scheduledAmount)
    {
        Id = id;
        InstallmentNo = installmentNo;
        DueDate = dueDate;
        ScheduledAmount = scheduledAmount;
        Status = QarzanHasanaInstallmentStatus.Pending;
    }

    public Guid QarzanHasanaLoanId { get; private set; }
    public int InstallmentNo { get; private set; }
    public DateOnly DueDate { get; private set; }
    public decimal ScheduledAmount { get; private set; }
    public decimal PaidAmount { get; private set; }
    public DateOnly? LastPaymentDate { get; private set; }
    public QarzanHasanaInstallmentStatus Status { get; private set; }

    public DateTimeOffset? WaivedAtUtc { get; private set; }
    public Guid? WaivedByUserId { get; private set; }
    public string? WaivedByUserName { get; private set; }
    public string? WaiverReason { get; private set; }

    public decimal RemainingAmount => ScheduledAmount - PaidAmount;

    internal void ApplyPayment(decimal amount, DateOnly paymentDate)
    {
        if (amount <= 0) return;
        PaidAmount += amount;
        LastPaymentDate = paymentDate;
        Status = PaidAmount >= ScheduledAmount
            ? QarzanHasanaInstallmentStatus.Paid
            : QarzanHasanaInstallmentStatus.PartiallyPaid;
    }

    internal void RollbackPayment(decimal amount)
    {
        if (amount <= 0) return;
        PaidAmount = Math.Max(0, PaidAmount - amount);
        if (PaidAmount == 0)
            Status = DueDate < DateOnly.FromDateTime(DateTime.UtcNow)
                ? QarzanHasanaInstallmentStatus.Overdue
                : QarzanHasanaInstallmentStatus.Pending;
        else
            Status = QarzanHasanaInstallmentStatus.PartiallyPaid;
    }

    internal void Waive(string reason, Guid userId, string userName, DateTimeOffset at)
    {
        Status = QarzanHasanaInstallmentStatus.Waived;
        WaivedAtUtc = at;
        WaivedByUserId = userId;
        WaivedByUserName = userName;
        WaiverReason = reason;
    }
}
