using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

/// <summary>
/// A community organisation or committee (e.g., Shababil Eidz-Zahabi, Tanzeem Committee, Zakereen, Alaqeeq).
/// </summary>
public sealed class Organisation : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private Organisation() { }

    public Organisation(Guid id, Guid tenantId, string code, string name)
    {
        if (string.IsNullOrWhiteSpace(code)) throw new ArgumentException("Code required.", nameof(code));
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Name required.", nameof(name));
        Id = id;
        TenantId = tenantId;
        Code = code.ToUpperInvariant();
        Name = name;
        IsActive = true;
    }

    public Guid TenantId { get; private set; }
    public string Code { get; private set; } = default!;
    public string Name { get; private set; } = default!;
    public string? NameArabic { get; private set; }
    public string? Category { get; private set; }
    public string? Notes { get; private set; }
    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Update(string name, string? nameArabic, string? category, string? notes, bool isActive)
    {
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Name required.", nameof(name));
        Name = name;
        NameArabic = nameArabic;
        Category = category;
        Notes = notes;
        IsActive = isActive;
    }
}

/// <summary>
/// Many-to-many link between a Member and an Organisation with a specific role.
/// Samples: "Member", "Treasurer", "Maliyah_Member", "Reciter".
/// </summary>
public sealed class MemberOrganisationMembership : Entity<Guid>, ITenantScoped, IAuditable
{
    private MemberOrganisationMembership() { }

    public MemberOrganisationMembership(Guid id, Guid tenantId, Guid memberId, Guid organisationId, string role)
    {
        Id = id;
        TenantId = tenantId;
        MemberId = memberId;
        OrganisationId = organisationId;
        Role = role;
        IsActive = true;
    }

    public Guid TenantId { get; private set; }
    public Guid MemberId { get; private set; }
    public Guid OrganisationId { get; private set; }
    public string Role { get; private set; } = default!;
    public DateOnly? StartDate { get; private set; }
    public DateOnly? EndDate { get; private set; }
    public bool IsActive { get; private set; }
    public string? Notes { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Update(string role, DateOnly? startDate, DateOnly? endDate, string? notes, bool isActive)
    {
        if (string.IsNullOrWhiteSpace(role)) throw new ArgumentException("Role required.", nameof(role));
        Role = role;
        StartDate = startDate;
        EndDate = endDate;
        Notes = notes;
        IsActive = isActive;
    }
}
