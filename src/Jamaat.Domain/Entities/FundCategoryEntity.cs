using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

/// <summary>
/// Admin-managed master classification for fund types - replaces the legacy <see cref="FundCategory"/>
/// enum on <see cref="FundType"/>. The Jamaat can author Permanent Income, Temporary Income, Loan Fund,
/// Commitment Scheme and Function-based categories without code changes; each carries a <see cref="Kind"/>
/// flag the system uses to drive behaviour (returnable vs not, loan-issuing, etc.).
/// </summary>
/// <remarks>
/// Named with the <c>Entity</c> suffix to avoid colliding with the existing <see cref="FundCategory"/> enum
/// during the transition. Once the enum is fully retired (a later migration), this can be renamed.
/// </remarks>
public sealed class FundCategoryEntity : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private FundCategoryEntity() { }

    public FundCategoryEntity(Guid id, Guid tenantId, string code, string name, FundCategoryKind kind)
    {
        if (string.IsNullOrWhiteSpace(code)) throw new ArgumentException("Code required.", nameof(code));
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Name required.", nameof(name));
        Id = id;
        TenantId = tenantId;
        Code = code.ToUpperInvariant();
        Name = name;
        Kind = kind;
        IsActive = true;
        SortOrder = 0;
    }

    public Guid TenantId { get; private set; }
    public string Code { get; private set; } = default!;
    public string Name { get; private set; } = default!;
    public FundCategoryKind Kind { get; private set; }
    public string? Description { get; private set; }
    public int SortOrder { get; private set; }
    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Update(string name, FundCategoryKind kind, string? description, int sortOrder, bool isActive)
    {
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Name required.", nameof(name));
        Name = name;
        Kind = kind;
        Description = description;
        SortOrder = sortOrder;
        IsActive = isActive;
    }
}
