namespace Jamaat.Domain.Enums;

/// <summary>
/// Lifecycle state of a returnable receipt's return-obligation. Computed from
/// (today vs MaturityDate) and (AmountReturned vs AmountTotal); persisted on the
/// receipt so reports can filter on it without joining or recomputing.
/// </summary>
/// <remarks>
/// State transitions:
/// <list type="bullet">
///   <item>NotApplicable - permanent receipt; no obligation.</item>
///   <item>NotMatured - returnable + today &lt; MaturityDate (or MaturityDate is null and IsReturnable).</item>
///   <item>Matured - returnable + today &gt;= MaturityDate + AmountReturned == 0.</item>
///   <item>PartiallyReturned - some return processed but balance &gt; 0 (regardless of maturity).</item>
///   <item>FullyReturned - AmountReturned &gt;= AmountTotal.</item>
/// </list>
/// </remarks>
public enum ReturnableMaturityState
{
    NotApplicable = 0,
    NotMatured = 1,
    Matured = 2,
    PartiallyReturned = 3,
    FullyReturned = 4,
}
