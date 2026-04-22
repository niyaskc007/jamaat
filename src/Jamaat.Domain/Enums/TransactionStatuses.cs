namespace Jamaat.Domain.Enums;

public enum ReceiptStatus
{
    Draft = 1,
    Confirmed = 2,
    Cancelled = 3,
    Reversed = 4,
}

public enum VoucherStatus
{
    Draft = 1,
    PendingApproval = 2,
    Approved = 3,
    Paid = 4,
    Cancelled = 5,
    Reversed = 6,
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
