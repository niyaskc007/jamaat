using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

/// <summary>
/// Extended-kinship link between a <see cref="Family"/> and a <see cref="Member"/> who lives
/// in a different household. Lets the family detail capture relationships like "Saifee is the
/// uncle of this family's head" without changing Saifee's primary <see cref="Member.FamilyId"/>.
/// </summary>
/// <remarks>
/// Why a separate row rather than overloading <see cref="Member.FamilyId"/>: a member has
/// exactly one household (where the post lands, where receipts/contributions are addressed,
/// where the household roster shows them). Extended kinship - uncle, aunt, niece, nephew,
/// grand-son living with their parents, etc. - is a relationship, not a residency. Forcing
/// it through <c>FamilyId</c> would either silently move the relative out of their actual
/// home (we hit this earlier) or block legitimate "record the relationship" intents.
/// <para>
/// Mirrors are NOT auto-created: if the operator captures "Saifee is uncle of Family A's
/// head", the inverse "Family A's head is nephew of Family B's head" must be recorded
/// explicitly. Keeps the model simple and avoids speculative inserts the operator may not want.
/// </para>
/// </remarks>
public sealed class FamilyMemberLink : Entity<Guid>, ITenantScoped, IAuditable
{
    private FamilyMemberLink() { }

    public FamilyMemberLink(Guid id, Guid tenantId, Guid familyId, Guid memberId, FamilyRole role)
    {
        if (familyId == Guid.Empty) throw new ArgumentException("FamilyId required.", nameof(familyId));
        if (memberId == Guid.Empty) throw new ArgumentException("MemberId required.", nameof(memberId));

        Id = id;
        TenantId = tenantId;
        FamilyId = familyId;
        MemberId = memberId;
        Role = role;
    }

    public Guid TenantId { get; private set; }
    public Guid FamilyId { get; private set; }
    public Guid MemberId { get; private set; }
    public FamilyRole Role { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void ChangeRole(FamilyRole role) => Role = role;
}
