using FluentValidation;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Cms;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.Cms;

public interface ICmsService
{
    // ---- Pages -----------------------------------------------------------
    Task<IReadOnlyList<CmsPageListItemDto>> ListPagesAsync(bool includeUnpublished, CancellationToken ct = default);
    Task<Result<CmsPageDto>> GetPageBySlugAsync(string slug, bool includeUnpublished, CancellationToken ct = default);
    Task<Result<CmsPageDto>> GetPageByIdAsync(Guid id, CancellationToken ct = default);
    Task<Result<CmsPageDto>> CreatePageAsync(CreateCmsPageDto dto, CancellationToken ct = default);
    Task<Result<CmsPageDto>> UpdatePageAsync(Guid id, UpdateCmsPageDto dto, CancellationToken ct = default);
    Task<Result> DeletePageAsync(Guid id, CancellationToken ct = default);

    // ---- Blocks ----------------------------------------------------------
    Task<IReadOnlyList<CmsBlockDto>> ListBlocksAsync(string? prefix, CancellationToken ct = default);
    Task<CmsBlockDto?> GetBlockAsync(string key, CancellationToken ct = default);
    Task<CmsBlockDto> UpsertBlockAsync(string key, UpsertCmsBlockDto dto, CancellationToken ct = default);
    Task<Result> DeleteBlockAsync(string key, CancellationToken ct = default);
}

