using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

/// <summary>
/// Admin-managed master classification for Qarzan Hasana loans. Replaces the legacy
/// <see cref="Enums.QarzanHasanaScheme"/> two-value enum so a Jamaat can author its
/// own scheme catalog (typically 10+ schemes with subcategories) without code
/// changes. Parent/child support is built-in: top-level schemes have
/// <see cref="ParentSchemeId"/> = null, and subcategories point at their parent's
/// id. The conditional "gold collateral required" panel on the QH form drives off
/// <see cref="RequiresGoldCollateral"/> instead of a hardcoded enum check, so a new
/// gold-backed scheme is one master-data create away.
/// </summary>
/// <remarks>
/// The legacy int <c>Scheme</c> column on <see cref="QarzanHasanaLoan"/> stays for
/// backwards compatibility with already-issued loans. A nullable <c>SchemeId</c>
/// column has been added and is the source of truth for new loans. The seeder
/// backfills SchemeId on existing rows from the int Scheme value.
/// </remarks>
public sealed class QhScheme : AggregateRoot<Guid>, ITenantScoped, IAuditable, ISoftDeletable
{
    private QhScheme() { }

    public QhScheme(Guid id, Guid tenantId, string code, string name, bool requiresGoldCollateral)
    {
        if (string.IsNullOrWhiteSpace(code)) throw new ArgumentException("Code required.", nameof(code));
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Name required.", nameof(name));
        Id = id;
        TenantId = tenantId;
        Code = code.ToUpperInvariant();
        Name = name;
        RequiresGoldCollateral = requiresGoldCollateral;
        IsActive = true;
        SortOrder = 0;
    }

    public Guid TenantId { get; private set; }
    public string Code { get; private set; } = default!;
    public string Name { get; private set; } = default!;
    public string? Description { get; private set; }

    /// Null for top-level schemes; points at another QhScheme.Id for subcategories.
    /// A subcategory inherits its parent's <see cref="RequiresGoldCollateral"/> on
    /// the UI side - the form picks whichever of parent/child has it set.
    public Guid? ParentSchemeId { get; private set; }

    /// Drives the conditional "gold collateral details" form section. When false
    /// (typical for benevolent schemes), the form hides the gold panel entirely
    /// and the validator doesn't require gold fields. When true, gold weight +
    /// karat + held-at + slip url become required for submission.
    public bool RequiresGoldCollateral { get; private set; }

    public int SortOrder { get; private set; }
    public bool IsActive { get; private set; }

    /// Optional shim that maps an admin-authored scheme back to one of the legacy
    /// int values (1 = MohammadiScheme, 2 = HussainScheme, 0 = Other). Lets the
    /// legacy <c>Scheme</c> column stay populated for backwards compatibility with
    /// historical reports + existing display code that branches on the int.
    public int LegacySchemeValue { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public DateTimeOffset? DeletedAtUtc { get; set; }
    public Guid? DeletedByUserId { get; set; }
    public string? DeletionReason { get; set; }
    public DateTimeOffset? RetentionUntilUtc { get; set; }

    public void Update(string name, string? description, Guid? parentSchemeId, bool requiresGoldCollateral, int sortOrder, bool isActive, int legacySchemeValue)
    {
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Name required.", nameof(name));
        if (parentSchemeId == Id) throw new InvalidOperationException("A scheme cannot be its own parent.");
        Name = name;
        Description = description;
        ParentSchemeId = parentSchemeId;
        RequiresGoldCollateral = requiresGoldCollateral;
        SortOrder = sortOrder;
        IsActive = isActive;
        LegacySchemeValue = legacySchemeValue;
    }

    /// Used by the seeder to set ParentSchemeId post-construction (the parent's
    /// id isn't known at the point the child is constructed).
    public void SetParent(Guid? parentSchemeId)
    {
        if (parentSchemeId == Id) throw new InvalidOperationException("A scheme cannot be its own parent.");
        ParentSchemeId = parentSchemeId;
    }

    public void SetLegacyValue(int value) => LegacySchemeValue = value;
}
