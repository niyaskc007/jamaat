using Jamaat.Application.Persistence;
using Jamaat.Contracts.FundCategories;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.FundCategories;

public interface IFundCategoryService
{
    Task<IReadOnlyList<FundCategoryDto>> ListAsync(bool? activeOnly, CancellationToken ct = default);
    Task<Result<FundCategoryDto>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<FundCategoryDto>> CreateAsync(CreateFundCategoryDto dto, CancellationToken ct = default);
    Task<Result<FundCategoryDto>> UpdateAsync(Guid id, UpdateFundCategoryDto dto, CancellationToken ct = default);
    Task<Result> DeleteAsync(Guid id, CancellationToken ct = default);

    Task<IReadOnlyList<FundSubCategoryDto>> ListSubCategoriesAsync(Guid? fundCategoryId, bool? activeOnly, CancellationToken ct = default);
    Task<Result<FundSubCategoryDto>> CreateSubAsync(CreateFundSubCategoryDto dto, CancellationToken ct = default);
    Task<Result<FundSubCategoryDto>> UpdateSubAsync(Guid id, UpdateFundSubCategoryDto dto, CancellationToken ct = default);
    Task<Result> DeleteSubAsync(Guid id, CancellationToken ct = default);
}

public sealed class FundCategoryService(JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant) : IFundCategoryService
{
    public async Task<IReadOnlyList<FundCategoryDto>> ListAsync(bool? activeOnly, CancellationToken ct = default)
    {
        var q = db.FundCategories.AsNoTracking();
        if (activeOnly == true) q = q.Where(c => c.IsActive);
        var items = await q.OrderBy(c => c.SortOrder).ThenBy(c => c.Name).ToListAsync(ct);
        // Counts let the admin UI surface "X fund types use this" so deletes can be safer.
        var typeCounts = await db.FundTypes.AsNoTracking()
            .Where(t => t.FundCategoryId != null)
            .GroupBy(t => t.FundCategoryId!.Value)
            .Select(g => new { CategoryId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.CategoryId, g => g.Count, ct);
        var subCounts = await db.FundSubCategories.AsNoTracking()
            .GroupBy(s => s.FundCategoryId)
            .Select(g => new { CategoryId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.CategoryId, g => g.Count, ct);
        return items.Select(c => new FundCategoryDto(
            c.Id, c.Code, c.Name, c.Kind, c.Description, c.SortOrder, c.IsActive,
            typeCounts.GetValueOrDefault(c.Id), subCounts.GetValueOrDefault(c.Id),
            c.CreatedAtUtc)).ToList();
    }

    public async Task<Result<FundCategoryDto>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var c = await db.FundCategories.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return Error.NotFound("fund_category.not_found", "Fund category not found.");
        var typeCount = await db.FundTypes.CountAsync(t => t.FundCategoryId == id, ct);
        var subCount = await db.FundSubCategories.CountAsync(s => s.FundCategoryId == id, ct);
        return new FundCategoryDto(c.Id, c.Code, c.Name, c.Kind, c.Description, c.SortOrder, c.IsActive, typeCount, subCount, c.CreatedAtUtc);
    }

    public async Task<Result<FundCategoryDto>> CreateAsync(CreateFundCategoryDto dto, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(dto.Code) || string.IsNullOrWhiteSpace(dto.Name))
            return Error.Validation("fund_category.invalid", "Code and name are required.");
        var code = dto.Code.ToUpperInvariant();
        if (await db.FundCategories.AnyAsync(c => c.Code == code, ct))
            return Error.Conflict("fund_category.duplicate", $"A fund category with code '{code}' already exists.");
        var entity = new FundCategoryEntity(Guid.NewGuid(), tenant.TenantId, code, dto.Name, dto.Kind);
        entity.Update(dto.Name, dto.Kind, dto.Description, dto.SortOrder, isActive: true);
        db.FundCategories.Add(entity);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(entity.Id, ct);
    }

