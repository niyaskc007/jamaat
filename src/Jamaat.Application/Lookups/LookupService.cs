using FluentValidation;
using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Lookups;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.Lookups;

public interface ILookupService
{
    Task<PagedResult<LookupDto>> ListAsync(LookupListQuery q, CancellationToken ct = default);
    Task<IReadOnlyList<string>> GetCategoriesAsync(CancellationToken ct = default);
    Task<Result<LookupDto>> CreateAsync(CreateLookupDto dto, CancellationToken ct = default);
    Task<Result<LookupDto>> UpdateAsync(Guid id, UpdateLookupDto dto, CancellationToken ct = default);
    Task<Result> DeleteAsync(Guid id, CancellationToken ct = default);
}

public sealed class LookupService(
    JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant,
    IValidator<CreateLookupDto> createV, IValidator<UpdateLookupDto> updateV) : ILookupService
{
    public async Task<PagedResult<LookupDto>> ListAsync(LookupListQuery q, CancellationToken ct = default)
    {
        IQueryable<Lookup> query = db.Lookups.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q.Category)) query = query.Where(x => x.Category == q.Category);
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(x => EF.Functions.Like(x.Name, $"%{s}%") || EF.Functions.Like(x.Code, $"%{s}%"));
        }
        if (q.Active is not null) query = query.Where(x => x.IsActive == q.Active);
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(x => x.Category).ThenBy(x => x.SortOrder).ThenBy(x => x.Name)
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 1000))
            .Select(x => new LookupDto(x.Id, x.Category, x.Code, x.Name, x.NameArabic, x.SortOrder, x.IsActive, x.Notes, x.CreatedAtUtc))
            .ToListAsync(ct);
        return new PagedResult<LookupDto>(items, total, q.Page, q.PageSize);
    }

    public async Task<IReadOnlyList<string>> GetCategoriesAsync(CancellationToken ct = default)
        => await db.Lookups.AsNoTracking().Select(x => x.Category).Distinct().OrderBy(c => c).ToListAsync(ct);

    public async Task<Result<LookupDto>> CreateAsync(CreateLookupDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);
        var code = dto.Code.ToUpperInvariant();
        if (await db.Lookups.AnyAsync(x => x.Category == dto.Category && x.Code == code, ct))
            return Error.Conflict("lookup.code_duplicate", $"'{code}' already exists in category '{dto.Category}'.");
        var l = new Lookup(Guid.NewGuid(), tenant.TenantId, dto.Category, code, dto.Name);
        l.Update(dto.Name, dto.NameArabic, dto.SortOrder, dto.Notes, isActive: true);
        db.Lookups.Add(l);
        await uow.SaveChangesAsync(ct);
        return new LookupDto(l.Id, l.Category, l.Code, l.Name, l.NameArabic, l.SortOrder, l.IsActive, l.Notes, l.CreatedAtUtc);
    }

    public async Task<Result<LookupDto>> UpdateAsync(Guid id, UpdateLookupDto dto, CancellationToken ct = default)
    {
        await updateV.ValidateAndThrowAsync(dto, ct);
        var l = await db.Lookups.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (l is null) return Error.NotFound("lookup.not_found", "Lookup not found.");
        l.Update(dto.Name, dto.NameArabic, dto.SortOrder, dto.Notes, dto.IsActive);
        db.Lookups.Update(l);
        await uow.SaveChangesAsync(ct);
        return new LookupDto(l.Id, l.Category, l.Code, l.Name, l.NameArabic, l.SortOrder, l.IsActive, l.Notes, l.CreatedAtUtc);
    }

    public async Task<Result> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var l = await db.Lookups.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (l is null) return Result.Failure(Error.NotFound("lookup.not_found", "Lookup not found."));
        db.Lookups.Remove(l);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }
}

public sealed class CreateLookupValidator : AbstractValidator<CreateLookupDto>
{
    public CreateLookupValidator()
    {
        RuleFor(x => x.Category).NotEmpty().MaximumLength(64);
        RuleFor(x => x.Code).NotEmpty().MaximumLength(64);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
    }
}
public sealed class UpdateLookupValidator : AbstractValidator<UpdateLookupDto>
{
    public UpdateLookupValidator() { RuleFor(x => x.Name).NotEmpty().MaximumLength(200); }
}
