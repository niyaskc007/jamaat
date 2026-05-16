using System.Text.Json;
using Jamaat.Application.Admin;
using Jamaat.Application.Common;
using Jamaat.Application.Notifications;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Admin;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Jamaat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Jamaat.Infrastructure.Admin;

/// Concrete <see cref="IDeletionService"/> for the 10 Phase-1 master-data tables.
///
/// Design: one service, one internal registry of <see cref="EntityHandler"/> records.
/// Each handler knows how to label a row, count its FK dependents (blockers), and run
/// the entity-specific bits of soft-delete / restore / purge. The big switch is by
/// design - it surfaces every soft-deletable table in one place so a code reviewer
/// can see at a glance which entities are wired and which aren't.
public sealed class DeletionService(
    JamaatDbContext db,
    ITenantContext tenant,
    ICurrentUser currentUser,
    IClock clock,
    ILogger<DeletionService> logger) : IDeletionService
{
    private static readonly JsonSerializerOptions SnapshotOptions = new() { WriteIndented = false };

    /// Retention window for new soft-deletes. 30d by default; admin can purge-now any
    /// time. Pre-existing legacy `IsDeleted=1` rows that get migrated in keep a NULL
    /// RetentionUntilUtc (indefinite) so the auto-purge job never touches them.
    private static readonly TimeSpan RetentionWindow = TimeSpan.FromDays(30);

    /// Minimum reason length. Anything shorter (incl. "test", "x", whitespace) is
    /// rejected up-front. The Trash UI relies on a meaningful reason to help future
    /// admins understand history.
    private const int MinReasonLength = 10;

    public IReadOnlyList<string> SupportedEntityTypes { get; } = new[]
    {
        "Lookup", "Sector", "SubSector", "Organisation",
        "FundType", "FundCategory", "FundSubCategory",
        "BankAccount", "ExpenseType", "NumberingSeries",
        "QhScheme", "AgreementTemplate",
    };

    public async Task<Result<DeletionImpactDto>> ImpactAsync(string entityType, Guid id, CancellationToken ct = default)
    {
        if (!SupportedEntityTypes.Contains(entityType))
            return Error.NotFound("delete.entity_unsupported", $"'{entityType}' is not a soft-deletable entity type.");

        var label = await ResolveLabelAsync(entityType, id, ct);
        if (label is null) return Error.NotFound("delete.target_missing", $"{entityType}/{id} not found.");

        var blockers = await ComputeBlockersAsync(entityType, id, ct);
        var cascades = await ComputeCascadesAsync(entityType, id, ct);
        var redactions = new List<DeletionLine>(); // Phase 2 territory (AuditLog redaction-on-purge)

        return new DeletionImpactDto(entityType, id, label, blockers, cascades, redactions);
    }

    public async Task<Result> SoftDeleteAsync(string entityType, Guid id, string reason, CancellationToken ct = default)
    {
        if (!SupportedEntityTypes.Contains(entityType))
            return Result.Failure(Error.NotFound("delete.entity_unsupported", $"'{entityType}' is not a soft-deletable entity type."));
        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length < MinReasonLength)
            return Result.Failure(Error.Validation("delete.reason_required",
                $"Provide a reason of at least {MinReasonLength} characters - it surfaces in the Trash list and audit log."));

        var entity = await LoadLiveAsync(entityType, id, ct);
        if (entity is null) return Result.Failure(Error.NotFound("delete.target_missing", $"{entityType}/{id} not found or already deleted."));

        var blockers = await ComputeBlockersAsync(entityType, id, ct);
        if (blockers.Count > 0)
            return Result.Failure(Error.Business("delete.has_blockers",
                $"Cannot delete: {blockers.Count} blocker(s). Clear them via the relevant per-feature workflow first."));

        var now = clock.UtcNow;
        entity.DeletedAtUtc = now;
        entity.DeletedByUserId = currentUser.UserId;
        entity.DeletionReason = reason.Trim();
        entity.RetentionUntilUtc = now + RetentionWindow;

        // Cascade children (e.g. SubSectors for a Sector). They share the same
        // RetentionUntilUtc so a restore brings the whole tree back.
        foreach (var child in await LoadCascadeChildrenAsync(entityType, id, ct))
        {
            child.DeletedAtUtc = now;
            child.DeletedByUserId = currentUser.UserId;
            child.DeletionReason = $"Cascaded from {entityType} {id}";
            child.RetentionUntilUtc = now + RetentionWindow;
        }

        await WriteAuditAsync("soft-delete", entityType, id, reason, entity, ct);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("SoftDelete: {EntityType} {Id} by {ActorId} reason={Reason}",
            entityType, id, currentUser.UserId, reason);
        return Result.Success();
    }

    public async Task<Result> RestoreAsync(string entityType, Guid id, CancellationToken ct = default)
    {
        if (!SupportedEntityTypes.Contains(entityType))
            return Result.Failure(Error.NotFound("delete.entity_unsupported", $"'{entityType}' is not a soft-deletable entity type."));

        var entity = await LoadAnyAsync(entityType, id, ct);
        if (entity is null) return Result.Failure(Error.NotFound("delete.target_missing", $"{entityType}/{id} not found."));
        if (entity.DeletedAtUtc is null)
            return Result.Failure(Error.Business("delete.not_deleted", $"{entityType}/{id} is not currently soft-deleted."));

        entity.DeletedAtUtc = null;
        entity.DeletedByUserId = null;
        entity.DeletionReason = null;
        entity.RetentionUntilUtc = null;
        foreach (var child in await LoadCascadeChildrenAsync(entityType, id, ct, includeDeleted: true))
        {
            child.DeletedAtUtc = null;
            child.DeletedByUserId = null;
            child.DeletionReason = null;
            child.RetentionUntilUtc = null;
        }

        await WriteAuditAsync("restore", entityType, id, "restored by SuperAdmin", entity, ct);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Restore: {EntityType} {Id} by {ActorId}", entityType, id, currentUser.UserId);
        return Result.Success();
    }

    public async Task<Result> PurgeAsync(string entityType, Guid id, CancellationToken ct = default)
    {
        if (!SupportedEntityTypes.Contains(entityType))
            return Result.Failure(Error.NotFound("delete.entity_unsupported", $"'{entityType}' is not a soft-deletable entity type."));

        var entity = await LoadAnyAsync(entityType, id, ct);
        if (entity is null) return Result.Failure(Error.NotFound("delete.target_missing", $"{entityType}/{id} not found."));
        if (entity.DeletedAtUtc is null)
            return Result.Failure(Error.Business("delete.purge_live_row",
                "Refusing to purge a live row. Soft-delete first, confirm the 30-day window is OK to skip, then purge."));

        // Snapshot for the audit row BEFORE we remove from the context.
        await WriteAuditAsync("purge", entityType, id, entity.DeletionReason ?? "auto-purge", entity, ct);

        // Cascade children first (FK direction).
        foreach (var child in await LoadCascadeChildrenAsync(entityType, id, ct, includeDeleted: true))
        {
            db.Remove(child);
        }
        db.Remove((object)entity);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex)
        {
            // FK from a non-cascading dependent (e.g. live commitment still referencing
            // a fund type the SuperAdmin tried to force-purge). Bubble the underlying
            // SQL error as a Business error so the UI can show "X still references this".
            return Result.Failure(Error.Business("delete.fk_violation",
                "Cannot purge: another row still references this. Resolve the dependency first.\n" + ex.InnerException?.Message));
        }

        logger.LogInformation("Purge: {EntityType} {Id} by {ActorId}", entityType, id, currentUser.UserId);
        return Result.Success();
    }

    public async Task<Result<IReadOnlyList<TrashRowDto>>> ListTrashAsync(string? entityType, CancellationToken ct = default)
    {
        if (entityType is not null && !SupportedEntityTypes.Contains(entityType))
            return Error.NotFound("delete.entity_unsupported", $"'{entityType}' is not a soft-deletable entity type.");

        var rows = new List<TrashRowDto>();
        var types = entityType is null ? SupportedEntityTypes : (IReadOnlyList<string>)[entityType];
        foreach (var t in types)
        {
            rows.AddRange(await LoadTrashAsync(t, ct));
        }
        var ordered = rows
            .OrderBy(r => r.RetentionUntilUtc ?? DateTimeOffset.MaxValue)
            .ToList();
        return Result.Success<IReadOnlyList<TrashRowDto>>(ordered);
    }

    public async Task<int> PurgeExpiredAsync(CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        var total = 0;
        foreach (var t in SupportedEntityTypes)
        {
            var ids = await LoadExpiredIdsAsync(t, now, ct);
            foreach (var id in ids)
            {
                var r = await PurgeAsync(t, id, ct);
                if (r.IsSuccess) total++;
                else logger.LogWarning("Auto-purge failed for {Type} {Id}: {Error}", t, id, r.Error.Message);
            }
        }
        if (total > 0) logger.LogInformation("Auto-purge: {Count} rows hard-deleted.", total);
        return total;
    }

    // -----------------------------------------------------------------------
    // Per-entity bits below. The big switch is intentional - it's the single
    // place where "which entities are wired" lives. Adding a new soft-deletable
    // entity is: add to SupportedEntityTypes + add a case to each helper.
    // -----------------------------------------------------------------------

    private async Task<string?> ResolveLabelAsync(string entityType, Guid id, CancellationToken ct) => entityType switch
    {
        "Lookup"            => await db.Lookups.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => x.Category + " / " + x.Code).FirstOrDefaultAsync(ct),
        "Sector"            => await db.Sectors.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => x.Code + " - " + x.Name).FirstOrDefaultAsync(ct),
        "SubSector"         => await db.SubSectors.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => x.Code + " - " + x.Name).FirstOrDefaultAsync(ct),
        "Organisation"      => await db.Organisations.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => x.Code + " - " + x.Name).FirstOrDefaultAsync(ct),
        "FundType"          => await db.FundTypes.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => x.Code + " - " + x.NameEnglish).FirstOrDefaultAsync(ct),
        "FundCategory"      => await db.FundCategories.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => x.Code + " - " + x.Name).FirstOrDefaultAsync(ct),
        "FundSubCategory"   => await db.FundSubCategories.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => x.Code + " - " + x.Name).FirstOrDefaultAsync(ct),
        "BankAccount"       => await db.BankAccounts.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => x.Name + " / " + x.BankName).FirstOrDefaultAsync(ct),
        "ExpenseType"       => await db.ExpenseTypes.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => x.Code + " - " + x.Name).FirstOrDefaultAsync(ct),
        "NumberingSeries"   => await db.NumberingSeries.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => x.Name + " (" + x.Prefix + ")").FirstOrDefaultAsync(ct),
        "QhScheme"          => await db.QhSchemes.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => x.Code + " - " + x.Name).FirstOrDefaultAsync(ct),
        "AgreementTemplate" => await db.CommitmentAgreementTemplates.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => x.Code + " - " + x.Name).FirstOrDefaultAsync(ct),
        _ => null,
    };

    /// Load the row INCLUDING soft-deleted ones (used for restore + purge + trash list).
    private async Task<ISoftDeletable?> LoadAnyAsync(string entityType, Guid id, CancellationToken ct) => entityType switch
    {
        "Lookup"            => await db.Lookups.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id, ct),
        "Sector"            => await db.Sectors.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id, ct),
        "SubSector"         => await db.SubSectors.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id, ct),
        "Organisation"      => await db.Organisations.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id, ct),
        "FundType"          => await db.FundTypes.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id, ct),
        "FundCategory"      => await db.FundCategories.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id, ct),
        "FundSubCategory"   => await db.FundSubCategories.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id, ct),
        "BankAccount"       => await db.BankAccounts.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id, ct),
        "ExpenseType"       => await db.ExpenseTypes.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id, ct),
        "NumberingSeries"   => await db.NumberingSeries.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id, ct),
        "QhScheme"          => await db.QhSchemes.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id, ct),
        "AgreementTemplate" => await db.CommitmentAgreementTemplates.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id, ct),
        _ => null,
    };

    /// Live-only load (global filter applies) - used by SoftDeleteAsync so we don't
    /// re-delete an already-deleted row.
    private async Task<ISoftDeletable?> LoadLiveAsync(string entityType, Guid id, CancellationToken ct) => entityType switch
    {
        "Lookup"            => await db.Lookups.FirstOrDefaultAsync(x => x.Id == id, ct),
        "Sector"            => await db.Sectors.FirstOrDefaultAsync(x => x.Id == id, ct),
        "SubSector"         => await db.SubSectors.FirstOrDefaultAsync(x => x.Id == id, ct),
        "Organisation"      => await db.Organisations.FirstOrDefaultAsync(x => x.Id == id, ct),
        "FundType"          => await db.FundTypes.FirstOrDefaultAsync(x => x.Id == id, ct),
        "FundCategory"      => await db.FundCategories.FirstOrDefaultAsync(x => x.Id == id, ct),
        "FundSubCategory"   => await db.FundSubCategories.FirstOrDefaultAsync(x => x.Id == id, ct),
        "BankAccount"       => await db.BankAccounts.FirstOrDefaultAsync(x => x.Id == id, ct),
        "ExpenseType"       => await db.ExpenseTypes.FirstOrDefaultAsync(x => x.Id == id, ct),
        "NumberingSeries"   => await db.NumberingSeries.FirstOrDefaultAsync(x => x.Id == id, ct),
        "QhScheme"          => await db.QhSchemes.FirstOrDefaultAsync(x => x.Id == id, ct),
        "AgreementTemplate" => await db.CommitmentAgreementTemplates.FirstOrDefaultAsync(x => x.Id == id, ct),
        _ => null,
    };

    /// Inbound FK blockers. Phase 1 has the most important cases (FundType, Sector,
    /// FundCategory) wired explicitly; the others rely on DB-level FK enforcement
    /// at purge time + a generic "no known blockers" return here. Add a case per
    /// entity as the dependency map gets fleshed out.
    private async Task<IReadOnlyList<DeletionLine>> ComputeBlockersAsync(string entityType, Guid id, CancellationToken ct)
    {
        var lines = new List<DeletionLine>();
        switch (entityType)
        {
            case "FundType":
                var activeCommits = await db.Commitments.IgnoreQueryFilters()
                    .CountAsync(c => c.FundTypeId == id && c.Status != CommitmentStatus.Cancelled, ct);
                if (activeCommits > 0) lines.Add(new("active-commitment", activeCommits,
                    $"{activeCommits} non-cancelled commitment(s) reference this fund type."));

                var activeEnrollments = await db.FundEnrollments.IgnoreQueryFilters()
                    .CountAsync(e => e.FundTypeId == id && e.Status != FundEnrollmentStatus.Cancelled, ct);
                if (activeEnrollments > 0) lines.Add(new("active-enrollment", activeEnrollments,
                    $"{activeEnrollments} non-cancelled fund enrollment(s) reference this fund type."));

                var receiptLines = await db.Receipts.IgnoreQueryFilters()
                    .CountAsync(r => r.Lines.Any(l => l.FundTypeId == id), ct);
                if (receiptLines > 0) lines.Add(new("historical-receipt", receiptLines,
                    $"{receiptLines} receipt(s) include a line for this fund type. Soft-delete will hide the fund type from new flows but historical receipts stay readable; purge would require those receipts to be reversed first."));
                break;

            case "Sector":
                var sectorMembers = await db.Members.IgnoreQueryFilters()
                    .CountAsync(m => m.SectorId == id && !m.IsDeleted, ct);
                if (sectorMembers > 0) lines.Add(new("member", sectorMembers,
                    $"{sectorMembers} active member(s) belong to this sector."));
                break;

            case "FundCategory":
                var fundTypesInCategory = await db.FundTypes.IgnoreQueryFilters()
                    .CountAsync(f => f.FundCategoryId == id && f.DeletedAtUtc == null, ct);
                if (fundTypesInCategory > 0) lines.Add(new("fund-type", fundTypesInCategory,
                    $"{fundTypesInCategory} live fund type(s) classify under this category."));
                break;

            // Phase 1 minimal: other entities have no hand-wired blockers; SQL FK
            // will catch real violations at purge time. Adding cases here is the
            // way to give the SuperAdmin proper warning instead of an FK 500.
        }
        return lines;
    }

    /// Children that go with the parent on soft-delete (and come back together on
    /// restore). Right now only Sector -> SubSector. Add cases as needed.
    private async Task<List<ISoftDeletable>> LoadCascadeChildrenAsync(string entityType, Guid id, CancellationToken ct, bool includeDeleted = false)
    {
        var list = new List<ISoftDeletable>();
        if (entityType == "Sector")
        {
            var q = db.SubSectors.IgnoreQueryFilters().Where(x => x.SectorId == id);
            if (!includeDeleted) q = q.Where(x => x.DeletedAtUtc == null);
            list.AddRange(await q.ToListAsync(ct));
        }
        return list;
    }

    /// Same shape as ComputeCascades, but counts rather than entities. Used by impact preview.
    private async Task<IReadOnlyList<DeletionLine>> ComputeCascadesAsync(string entityType, Guid id, CancellationToken ct)
    {
        var lines = new List<DeletionLine>();
        if (entityType == "Sector")
        {
            var n = await db.SubSectors.IgnoreQueryFilters().CountAsync(x => x.SectorId == id && x.DeletedAtUtc == null, ct);
            if (n > 0) lines.Add(new("sub-sector", n, $"{n} sub-sector(s) will be soft-deleted alongside this sector."));
        }
        return lines;
    }

    /// Trash list rows for one entity type.
    private async Task<List<TrashRowDto>> LoadTrashAsync(string entityType, CancellationToken ct)
    {
        // Pre-load DeletedByUser names for the rows we return. Cheap join in C# because
        // the trash table is small relative to the user table.
        var raw = entityType switch
        {
            "Lookup"            => await db.Lookups.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null)
                                    .Select(x => new TrashRowDto(entityType, x.Id, x.Category + " / " + x.Code,
                                        x.DeletedAtUtc!.Value, x.DeletedByUserId, null, x.DeletionReason, x.RetentionUntilUtc))
                                    .ToListAsync(ct),
            "Sector"            => await db.Sectors.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null)
                                    .Select(x => new TrashRowDto(entityType, x.Id, x.Code + " - " + x.Name,
                                        x.DeletedAtUtc!.Value, x.DeletedByUserId, null, x.DeletionReason, x.RetentionUntilUtc))
                                    .ToListAsync(ct),
            "SubSector"         => await db.SubSectors.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null)
                                    .Select(x => new TrashRowDto(entityType, x.Id, x.Code + " - " + x.Name,
                                        x.DeletedAtUtc!.Value, x.DeletedByUserId, null, x.DeletionReason, x.RetentionUntilUtc))
                                    .ToListAsync(ct),
            "Organisation"      => await db.Organisations.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null)
                                    .Select(x => new TrashRowDto(entityType, x.Id, x.Code + " - " + x.Name,
                                        x.DeletedAtUtc!.Value, x.DeletedByUserId, null, x.DeletionReason, x.RetentionUntilUtc))
                                    .ToListAsync(ct),
            "FundType"          => await db.FundTypes.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null)
                                    .Select(x => new TrashRowDto(entityType, x.Id, x.Code + " - " + x.NameEnglish,
                                        x.DeletedAtUtc!.Value, x.DeletedByUserId, null, x.DeletionReason, x.RetentionUntilUtc))
                                    .ToListAsync(ct),
            "FundCategory"      => await db.FundCategories.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null)
                                    .Select(x => new TrashRowDto(entityType, x.Id, x.Code + " - " + x.Name,
                                        x.DeletedAtUtc!.Value, x.DeletedByUserId, null, x.DeletionReason, x.RetentionUntilUtc))
                                    .ToListAsync(ct),
            "FundSubCategory"   => await db.FundSubCategories.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null)
                                    .Select(x => new TrashRowDto(entityType, x.Id, x.Code + " - " + x.Name,
                                        x.DeletedAtUtc!.Value, x.DeletedByUserId, null, x.DeletionReason, x.RetentionUntilUtc))
                                    .ToListAsync(ct),
            "BankAccount"       => await db.BankAccounts.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null)
                                    .Select(x => new TrashRowDto(entityType, x.Id, x.Name + " / " + x.BankName,
                                        x.DeletedAtUtc!.Value, x.DeletedByUserId, null, x.DeletionReason, x.RetentionUntilUtc))
                                    .ToListAsync(ct),
            "ExpenseType"       => await db.ExpenseTypes.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null)
                                    .Select(x => new TrashRowDto(entityType, x.Id, x.Code + " - " + x.Name,
                                        x.DeletedAtUtc!.Value, x.DeletedByUserId, null, x.DeletionReason, x.RetentionUntilUtc))
                                    .ToListAsync(ct),
            "NumberingSeries"   => await db.NumberingSeries.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null)
                                    .Select(x => new TrashRowDto(entityType, x.Id, x.Name + " (" + x.Prefix + ")",
                                        x.DeletedAtUtc!.Value, x.DeletedByUserId, null, x.DeletionReason, x.RetentionUntilUtc))
                                    .ToListAsync(ct),
            "QhScheme"          => await db.QhSchemes.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null)
                                    .Select(x => new TrashRowDto(entityType, x.Id, x.Code + " - " + x.Name,
                                        x.DeletedAtUtc!.Value, x.DeletedByUserId, null, x.DeletionReason, x.RetentionUntilUtc))
                                    .ToListAsync(ct),
            "AgreementTemplate" => await db.CommitmentAgreementTemplates.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null)
                                    .Select(x => new TrashRowDto(entityType, x.Id, x.Code + " - " + x.Name,
                                        x.DeletedAtUtc!.Value, x.DeletedByUserId, null, x.DeletionReason, x.RetentionUntilUtc))
                                    .ToListAsync(ct),
            _ => new List<TrashRowDto>(),
        };

        // Hydrate DeletedByUserName from ApplicationUser. One small query.
        var userIds = raw.Where(r => r.DeletedByUserId is not null).Select(r => r.DeletedByUserId!.Value).Distinct().ToList();
        var names = await db.Users.AsNoTracking().Where(u => userIds.Contains(u.Id))
            .Select(u => new { u.Id, u.FullName }).ToDictionaryAsync(u => u.Id, u => u.FullName, ct);
        return raw.Select(r => r with { DeletedByUserName = r.DeletedByUserId is Guid g && names.TryGetValue(g, out var n) ? n : null }).ToList();
    }

    /// IDs of rows whose retention has expired (for the auto-purge job).
    private async Task<List<Guid>> LoadExpiredIdsAsync(string entityType, DateTimeOffset now, CancellationToken ct) => entityType switch
    {
        "Lookup"            => await db.Lookups.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null && x.RetentionUntilUtc != null && x.RetentionUntilUtc < now).Select(x => x.Id).ToListAsync(ct),
        "Sector"            => await db.Sectors.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null && x.RetentionUntilUtc != null && x.RetentionUntilUtc < now).Select(x => x.Id).ToListAsync(ct),
        "SubSector"         => await db.SubSectors.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null && x.RetentionUntilUtc != null && x.RetentionUntilUtc < now).Select(x => x.Id).ToListAsync(ct),
        "Organisation"      => await db.Organisations.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null && x.RetentionUntilUtc != null && x.RetentionUntilUtc < now).Select(x => x.Id).ToListAsync(ct),
        "FundType"          => await db.FundTypes.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null && x.RetentionUntilUtc != null && x.RetentionUntilUtc < now).Select(x => x.Id).ToListAsync(ct),
        "FundCategory"      => await db.FundCategories.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null && x.RetentionUntilUtc != null && x.RetentionUntilUtc < now).Select(x => x.Id).ToListAsync(ct),
        "FundSubCategory"   => await db.FundSubCategories.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null && x.RetentionUntilUtc != null && x.RetentionUntilUtc < now).Select(x => x.Id).ToListAsync(ct),
        "BankAccount"       => await db.BankAccounts.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null && x.RetentionUntilUtc != null && x.RetentionUntilUtc < now).Select(x => x.Id).ToListAsync(ct),
        "ExpenseType"       => await db.ExpenseTypes.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null && x.RetentionUntilUtc != null && x.RetentionUntilUtc < now).Select(x => x.Id).ToListAsync(ct),
        "NumberingSeries"   => await db.NumberingSeries.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null && x.RetentionUntilUtc != null && x.RetentionUntilUtc < now).Select(x => x.Id).ToListAsync(ct),
        "QhScheme"          => await db.QhSchemes.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null && x.RetentionUntilUtc != null && x.RetentionUntilUtc < now).Select(x => x.Id).ToListAsync(ct),
        "AgreementTemplate" => await db.CommitmentAgreementTemplates.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null && x.RetentionUntilUtc != null && x.RetentionUntilUtc < now).Select(x => x.Id).ToListAsync(ct),
        _ => new List<Guid>(),
    };

    private Task WriteAuditAsync(string action, string entityType, Guid id, string reason, ISoftDeletable? entity, CancellationToken ct)
    {
        // Snapshot is best-effort - if serialization fails, we still write the row.
        string? snapshot = null;
        try
        {
            snapshot = entity is null ? null : JsonSerializer.Serialize(entity, SnapshotOptions);
            if (snapshot is not null && snapshot.Length > 8000) snapshot = snapshot[..8000] + "...(truncated)";
        }
        catch { /* ignore - the row still has actor / target / reason */ }

        db.AuditLogs.Add(new AuditLog(
            tenantId: tenant.TenantId,
            userId: currentUser.UserId,
            userName: currentUser.UserName ?? "system",
            correlationId: Guid.NewGuid().ToString("N"),
            action: $"superadmin.{action}",
            entityName: entityType,
            entityId: id.ToString(),
            screen: "/admin/trash",
            beforeJson: snapshot,
            afterJson: $"{{\"reason\":{JsonSerializer.Serialize(reason)}}}",
            ipAddress: null,
            userAgent: null,
            atUtc: clock.UtcNow));
        return Task.CompletedTask;
    }
}
