using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

/// <summary>
/// Admin-managed label override per (FundType, TransactionLabelType). Lets the Jamaat
/// rebrand approval prompts, audit-log entries, notification subjects, and PDFs without
/// code changes — e.g. show "His Contribution" for one scheme and "Niyaz Pledge" for another.
/// </summary>
/// <remarks>
/// FundTypeId may be null to represent a system-wide default for the given
/// <see cref="LabelType"/>. The lookup hierarchy is: (FundType, Type) → (null, Type) → built-in.
/// </remarks>
public sealed class TransactionLabel : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private TransactionLabel() { }

    public TransactionLabel(Guid id, Guid tenantId, Guid? fundTypeId, TransactionLabelType labelType, string label)
    {
        if (string.IsNullOrWhiteSpace(label)) throw new ArgumentException("Label required.", nameof(label));
        Id = id;
        TenantId = tenantId;
        FundTypeId = fundTypeId;
        LabelType = labelType;
        Label = label;
        IsActive = true;
    }

    public Guid TenantId { get; private set; }
    /// <summary>Null = system-wide default for the LabelType.</summary>
    public Guid? FundTypeId { get; private set; }
    public TransactionLabelType LabelType { get; private set; }
    public string Label { get; private set; } = default!;
    public string? Notes { get; private set; }
    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Update(string label, string? notes, bool isActive)
    {
        if (string.IsNullOrWhiteSpace(label)) throw new ArgumentException("Label required.", nameof(label));
        Label = label;
        Notes = notes;
        IsActive = isActive;
    }
}
