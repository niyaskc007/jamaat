using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

/// <summary>
/// A post-dated cheque tracked from receipt to clearance. Polymorphic over its source document:
/// it can be linked to a <see cref="Commitment"/> (legacy path - clearing issues a new Receipt
/// against an installment), a <see cref="Receipt"/> held in PendingClearance (clearing confirms
/// that receipt + posts to GL), or a <see cref="Voucher"/> held in PendingClearance (clearing
/// approves + pays + posts).
/// <para>
/// Why a separate aggregate rather than mutating the source: a Receipt represents money received,
/// a Voucher represents money paid. A future-dated cheque is a promise on either side. Treating
/// it as a separate lifecycle lets the GL stay accurate (no posting until cleared) while still
/// giving cashiers a single workbench to track every cheque they're holding.
/// </para>
/// </summary>
public sealed class PostDatedCheque : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private PostDatedCheque() { }

    /// <summary>Legacy constructor: PDC tracking a commitment installment. Clearing this kind
    /// of PDC creates a fresh Receipt allocated to the linked installment.</summary>
    public PostDatedCheque(
        Guid id, Guid tenantId,
        Guid commitmentId, Guid? commitmentInstallmentId,
        Guid memberId,
        string chequeNumber, DateOnly chequeDate, string drawnOnBank,
        decimal amount, string currency)
    {
        if (commitmentId == Guid.Empty) throw new ArgumentException("CommitmentId required.", nameof(commitmentId));
        if (memberId == Guid.Empty) throw new ArgumentException("MemberId required.", nameof(memberId));
        AssertChequeFields(chequeNumber, drawnOnBank, amount);

        Id = id;
        TenantId = tenantId;
        CommitmentId = commitmentId;
        CommitmentInstallmentId = commitmentInstallmentId;
        MemberId = memberId;
        Source = PostDatedChequeSource.Commitment;
        ChequeNumber = chequeNumber.Trim();
        ChequeDate = chequeDate;
        DrawnOnBank = drawnOnBank.Trim();
        Amount = amount;
        Currency = currency.ToUpperInvariant();
        Status = PostDatedChequeStatus.Pledged;
    }

    /// <summary>Factory: PDC backing a Receipt that's been drafted but is sitting in
    /// PendingClearance until the cheque clears. Receipt + member references are preserved
    /// so the cheques workbench can still show "who paid" and link to the source receipt.</summary>
    public static PostDatedCheque ForReceipt(
        Guid id, Guid tenantId, Guid sourceReceiptId, Guid memberId,
        string chequeNumber, DateOnly chequeDate, string drawnOnBank,
        decimal amount, string currency)
    {
        if (sourceReceiptId == Guid.Empty) throw new ArgumentException("Source receipt required.", nameof(sourceReceiptId));
        if (memberId == Guid.Empty) throw new ArgumentException("MemberId required.", nameof(memberId));
        AssertChequeFields(chequeNumber, drawnOnBank, amount);
        return new PostDatedCheque
        {
            Id = id,
            TenantId = tenantId,
            SourceReceiptId = sourceReceiptId,
            MemberId = memberId,
            Source = PostDatedChequeSource.Receipt,
            ChequeNumber = chequeNumber.Trim(),
            ChequeDate = chequeDate,
            DrawnOnBank = drawnOnBank.Trim(),
            Amount = amount,
            Currency = currency.ToUpperInvariant(),
            Status = PostDatedChequeStatus.Pledged,
        };
    }

    /// <summary>Factory: PDC backing a Voucher held in PendingClearance until the cheque clears.
    /// Vouchers may be paid to non-members (vendors, contractors), so MemberId is left null;
    /// the voucher's PayTo string is what shows in the cashier workbench.</summary>
    public static PostDatedCheque ForVoucher(
        Guid id, Guid tenantId, Guid sourceVoucherId,
        string chequeNumber, DateOnly chequeDate, string drawnOnBank,
        decimal amount, string currency)
    {
        if (sourceVoucherId == Guid.Empty) throw new ArgumentException("Source voucher required.", nameof(sourceVoucherId));
        AssertChequeFields(chequeNumber, drawnOnBank, amount);
        return new PostDatedCheque
        {
            Id = id,
            TenantId = tenantId,
            SourceVoucherId = sourceVoucherId,
            Source = PostDatedChequeSource.Voucher,
            ChequeNumber = chequeNumber.Trim(),
            ChequeDate = chequeDate,
            DrawnOnBank = drawnOnBank.Trim(),
            Amount = amount,
            Currency = currency.ToUpperInvariant(),
            Status = PostDatedChequeStatus.Pledged,
        };
    }

    private static void AssertChequeFields(string chequeNumber, string drawnOnBank, decimal amount)
    {
        if (string.IsNullOrWhiteSpace(chequeNumber)) throw new ArgumentException("Cheque number required.", nameof(chequeNumber));
        if (string.IsNullOrWhiteSpace(drawnOnBank)) throw new ArgumentException("Drawn-on bank required.", nameof(drawnOnBank));
        if (amount <= 0) throw new ArgumentException("Amount must be positive.", nameof(amount));
    }

    public Guid TenantId { get; private set; }

    /// <summary>Discriminator: which source document this cheque is tracking.</summary>
    public PostDatedChequeSource Source { get; private set; }

    // Source pointers - exactly one is non-null per row, matching <see cref="Source"/>.
    public Guid? CommitmentId { get; private set; }
    public Guid? CommitmentInstallmentId { get; private set; }
    public Guid? SourceReceiptId { get; private set; }
    public Guid? SourceVoucherId { get; private set; }

    /// <summary>The contributor / borrower / payee identified as a member, when applicable.
    /// Set for Commitment- and Receipt-source PDCs; null for Voucher-source PDCs paid to a
    /// non-member vendor.</summary>
    public Guid? MemberId { get; private set; }

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
    /// <summary>Receipt produced (Commitment-source) or confirmed (Receipt-source) when the cheque
    /// cleared. Null for Voucher-source PDCs (no receipt is involved on the voucher path).</summary>
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
        // The whole point of "post-dated" is that the cheque cannot be presented to the bank
        // before its printed date - the bank will reject it. Treat depositing-before-the-date
        // as a logic error so the cashier doesn't strand the cheque in a wrong state.
        if (on < ChequeDate)
            throw new InvalidOperationException(
                $"Cannot deposit cheque {ChequeNumber} on {on:yyyy-MM-dd} - it's dated {ChequeDate:yyyy-MM-dd}. Wait until on/after the cheque date.");
        Status = PostDatedChequeStatus.Deposited;
        DepositedOn = on;
    }

    /// <summary>Bank confirmed clearance. The matching Receipt id is recorded so the cheque has
    /// an audit trail back to the ledger entry. Caller is responsible for the source-side action
    /// (issue Receipt for Commitment-source; confirm the existing Receipt for Receipt-source;
    /// pay the Voucher for Voucher-source). For Voucher-source, <paramref name="receiptId"/> is null.</summary>
    public void MarkCleared(DateOnly on, Guid? receiptId)
    {
        if (Status is PostDatedChequeStatus.Cleared or PostDatedChequeStatus.Bounced or PostDatedChequeStatus.Cancelled)
            throw new InvalidOperationException($"Cheque is already {Status}.");
        if (on < ChequeDate)
            throw new InvalidOperationException(
                $"Cannot clear cheque {ChequeNumber} on {on:yyyy-MM-dd} - it's dated {ChequeDate:yyyy-MM-dd}. Wait until on/after the cheque date.");
        Status = PostDatedChequeStatus.Cleared;
        ClearedOn = on;
        ClearedReceiptId = receiptId;
    }

    public void MarkBounced(DateOnly on, string reason)
    {
        if (string.IsNullOrWhiteSpace(reason)) throw new ArgumentException("Reason required.", nameof(reason));
        if (Status is PostDatedChequeStatus.Cleared or PostDatedChequeStatus.Cancelled)
            throw new InvalidOperationException($"Cheque is already {Status}.");
        if (on < ChequeDate)
            throw new InvalidOperationException(
                $"Cannot bounce cheque {ChequeNumber} on {on:yyyy-MM-dd} - it's dated {ChequeDate:yyyy-MM-dd}.");
        Status = PostDatedChequeStatus.Bounced;
        BouncedOn = on;
        BounceReason = reason;
    }

    public void MarkCancelled(DateOnly on, string reason)
    {
        if (string.IsNullOrWhiteSpace(reason)) throw new ArgumentException("Reason required.", nameof(reason));
        if (Status == PostDatedChequeStatus.Cleared)
            throw new InvalidOperationException("A cleared cheque cannot be cancelled - reverse the receipt instead.");
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