public sealed class CmsService(
    JamaatDbContextFacade db, IUnitOfWork uow,
    IValidator<CreateCmsPageDto> createV, IValidator<UpdateCmsPageDto> updateV,
    IValidator<UpsertCmsBlockDto> blockV) : ICmsService
{
    // ---- Pages -----------------------------------------------------------
    public async Task<IReadOnlyList<CmsPageListItemDto>> ListPagesAsync(bool includeUnpublished, CancellationToken ct = default)
    {
        IQueryable<CmsPage> q = db.CmsPages.AsNoTracking();
        if (!includeUnpublished) q = q.Where(p => p.IsPublished);
        return await q.OrderBy(p => p.Section).ThenBy(p => p.Slug)
            .Select(p => new CmsPageListItemDto(p.Id, p.Slug, p.Title, (CmsPageSectionDto)p.Section, p.IsPublished, p.UpdatedAtUtc))
            .ToListAsync(ct);
    }

    public async Task<Result<CmsPageDto>> GetPageBySlugAsync(string slug, bool includeUnpublished, CancellationToken ct = default)
    {
        var s = (slug ?? "").Trim().ToLowerInvariant();
        var page = await db.CmsPages.AsNoTracking().FirstOrDefaultAsync(p => p.Slug == s, ct);
        if (page is null) return Error.NotFound("cms.page.not_found", $"Page '{s}' not found.");
        if (!includeUnpublished && !page.IsPublished) return Error.NotFound("cms.page.not_found", $"Page '{s}' not found.");
        return Map(page);
    }

    public async Task<Result<CmsPageDto>> GetPageByIdAsync(Guid id, CancellationToken ct = default)
    {
        var page = await db.CmsPages.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id, ct);
        if (page is null) return Error.NotFound("cms.page.not_found", "Page not found.");
        return Map(page);
    }

    public async Task<Result<CmsPageDto>> CreatePageAsync(CreateCmsPageDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);
        var slug = dto.Slug.Trim().ToLowerInvariant();
        if (await db.CmsPages.AnyAsync(p => p.Slug == slug, ct))
            return Error.Conflict("cms.page.slug_duplicate", $"A page with slug '{slug}' already exists.");

        var page = new CmsPage(Guid.NewGuid(), slug, dto.Title, dto.Body, (CmsPageSection)dto.Section);
        page.Update(dto.Title, dto.Body, (CmsPageSection)dto.Section, dto.IsPublished);
        db.CmsPages.Add(page);
        await uow.SaveChangesAsync(ct);
        return Map(page);
    }

    public async Task<Result<CmsPageDto>> UpdatePageAsync(Guid id, UpdateCmsPageDto dto, CancellationToken ct = default)
    {
        await updateV.ValidateAndThrowAsync(dto, ct);
        var page = await db.CmsPages.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (page is null) return Error.NotFound("cms.page.not_found", "Page not found.");
        page.Update(dto.Title, dto.Body, (CmsPageSection)dto.Section, dto.IsPublished);
        db.CmsPages.Update(page);
        await uow.SaveChangesAsync(ct);
        return Map(page);
    }

    public async Task<Result> DeletePageAsync(Guid id, CancellationToken ct = default)
    {
        var page = await db.CmsPages.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (page is null) return Result.Failure(Error.NotFound("cms.page.not_found", "Page not found."));
        db.CmsPages.Remove(page);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    // ---- Blocks ----------------------------------------------------------
    public async Task<IReadOnlyList<CmsBlockDto>> ListBlocksAsync(string? prefix, CancellationToken ct = default)
    {
        IQueryable<CmsBlock> q = db.CmsBlocks.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(prefix))
        {
            var p = prefix.Trim().ToLowerInvariant();
            q = q.Where(b => b.Key.StartsWith(p));
        }
        return await q.OrderBy(b => b.Key)
            .Select(b => new CmsBlockDto(b.Key, b.Value))
            .ToListAsync(ct);
    }

    public async Task<CmsBlockDto?> GetBlockAsync(string key, CancellationToken ct = default)
    {
        var k = (key ?? "").Trim().ToLowerInvariant();
        var b = await db.CmsBlocks.AsNoTracking().FirstOrDefaultAsync(x => x.Key == k, ct);
        return b is null ? null : new CmsBlockDto(b.Key, b.Value);
    }

    public async Task<CmsBlockDto> UpsertBlockAsync(string key, UpsertCmsBlockDto dto, CancellationToken ct = default)
    {
        await blockV.ValidateAndThrowAsync(dto, ct);
        var k = (key ?? "").Trim().ToLowerInvariant();
        var b = await db.CmsBlocks.FirstOrDefaultAsync(x => x.Key == k, ct);
        if (b is null)
        {
            b = new CmsBlock(Guid.NewGuid(), k, dto.Value);
            db.CmsBlocks.Add(b);
        }
        else
        {
            b.Update(dto.Value);
            db.CmsBlocks.Update(b);
        }
        await uow.SaveChangesAsync(ct);
        return new CmsBlockDto(b.Key, b.Value);
    }

    public async Task<Result> DeleteBlockAsync(string key, CancellationToken ct = default)
    {
        var k = (key ?? "").Trim().ToLowerInvariant();
        var b = await db.CmsBlocks.FirstOrDefaultAsync(x => x.Key == k, ct);
        if (b is null) return Result.Failure(Error.NotFound("cms.block.not_found", "Block not found."));
        db.CmsBlocks.Remove(b);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    private static CmsPageDto Map(CmsPage p) =>
        new(p.Id, p.Slug, p.Title, p.Body, (CmsPageSectionDto)p.Section, p.IsPublished, p.CreatedAtUtc, p.UpdatedAtUtc);
}

public sealed class CreateCmsPageValidator : AbstractValidator<CreateCmsPageDto>
{
    public CreateCmsPageValidator()
    {
        RuleFor(x => x.Slug).NotEmpty().MaximumLength(128).Matches("^[a-z0-9][a-z0-9-]*$")
            .WithMessage("Slug must be lowercase alphanumeric with optional hyphens.");
        RuleFor(x => x.Title).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Body).NotEmpty();
    }
}

public sealed class UpdateCmsPageValidator : AbstractValidator<UpdateCmsPageDto>
{
    public UpdateCmsPageValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Body).NotEmpty();
    }
}

public sealed class UpsertCmsBlockValidator : AbstractValidator<UpsertCmsBlockDto>
{
    public UpsertCmsBlockValidator()
    {
        RuleFor(x => x.Value).NotNull();
    }
}
