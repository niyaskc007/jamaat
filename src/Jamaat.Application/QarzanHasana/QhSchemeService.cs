using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.QarzanHasana;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.QarzanHasana;

/// CRUD service for QH scheme master-data. The legacy two-value enum
/// (Mohammadi=1, Hussain=2, Other=0) is now a code-defined seed inside this
/// table; admins can add their own schemes + subcategories without code
/// changes, and the form's "gold collateral" conditional drives off
/// <see cref="QhScheme.RequiresGoldCollateral"/> instead of a hardcoded
/// enum check.
public interface IQhSchemeService
{
    Task<IReadOnlyList<QhSchemeDto>> ListAsync(bool includeInactive, CancellationToken ct = default);
    Task<Result<QhSchemeDto>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<QhSchemeDto>> CreateAsync(CreateQhSchemeDto dto, CancellationToken ct = default);
    Task<Result<QhSchemeDto>> UpdateAsync(Guid id, UpdateQhSchemeDto dto, CancellationToken ct = default);
    Task<Result> DeleteAsync(Guid id, CancellationToken ct = default);
}

public sealed class QhSchemeService(
    JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant) : IQhSchemeService
{
    public async Task<IReadOnlyList<QhSchemeDto>> ListAsync(bool includeInactive, CancellationToken ct = default)
    {
        // Two-pass: load all (we typically have <100 rows), then map. Avoids a
        // self-join for the ParentSchemeName + works around EF Core's value-
        // converter quirks when projecting nested fields.
        IQueryable<QhScheme> q = db.QhSchemes.AsNoTracking();
        if (!includeInactive) q = q.Where(s => s.IsActive);
        var rows = await q.OrderBy(s => s.SortOrder).ThenBy(s => s.Name).ToListAsync(ct);
        var byId = rows.ToDictionary(r => r.Id);
        return rows.Select(r => Map(r, r.ParentSchemeId is { } pid && byId.TryGetValue(pid, out var p) ? p.Name : null)).ToList();
    }

    public async Task<Result<QhSchemeDto>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var row = await db.QhSchemes.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id, ct);
        if (row is null) return Error.NotFound("qh_scheme.not_found", "Scheme not found.");
        string? parentName = null;
        if (row.ParentSchemeId is { } pid)
            parentName = await db.QhSchemes.AsNoTracking().Where(p => p.Id == pid).Select(p => p.Name).FirstOrDefaultAsync(ct);
        return Map(row, parentName);
    }

    public async Task<Result<QhSchemeDto>> CreateAsync(CreateQhSchemeDto dto, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(dto.Code)) return Error.Validation("qh_scheme.code_required", "Code is required.");
        if (string.IsNullOrWhiteSpace(dto.Name)) return Error.Validation("qh_scheme.name_required", "Name is required.");
        // Uniqueness within (TenantId, ParentSchemeId, Code) per the unique index;
        // we pre-check so we can return a friendly error instead of a SQL constraint violation.
        var dupe = await db.QhSchemes.AsNoTracking().AnyAsync(s =>
            s.TenantId == tenant.TenantId && s.ParentSchemeId == dto.ParentSchemeId &&
            s.Code == dto.Code.ToUpperInvariant(), ct);
        if (dupe) return Error.Conflict("qh_scheme.code_duplicate",
            "A scheme with that code already exists at this level (root or under the chosen parent).");

        if (dto.ParentSchemeId is { } pid)
        {
            var parent = await db.QhSchemes.AsNoTracking().FirstOrDefaultAsync(p => p.Id == pid, ct);
            if (parent is null) return Error.NotFound("qh_scheme.parent_missing", "Parent scheme not found.");
            // No grandchildren: keeps the UI simple (single cascading select).
            if (parent.ParentSchemeId is not null)
                return Error.Validation("qh_scheme.depth_exceeded",
                    "Schemes only support a single level of subcategories. The chosen parent is itself a subcategory.");
        }

        var s = new QhScheme(Guid.NewGuid(), tenant.TenantId, dto.Code, dto.Name, dto.RequiresGoldCollateral);
        s.Update(dto.Name, dto.Description, dto.ParentSchemeId, dto.RequiresGoldCollateral,
            dto.SortOrder, isActive: true, legacySchemeValue: dto.LegacySchemeValue);
        db.QhSchemes.Add(s);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(s.Id, ct);
    }

    public async Task<Result<QhSchemeDto>> UpdateAsync(Guid id, UpdateQhSchemeDto dto, CancellationToken ct = default)
    {
        var row = await db.QhSchemes.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (row is null) return Error.NotFound("qh_scheme.not_found", "Scheme not found.");
        if (dto.ParentSchemeId == id)
            return Error.Validation("qh_scheme.self_parent", "A scheme cannot be its own parent.");

        if (dto.ParentSchemeId is { } pid)
        {
            var parent = await db.QhSchemes.AsNoTracking().FirstOrDefaultAsync(p => p.Id == pid, ct);
            if (parent is null) return Error.NotFound("qh_scheme.parent_missing", "Parent scheme not found.");
            if (parent.ParentSchemeId is not null)
                return Error.Validation("qh_scheme.depth_exceeded",
                    "Schemes only support a single level of subcategories.");
        }

        row.Update(dto.Name, dto.Description, dto.ParentSchemeId, dto.RequiresGoldCollateral,
            dto.SortOrder, dto.IsActive, dto.LegacySchemeValue);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<Result> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var row = await db.QhSchemes.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (row is null) return Result.Failure(Error.NotFound("qh_scheme.not_found", "Scheme not found."));
        // Guards: a scheme with children OR with loans pointing at it can't be
        // hard-deleted. The admin must either reassign loans / unparent children
        // first, or just toggle IsActive=false (soft retire).
        if (await db.QhSchemes.AsNoTracking().AnyAsync(c => c.ParentSchemeId == id, ct))
            return Result.Failure(Error.Business("qh_scheme.has_children",
                "Cannot delete: this scheme has subcategories. Delete or unparent them first, or just toggle the scheme inactive."));
        if (await db.QarzanHasanaLoans.AsNoTracking().AnyAsync(l => l.SchemeId == id, ct))
            return Result.Failure(Error.Business("qh_scheme.in_use",
                "Cannot delete: loans have been issued under this scheme. Toggle it inactive instead so it stops appearing on new applications."));
        db.QhSchemes.Remove(row);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    private static QhSchemeDto Map(QhScheme s, string? parentName) => new(
        s.Id, s.Code, s.Name, s.Description, s.ParentSchemeId, parentName,
        s.RequiresGoldCollateral, s.SortOrder, s.IsActive, s.LegacySchemeValue);
}
