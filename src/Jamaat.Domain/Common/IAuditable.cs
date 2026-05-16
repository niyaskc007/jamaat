namespace Jamaat.Domain.Common;

public interface IAuditable
{
    DateTimeOffset CreatedAtUtc { get; }
    Guid? CreatedByUserId { get; }
    DateTimeOffset? UpdatedAtUtc { get; }
    Guid? UpdatedByUserId { get; }
}

/// Soft-delete + retention contract used by the SuperAdmin destructive-delete flow.
/// Rows where <see cref="DeletedAtUtc"/> is non-null are excluded from default EF queries
/// via the global filter; the Trash list page + impact analyzer use IgnoreQueryFilters()
/// to see them. The auto-purge Hangfire job hard-deletes rows whose
/// <see cref="RetentionUntilUtc"/> has passed.
///
/// Setters are public because the SoftDeleteService is the sole authorised mutator and
/// EF Core 10 requires public set for column mapping; the alternative (per-entity
/// MarkDeleted() methods) is needless boilerplate for a cross-cutting concern.
///
/// Note: <c>Member</c> historically had a separate <c>IsDeleted</c> bool kept in sync with
/// <c>DeletedAtUtc</c>. That legacy column stays for one release (per RULES.md §34's
/// additive migration) but is NOT part of this contract - callers should test
/// <c>DeletedAtUtc.HasValue</c>.
public interface ISoftDeletable
{
    DateTimeOffset? DeletedAtUtc { get; set; }
    Guid? DeletedByUserId { get; set; }
    string? DeletionReason { get; set; }
    DateTimeOffset? RetentionUntilUtc { get; set; }
}
