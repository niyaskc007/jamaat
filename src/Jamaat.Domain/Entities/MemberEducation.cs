using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

/// <summary>
/// One education entry for a member. Multiple rows make up the member's education history;
/// the existing scalar Member.Qualification stays as the "highest level achieved" snapshot
/// for back-compat with reports and printed templates.
/// </summary>
public sealed class MemberEducation : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private MemberEducation() { }

    public MemberEducation(Guid id, Guid tenantId, Guid memberId,
        Qualification level, string? degree, string? institution, int? yearCompleted,
        string? specialization, bool isHighest)
    {
        if (memberId == Guid.Empty) throw new ArgumentException("MemberId required.", nameof(memberId));
        Id = id;
        TenantId = tenantId;
        MemberId = memberId;
        Level = level;
        Degree = degree;
        Institution = institution;
        YearCompleted = yearCompleted;
        Specialization = specialization;
        IsHighest = isHighest;
    }

    public Guid TenantId { get; private set; }
    public Guid MemberId { get; private set; }
    public Qualification Level { get; private set; }
    public string? Degree { get; private set; }
    public string? Institution { get; private set; }
    public int? YearCompleted { get; private set; }
    public string? Specialization { get; private set; }
    /// <summary>True for the entry that represents the member's highest qualification.
    /// The service ensures at most one row per member is flagged.</summary>
    public bool IsHighest { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Update(Qualification level, string? degree, string? institution, int? yearCompleted,
        string? specialization, bool isHighest)
    {
        Level = level;
        Degree = degree;
        Institution = institution;
        YearCompleted = yearCompleted;
        Specialization = specialization;
        IsHighest = isHighest;
    }
}
