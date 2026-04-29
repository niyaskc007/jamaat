namespace Jamaat.Domain.Enums;

/// <summary>
/// High-level kind that drives behaviour of every fund category. Unlike <see cref="FundCategory"/>
/// (the legacy enum on FundType), this is the *type* of a master <c>FundCategory</c> entity -
/// each Jamaat instance can author multiple categories of the same kind. The kind tells the
/// system how money entering or leaving categories of this kind should be treated.
/// </summary>
/// <remarks>
/// Spec mapping (from the Jan 2026 fund-management requirement):
/// - PermanentIncome: Mohammedi-style schemes - receipts post to income, no return obligation.
/// - TemporaryIncome: Hussaini-style schemes - receipts post to a returnable-contribution liability.
/// - LoanFund: Qarzan Hasana and similar - same fund can receive both returnable and permanent
///   contributions AND issue loans to beneficiaries.
/// - CommitmentScheme: scheme-driven pledges with structured instalment schedules.
/// - FunctionBased: contributions tied to a specific event/majlis/program.
/// - Other: escape hatch for future categories that don't fit the above shapes.
/// </remarks>
public enum FundCategoryKind
{
    PermanentIncome = 1,
    TemporaryIncome = 2,
    LoanFund = 3,
    CommitmentScheme = 4,
    FunctionBased = 5,
    Other = 99,
}
