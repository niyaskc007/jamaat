using Jamaat.Domain.Common;

namespace Jamaat.Domain.Entities;

/// SuperAdmin's "delete a posted Receipt / Voucher" workflow lives behind a two-person
/// rule: one SuperAdmin requests, a second SuperAdmin approves, only then is the
/// underlying transaction reversed + the document retired. This row tracks the
/// pending-approval state.
///
/// Lifecycle:
///   Pending  -> Approved (second SuperAdmin clicked Approve; the service then runs
///               IReceiptService.ReverseAsync / IVoucherService.ReverseAsync and stamps
///               the document with DeletedAtUtc + retention).
///   Pending  -> Rejected (second SuperAdmin declined, or the requester withdrew).
///   Pending  -> Expired (no second approver acted in 14 days; the row stays for the
///               audit trail but the document is not affected).
///
/// Append-only after terminal state. A new request for the same document is allowed
/// after a Rejected / Expired one.
public sealed class TransactionDeletionRequest : AggregateRoot<Guid>, ITenantScoped, IAuditable
{
    private TransactionDeletionRequest() { }

    public TransactionDeletionRequest(
        Guid id, Guid tenantId,
        TransactionTargetType targetType, Guid targetId, string targetCode,
        string reason,
        Guid? requesterUserId, string requesterUserName,
        DateTimeOffset requestedAtUtc, DateTimeOffset expiresAtUtc)
    {
        Id = id;
        TenantId = tenantId;
        TargetType = targetType;
        TargetId = targetId;
        TargetCode = targetCode;
        Reason = reason;
        RequesterUserId = requesterUserId;
        RequesterUserName = requesterUserName;
        RequestedAtUtc = requestedAtUtc;
        ExpiresAtUtc = expiresAtUtc;
        Status = TransactionDeletionStatus.Pending;
    }

    public Guid TenantId { get; private set; }

    public TransactionTargetType TargetType { get; private set; }
    public Guid TargetId { get; private set; }
    /// Snapshot of the target's display code (e.g. "REC-00042"). Useful when listing
    /// pending requests even if the target gets renumbered or fully purged later.
    public string TargetCode { get; private set; } = default!;

    public string Reason { get; private set; } = default!;
    public TransactionDeletionStatus Status { get; private set; }

    public Guid? RequesterUserId { get; private set; }
    public string RequesterUserName { get; private set; } = default!;
    public DateTimeOffset RequestedAtUtc { get; private set; }
    public DateTimeOffset ExpiresAtUtc { get; private set; }

    public Guid? ApproverUserId { get; private set; }
    public string? ApproverUserName { get; private set; }
    public DateTimeOffset? ApprovedAtUtc { get; private set; }
    public string? DecisionNote { get; private set; }

    /// IAuditable - audit interceptor stamps these on save.
    public DateTimeOffset CreatedAtUtc { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByUserId { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }
    public Guid? UpdatedByUserId { get; private set; }

    /// Second-approver action. Throws if the request is not Pending - terminal
    /// states are immutable.
    public void Approve(Guid? approverUserId, string approverUserName, string? note, DateTimeOffset at)
    {
        if (Status != TransactionDeletionStatus.Pending)
            throw new InvalidOperationException($"Cannot approve a {Status} request.");
        if (RequesterUserId is Guid requester && approverUserId is Guid approver && requester == approver)
            throw new InvalidOperationException("Two-person rule: the requester cannot also approve.");
        Status = TransactionDeletionStatus.Approved;
        ApproverUserId = approverUserId;
        ApproverUserName = approverUserName;
        ApprovedAtUtc = at;
        DecisionNote = note;
    }

    public void Reject(Guid? approverUserId, string approverUserName, string note, DateTimeOffset at)
    {
        if (Status != TransactionDeletionStatus.Pending)
            throw new InvalidOperationException($"Cannot reject a {Status} request.");
        Status = TransactionDeletionStatus.Rejected;
        ApproverUserId = approverUserId;
        ApproverUserName = approverUserName;
        ApprovedAtUtc = at;
        DecisionNote = note;
    }

    public void Expire(DateTimeOffset at)
    {
        if (Status != TransactionDeletionStatus.Pending) return; // idempotent
        Status = TransactionDeletionStatus.Expired;
        ApprovedAtUtc = at;
    }
}

public enum TransactionTargetType
{
    Receipt = 1,
    Voucher = 2,
}

public enum TransactionDeletionStatus
{
    Pending = 1,
    Approved = 2,
    Rejected = 3,
    Expired = 4,
}