    public async Task<Result<FundCategoryDto>> UpdateAsync(Guid id, UpdateFundCategoryDto dto, CancellationToken ct = default)
    {
        var entity = await db.FundCategories.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (entity is null) return Error.NotFound("fund_category.not_found", "Fund category not found.");
        entity.Update(dto.Name, dto.Kind, dto.Description, dto.SortOrder, dto.IsActive);
        db.FundCategories.Update(entity);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<Result> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var inUse = await db.FundTypes.AnyAsync(t => t.FundCategoryId == id, ct)
                    || await db.FundSubCategories.AnyAsync(s => s.FundCategoryId == id, ct);
        if (inUse) return Result.Failure(Error.Business("fund_category.in_use",
            "Cannot delete: fund types or sub-categories reference this category. Deactivate it instead."));
        var entity = await db.FundCategories.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (entity is null) return Result.Failure(Error.NotFound("fund_category.not_found", "Fund category not found."));
        db.FundCategories.Remove(entity);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<IReadOnlyList<FundSubCategoryDto>> ListSubCategoriesAsync(Guid? fundCategoryId, bool? activeOnly, CancellationToken ct = default)
    {
        var q = db.FundSubCategories.AsNoTracking();
        if (fundCategoryId is Guid cat) q = q.Where(s => s.FundCategoryId == cat);
        if (activeOnly == true) q = q.Where(s => s.IsActive);
        var items = await q.OrderBy(s => s.SortOrder).ThenBy(s => s.Name).ToListAsync(ct);
        var categoryIds = items.Select(s => s.FundCategoryId).Distinct().ToList();
        var categoryLookup = await db.FundCategories.AsNoTracking()
            .Where(c => categoryIds.Contains(c.Id))
            .Select(c => new { c.Id, c.Code, c.Name })
            .ToDictionaryAsync(c => c.Id, ct);
        var typeCounts = await db.FundTypes.AsNoTracking()
            .Where(t => t.FundSubCategoryId != null)
            .GroupBy(t => t.FundSubCategoryId!.Value)
            .Select(g => new { SubId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.SubId, g => g.Count, ct);
        return items.Select(s =>
        {
            var cat = categoryLookup.TryGetValue(s.FundCategoryId, out var c) ? c : null;
            return new FundSubCategoryDto(
                s.Id, s.FundCategoryId, cat?.Code ?? string.Empty, cat?.Name ?? string.Empty,
                s.Code, s.Name, s.Description, s.SortOrder, s.IsActive,
                typeCounts.GetValueOrDefault(s.Id),
                s.CreatedAtUtc);
        }).ToList();
    }

    public async Task<Result<FundSubCategoryDto>> CreateSubAsync(CreateFundSubCategoryDto dto, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(dto.Code) || string.IsNullOrWhiteSpace(dto.Name))
            return Error.Validation("fund_sub_category.invalid", "Code and name are required.");
        if (!await db.FundCategories.AnyAsync(c => c.Id == dto.FundCategoryId, ct))
            return Error.NotFound("fund_category.not_found", "Parent fund category not found.");
        var code = dto.Code.ToUpperInvariant();
        if (await db.FundSubCategories.AnyAsync(s => s.FundCategoryId == dto.FundCategoryId && s.Code == code, ct))
            return Error.Conflict("fund_sub_category.duplicate", $"A sub-category with code '{code}' already exists under this category.");
        var entity = new FundSubCategory(Guid.NewGuid(), tenant.TenantId, dto.FundCategoryId, code, dto.Name);
        entity.Update(dto.Name, dto.Description, dto.SortOrder, isActive: true);
        db.FundSubCategories.Add(entity);
        await uow.SaveChangesAsync(ct);
        return (await ListSubCategoriesAsync(dto.FundCategoryId, null, ct)).First(x => x.Id == entity.Id);
    }

    public async Task<Result<FundSubCategoryDto>> UpdateSubAsync(Guid id, UpdateFundSubCategoryDto dto, CancellationToken ct = default)
    {
        var entity = await db.FundSubCategories.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (entity is null) return Error.NotFound("fund_sub_category.not_found", "Sub-category not found.");
        if (entity.FundCategoryId != dto.FundCategoryId)
        {
            if (!await db.FundCategories.AnyAsync(c => c.Id == dto.FundCategoryId, ct))
                return Error.NotFound("fund_category.not_found", "Target fund category not found.");
            entity.MoveTo(dto.FundCategoryId);
        }
        entity.Update(dto.Name, dto.Description, dto.SortOrder, dto.IsActive);
        db.FundSubCategories.Update(entity);
        await uow.SaveChangesAsync(ct);
        return (await ListSubCategoriesAsync(entity.FundCategoryId, null, ct)).First(x => x.Id == id);
    }

    public async Task<Result> DeleteSubAsync(Guid id, CancellationToken ct = default)
    {
        var inUse = await db.FundTypes.AnyAsync(t => t.FundSubCategoryId == id, ct);
        if (inUse) return Result.Failure(Error.Business("fund_sub_category.in_use",
            "Cannot delete: fund types reference this sub-category. Deactivate it instead."));
        var entity = await db.FundSubCategories.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (entity is null) return Result.Failure(Error.NotFound("fund_sub_category.not_found", "Sub-category not found."));
        db.FundSubCategories.Remove(entity);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }
}
