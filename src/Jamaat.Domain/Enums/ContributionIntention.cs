namespace Jamaat.Domain.Enums;

/// <summary>
/// Captures the contributor's Niyyath at receipt time. Drives accounting + return-processing
/// behaviour: <see cref="Permanent"/> receipts post to income (no obligation), <see cref="Returnable"/>
/// receipts create a return obligation tracked until matured + settled.
/// </summary>
/// <remarks>
/// Defaults to <see cref="Permanent"/> for backwards compatibility — every receipt that existed
/// before this enum was added is treated as permanent. The Receipt form only surfaces the choice
/// when the selected FundType has <c>IsReturnable=true</c>.
/// </remarks>
public enum ContributionIntention
{
    Permanent = 1,
    Returnable = 2,
}
