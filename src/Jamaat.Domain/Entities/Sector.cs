using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

/// <summary>
/// A geographic/community grouping within a Jamaat (e.g., HATEMI sector).
/// Each sector has a male and female incharge.
/// </summary>
public sealed class Sector : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private Sector() { }

    public Sector(Guid id, Guid tenantId, string code, string name)
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
    public Guid? MaleInchargeMemberId { get; private set; }
    public Guid? FemaleInchargeMemberId { get; private set; }
    public string? Notes { get; private set; }
    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Update(string name, Guid? maleInchargeMemberId, Guid? femaleInchargeMemberId, string? notes, bool isActive)
    {
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Name required.", nameof(name));
        Name = name;
        MaleInchargeMemberId = maleInchargeMemberId;
        FemaleInchargeMemberId = femaleInchargeMemberId;
        Notes = notes;
        IsActive = isActive;
    }
}

public sealed class SubSector : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private SubSector() { }

    public SubSector(Guid id, Guid tenantId, Guid sectorId, string code, string name)
    {
        if (string.IsNullOrWhiteSpace(code)) throw new ArgumentException("Code required.", nameof(code));
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Name required.", nameof(name));
        Id = id;
        TenantId = tenantId;
        SectorId = sectorId;
        Code = code.ToUpperInvariant();
        Name = name;
        IsActive = true;
    }

    public Guid TenantId { get; private set; }
    public Guid SectorId { get; private set; }
    public string Code { get; private set; } = default!;
    public string Name { get; private set; } = default!;
    public Guid? MaleInchargeMemberId { get; private set; }
    public Guid? FemaleInchargeMemberId { get; private set; }
    public string? Notes { get; private set; }
    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Update(string name, Guid? maleInchargeMemberId, Guid? femaleInchargeMemberId, string? notes, bool isActive)
    {
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Name required.", nameof(name));
        Name = name;
        MaleInchargeMemberId = maleInchargeMemberId;
        FemaleInchargeMemberId = femaleInchargeMemberId;
        Notes = notes;
        IsActive = isActive;
    }
}
