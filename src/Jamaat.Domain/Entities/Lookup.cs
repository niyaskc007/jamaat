using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

/// <summary>
/// Generic per-tenant lookup list (e.g., SabilType, WajebaatType, NiyazType).
/// Category groups the entries; Code is unique per (tenant, category).
/// </summary>
public sealed class Lookup : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private Lookup() { }

    public Lookup(Guid id, Guid tenantId, string category, string code, string name)
    {
        if (string.IsNullOrWhiteSpace(category)) throw new ArgumentException("Category required.", nameof(category));
        if (string.IsNullOrWhiteSpace(code)) throw new ArgumentException("Code required.", nameof(code));
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Name required.", nameof(name));
        Id = id;
        TenantId = tenantId;
        Category = category;
        Code = code.ToUpperInvariant();
        Name = name;
        IsActive = true;
    }

    public Guid TenantId { get; private set; }
    public string Category { get; private set; } = default!;
    public string Code { get; private set; } = default!;
    public string Name { get; private set; } = default!;
    public string? NameArabic { get; private set; }
    public int SortOrder { get; private set; }
    public bool IsActive { get; private set; }
    public string? Notes { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Update(string name, string? nameArabic, int sortOrder, string? notes, bool isActive)
    {
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Name required.", nameof(name));
        Name = name;
        NameArabic = nameArabic;
        SortOrder = sortOrder;
        Notes = notes;
        IsActive = isActive;
    }
}
