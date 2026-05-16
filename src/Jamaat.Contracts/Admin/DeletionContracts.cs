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
