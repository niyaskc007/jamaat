using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

/// <summary>
/// A post-dated cheque held against a commitment. Captures the cheque metadata at receive
/// time so it can be tracked through deposit / clearing / bouncing without applying payment
/// until the cheque actually clears. When it clears, the system issues a normal Receipt that
/// allocates against the linked <see cref="CommitmentInstallment"/>; until then the
/// instalment's PaidAmount stays untouched.
/// </summary>
/// <remarks>
/// Why a separate aggregate rather than mutating the receipt: a Receipt represents money
/// received by the Jamaat. A PDC is a future promise — issuing a Receipt before the cheque
/// clears would overstate income. This aggregate carries the cheque's lifecycle distinct
/// from the ledger; only the <see cref="Cleared"/> transition produces a real Receipt.
/// </remarks>
public sealed class PostDatedCheque : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private PostDatedCheque() { }

    public PostDatedCheque(
        Guid id, Guid tenantId,
        Guid commitmentId, Guid? commitmentInstallmentId,
        Guid memberId,
        string chequeNumber, DateOnly chequeDate, string drawnOnBank,
        decimal amount, string currency)
    {
        if (commitmentId == Guid.Empty) throw new ArgumentException("CommitmentId required.", nameof(commitmentId));
        if (memberId == Guid.Empty) throw new ArgumentException("MemberId required.", nameof(memberId));
        if (string.IsNullOrWhiteSpace(chequeNumber)) throw new ArgumentException("Cheque number required.", nameof(chequeNumber));
        if (string.IsNullOrWhiteSpace(drawnOnBank)) throw new ArgumentException("Drawn-on bank required.", nameof(drawnOnBank));
        if (amount <= 0) throw new ArgumentException("Amount must be positive.", nameof(amount));

        Id = id;
        TenantId = tenantId;
        CommitmentId = commitmentId;
        CommitmentInstallmentId = commitmentInstallmentId;
        MemberId = memberId;
        ChequeNumber = chequeNumber.Trim();
        ChequeDate = chequeDate;
        DrawnOnBank = drawnOnBank.Trim();
        Amount = amount;
        Currency = currency.ToUpperInvariant();
        Status = PostDatedChequeStatus.Pledged;
    }

    public Guid TenantId { get; private set; }
    public Guid CommitmentId { get; private set; }
    public Guid? CommitmentInstallmentId { get; private set; }
    public Guid MemberId { get; private set; }
    public string ChequeNumber { get; private set; } = default!;
    public DateOnly ChequeDate { get; private set; }
    public string DrawnOnBank { get; private set; } = default!;
    public decimal Amount { get; private set; }
    public string Currency { get; private set; } = default!;
    public PostDatedChequeStatus Status { get; private set; }
    public string? Notes { get; private set; }

    // Lifecycle timestamps + side-effects
    public DateOnly? DepositedOn { get; private set; }
    public DateOnly? ClearedOn { get; private set; }
    /// <summary>Receipt produced when the cheque cleared. Null until Cleared.</summary>
    public Guid? ClearedReceiptId { get; private set; }
    public DateOnly? BouncedOn { get; private set; }
    public string? BounceReason { get; private set; }
    /// <summary>If a bounced/cancelled cheque was replaced, points to the new PDC.</summary>
    public Guid? ReplacedByChequeId { get; private set; }
    public DateOnly? CancelledOn { get; private set; }
    public string? CancellationReason { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public bool IsTerminal => Status is PostDatedChequeStatus.Cleared
        or PostDatedChequeStatus.Bounced or PostDatedChequeStatus.Cancelled;

    public void SetNotes(string? notes) => Notes = notes;

    public void MarkDeposited(DateOnly on)
    {
        if (Status != PostDatedChequeStatus.Pledged)
            throw new InvalidOperationException($"Only Pledged cheques can be marked Deposited (current: {Status}).");
        Status = PostDatedChequeStatus.Deposited;
        DepositedOn = on;
    }

    /// <summary>Bank confirmed clearance. The matching Receipt id is recorded so the cheque
    /// has an audit trail back to the ledger entry. Caller is responsible for issuing the
    /// Receipt via the standard ReceiptService — this method only flips the lifecycle.</summary>
    public void MarkCleared(DateOnly on, Guid receiptId)
    {
        if (Status is PostDatedChequeStatus.Cleared or PostDatedChequeStatus.Bounced or PostDatedChequeStatus.Cancelled)
            throw new InvalidOperationException($"Cheque is already {Status}.");
        Status = PostDatedChequeStatus.Cleared;
        ClearedOn = on;
        ClearedReceiptId = receiptId;
    }

    public void MarkBounced(DateOnly on, string reason)
    {
        if (string.IsNullOrWhiteSpace(reason)) throw new ArgumentException("Reason required.", nameof(reason));
        if (Status is PostDatedChequeStatus.Cleared or PostDatedChequeStatus.Cancelled)
            throw new InvalidOperationException($"Cheque is already {Status}.");
        Status = PostDatedChequeStatus.Bounced;
        BouncedOn = on;
        BounceReason = reason;
    }

    public void MarkCancelled(DateOnly on, string reason)
    {
        if (string.IsNullOrWhiteSpace(reason)) throw new ArgumentException("Reason required.", nameof(reason));
        if (Status == PostDatedChequeStatus.Cleared)
            throw new InvalidOperationException("A cleared cheque cannot be cancelled — reverse the receipt instead.");
        Status = PostDatedChequeStatus.Cancelled;
        CancelledOn = on;
        CancellationReason = reason;
    }

    public void LinkReplacement(Guid newChequeId)
    {
        if (Status is not (PostDatedChequeStatus.Bounced or PostDatedChequeStatus.Cancelled))
            throw new InvalidOperationException("Only bounced or cancelled cheques can be replaced.");
        ReplacedByChequeId = newChequeId;
    }
}
