using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

public sealed class Family : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private Family() { }

    public Family(Guid id, Guid tenantId, string code, string familyName, Guid? headMemberId = null)
    {
        Id = id;
        TenantId = tenantId;
        Code = code.ToUpperInvariant();
        FamilyName = familyName;
        HeadMemberId = headMemberId;
        IsActive = true;
    }

    public Guid TenantId { get; private set; }
    public string Code { get; private set; } = default!;
    /// Stable registry number issued by the Jamaat (e.g., "147"). Unique per tenant.
    public string? TanzeemFileNo { get; private set; }
    /// Mirror of the HOF's ITS number; lets downstream systems reference the family by a stable ITS identifier.
    public string? FamilyItsNumber { get; private set; }
    public string FamilyName { get; private set; } = default!;
    /// FK to Member.Id — the family head. Nullable during creation flow until a member is assigned.
    public Guid? HeadMemberId { get; private set; }
    public string? HeadItsNumber { get; private set; }
    public string? ContactPhone { get; private set; }
    public string? ContactEmail { get; private set; }
    public string? Address { get; private set; }
    public string? Notes { get; private set; }
    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void UpdateDetails(string familyName, string? phone, string? email, string? address, string? notes)
    {
        FamilyName = familyName;
        ContactPhone = phone;
        ContactEmail = email;
        Address = address;
        Notes = notes;
    }

    public void SetRegistry(string? tanzeemFileNo, string? familyItsNumber)
    {
        TanzeemFileNo = tanzeemFileNo;
        FamilyItsNumber = familyItsNumber;
    }

    public void SetHead(Guid memberId, string itsNumber)
    {
        HeadMemberId = memberId;
        HeadItsNumber = itsNumber;
        FamilyItsNumber ??= itsNumber;
    }

    public void Deactivate() => IsActive = false;
    public void Activate() => IsActive = true;
}
