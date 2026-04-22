using FluentValidation;
using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Sectors;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.Sectors;

public interface ISubSectorService
{
    Task<PagedResult<SubSectorDto>> ListAsync(SubSectorListQuery q, CancellationToken ct = default);
    Task<Result<SubSectorDto>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<SubSectorDto>> CreateAsync(CreateSubSectorDto dto, CancellationToken ct = default);
    Task<Result<SubSectorDto>> UpdateAsync(Guid id, UpdateSubSectorDto dto, CancellationToken ct = default);
    Task<Result> DeleteAsync(Guid id, CancellationToken ct = default);
}

public sealed class SubSectorService(
    JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant,
    IValidator<CreateSubSectorDto> createV, IValidator<UpdateSubSectorDto> updateV) : ISubSectorService
{
    private sealed record SubP(
        SubSector Entity, string SectorCode, string SectorName,
        string? MaleName, string? FemaleName, int MemberCount);

    public async Task<PagedResult<SubSectorDto>> ListAsync(SubSectorListQuery q, CancellationToken ct = default)
    {
        IQueryable<SubSector> query = db.SubSectors.AsNoTracking();
        if (q.SectorId is not null) query = query.Where(x => x.SectorId == q.SectorId);
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
            .Select(x => new SubP(x,
                db.Sectors.Where(sc => sc.Id == x.SectorId).Select(sc => sc.Code).FirstOrDefault() ?? "",
                db.Sectors.Where(sc => sc.Id == x.SectorId).Select(sc => sc.Name).FirstOrDefault() ?? "",
                db.Members.Where(m => m.Id == x.MaleInchargeMemberId).Select(m => m.FullName).FirstOrDefault(),
                db.Members.Where(m => m.Id == x.FemaleInchargeMemberId).Select(m => m.FullName).FirstOrDefault(),
                db.Members.Count(m => m.SubSectorId == x.Id && !m.IsDeleted)))
            .ToListAsync(ct);
        return new PagedResult<SubSectorDto>(items.Select(Map).ToList(), total, q.Page, q.PageSize);
    }

    public async Task<Result<SubSectorDto>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var p = await db.SubSectors.AsNoTracking().Where(x => x.Id == id)
            .Select(x => new SubP(x,
                db.Sectors.Where(sc => sc.Id == x.SectorId).Select(sc => sc.Code).FirstOrDefault() ?? "",
                db.Sectors.Where(sc => sc.Id == x.SectorId).Select(sc => sc.Name).FirstOrDefault() ?? "",
                db.Members.Where(m => m.Id == x.MaleInchargeMemberId).Select(m => m.FullName).FirstOrDefault(),
                db.Members.Where(m => m.Id == x.FemaleInchargeMemberId).Select(m => m.FullName).FirstOrDefault(),
                db.Members.Count(m => m.SubSectorId == x.Id && !m.IsDeleted)))
            .FirstOrDefaultAsync(ct);
        if (p is null) return Error.NotFound("subsector.not_found", "Sub-sector not found.");
        return Map(p);
    }

    public async Task<Result<SubSectorDto>> CreateAsync(CreateSubSectorDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);
        if (!await db.Sectors.AnyAsync(s => s.Id == dto.SectorId, ct))
            return Error.Validation("subsector.sector_invalid", "Sector not found.");
        var code = dto.Code.ToUpperInvariant();
        if (await db.SubSectors.AnyAsync(x => x.SectorId == dto.SectorId && x.Code == code, ct))
            return Error.Conflict("subsector.code_duplicate", $"Sub-sector code '{code}' already exists in this sector.");
        var s = new SubSector(Guid.NewGuid(), tenant.TenantId, dto.SectorId, code, dto.Name);
        s.Update(dto.Name, dto.MaleInchargeMemberId, dto.FemaleInchargeMemberId, dto.Notes, isActive: true);
        db.SubSectors.Add(s);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(s.Id, ct);
    }

    public async Task<Result<SubSectorDto>> UpdateAsync(Guid id, UpdateSubSectorDto dto, CancellationToken ct = default)
    {
        await updateV.ValidateAndThrowAsync(dto, ct);
        var s = await db.SubSectors.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (s is null) return Error.NotFound("subsector.not_found", "Sub-sector not found.");
        s.Update(dto.Name, dto.MaleInchargeMemberId, dto.FemaleInchargeMemberId, dto.Notes, dto.IsActive);
        db.SubSectors.Update(s);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(s.Id, ct);
    }

    public async Task<Result> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var s = await db.SubSectors.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (s is null) return Result.Failure(Error.NotFound("subsector.not_found", "Sub-sector not found."));
        var inUse = await db.Members.AnyAsync(m => m.SubSectorId == id, ct);
        if (inUse)
        {
            s.Update(s.Name, s.MaleInchargeMemberId, s.FemaleInchargeMemberId, s.Notes, isActive: false);
            db.SubSectors.Update(s);
        }
        else db.SubSectors.Remove(s);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    private static SubSectorDto Map(SubP p) =>
        new(p.Entity.Id, p.Entity.SectorId, p.SectorCode, p.SectorName,
            p.Entity.Code, p.Entity.Name,
            p.Entity.MaleInchargeMemberId, p.MaleName,
            p.Entity.FemaleInchargeMemberId, p.FemaleName,
            p.Entity.Notes, p.Entity.IsActive, p.MemberCount, p.Entity.CreatedAtUtc);
}

public sealed class CreateSubSectorValidator : AbstractValidator<CreateSubSectorDto>
{
    public CreateSubSectorValidator()
    {
        RuleFor(x => x.SectorId).NotEmpty();
        RuleFor(x => x.Code).NotEmpty().MaximumLength(32);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
    }
}
public sealed class UpdateSubSectorValidator : AbstractValidator<UpdateSubSectorDto>
{
    public UpdateSubSectorValidator() { RuleFor(x => x.Name).NotEmpty().MaximumLength(200); }
}
