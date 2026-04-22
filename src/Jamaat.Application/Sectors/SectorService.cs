using FluentValidation;
using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Sectors;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.Sectors;

public interface ISectorService
{
    Task<PagedResult<SectorDto>> ListAsync(SectorListQuery q, CancellationToken ct = default);
    Task<Result<SectorDto>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<SectorDto>> CreateAsync(CreateSectorDto dto, CancellationToken ct = default);
    Task<Result<SectorDto>> UpdateAsync(Guid id, UpdateSectorDto dto, CancellationToken ct = default);
    Task<Result> DeleteAsync(Guid id, CancellationToken ct = default);
}

public sealed class SectorService(
    JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant,
    IValidator<CreateSectorDto> createV, IValidator<UpdateSectorDto> updateV) : ISectorService
{
    public async Task<PagedResult<SectorDto>> ListAsync(SectorListQuery q, CancellationToken ct = default)
    {
        IQueryable<Sector> query = db.Sectors.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(x => EF.Functions.Like(x.Name, $"%{s}%") || EF.Functions.Like(x.Code, $"%{s}%"));
        }
        if (q.Active is not null) query = query.Where(x => x.IsActive == q.Active);
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(x => x.Code)
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 500))
            .Select(x => new SectorProjection(
                x,
                db.Members.Where(m => m.Id == x.MaleInchargeMemberId).Select(m => m.ItsNumber.Value).FirstOrDefault(),
                db.Members.Where(m => m.Id == x.MaleInchargeMemberId).Select(m => m.FullName).FirstOrDefault(),
                db.Members.Where(m => m.Id == x.FemaleInchargeMemberId).Select(m => m.ItsNumber.Value).FirstOrDefault(),
                db.Members.Where(m => m.Id == x.FemaleInchargeMemberId).Select(m => m.FullName).FirstOrDefault(),
                db.SubSectors.Count(ss => ss.SectorId == x.Id),
                db.Members.Count(m => m.SectorId == x.Id && !m.IsDeleted)))
            .ToListAsync(ct);
        return new PagedResult<SectorDto>(items.Select(Map).ToList(), total, q.Page, q.PageSize);
    }

    public async Task<Result<SectorDto>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var p = await db.Sectors.AsNoTracking().Where(x => x.Id == id)
            .Select(x => new SectorProjection(
                x,
                db.Members.Where(m => m.Id == x.MaleInchargeMemberId).Select(m => m.ItsNumber.Value).FirstOrDefault(),
                db.Members.Where(m => m.Id == x.MaleInchargeMemberId).Select(m => m.FullName).FirstOrDefault(),
                db.Members.Where(m => m.Id == x.FemaleInchargeMemberId).Select(m => m.ItsNumber.Value).FirstOrDefault(),
                db.Members.Where(m => m.Id == x.FemaleInchargeMemberId).Select(m => m.FullName).FirstOrDefault(),
                db.SubSectors.Count(ss => ss.SectorId == x.Id),
                db.Members.Count(m => m.SectorId == x.Id && !m.IsDeleted)))
            .FirstOrDefaultAsync(ct);
        if (p is null) return Error.NotFound("sector.not_found", "Sector not found.");
        return Map(p);
    }

    private sealed record SectorProjection(
        Sector Sector,
        string? MaleIts, string? MaleName,
        string? FemaleIts, string? FemaleName,
        int SubCount, int MemberCount);

    private static SectorDto Map(SectorProjection p) =>
        new(p.Sector.Id, p.Sector.Code, p.Sector.Name,
            p.Sector.MaleInchargeMemberId, p.MaleIts, p.MaleName,
            p.Sector.FemaleInchargeMemberId, p.FemaleIts, p.FemaleName,
            p.Sector.Notes, p.Sector.IsActive, p.SubCount, p.MemberCount, p.Sector.CreatedAtUtc);

    public async Task<Result<SectorDto>> CreateAsync(CreateSectorDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);
        var code = dto.Code.ToUpperInvariant();
        if (await db.Sectors.AnyAsync(x => x.Code == code, ct))
            return Error.Conflict("sector.code_duplicate", $"Sector code '{code}' already exists.");
        var s = new Sector(Guid.NewGuid(), tenant.TenantId, code, dto.Name);
        s.Update(dto.Name, dto.MaleInchargeMemberId, dto.FemaleInchargeMemberId, dto.Notes, isActive: true);
        db.Sectors.Add(s);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(s.Id, ct);
    }

    public async Task<Result<SectorDto>> UpdateAsync(Guid id, UpdateSectorDto dto, CancellationToken ct = default)
    {
        await updateV.ValidateAndThrowAsync(dto, ct);
        var s = await db.Sectors.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (s is null) return Error.NotFound("sector.not_found", "Sector not found.");
        s.Update(dto.Name, dto.MaleInchargeMemberId, dto.FemaleInchargeMemberId, dto.Notes, dto.IsActive);
        db.Sectors.Update(s);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(s.Id, ct);
    }

    public async Task<Result> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var s = await db.Sectors.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (s is null) return Result.Failure(Error.NotFound("sector.not_found", "Sector not found."));
        var inUse = await db.Members.AnyAsync(m => m.SectorId == id, ct) || await db.SubSectors.AnyAsync(ss => ss.SectorId == id, ct);
        if (inUse)
        {
            s.Update(s.Name, s.MaleInchargeMemberId, s.FemaleInchargeMemberId, s.Notes, isActive: false);
            db.Sectors.Update(s);
        }
        else db.Sectors.Remove(s);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

}

public sealed class CreateSectorValidator : AbstractValidator<CreateSectorDto>
{
    public CreateSectorValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(32);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
    }
}
public sealed class UpdateSectorValidator : AbstractValidator<UpdateSectorDto>
{
    public UpdateSectorValidator() { RuleFor(x => x.Name).NotEmpty().MaximumLength(200); }
}
