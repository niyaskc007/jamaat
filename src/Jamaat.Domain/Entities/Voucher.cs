using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

public sealed class Voucher : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private readonly List<VoucherLine> _lines = [];

    private Voucher() { }

    public Voucher(Guid id, Guid tenantId, DateOnly voucherDate, string payTo, string currency)
    {
        Id = id;
        TenantId = tenantId;
        VoucherDate = voucherDate;
        PayTo = payTo;
        Currency = currency;
        Status = VoucherStatus.Draft;
        PaymentMode = PaymentMode.Cash;
    }

    public Guid TenantId { get; private set; }
    public string? VoucherNumber { get; private set; }
    public DateOnly VoucherDate { get; private set; }
    public string PayTo { get; private set; } = default!;
    public string? PayeeItsNumber { get; private set; }
    public string Purpose { get; private set; } = string.Empty;
    public decimal AmountTotal { get; private set; }
    public string Currency { get; private set; } = "AED";
    public decimal FxRate { get; private set; } = 1m;
    public string BaseCurrency { get; private set; } = "AED";
    public decimal BaseAmountTotal { get; private set; }
    public PaymentMode PaymentMode { get; private set; }
    public string? ChequeNumber { get; private set; }
    public DateOnly? ChequeDate { get; private set; }
    public string? DrawnOnBank { get; private set; }
    public Guid? BankAccountId { get; private set; }
    public DateOnly? PaymentDate { get; private set; }
    public string? Remarks { get; private set; }
    public VoucherStatus Status { get; private set; }
    public Guid? ApprovedByUserId { get; private set; }
    public string? ApprovedByUserName { get; private set; }
    public DateTimeOffset? ApprovedAtUtc { get; private set; }
    public Guid? PaidByUserId { get; private set; }
    public string? PaidByUserName { get; private set; }
    public DateTimeOffset? PaidAtUtc { get; private set; }
    public DateTimeOffset? CancelledAtUtc { get; private set; }
    public string? CancellationReason { get; private set; }
    public DateTimeOffset? ReversedAtUtc { get; private set; }
    public string? ReversalReason { get; private set; }
    public Guid? FinancialPeriodId { get; private set; }
    public Guid? NumberingSeriesId { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public IReadOnlyCollection<VoucherLine> Lines => _lines.AsReadOnly();

    public void SetHeader(string payTo, string? payeeIts, string purpose)
    {
        PayTo = payTo;
        PayeeItsNumber = payeeIts;
        Purpose = purpose;
    }

    public void SetPayment(PaymentMode mode, Guid? bankAccountId, string? chequeNumber, DateOnly? chequeDate, string? drawnOnBank, DateOnly? paymentDate)
    {
        PaymentMode = mode;
        BankAccountId = bankAccountId;
        ChequeNumber = chequeNumber;
        ChequeDate = chequeDate;
        DrawnOnBank = drawnOnBank;
        PaymentDate = paymentDate;
    }

    public void SetRemarks(string? remarks) => Remarks = remarks;

    public void ReplaceLines(IEnumerable<VoucherLine> lines)
    {
        if (Status != VoucherStatus.Draft) throw new InvalidOperationException("Cannot edit lines after submission.");
        _lines.Clear();
        _lines.AddRange(lines);
        AmountTotal = _lines.Sum(l => l.Amount);
    }

    public void ApplyFxConversion(string baseCurrency, decimal fxRate, decimal baseAmountTotal)
    {
        if (fxRate <= 0) throw new ArgumentException("FX rate must be positive.", nameof(fxRate));
        BaseCurrency = baseCurrency.ToUpperInvariant();
        FxRate = fxRate;
        BaseAmountTotal = baseAmountTotal;
    }

    public void Submit(bool requiresApproval)
    {
        if (Status != VoucherStatus.Draft) throw new InvalidOperationException("Only drafts can be submitted.");
        if (_lines.Count == 0) throw new InvalidOperationException("Voucher must have at least one line.");
        Status = requiresApproval ? VoucherStatus.PendingApproval : VoucherStatus.Approved;
    }

    public void Approve(Guid userId, string userName, DateTimeOffset at)
    {
        if (Status != VoucherStatus.PendingApproval && Status != VoucherStatus.Draft)
            throw new InvalidOperationException("Only pending vouchers can be approved.");
        Status = VoucherStatus.Approved;
        ApprovedByUserId = userId;
        ApprovedByUserName = userName;
        ApprovedAtUtc = at;
    }

    public void MarkPaid(string voucherNumber, Guid periodId, Guid numberingSeriesId, Guid userId, string userName, DateTimeOffset at)
    {
        if (Status != VoucherStatus.Approved) throw new InvalidOperationException("Only approved vouchers can be marked paid.");
        VoucherNumber = voucherNumber;
        FinancialPeriodId = periodId;
        NumberingSeriesId = numberingSeriesId;
        Status = VoucherStatus.Paid;
        PaidAtUtc = at;
        PaidByUserId = userId;
        PaidByUserName = userName;
    }

    public void Cancel(string reason, Guid userId, DateTimeOffset at)
    {
        if (Status == VoucherStatus.Cancelled || Status == VoucherStatus.Reversed) return;
        Status = VoucherStatus.Cancelled;
        CancelledAtUtc = at;
        _ = userId;
        CancellationReason = reason;
    }

    public void MarkReversed(string reason, DateTimeOffset at)
    {
        Status = VoucherStatus.Reversed;
        ReversedAtUtc = at;
        ReversalReason = reason;
    }
}

public sealed class VoucherLine : Entity<Guid>
{
    private VoucherLine() { }

    public VoucherLine(Guid id, int lineNo, Guid expenseTypeId, decimal amount, string? narration)
    {
        Id = id;
        LineNo = lineNo;
        ExpenseTypeId = expenseTypeId;
        Amount = amount;
        Narration = narration;
    }

    public Guid VoucherId { get; private set; }
    public int LineNo { get; private set; }
    public Guid ExpenseTypeId { get; private set; }
    public decimal Amount { get; private set; }
    public string? Narration { get; private set; }
}
