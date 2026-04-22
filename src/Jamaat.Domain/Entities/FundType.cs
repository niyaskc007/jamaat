using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

public sealed class FundType : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private FundType() { }

    public FundType(Guid id, Guid tenantId, string code, string nameEnglish, PaymentMode allowedModes)
    {
        if (string.IsNullOrWhiteSpace(code)) throw new ArgumentException("Code required.", nameof(code));
        if (string.IsNullOrWhiteSpace(nameEnglish)) throw new ArgumentException("Name required.", nameof(nameEnglish));
        Id = id;
        TenantId = tenantId;
        Code = code.ToUpperInvariant();
        NameEnglish = nameEnglish;
        AllowedPaymentModes = allowedModes;
        IsActive = true;
    }

    public Guid TenantId { get; private set; }
    public string Code { get; private set; } = default!;
    public string NameEnglish { get; private set; } = default!;
    public string? NameArabic { get; private set; }
    public string? NameHindi { get; private set; }
    public string? NameUrdu { get; private set; }
    public string? Description { get; private set; }
    public bool IsActive { get; private set; }
    public bool RequiresItsNumber { get; private set; } = true;
    public bool RequiresPeriodReference { get; private set; }
    /// <summary>Classification of this fund (Donation / Loan / Charity / CommunitySupport / Other).</summary>
    public FundCategory Category { get; private set; } = FundCategory.Donation;
    /// <summary>Convenience alias. Loan funds block Commitment pledges + FundEnrollments; only QarzanHasanaLoan can operate on them.</summary>
    public bool IsLoan => Category == FundCategory.Loan;
    public PaymentMode AllowedPaymentModes { get; private set; }
    public Guid? DefaultTemplateId { get; private set; }
    public Guid? CreditAccountId { get; private set; }
    /// JSON for fund-specific rules (e.g. Qarzan Hasana period constraints).
    public string? RulesJson { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void UpdateNames(string english, string? arabic, string? hindi, string? urdu, string? description)
    {
        if (string.IsNullOrWhiteSpace(english)) throw new ArgumentException("Name required.", nameof(english));
        NameEnglish = english;
        NameArabic = arabic;
        NameHindi = hindi;
        NameUrdu = urdu;
        Description = description;
    }

    public void ConfigureAccounting(Guid? creditAccountId, Guid? defaultTemplateId)
    {
        CreditAccountId = creditAccountId;
        DefaultTemplateId = defaultTemplateId;
    }

    public void SetRules(bool requiresIts, bool requiresPeriod, PaymentMode allowedModes, string? rulesJson, FundCategory category = FundCategory.Donation)
    {
        RequiresItsNumber = requiresIts;
        RequiresPeriodReference = requiresPeriod;
        AllowedPaymentModes = allowedModes;
        RulesJson = rulesJson;
        Category = category;
    }

    public void SetCategory(FundCategory category) => Category = category;

    public void Deactivate() => IsActive = false;
    public void Activate() => IsActive = true;
}
