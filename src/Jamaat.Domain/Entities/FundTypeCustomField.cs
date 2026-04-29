using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

/// <summary>
/// Admin-defined extra field that the receipt form renders dynamically when its
/// <see cref="FundTypeId"/> is selected. The value is captured into <c>Receipt.CustomFieldsJson</c>
/// (a JSON map of FieldKey → string value) at confirmation.
/// </summary>
/// <remarks>
/// Each fund type can carry many fields. Position by <see cref="SortOrder"/>; required fields
/// block submit if empty. Dropdowns get a comma-separated <see cref="OptionsCsv"/>; other types
/// ignore that property.
/// </remarks>
public sealed class FundTypeCustomField : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private FundTypeCustomField() { }

    public FundTypeCustomField(Guid id, Guid tenantId, Guid fundTypeId, string fieldKey, string label, CustomFieldType fieldType)
    {
        if (fundTypeId == Guid.Empty) throw new ArgumentException("FundTypeId required.", nameof(fundTypeId));
        if (string.IsNullOrWhiteSpace(fieldKey)) throw new ArgumentException("Field key required.", nameof(fieldKey));
        if (string.IsNullOrWhiteSpace(label)) throw new ArgumentException("Label required.", nameof(label));
        Id = id;
        TenantId = tenantId;
        FundTypeId = fundTypeId;
        FieldKey = fieldKey.Trim();
        Label = label;
        FieldType = fieldType;
        IsRequired = false;
        IsActive = true;
        SortOrder = 0;
    }

    public Guid TenantId { get; private set; }
    public Guid FundTypeId { get; private set; }
    /// <summary>Stable internal key used to look the value up on a receipt - letters/digits/underscore only.</summary>
    public string FieldKey { get; private set; } = default!;
    /// <summary>Display label shown on the receipt form.</summary>
    public string Label { get; private set; } = default!;
    public string? HelpText { get; private set; }
    public CustomFieldType FieldType { get; private set; }
    public bool IsRequired { get; private set; }
    public string? OptionsCsv { get; private set; }
    /// <summary>Optional default value as a string (parsed by the renderer per <see cref="FieldType"/>).</summary>
    public string? DefaultValue { get; private set; }
    public int SortOrder { get; private set; }
    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Update(string label, CustomFieldType fieldType, bool isRequired, string? helpText, string? optionsCsv, string? defaultValue, int sortOrder, bool isActive)
    {
        if (string.IsNullOrWhiteSpace(label)) throw new ArgumentException("Label required.", nameof(label));
        Label = label;
        FieldType = fieldType;
        IsRequired = isRequired;
        HelpText = helpText;
        OptionsCsv = optionsCsv;
        DefaultValue = defaultValue;
        SortOrder = sortOrder;
        IsActive = isActive;
    }
}
