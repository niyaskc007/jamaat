namespace Jamaat.Domain.Enums;

public enum FundEnrollmentRecurrence
{
    OneTime = 1,
    Monthly = 2,
    Quarterly = 3,
    HalfYearly = 4,
    Yearly = 5,
    Custom = 99,
}

public enum FundEnrollmentStatus
{
    Draft = 1,
    Active = 2,
    Paused = 3,
    Cancelled = 4,
    Expired = 5,
}

public enum QarzanHasanaScheme
{
    Other = 0,
    MohammadiScheme = 1,
    HussainScheme = 2,
}

public enum QarzanHasanaStatus
{
    Draft = 1,
    PendingLevel1 = 2,
    PendingLevel2 = 3,
    Approved = 4,
    Disbursed = 5,
    Active = 6,
    Completed = 7,
    Defaulted = 8,
    Cancelled = 9,
    Rejected = 10,
}

public enum QarzanHasanaInstallmentStatus
{
    Pending = 1,
    PartiallyPaid = 2,
    Paid = 3,
    Overdue = 4,
    Waived = 5,
}

public enum EventCategory
{
    Other = 0,
    Urs = 1,
    Miladi = 2,
    Shahadat = 3,
    Night = 4,
    AsharaMubaraka = 5,
    MiscReligious = 6,
    Community = 7,
}
