using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

/// <summary>
/// Optional second-tier classification under a <see cref="FundCategoryEntity"/>. Lets a single category
/// (e.g. Permanent Income) carry many distinct schemes (Mohammedi Scheme, Sabil, etc.) without
/// proliferating top-level categories.
/// </summary>
public sealed class FundSubCategory : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private FundSubCategory() { }

    public FundSubCategory(Guid id, Guid tenantId, Guid fundCategoryId, string code, string name)
    {
        if (fundCategoryId == Guid.Empty) throw new ArgumentException("FundCategoryId required.", nameof(fundCategoryId));
        if (string.IsNullOrWhiteSpace(code)) throw new ArgumentException("Code required.", nameof(code));
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Name required.", nameof(name));
        Id = id;
        TenantId = tenantId;
        FundCategoryId = fundCategoryId;
        Code = code.ToUpperInvariant();
        Name = name;
        IsActive = true;
        SortOrder = 0;
    }

    public Guid TenantId { get; private set; }
    public Guid FundCategoryId { get; private set; }
    public string Code { get; private set; } = default!;
    public string Name { get; private set; } = default!;
    public string? Description { get; private set; }
    public int SortOrder { get; private set; }
    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Update(string name, string? description, int sortOrder, bool isActive)
    {
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Name required.", nameof(name));
        Name = name;
        Description = description;
        SortOrder = sortOrder;
        IsActive = isActive;
    }

    public void MoveTo(Guid newFundCategoryId)
    {
        if (newFundCategoryId == Guid.Empty) throw new ArgumentException("FundCategoryId required.", nameof(newFundCategoryId));
        FundCategoryId = newFundCategoryId;
    }
}
