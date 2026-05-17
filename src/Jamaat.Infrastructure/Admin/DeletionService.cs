using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
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
using Jamaat.Infrastructure.Identity;
using Jamaat.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
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
    IHttpContextAccessor httpAccessor,
    IClock clock,
    ILogger<DeletionService> logger) : IDeletionService
{
    private static readonly JsonSerializerOptions SnapshotOptions = new() { WriteIndented = false };

    /// Resolve the calling user's id at call time (not ctor time). ICurrentUser captures
    /// in its constructor; if it's resolved before the auth pipeline finishes (or in any
    /// other quirky scope timing), UserId comes back null. Reading the HttpContext fresh
    /// per call avoids that whole class of issue. Walks every plausible claim type
    /// because JwtBearer's inbound mapping has varied across .NET versions.
    private Guid? CurrentUserId()
    {
        if (currentUser.UserId is Guid id) return id;
        var user = httpAccessor.HttpContext?.User;
        if (user?.Identity?.IsAuthenticated != true) return null;
        string?[] candidates = {
            user.FindFirstValue(ClaimTypes.NameIdentifier),
            user.FindFirstValue(JwtRegisteredClaimNames.Sub),
            user.FindFirstValue("sub"),
            user.FindFirstValue("nameid"),
        };
        foreach (var v in candidates) if (Guid.TryParse(v, out var g)) return g;
        return null;
    }

    private string? CurrentUserName()
    {
        if (!string.IsNullOrEmpty(currentUser.UserName)) return currentUser.UserName;
        var user = httpAccessor.HttpContext?.User;
        return user?.FindFirstValue(ClaimTypes.Name)
            ?? user?.FindFirstValue(JwtRegisteredClaimNames.UniqueName)
            ?? user?.FindFirstValue(ClaimTypes.Email);
    }

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
        // Phase 1 master data
        "Lookup", "Sector", "SubSector", "Organisation",
        "FundType", "FundCategory", "FundSubCategory",
        "BankAccount", "ExpenseType", "NumberingSeries",
        "QhScheme", "AgreementTemplate",
        // Phase 2 identity. Transactions (Receipt/Voucher) are NOT in this list - they
        // go through the two-person SuperAdminTransactionDeletionService instead.
        "Member", "Family",
    };

    public async Task<Result<DeletionImpactDto>> ImpactAsync(string entityType, Guid id, CancellationToken ct = default)
    {
        if (!SupportedEntityTypes.Contains(entityType))
            return Error.NotFound("delete.entity_unsupported", $"'{entityType}' is not a soft-deletable entity type.");

        var label = await ResolveLabelAsync(entityType, id, ct);
        if (label is null) return Error.NotFound("delete.target_missing", $"{entityType}/{id} not found.");

        var blockers = await ComputeBlockersAsync(entityType, id, ct);
        var cascades = await ComputeCascadesAsync(entityType, id, ct);
        var redactions = await ComputeRedactionsAsync(entityType, id, ct);

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
        var actorId = CurrentUserId();
        entity.DeletedAtUtc = now;
        entity.DeletedByUserId = actorId;
        entity.DeletionReason = reason.Trim();
        entity.RetentionUntilUtc = now + RetentionWindow;
        // Member carries a legacy IsDeleted bool that pre-dates ISoftDeletable. Keep both
        // in sync for the one-release deprecation window (RULES.md §34 additive-migration).
        if (entity is Member memberToDelete)
        {
            memberToDelete.IsDeleted = true;
            // A Member with a linked ApplicationUser shouldn't keep being able to sign in after
            // SuperAdmin retired them. Pair the soft-delete with IsLoginAllowed=false. Restore
            // re-enables it. The user row itself stays (so the audit trail of their past
            // actions stays intact); only the login gate flips.
            await RevokeLinkedLoginAsync(memberToDelete.ItsNumber.Value, revoke: true, ct);
        }

        // Cascade children (e.g. SubSectors for a Sector). They share the same
        // RetentionUntilUtc so a restore brings the whole tree back.
        foreach (var child in await LoadCascadeChildrenAsync(entityType, id, ct))
        {
            child.DeletedAtUtc = now;
            child.DeletedByUserId = actorId;
            child.DeletionReason = $"Cascaded from {entityType} {id}";
            child.RetentionUntilUtc = now + RetentionWindow;
        }

        await WriteAuditAsync("soft-delete", entityType, id, reason, entity, ct);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("SoftDelete: {EntityType} {Id} by {ActorId} reason={Reason}",
            entityType, id, actorId, reason);
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
        if (entity is Member memberToRestore)
        {
            memberToRestore.IsDeleted = false;
            await RevokeLinkedLoginAsync(memberToRestore.ItsNumber.Value, revoke: false, ct);
        }
        foreach (var child in await LoadCascadeChildrenAsync(entityType, id, ct, includeDeleted: true))
        {
            child.DeletedAtUtc = null;
            child.DeletedByUserId = null;
            child.DeletionReason = null;
            child.RetentionUntilUtc = null;
        }

        await WriteAuditAsync("restore", entityType, id, "restored by SuperAdmin", entity, ct);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Restore: {EntityType} {Id} by {ActorId}", entityType, id, CurrentUserId());
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

        // Cascade ISoftDeletable children first (FK direction). These shared the parent's
        // soft-delete state and now go with the parent. Today only Sector -> SubSector.
        foreach (var child in await LoadCascadeChildrenAsync(entityType, id, ct, includeDeleted: true))
        {
            db.Remove(child);
        }
        // Hard-delete-only children: rows that aren't ISoftDeletable but FK-reference the
        // parent (MemberAsset, FamilyMemberLink, etc.). They never go through the trash;
        // they live or die with their parent. Loaded fresh here because PurgeAsync is the
        // only path that has to deal with them.
        foreach (var child in await LoadPurgeCascadeAsync(entityType, id, ct))
        {
            db.Remove(child);
        }
        // Redact PII snapshots on rows that survive the purge (audit trail, ledger
        // history). Plan §3b: keep the row, rewrite name/ITS to "<purged-yyyy-mm-dd>".
        await RedactSurvivingSnapshotsAsync(entityType, id, ct);

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

        logger.LogInformation("Purge: {EntityType} {Id} by {ActorId}", entityType, id, CurrentUserId());
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
        "Member"            => await db.Members.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => x.FullName + " (" + x.ItsNumber.Value + ")").FirstOrDefaultAsync(ct),
        "Family"            => await db.Families.IgnoreQueryFilters().Where(x => x.Id == id).Select(x => x.Code + " - " + x.FamilyName).FirstOrDefaultAsync(ct),
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
        "Member"            => await db.Members.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id, ct),
        "Family"            => await db.Families.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id, ct),
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
        "Member"            => await db.Members.FirstOrDefaultAsync(x => x.Id == id, ct),
        "Family"            => await db.Families.FirstOrDefaultAsync(x => x.Id == id, ct),
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

            case "Member":
                // Active financial obligations that would break audit/repayment trails.
                var memberActiveCommits = await db.Commitments.IgnoreQueryFilters()
                    .CountAsync(c => c.MemberId == id && c.Status != CommitmentStatus.Cancelled, ct);
                if (memberActiveCommits > 0) lines.Add(new("active-commitment", memberActiveCommits,
                    $"{memberActiveCommits} non-cancelled commitment(s) belong to this member."));

                var memberActiveLoans = await db.QarzanHasanaLoans.IgnoreQueryFilters()
                    .CountAsync(l => l.MemberId == id
                        && l.Status != QarzanHasanaStatus.Cancelled
                        && l.Status != QarzanHasanaStatus.Rejected
                        && l.Status != QarzanHasanaStatus.Completed, ct);
                if (memberActiveLoans > 0) lines.Add(new("active-qh-loan", memberActiveLoans,
                    $"{memberActiveLoans} non-terminal Qarzan Hasana loan(s) belong to this member."));

                var memberAsGuarantor = await db.QarzanHasanaLoans.IgnoreQueryFilters()
                    .CountAsync(l => (l.Guarantor1MemberId == id || l.Guarantor2MemberId == id)
                        && l.Status != QarzanHasanaStatus.Cancelled
                        && l.Status != QarzanHasanaStatus.Rejected
                        && l.Status != QarzanHasanaStatus.Completed, ct);
                if (memberAsGuarantor > 0) lines.Add(new("active-qh-guarantor", memberAsGuarantor,
                    $"{memberAsGuarantor} active QH loan(s) list this member as a guarantor. Replace the guarantor before deleting."));

                var memberActiveEnrollments = await db.FundEnrollments.IgnoreQueryFilters()
                    .CountAsync(e => e.MemberId == id && e.Status != FundEnrollmentStatus.Cancelled, ct);
                if (memberActiveEnrollments > 0) lines.Add(new("active-enrollment", memberActiveEnrollments,
                    $"{memberActiveEnrollments} non-cancelled fund enrollment(s) belong to this member."));

                var memberPendingConsents = await db.QarzanHasanaGuarantorConsents.IgnoreQueryFilters()
                    .CountAsync(c => c.GuarantorMemberId == id && c.Status == QhGuarantorConsentStatus.Pending, ct);
                if (memberPendingConsents > 0) lines.Add(new("pending-consent", memberPendingConsents,
                    $"{memberPendingConsents} pending guarantor-consent request(s) await this member's response."));
                // Historical receipts/vouchers are intentionally NOT listed: they live in the ledger
                // post-soft-delete (the member name + ITS snapshot is preserved on the receipt row
                // itself, so audit reads stay intact). Listing them as an "informational" blocker
                // muddied the UX - admins can see the member's history on the Member page already.
                break;

            case "Family":
                // Active members in the family block deletion - delete or reassign them first.
                var familyActiveMembers = await db.Members.IgnoreQueryFilters()
                    .CountAsync(m => m.FamilyId == id && !m.IsDeleted, ct);
                if (familyActiveMembers > 0) lines.Add(new("active-member", familyActiveMembers,
                    $"{familyActiveMembers} active member(s) belong to this family. Reassign or delete them first."));
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
        switch (entityType)
        {
            case "Sector":
                var subSectors = await db.SubSectors.IgnoreQueryFilters().CountAsync(x => x.SectorId == id && x.DeletedAtUtc == null, ct);
                if (subSectors > 0) lines.Add(new("sub-sector", subSectors,
                    $"{subSectors} sub-sector(s) will be soft-deleted alongside this sector."));
                break;

            case "Member":
                // Owned-by-member kid tables. They aren't ISoftDeletable - they survive the soft-delete
                // window (no separate restore concept for a member's asset records, etc.) but get
                // hard-deleted alongside the Member on purge so no orphan rows survive.
                var memberAssets = await db.MemberAssets.IgnoreQueryFilters().CountAsync(a => a.MemberId == id, ct);
                if (memberAssets > 0) lines.Add(new("member-asset", memberAssets,
                    $"{memberAssets} asset record(s) will be hard-deleted when the member is purged."));

                var memberEducation = await db.MemberEducations.IgnoreQueryFilters().CountAsync(e => e.MemberId == id, ct);
                if (memberEducation > 0) lines.Add(new("member-education", memberEducation,
                    $"{memberEducation} education record(s) will be hard-deleted when the member is purged."));

                var memberChangeReqs = await db.MemberChangeRequests.IgnoreQueryFilters().CountAsync(r => r.MemberId == id, ct);
                if (memberChangeReqs > 0) lines.Add(new("member-change-request", memberChangeReqs,
                    $"{memberChangeReqs} change-request(s) will be hard-deleted when the member is purged."));

                var pushSubs = await db.PushSubscriptions.IgnoreQueryFilters().CountAsync(p => p.MemberId == id, ct);
                if (pushSubs > 0) lines.Add(new("push-subscription", pushSubs,
                    $"{pushSubs} push-notification subscription(s) will be hard-deleted when the member is purged."));

                var orgMemberships = await db.MemberOrganisationMemberships.IgnoreQueryFilters().CountAsync(m => m.MemberId == id, ct);
                if (orgMemberships > 0) lines.Add(new("org-membership", orgMemberships,
                    $"{orgMemberships} organisation membership(s) will be hard-deleted when the member is purged."));
                break;

            case "Family":
                // FamilyMemberLink rows tie a member into a household; they go when the household goes.
                var familyLinks = await db.FamilyMemberLinks.IgnoreQueryFilters().CountAsync(l => l.FamilyId == id, ct);
                if (familyLinks > 0) lines.Add(new("family-member-link", familyLinks,
                    $"{familyLinks} family-member link(s) will be hard-deleted when the family is purged."));
                break;
        }
        return lines;
    }

    /// Hard-delete-only children that FK-reference the parent. Loaded only at purge time -
    /// during the soft-delete window these rows remain visible in their own queries (a member's
    /// assets stay browsable so the operator can confirm what they're about to wipe). EF
    /// cascade is intentionally NOT used in the schema because we want explicit, traceable
    /// deletion through this code path rather than silent SQL CASCADE behaviour.
    private async Task<List<object>> LoadPurgeCascadeAsync(string entityType, Guid id, CancellationToken ct)
    {
        var list = new List<object>();
        switch (entityType)
        {
            case "Member":
                list.AddRange(await db.MemberAssets.IgnoreQueryFilters().Where(a => a.MemberId == id).ToListAsync(ct));
                list.AddRange(await db.MemberEducations.IgnoreQueryFilters().Where(e => e.MemberId == id).ToListAsync(ct));
                list.AddRange(await db.MemberChangeRequests.IgnoreQueryFilters().Where(r => r.MemberId == id).ToListAsync(ct));
                list.AddRange(await db.PushSubscriptions.IgnoreQueryFilters().Where(p => p.MemberId == id).ToListAsync(ct));
                list.AddRange(await db.MemberOrganisationMemberships.IgnoreQueryFilters().Where(m => m.MemberId == id).ToListAsync(ct));
                break;
            case "Family":
                list.AddRange(await db.FamilyMemberLinks.IgnoreQueryFilters().Where(l => l.FamilyId == id).ToListAsync(ct));
                break;
        }
        return list;
    }

    /// Flip the linked ApplicationUser's IsLoginAllowed in lockstep with the Member's
    /// soft-delete state. Looked up by ITS rather than relying on an FK because Member.Id
    /// and ApplicationUser.Id are independent guids (one-to-one is by ITS). Silent no-op
    /// if the member has no login - that's normal for members who were never provisioned.
    private async Task RevokeLinkedLoginAsync(string itsNumber, bool revoke, CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.ItsNumber == itsNumber, ct);
        if (user is null) return;
        // !revoke == we're restoring -> set IsLoginAllowed = true. revoke == soft-delete -> false.
        var target = !revoke;
        if (user.IsLoginAllowed == target) return; // idempotent
        user.IsLoginAllowed = target;
        logger.LogInformation("Linked login for ITS {Its}: IsLoginAllowed -> {Target} (Member {Action}).",
            itsNumber, target, revoke ? "soft-deleted" : "restored");
    }

    /// Same shape as RedactSurvivingSnapshotsAsync but counts only - for the impact preview's
    /// "Redactions" bucket. Surfaces in the UI so the SuperAdmin sees "12 receipts will have
    /// the member name redacted on purge" before they confirm.
    private async Task<IReadOnlyList<DeletionLine>> ComputeRedactionsAsync(string entityType, Guid id, CancellationToken ct)
    {
        var lines = new List<DeletionLine>();
        if (entityType == "Member")
        {
            var receipts = await db.Receipts.IgnoreQueryFilters().CountAsync(r => r.MemberId == id, ct);
            if (receipts > 0) lines.Add(new("receipt-snapshot", receipts,
                $"{receipts} historical receipt(s) will keep their ledger entries on purge but have the member's name + ITS replaced with a <purged-YYYY-MM-DD> token."));
        }
        return lines;
    }

    /// Plan §3b: AuditLog / LoginAuditEntry / Receipt-snapshot fields keep their rows on purge
    /// but get their PII rewritten to "<purged-yyyy-mm-dd>". Today this only handles the
    /// Receipt.MemberNameSnapshot / Receipt.ItsNumberSnapshot fields - those are the only
    /// snapshot columns in the schema that carry Member PII. Commitment / QarzanHasanaLoan /
    /// EventRegistration don't carry name snapshots (they FK to the Member by id; the name
    /// renders at read time from the live row). After purge those reads will resolve the
    /// member id to null - the UI shows it as "(deleted)".
    private async Task RedactSurvivingSnapshotsAsync(string entityType, Guid id, CancellationToken ct)
    {
        if (entityType != "Member") return;
        var token = $"<purged-{clock.UtcNow:yyyy-MM-dd}>";
        var receipts = await db.Receipts.IgnoreQueryFilters().Where(r => r.MemberId == id).ToListAsync(ct);
        if (receipts.Count == 0) return;
        // EF Property() shadow accessor is the only way to write to private setters from
        // outside the aggregate without adding a domain method just for redaction.
        foreach (var r in receipts)
        {
            db.Entry(r).Property(nameof(Receipt.MemberNameSnapshot)).CurrentValue = token;
            db.Entry(r).Property(nameof(Receipt.ItsNumberSnapshot)).CurrentValue = token;
        }
        logger.LogInformation("Redacted MemberNameSnapshot/ItsNumberSnapshot on {Count} receipt(s) for purged member {MemberId}.",
            receipts.Count, id);
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
            "Member"            => await db.Members.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null)
                                    .Select(x => new TrashRowDto(entityType, x.Id, x.FullName + " (" + x.ItsNumber.Value + ")",
                                        x.DeletedAtUtc!.Value, x.DeletedByUserId, null, x.DeletionReason, x.RetentionUntilUtc))
                                    .ToListAsync(ct),
            "Family"            => await db.Families.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null)
                                    .Select(x => new TrashRowDto(entityType, x.Id, x.Code + " - " + x.FamilyName,
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
        "Member"            => await db.Members.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null && x.RetentionUntilUtc != null && x.RetentionUntilUtc < now).Select(x => x.Id).ToListAsync(ct),
        "Family"            => await db.Families.IgnoreQueryFilters().Where(x => x.DeletedAtUtc != null && x.RetentionUntilUtc != null && x.RetentionUntilUtc < now).Select(x => x.Id).ToListAsync(ct),
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
            userId: CurrentUserId(),
            userName: CurrentUserName() ?? "system",
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
