using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

/// <summary>
/// Self-declared asset belonging to a member - real estate, vehicle, investment, share
/// holdings, business stake, jewellery, etc. Forms the wealth-profile data set the user
/// asked for. Sensitive: visibility is gated by member.wealth.view; the member always
/// sees their own.
/// </summary>
public sealed class MemberAsset : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private MemberAsset() { }

    public MemberAsset(Guid id, Guid tenantId, Guid memberId,
        MemberAssetKind kind, string description,
        decimal? estimatedValue, string currency,
        string? notes, string? documentUrl)
    {
        if (memberId == Guid.Empty) throw new ArgumentException("MemberId required.", nameof(memberId));
        if (string.IsNullOrWhiteSpace(description)) throw new ArgumentException("Description required.", nameof(description));
        Id = id;
        TenantId = tenantId;
        MemberId = memberId;
        Kind = kind;
        Description = description;
        EstimatedValue = estimatedValue;
        Currency = (currency ?? "AED").ToUpperInvariant();
        Notes = notes;
        DocumentUrl = documentUrl;
    }

    public Guid TenantId { get; private set; }
    public Guid MemberId { get; private set; }
    public MemberAssetKind Kind { get; private set; }
    public string Description { get; private set; } = default!;
    public decimal? EstimatedValue { get; private set; }
    public string Currency { get; private set; } = "AED";
    public string? Notes { get; private set; }
    public string? DocumentUrl { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Update(MemberAssetKind kind, string description, decimal? estimatedValue, string currency, string? notes)
    {
        if (string.IsNullOrWhiteSpace(description)) throw new ArgumentException("Description required.", nameof(description));
        Kind = kind;
        Description = description;
        EstimatedValue = estimatedValue;
        Currency = (currency ?? "AED").ToUpperInvariant();
        Notes = notes;
    }

    public void SetDocumentUrl(string? url) => DocumentUrl = string.IsNullOrWhiteSpace(url) ? null : url;
}
