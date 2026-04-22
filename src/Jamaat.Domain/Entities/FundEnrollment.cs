using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

/// <summary>
/// Per-member enrollment under a donation fund type (Sabil, Wajebaat, Mutafariq, Niyaz).
/// Long-lived: Receipt lines can reference an enrollment to attribute the collection.
/// Distinct from <see cref="Commitment"/> (fixed-amount pledge with schedule).
/// </summary>
public sealed class FundEnrollment : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private FundEnrollment() { }

    public FundEnrollment(Guid id, Guid tenantId, string code, Guid memberId, Guid fundTypeId,
        string? subType, FundEnrollmentRecurrence recurrence, DateOnly startDate)
    {
        Id = id;
        TenantId = tenantId;
        Code = code;
        MemberId = memberId;
        FundTypeId = fundTypeId;
        SubType = subType;
        Recurrence = recurrence;
        StartDate = startDate;
        Status = FundEnrollmentStatus.Draft;
    }

    public Guid TenantId { get; private set; }
    public string Code { get; private set; } = default!;
    public Guid MemberId { get; private set; }
    public Guid FundTypeId { get; private set; }
    public Guid? FamilyId { get; private set; }

    /// Per-fund sub-type from the Lookups sheet (e.g., Sabil → Individual/Professional/Establishment).
    public string? SubType { get; private set; }
    public FundEnrollmentRecurrence Recurrence { get; private set; }
    public DateOnly StartDate { get; private set; }
    public DateOnly? EndDate { get; private set; }
    public FundEnrollmentStatus Status { get; private set; }

    public Guid? ApprovedByUserId { get; private set; }
    public string? ApprovedByUserName { get; private set; }
    public DateTimeOffset? ApprovedAtUtc { get; private set; }
    public string? Notes { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void UpdateDetails(string? subType, FundEnrollmentRecurrence recurrence, DateOnly startDate, DateOnly? endDate, string? notes, Guid? familyId)
    {
        SubType = subType;
        Recurrence = recurrence;
        StartDate = startDate;
        EndDate = endDate;
        Notes = notes;
        FamilyId = familyId;
    }

    public void Approve(Guid userId, string userName, DateTimeOffset at)
    {
        if (Status is FundEnrollmentStatus.Cancelled or FundEnrollmentStatus.Expired)
            throw new InvalidOperationException($"Cannot approve a {Status} enrollment.");
        ApprovedByUserId = userId;
        ApprovedByUserName = userName;
        ApprovedAtUtc = at;
        Status = FundEnrollmentStatus.Active;
    }

    public void Pause() { if (Status == FundEnrollmentStatus.Active) Status = FundEnrollmentStatus.Paused; }
    public void Resume() { if (Status == FundEnrollmentStatus.Paused) Status = FundEnrollmentStatus.Active; }
    public void Cancel() => Status = FundEnrollmentStatus.Cancelled;
    public void Expire(DateOnly at)
    {
        Status = FundEnrollmentStatus.Expired;
        EndDate = at;
    }
}
