using Jamaat.Application.Common;
using Jamaat.Contracts.Admin;
using Jamaat.Domain.Common;

namespace Jamaat.Application.Admin;

/// SuperAdmin destructive-delete entry point. One service handles every soft-deletable
/// entity type via an internal registry; controllers dispatch by string key
/// ("FundType", "Sector", ...) drawn from the static <see cref="SupportedEntityTypes"/>
/// allowlist. Free-form types from the client are rejected up-front.
///
/// Every mutating call writes an AuditLog row capturing the actor, the target entity,
/// the reason, and a JSON snapshot of the row at delete time. Restoring or purging
/// also writes audit rows so the trail is complete.
public interface IDeletionService
{
    /// Allowlist of entity-type keys this service knows how to delete. Anything not
    /// in this set is a 404. Phase 1 starts with master-data only; Phase 2 extends.
    IReadOnlyList<string> SupportedEntityTypes { get; }

    /// Impact preview - no side effects. Returns blockers / cascades / redactions
    /// so the SPA can show the SuperAdmin what they're about to do.
    Task<Result<DeletionImpactDto>> ImpactAsync(string entityType, Guid id, CancellationToken ct = default);

    /// Soft-delete: stamps DeletedAtUtc + DeletedByUserId + DeletionReason +
    /// RetentionUntilUtc (= now + 30d). Fails with Error.Business if any blocker
    /// is present, or Error.Validation if the reason is too short.
    Task<Result> SoftDeleteAsync(string entityType, Guid id, string reason, CancellationToken ct = default);

    /// Restore: clears the four delete-marker columns. Fails if the row was already
    /// hard-purged or if its RetentionUntilUtc has passed (use PurgeAsync to
    /// finalise instead). Cascading children are restored alongside the parent.
    Task<Result> RestoreAsync(string entityType, Guid id, CancellationToken ct = default);

    /// Hard-delete NOW, bypassing the 30-day retention timer. Used by the SuperAdmin
    /// "Purge now" button in the Trash UI. Fails if the row is not currently
    /// soft-deleted (you can't purge a live record - soft-delete first).
    Task<Result> PurgeAsync(string entityType, Guid id, CancellationToken ct = default);

    /// Trash list: every soft-deleted row across all supported entity types in the
    /// caller's tenant. Sorted by RetentionUntilUtc ascending (closest to auto-purge
    /// first). Supports optional filter by entity type.
    Task<Result<IReadOnlyList<TrashRowDto>>> ListTrashAsync(string? entityType, CancellationToken ct = default);

    /// Drain pass for the Hangfire auto-purge job. Iterates every supported entity,
    /// finds rows where RetentionUntilUtc has passed, and hard-deletes them. Logs
    /// counts. Safe to run when there's nothing to do (idempotent).
    Task<int> PurgeExpiredAsync(CancellationToken ct = default);
}
