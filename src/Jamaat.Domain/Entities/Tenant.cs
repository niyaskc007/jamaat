using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

public sealed class Tenant : AggregateRoot<Guid>, IAuditable
{
    private Tenant() { }

    public Tenant(Guid id, string code, string name)
    {
        if (string.IsNullOrWhiteSpace(code)) throw new ArgumentException("Tenant code required.", nameof(code));
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Tenant name required.", nameof(name));
        Id = id;
        Code = code.ToUpperInvariant();
        Name = name;
        IsActive = true;
    }

    public string Code { get; private set; } = default!;
    public string Name { get; private set; } = default!;
    public bool IsActive { get; private set; }
    public string? BaseCurrency { get; private set; } = "INR";
    public string? Address { get; private set; }
    public string? Phone { get; private set; }
    public string? Email { get; private set; }
    public string? LogoPath { get; private set; }

    /// Regional grouping above this Jamaat (e.g., "Khaleej"). Reserved for multi-jamaat rollups.
    public string? JamiaatCode { get; private set; }
    public string? JamiaatName { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void UpdateDetails(string name, string? address, string? phone, string? email)
    {
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Tenant name required.", nameof(name));
        Name = name;
        Address = address;
        Phone = phone;
        Email = email;
    }

    public void SetJamiaat(string? code, string? name)
    {
        JamiaatCode = code;
        JamiaatName = name;
    }

    public void Deactivate() => IsActive = false;
    public void Activate() => IsActive = true;
}
