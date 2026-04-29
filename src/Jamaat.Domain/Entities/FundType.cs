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
    /// <summary>Legacy enum classification - kept for backwards compatibility while callers migrate to <see cref="FundCategoryId"/>.</summary>
    public FundCategory Category { get; private set; } = FundCategory.Donation;
    /// <summary>Convenience alias. Loan funds block Commitment pledges + FundEnrollments; only QarzanHasanaLoan can operate on them.</summary>
    public bool IsLoan => Category == FundCategory.Loan;

    /// <summary>FK to the admin-managed <see cref="FundCategoryEntity"/>. Nullable during the transition; once populated for every row, a follow-up migration tightens this.</summary>
    public Guid? FundCategoryId { get; private set; }
    /// <summary>Optional second-tier classification (e.g. "Mohammedi Scheme" under Permanent Income).</summary>
    public Guid? FundSubCategoryId { get; private set; }
    /// <summary>For Function-based funds: the event this fund collects against. Receipts on this fund implicitly tie to the event.</summary>
    public Guid? EventId { get; private set; }

    /// <summary>When true, the fund accepts contributions that the contributor expects back (returnable money). Drives different posting + reporting flows in batch 2 of the fund-management uplift.</summary>
    public bool IsReturnable { get; private set; }
    /// <summary>When true, contributions/loans on this fund cannot proceed without an attached agreement reference.</summary>
    public bool RequiresAgreement { get; private set; }
    /// <summary>When true, returnable contributions on this fund track a maturity date - returns before maturity require special approval.</summary>
    public bool RequiresMaturityTracking { get; private set; }
    /// <summary>When true, the contribution form must capture the contributor's Niyyath (intention) explicitly.</summary>
    public bool RequiresNiyyath { get; private set; }
    /// <summary>When true, receipts on this fund land in Draft state and require explicit
    /// approval before they're numbered + posted to the GL. Use for funds where a finance lead
    /// must double-check entries before they hit the books (e.g. large-value temporary funds,
    /// audit-sensitive scheme contributions). Default false keeps the auto-confirm flow.</summary>
    public bool RequiresApproval { get; private set; }

    public PaymentMode AllowedPaymentModes { get; private set; }
    public Guid? DefaultTemplateId { get; private set; }
    public Guid? CreditAccountId { get; private set; }
    /// <summary>Liability account that returnable contributions on this fund credit.
    /// When null, posting falls back to a global liability account (3500). Used to keep
    /// QH-returnable, scheme-temporary, and other-returnable buckets distinct in the GL
    /// rather than collapsing every returnable receipt into one obligation account.</summary>
    public Guid? LiabilityAccountId { get; private set; }
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

    public void ConfigureAccounting(Guid? creditAccountId, Guid? defaultTemplateId, Guid? liabilityAccountId = null)
    {
        CreditAccountId = creditAccountId;
        DefaultTemplateId = defaultTemplateId;
        LiabilityAccountId = liabilityAccountId;
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

    /// <summary>Bind a Function-based fund to a specific event. Pass null to clear the link.</summary>
    public void LinkEvent(Guid? eventId) => EventId = eventId;

    /// <summary>Set the new admin-managed classification + per-fund behaviour flags.</summary>
    /// <remarks>
    /// Used by the master-data screen and the migration backfill. The legacy <see cref="Category"/>
    /// enum is kept in sync where the kind maps cleanly (PermanentIncome→Donation, LoanFund→Loan)
    /// so existing call sites that read <see cref="IsLoan"/> keep working until they're migrated.
    /// </remarks>
    public void SetClassification(
        Guid fundCategoryId, Guid? fundSubCategoryId,
        FundCategoryKind kind,
        bool isReturnable, bool requiresAgreement, bool requiresMaturityTracking, bool requiresNiyyath,
        bool requiresApproval = false)
    {
        if (fundCategoryId == Guid.Empty) throw new ArgumentException("FundCategoryId required.", nameof(fundCategoryId));
        FundCategoryId = fundCategoryId;
        FundSubCategoryId = fundSubCategoryId;
        IsReturnable = isReturnable;
        RequiresAgreement = requiresAgreement;
        RequiresMaturityTracking = requiresMaturityTracking;
        RequiresNiyyath = requiresNiyyath;
        RequiresApproval = requiresApproval;

        // Keep the legacy enum coherent for callers that haven't migrated yet.
        Category = kind switch
        {
            FundCategoryKind.LoanFund => FundCategory.Loan,
            FundCategoryKind.PermanentIncome => FundCategory.Donation,
            FundCategoryKind.TemporaryIncome => FundCategory.Donation,
            FundCategoryKind.CommitmentScheme => FundCategory.Donation,
            FundCategoryKind.FunctionBased => FundCategory.Donation,
            _ => Category,
        };
    }

    public void Deactivate() => IsActive = false;
    public void Activate() => IsActive = true;
}
