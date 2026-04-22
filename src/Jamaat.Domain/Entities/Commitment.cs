using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

public sealed class Commitment : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private readonly List<CommitmentInstallment> _installments = [];

    private Commitment() { }

    public Commitment(
        Guid id,
        Guid tenantId,
        string code,
        CommitmentPartyType partyType,
        Guid? memberId,
        Guid? familyId,
        string partyNameSnapshot,
        Guid fundTypeId,
        string fundNameSnapshot,
        string currency,
        decimal totalAmount,
        CommitmentFrequency frequency,
        int numberOfInstallments,
        DateOnly startDate,
        bool allowPartialPayments,
        bool allowAutoAdvance)
    {
        if (totalAmount <= 0) throw new ArgumentException("Total amount must be > 0.", nameof(totalAmount));
        if (numberOfInstallments <= 0) throw new ArgumentException("At least one installment is required.", nameof(numberOfInstallments));
        if (partyType == CommitmentPartyType.Member && memberId is null) throw new ArgumentException("memberId required for member pledge.");
        if (partyType == CommitmentPartyType.Family && familyId is null) throw new ArgumentException("familyId required for family pledge.");

        Id = id;
        TenantId = tenantId;
        Code = code;
        PartyType = partyType;
        MemberId = memberId;
        FamilyId = familyId;
        PartyNameSnapshot = partyNameSnapshot;
        FundTypeId = fundTypeId;
        FundNameSnapshot = fundNameSnapshot;
        Currency = currency.ToUpperInvariant();
        TotalAmount = totalAmount;
        Frequency = frequency;
        NumberOfInstallments = numberOfInstallments;
        StartDate = startDate;
        AllowPartialPayments = allowPartialPayments;
        AllowAutoAdvance = allowAutoAdvance;
        Status = CommitmentStatus.Draft;
    }

    public Guid TenantId { get; private set; }
    public string Code { get; private set; } = default!;
    public CommitmentPartyType PartyType { get; private set; }
    public Guid? MemberId { get; private set; }
    public Guid? FamilyId { get; private set; }
    public string PartyNameSnapshot { get; private set; } = default!;
    public Guid FundTypeId { get; private set; }
    public string FundNameSnapshot { get; private set; } = default!;
    public string Currency { get; private set; } = "AED";
    public decimal TotalAmount { get; private set; }
    public decimal PaidAmount { get; private set; }
    public CommitmentFrequency Frequency { get; private set; }
    public int NumberOfInstallments { get; private set; }
    public DateOnly StartDate { get; private set; }
    public DateOnly? EndDate { get; private set; }
    public bool AllowPartialPayments { get; private set; }
    public bool AllowAutoAdvance { get; private set; }
    public CommitmentStatus Status { get; private set; }
    public string? Notes { get; private set; }

    // Agreement snapshot
    public Guid? AgreementTemplateId { get; private set; }
    public int? AgreementTemplateVersion { get; private set; }
    public string? AgreementText { get; private set; }
    public DateTimeOffset? AgreementAcceptedAtUtc { get; private set; }
    public Guid? AgreementAcceptedByUserId { get; private set; }
    public string? AgreementAcceptedByName { get; private set; }

    public DateTimeOffset? CancelledAtUtc { get; private set; }
    public string? CancellationReason { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public IReadOnlyCollection<CommitmentInstallment> Installments => _installments.AsReadOnly();

    public decimal RemainingAmount => TotalAmount - PaidAmount;
    public decimal ProgressPercent => TotalAmount == 0 ? 0 : Math.Round(PaidAmount / TotalAmount * 100m, 2);

    public void SetNotes(string? notes) => Notes = notes;

    public void ReplaceSchedule(IEnumerable<CommitmentInstallment> installments)
    {
        if (Status != CommitmentStatus.Draft) throw new InvalidOperationException("Schedule can only be set on draft commitments.");
        _installments.Clear();
        _installments.AddRange(installments);
        EndDate = _installments.Count == 0 ? null : _installments.Max(i => i.DueDate);
    }

    public void AcceptAgreement(Guid? templateId, int? templateVersion, string renderedText, Guid userId, string userName, DateTimeOffset at)
    {
        if (Status != CommitmentStatus.Draft) throw new InvalidOperationException("Agreement already accepted.");
        AgreementTemplateId = templateId;
        AgreementTemplateVersion = templateVersion;
        AgreementText = renderedText;
        AgreementAcceptedAtUtc = at;
        AgreementAcceptedByUserId = userId;
        AgreementAcceptedByName = userName;
        Status = CommitmentStatus.Active;
    }

    public void Pause() { if (Status == CommitmentStatus.Active) Status = CommitmentStatus.Paused; }
    public void Resume() { if (Status == CommitmentStatus.Paused) Status = CommitmentStatus.Active; }

    public void Cancel(string reason, DateTimeOffset at)
    {
        if (Status is CommitmentStatus.Cancelled or CommitmentStatus.Completed) return;
        Status = CommitmentStatus.Cancelled;
        CancelledAtUtc = at;
        CancellationReason = reason;
    }

    /// <summary>Applies a payment amount to the specified installment. Returns overflow (the amount beyond the due balance).</summary>
    public decimal RecordPaymentOnInstallment(Guid installmentId, decimal amount, DateOnly paymentDate)
    {
        var inst = _installments.First(i => i.Id == installmentId);
        if (inst.Status == InstallmentStatus.Waived) throw new InvalidOperationException("Cannot pay a waived installment.");
        var due = inst.ScheduledAmount - inst.PaidAmount;
        var applied = Math.Min(amount, due);
        inst.ApplyPayment(applied, paymentDate);
        PaidAmount += applied;
        RefreshStatus();
        return amount - applied;
    }

    /// <summary>Subtracts an earlier payment (on reversal of a receipt).</summary>
    public void RollbackPaymentOnInstallment(Guid installmentId, decimal amount)
    {
        var inst = _installments.First(i => i.Id == installmentId);
        var rolled = Math.Min(amount, inst.PaidAmount);
        inst.RollbackPayment(rolled);
        PaidAmount -= rolled;
        RefreshStatus();
    }

    public void WaiveInstallment(Guid installmentId, string reason, Guid userId, string userName, DateTimeOffset at)
    {
        var inst = _installments.First(i => i.Id == installmentId);
        inst.Waive(reason, userId, userName, at);
        RefreshStatus();
    }

    public void RefreshOverdueStatuses(DateOnly today)
    {
        foreach (var inst in _installments)
            if (inst.Status == InstallmentStatus.Pending && inst.DueDate < today)
                inst.MarkOverdue();
        RefreshStatus();
    }

    private void RefreshStatus()
    {
        if (Status is CommitmentStatus.Cancelled or CommitmentStatus.Draft or CommitmentStatus.Paused) return;
        var allSettled = _installments.All(i => i.Status is InstallmentStatus.Paid or InstallmentStatus.Waived);
        if (allSettled)
        {
            Status = CommitmentStatus.Completed;
        }
        else if (Status == CommitmentStatus.Completed)
        {
            Status = CommitmentStatus.Active;
        }
    }
}

