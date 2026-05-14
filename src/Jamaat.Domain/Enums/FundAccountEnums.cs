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

/// Schemes are currently code-defined (not master-data). To add a new scheme:
///
///   1. Append a new entry to this enum with the next int value. Never
///      re-number existing entries - they are persisted in the DB.
///   2. Update `QhSchemeLabel` in
///      web/jamaat-web/src/features/qarzan-hasana/qarzanHasanaApi.ts so the
///      operator + admin forms show the human label.
///   3. Update the duplicate scheme select in
///      web/jamaat-web/src/features/portal/me/MemberPortalDetailPages.tsx
///      (around `MemberQhSubmitPage`) so members can pick it too.
///   4. If the new scheme requires conditional form fields (e.g. Mohammadi
///      requires gold collateral details), branch on `scheme === N` in both
///      forms - the operator form already does this around its gold panel.
///   5. No DB migration is needed - the column is an int and accepts any
///      value. No validator change is needed either.
///
/// A future refactor could move schemes into a tenant-configurable master-
/// data table (similar to FundType), but that's out of scope for v1.
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

public enum QhGuarantorConsentStatus
{
    Pending = 1,
    Accepted = 2,
    Declined = 3,
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
