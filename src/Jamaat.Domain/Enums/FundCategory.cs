namespace Jamaat.Domain.Enums;

/// <summary>
/// High-level classification of a fund type. Drives which workflows can operate on it
/// (Commitment pledges + FundEnrollments are blocked on Loan funds; QH loans run only on Loan funds).
/// Each category may gain its own specialised fields over time.
/// </summary>
public enum FundCategory
{
    Donation = 1,          // e.g., Sabil, Wajebaat, Niyaz, Mutafariq — recurring or one-off giving
    Loan = 2,              // e.g., Qarzan Hasana — interest-free loans (receivable on the balance sheet)
    Charity = 3,           // beneficiary-directed giving (zakat, fitrah, disbursement-type charity)
    CommunitySupport = 4,  // funds directed at community programmes (education, housing, relief)
    Other = 99,
}
