using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;

namespace Jamaat.Domain.Entities;

/// <summary>
/// A pending change to a member's profile, submitted by the member themselves (or another
/// person with self.update only) and awaiting verification. Section-level granularity:
/// one request per Tab save, the whole DTO frozen as JSON. An admin / data-validator
/// approves (which calls the matching UpdateXxx service to apply) or rejects with a note.
/// </summary>
/// <remarks>
/// Why section-level: matches the existing IMemberProfileService surface (UpdateIdentity /
/// UpdateContact / UpdatePersonal / UpdateAddress / UpdateOrigin / UpdateEducationWork /
/// UpdateReligiousCredentials / UpdateFamilyRefs). Each approve = exactly one of those calls.
/// A field-level diff would need a parallel "computed-diff" subsystem and isn't needed yet.
/// </remarks>
public sealed class MemberChangeRequest : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private MemberChangeRequest() { }

    public MemberChangeRequest(Guid id, Guid tenantId, Guid memberId,
        string section, string payloadJson,
        Guid requestedByUserId, string requestedByUserName, DateTimeOffset at)
    {
        if (memberId == Guid.Empty) throw new ArgumentException("MemberId required.", nameof(memberId));
        if (string.IsNullOrWhiteSpace(section)) throw new ArgumentException("Section required.", nameof(section));
        if (string.IsNullOrWhiteSpace(payloadJson)) throw new ArgumentException("Payload required.", nameof(payloadJson));
        Id = id;
        TenantId = tenantId;
        MemberId = memberId;
        Section = section;
        PayloadJson = payloadJson;
        Status = MemberChangeRequestStatus.Pending;
        RequestedByUserId = requestedByUserId;
        RequestedByUserName = requestedByUserName;
        RequestedAtUtc = at;
    }

    public Guid TenantId { get; private set; }
    public Guid MemberId { get; private set; }
    /// <summary>Identity / Contact / Personal / Address / Origin / EducationWork /
    /// Religious / FamilyRefs - matches IMemberProfileService.</summary>
    public string Section { get; private set; } = default!;
    public string PayloadJson { get; private set; } = default!;
    public MemberChangeRequestStatus Status { get; private set; }

    public Guid RequestedByUserId { get; private set; }
    public string RequestedByUserName { get; private set; } = default!;
    public DateTimeOffset RequestedAtUtc { get; private set; }

    public Guid? ReviewedByUserId { get; private set; }
    public string? ReviewedByUserName { get; private set; }
    public DateTimeOffset? ReviewedAtUtc { get; private set; }
    public string? ReviewerNote { get; private set; }

    // IAuditable
    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Approve(Guid reviewerUserId, string reviewerUserName, DateTimeOffset at, string? note)
    {
        if (Status != MemberChangeRequestStatus.Pending)
            throw new InvalidOperationException($"Cannot approve - request is already {Status}.");
        Status = MemberChangeRequestStatus.Approved;
        ReviewedByUserId = reviewerUserId;
        ReviewedByUserName = reviewerUserName;
        ReviewedAtUtc = at;
        ReviewerNote = note;
    }

    public void Reject(Guid reviewerUserId, string reviewerUserName, DateTimeOffset at, string note)
    {
        if (Status != MemberChangeRequestStatus.Pending)
            throw new InvalidOperationException($"Cannot reject - request is already {Status}.");
        if (string.IsNullOrWhiteSpace(note))
            throw new ArgumentException("A reviewer note is required when rejecting.", nameof(note));
        Status = MemberChangeRequestStatus.Rejected;
        ReviewedByUserId = reviewerUserId;
        ReviewedByUserName = reviewerUserName;
        ReviewedAtUtc = at;
        ReviewerNote = note;
    }
}
