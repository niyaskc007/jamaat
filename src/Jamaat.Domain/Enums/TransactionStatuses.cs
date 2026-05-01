namespace Jamaat.Domain.Enums;

public enum ReceiptStatus
{
    Draft = 1,
    Confirmed = 2,
    Cancelled = 3,
    Reversed = 4,
    /// <summary>Held until a future-dated cheque clears (or bounces). The receipt has been
    /// captured with full line + payment details, but no ledger posting has been made and no
    /// receipt number has been assigned. Cleared by the matching <c>PostDatedCheque</c> transitioning
    /// to <c>Cleared</c>; cancelled if the cheque bounces.</summary>
    PendingClearance = 5,
}

public enum VoucherStatus
{
    Draft = 1,
    PendingApproval = 2,
    Approved = 3,
    Paid = 4,
    Cancelled = 5,
    Reversed = 6,
    /// <summary>Held until a future-dated cheque clears. Same semantics as the receipt analogue:
    /// captured with full lines + payment details, but no ledger posting and no voucher number.
    /// Transitions to Paid (and posts) on cheque clearance, or Cancelled on bounce.</summary>
    PendingClearance = 7,
}

public enum PeriodStatus
{
    Open = 1,
    Closed = 2,
}

public enum LedgerSourceType
{
    Receipt = 1,
    Voucher = 2,
    Journal = 3,
    Reversal = 4,
    OpeningBalance = 5,
}

public enum ReversalReasonType
{
    DataEntryError = 1,
    DuplicateEntry = 2,
    MemberRequest = 3,
    BankReturned = 4,
    Other = 99,
}
