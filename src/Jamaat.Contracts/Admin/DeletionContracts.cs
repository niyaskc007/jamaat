namespace Jamaat.Contracts.Admin;

/// Impact preview for a destructive-delete action. Computed BEFORE the delete is
/// confirmed so the SuperAdmin can see what they're about to wipe out and abort
/// if a blocker is present.
public sealed record DeletionImpactDto(
    /// The entity-type key, e.g. "FundType", "Sector". Identifies which handler the
    /// controller dispatches to. Must come from the allowlist enum on the server -
    /// the SPA never sends a free-form type name.
    string EntityType,
    Guid Id,
    /// Human-friendly label for the modal title, e.g. "Sabil Establishment (SABEELEST)".
    string Label,
    /// Hard stops. While this list is non-empty, the soft-delete endpoint will refuse.
    IReadOnlyList<DeletionLine> Blockers,
    /// Children that go with the parent (e.g. SubSectors when deleting a Sector). Will
    /// be soft-deleted in the same transaction and purged together.
    IReadOnlyList<DeletionLine> Cascades,
    /// Rows that survive a purge but get their PII fields redacted (AuditLog, etc.).
    IReadOnlyList<DeletionLine> Redactions);

/// One line in the impact preview. `Kind` keys an icon + colour on the SPA side;
/// `Count` powers the badge ("5 active commitments").
public sealed record DeletionLine(string Kind, int Count, string Description);

/// Body for POST /admin/soft-delete/{entityType}/{id}.
public sealed record SoftDeleteRequestDto(
    /// Required, min 10 chars. Surfaces in the Trash list + AuditLog row so future
    /// admins (or the original operator a year later) can tell why something got
    /// retired. "no reason" / "test" / blank get rejected.
    string Reason);

/// Row in the Trash list at GET /admin/trash.
public sealed record TrashRowDto(
    string EntityType,
    Guid Id,
    string Label,
    DateTimeOffset DeletedAtUtc,
    Guid? DeletedByUserId,
    string? DeletedByUserName,
    string? DeletionReason,
    DateTimeOffset? RetentionUntilUtc);

// -----------------------------------------------------------------------
// Two-person Transaction (Receipt / Voucher) deletion. The two-step flow lives in a
// separate request/approval workflow rather than the generic /admin/soft-delete path
// because a single SuperAdmin must NOT be able to wipe a posted financial document.
// -----------------------------------------------------------------------

/// Body for POST /admin/transaction-deletion-requests. Caller picks a target
/// (Receipt or Voucher) and provides a reason.
public sealed record RequestTransactionDeletionDto(
    /// "Receipt" or "Voucher". Validated server-side.
    string TargetType,
    Guid TargetId,
    /// Required, min 10 chars. Visible to the second approver and on the audit row.
    string Reason);

/// Body for POST /admin/transaction-deletion-requests/{id}/approve. The optional note
/// is appended to the audit trail alongside the original reason.
public sealed record ApproveTransactionDeletionDto(string? Note);

/// Body for POST /admin/transaction-deletion-requests/{id}/reject. The note explains
/// to the requester why the deletion was rejected; min 10 chars.
public sealed record RejectTransactionDeletionDto(string Note);

/// View of a pending or terminal-state transaction-deletion request. Powers both the
/// inbox list and the per-request detail view.
public sealed record TransactionDeletionRequestDto(
    Guid Id,
    string TargetType,
    Guid TargetId,
    string TargetCode,
    string Status,
    string Reason,
    Guid? RequesterUserId,
    string RequesterUserName,
    DateTimeOffset RequestedAtUtc,
    DateTimeOffset ExpiresAtUtc,
    Guid? ApproverUserId,
    string? ApproverUserName,
    DateTimeOffset? ApprovedAtUtc,
    string? DecisionNote);