public sealed class CommitmentInstallment : Entity<Guid>
{
    private CommitmentInstallment() { }

    public CommitmentInstallment(Guid id, int installmentNo, DateOnly dueDate, decimal scheduledAmount)
    {
        Id = id;
        InstallmentNo = installmentNo;
        DueDate = dueDate;
        ScheduledAmount = scheduledAmount;
        Status = InstallmentStatus.Pending;
    }

    public Guid CommitmentId { get; private set; }
    public int InstallmentNo { get; private set; }
    public DateOnly DueDate { get; private set; }
    public decimal ScheduledAmount { get; private set; }
    public decimal PaidAmount { get; private set; }
    public DateOnly? LastPaymentDate { get; private set; }
    public InstallmentStatus Status { get; private set; }
    public DateTimeOffset? WaivedAtUtc { get; private set; }
    public Guid? WaivedByUserId { get; private set; }
    public string? WaivedByUserName { get; private set; }
    public string? WaiverReason { get; private set; }
    public string? Notes { get; private set; }

    public decimal RemainingAmount => ScheduledAmount - PaidAmount;

    internal void ApplyPayment(decimal amount, DateOnly paymentDate)
    {
        if (amount <= 0) return;
        PaidAmount += amount;
        LastPaymentDate = paymentDate;
        if (PaidAmount >= ScheduledAmount) Status = InstallmentStatus.Paid;
        else Status = InstallmentStatus.PartiallyPaid;
    }

    internal void RollbackPayment(decimal amount)
    {
        if (amount <= 0) return;
        PaidAmount = Math.Max(0, PaidAmount - amount);
        if (PaidAmount == 0)
            Status = DueDate < DateOnly.FromDateTime(DateTime.UtcNow) ? InstallmentStatus.Overdue : InstallmentStatus.Pending;
        else
            Status = InstallmentStatus.PartiallyPaid;
    }

    internal void Waive(string reason, Guid userId, string userName, DateTimeOffset at)
    {
        Status = InstallmentStatus.Waived;
        WaivedAtUtc = at;
        WaivedByUserId = userId;
        WaivedByUserName = userName;
        WaiverReason = reason;
    }

    internal void MarkOverdue() { if (Status == InstallmentStatus.Pending) Status = InstallmentStatus.Overdue; }
}
