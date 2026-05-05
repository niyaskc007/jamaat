using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

/// Public self-registration request. Submitted anonymously via /portal/register; admin
/// reviews and either approves (creating an ApplicationUser and linking to / creating the
/// Member record) or rejects with a note. Tenant-scoped because each tenant runs its own
/// admission flow.
public sealed class MemberApplication : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private MemberApplication() { }

    public MemberApplication(
        Guid id, Guid tenantId,
        string fullName, string itsNumber, string? email, string? phoneE164,
        string? notes,
        string? ipAddress, string? userAgent)
    {
        Id = id;
        TenantId = tenantId;
        FullName = fullName;
        ItsNumber = itsNumber;
        Email = email;
        PhoneE164 = phoneE164;
        Notes = notes;
        IpAddress = ipAddress;
        UserAgent = userAgent;
        Status = MemberApplicationStatus.Pending;
    }

    public Guid TenantId { get; private set; }
    public string FullName { get; private set; } = default!;
    public string ItsNumber { get; private set; } = default!;
    public string? Email { get; private set; }
    public string? PhoneE164 { get; private set; }
    public string? Notes { get; private set; }                 // applicant message to the committee
    public MemberApplicationStatus Status { get; private set; }

    /// IP address of the submitter, captured at receipt for fraud / audit purposes. Free-form
    /// because we don't enforce IPv4-vs-IPv6 normalisation here; the fingerprint comparator
    /// can do that if/when we add rate-limiting.
    public string? IpAddress { get; private set; }
    public string? UserAgent { get; private set; }

    public Guid? ReviewedByUserId { get; private set; }
    public string? ReviewedByUserName { get; private set; }
    public DateTimeOffset? ReviewedAtUtc { get; private set; }
    public string? ReviewerNote { get; private set; }

    /// Set when the admin approves. Tracks the resulting ApplicationUser so we can show "you
    /// already approved this" if the admin double-clicks, and so audit can trace the
    /// application -> user record -> member chain.
    public Guid? CreatedUserId { get; private set; }
    public Guid? LinkedMemberId { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }       // null - public submission
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    public void Approve(Guid reviewerId, string reviewerName, DateTimeOffset at, string? note,
                        Guid createdUserId, Guid linkedMemberId)
    {
        if (Status != MemberApplicationStatus.Pending)
            throw new InvalidOperationException($"Cannot approve a {Status} application.");
        Status = MemberApplicationStatus.Approved;
        ReviewedByUserId = reviewerId;
        ReviewedByUserName = reviewerName;
        ReviewedAtUtc = at;
        ReviewerNote = note;
        CreatedUserId = createdUserId;
        LinkedMemberId = linkedMemberId;
    }

    public void Reject(Guid reviewerId, string reviewerName, DateTimeOffset at, string note)
    {
        if (Status != MemberApplicationStatus.Pending)
            throw new InvalidOperationException($"Cannot reject a {Status} application.");
        if (string.IsNullOrWhiteSpace(note))
            throw new ArgumentException("Rejection note required.", nameof(note));
        Status = MemberApplicationStatus.Rejected;
        ReviewedByUserId = reviewerId;
        ReviewedByUserName = reviewerName;
        ReviewedAtUtc = at;
        ReviewerNote = note;
    }
}

public enum MemberApplicationStatus
{
    Pending  = 1,
    Approved = 2,
    Rejected = 3,
}
