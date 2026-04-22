using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

/// <summary>
/// Template for a commitment/pledge agreement. Rendered with runtime placeholders
/// when a commitment is created. The final rendered text is snapshotted onto the
/// commitment so template edits never retroactively alter signed agreements.
///
/// Supported placeholders:
///   {{party_name}}           member or family name
///   {{party_type}}           "Member" or "Family"
///   {{fund_name}}            e.g. "Madrasa Fund"
///   {{fund_code}}            e.g. "MADRASA"
///   {{total_amount}}         formatted money (e.g. "AED 5,000.00")
///   {{currency}}             "AED"
///   {{installments}}         "5"
///   {{frequency}}            "Monthly"
///   {{installment_amount}}   formatted money per installment
///   {{start_date}}           "01 May 2026"
///   {{end_date}}             "30 Sep 2026"
///   {{today}}                date of acceptance
///   {{jamaat_name}}          tenant name
/// </summary>
public sealed class CommitmentAgreementTemplate : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private CommitmentAgreementTemplate() { }

    public CommitmentAgreementTemplate(Guid id, Guid tenantId, string code, string name, string bodyMarkdown)
    {
        Id = id;
        TenantId = tenantId;
        Code = code.ToUpperInvariant();
        Name = name;
        BodyMarkdown = bodyMarkdown;
        Version = 1;
        Language = "en";
        IsActive = true;
    }

    public Guid TenantId { get; private set; }
    public string Code { get; private set; } = default!;
    public string Name { get; private set; } = default!;
    /// Optional — bind this template specifically to a fund type. If null, template is a generic default.
    public Guid? FundTypeId { get; private set; }
    public string Language { get; private set; } = "en";
    public string BodyMarkdown { get; private set; } = default!;
    public int Version { get; private set; }
    public bool IsDefault { get; private set; }
    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Update(string name, string bodyMarkdown, string language, Guid? fundTypeId, bool isDefault, bool isActive)
    {
        if (BodyMarkdown != bodyMarkdown) Version++;
        Name = name;
        BodyMarkdown = bodyMarkdown;
        Language = language;
        FundTypeId = fundTypeId;
        IsDefault = isDefault;
        IsActive = isActive;
    }
}
