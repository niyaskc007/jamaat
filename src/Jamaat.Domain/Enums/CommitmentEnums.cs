namespace Jamaat.Domain.Enums;

public enum CommitmentFrequency
{
    OneTime = 1,
    Weekly = 2,
    BiWeekly = 3,
    Monthly = 4,
    Quarterly = 5,
    HalfYearly = 6,
    Yearly = 7,
    Custom = 99,
}

public enum CommitmentStatus
{
    Draft = 1,        // Created but agreement not yet accepted
    Active = 2,       // Agreement accepted, schedule running
    Completed = 3,    // All installments paid
    Cancelled = 4,
    Defaulted = 5,    // Grace period past, still unpaid
    Paused = 6,
}

public enum InstallmentStatus
{
    Pending = 1,
    PartiallyPaid = 2,
    Paid = 3,
    Overdue = 4,
    Waived = 5,
}

public enum CommitmentPartyType
{
    Member = 1,
    Family = 2,
}
