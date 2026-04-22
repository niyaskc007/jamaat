using FluentValidation;
using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Organisations;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.Organisations;

public interface IOrganisationService
{
    Task<PagedResult<OrganisationDto>> ListAsync(OrganisationListQuery q, CancellationToken ct = default);
    Task<Result<OrganisationDto>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<OrganisationDto>> CreateAsync(CreateOrganisationDto dto, CancellationToken ct = default);
    Task<Result<OrganisationDto>> UpdateAsync(Guid id, UpdateOrganisationDto dto, CancellationToken ct = default);
    Task<Result> DeleteAsync(Guid id, CancellationToken ct = default);
}

public sealed class OrganisationService(
    JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant,
    IValidator<CreateOrganisationDto> createV, IValidator<UpdateOrganisationDto> updateV) : IOrganisationService
{
    public async Task<PagedResult<OrganisationDto>> ListAsync(OrganisationListQuery q, CancellationToken ct = default)
    {
        IQueryable<Organisation> query = db.Organisations.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(x => EF.Functions.Like(x.Name, $"%{s}%") || EF.Functions.Like(x.Code, $"%{s}%"));
        }
        if (!string.IsNullOrWhiteSpace(q.Category)) query = query.Where(x => x.Category == q.Category);
        if (q.Active is not null) query = query.Where(x => x.IsActive == q.Active);
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(x => x.Name)
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 500))
            .Select(x => new OrganisationDto(
                x.Id, x.Code, x.Name, x.NameArabic, x.Category, x.Notes, x.IsActive,
                db.MemberOrganisationMemberships.Count(m => m.OrganisationId == x.Id && m.IsActive),
                x.CreatedAtUtc))
            .ToListAsync(ct);
        return new PagedResult<OrganisationDto>(items, total, q.Page, q.PageSize);
    }

    public async Task<Result<OrganisationDto>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var o = await db.Organisations.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (o is null) return Error.NotFound("organisation.not_found", "Organisation not found.");
        var count = await db.MemberOrganisationMemberships.CountAsync(m => m.OrganisationId == id && m.IsActive, ct);
        return new OrganisationDto(o.Id, o.Code, o.Name, o.NameArabic, o.Category, o.Notes, o.IsActive, count, o.CreatedAtUtc);
    }

    public async Task<Result<OrganisationDto>> CreateAsync(CreateOrganisationDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);
        var code = dto.Code.ToUpperInvariant();
        if (await db.Organisations.AnyAsync(x => x.Code == code, ct))
            return Error.Conflict("organisation.code_duplicate", $"Code '{code}' already exists.");
        var o = new Organisation(Guid.NewGuid(), tenant.TenantId, code, dto.Name);
        o.Update(dto.Name, dto.NameArabic, dto.Category, dto.Notes, isActive: true);
        db.Organisations.Add(o);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(o.Id, ct);
    }

    public async Task<Result<OrganisationDto>> UpdateAsync(Guid id, UpdateOrganisationDto dto, CancellationToken ct = default)
    {
        await updateV.ValidateAndThrowAsync(dto, ct);
        var o = await db.Organisations.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (o is null) return Error.NotFound("organisation.not_found", "Organisation not found.");
        o.Update(dto.Name, dto.NameArabic, dto.Category, dto.Notes, dto.IsActive);
        db.Organisations.Update(o);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(o.Id, ct);
    }

    public async Task<Result> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var o = await db.Organisations.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (o is null) return Result.Failure(Error.NotFound("organisation.not_found", "Organisation not found."));
        var inUse = await db.MemberOrganisationMemberships.AnyAsync(m => m.OrganisationId == id, ct);
        if (inUse)
        {
            o.Update(o.Name, o.NameArabic, o.Category, o.Notes, isActive: false);
            db.Organisations.Update(o);
        }
        else db.Organisations.Remove(o);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }
}

public sealed class CreateOrganisationValidator : AbstractValidator<CreateOrganisationDto>
{
    public CreateOrganisationValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(32);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
    }
}
public sealed class UpdateOrganisationValidator : AbstractValidator<UpdateOrganisationDto>
{
    public UpdateOrganisationValidator() { RuleFor(x => x.Name).NotEmpty().MaximumLength(200); }
}

public interface IMembershipService
{
    Task<PagedResult<MemberOrgMembershipDto>> ListAsync(MembershipListQuery q, CancellationToken ct = default);
    Task<Result<MemberOrgMembershipDto>> CreateAsync(CreateMembershipDto dto, CancellationToken ct = default);
    Task<Result<MemberOrgMembershipDto>> UpdateAsync(Guid id, UpdateMembershipDto dto, CancellationToken ct = default);
    Task<Result> DeleteAsync(Guid id, CancellationToken ct = default);
}

public sealed class MembershipService(
    JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant) : IMembershipService
{
    private sealed record MP(MemberOrganisationMembership Entity, string MemberIts, string MemberName, string OrgCode, string OrgName);

    private static IQueryable<MP> Project(JamaatDbContextFacade db, IQueryable<MemberOrganisationMembership> q) =>
        q.Select(x => new MP(x,
            db.Members.Where(m => m.Id == x.MemberId).Select(m => m.ItsNumber.Value).FirstOrDefault() ?? "",
            db.Members.Where(m => m.Id == x.MemberId).Select(m => m.FullName).FirstOrDefault() ?? "",
            db.Organisations.Where(o => o.Id == x.OrganisationId).Select(o => o.Code).FirstOrDefault() ?? "",
            db.Organisations.Where(o => o.Id == x.OrganisationId).Select(o => o.Name).FirstOrDefault() ?? ""));

    public async Task<PagedResult<MemberOrgMembershipDto>> ListAsync(MembershipListQuery q, CancellationToken ct = default)
    {
        IQueryable<MemberOrganisationMembership> query = db.MemberOrganisationMemberships.AsNoTracking();
        if (q.MemberId is not null) query = query.Where(x => x.MemberId == q.MemberId);
        if (q.OrganisationId is not null) query = query.Where(x => x.OrganisationId == q.OrganisationId);
        if (q.Active is not null) query = query.Where(x => x.IsActive == q.Active);
        var total = await query.CountAsync(ct);
        var items = await Project(db, query.OrderByDescending(x => x.CreatedAtUtc)
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 500)))
            .ToListAsync(ct);
        return new PagedResult<MemberOrgMembershipDto>(items.Select(Map).ToList(), total, q.Page, q.PageSize);
    }

    public async Task<Result<MemberOrgMembershipDto>> CreateAsync(CreateMembershipDto dto, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(dto.Role)) return Error.Validation("membership.role_required", "Role is required.");
        if (!await db.Members.AnyAsync(m => m.Id == dto.MemberId, ct))
            return Error.NotFound("member.not_found", "Member not found.");
        if (!await db.Organisations.AnyAsync(o => o.Id == dto.OrganisationId, ct))
            return Error.NotFound("organisation.not_found", "Organisation not found.");
        if (await db.MemberOrganisationMemberships.AnyAsync(m =>
                m.MemberId == dto.MemberId && m.OrganisationId == dto.OrganisationId && m.Role == dto.Role, ct))
            return Error.Conflict("membership.duplicate", "Membership with that role already exists.");
        var e = new MemberOrganisationMembership(Guid.NewGuid(), tenant.TenantId, dto.MemberId, dto.OrganisationId, dto.Role);
        e.Update(dto.Role, dto.StartDate, dto.EndDate, dto.Notes, isActive: true);
        db.MemberOrganisationMemberships.Add(e);
        await uow.SaveChangesAsync(ct);
        var fresh = await Project(db, db.MemberOrganisationMemberships.AsNoTracking().Where(x => x.Id == e.Id)).FirstAsync(ct);
        return Map(fresh);
    }

    public async Task<Result<MemberOrgMembershipDto>> UpdateAsync(Guid id, UpdateMembershipDto dto, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(dto.Role)) return Error.Validation("membership.role_required", "Role is required.");
        var e = await db.MemberOrganisationMemberships.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (e is null) return Error.NotFound("membership.not_found", "Membership not found.");
        e.Update(dto.Role, dto.StartDate, dto.EndDate, dto.Notes, dto.IsActive);
        db.MemberOrganisationMemberships.Update(e);
        await uow.SaveChangesAsync(ct);
        var fresh = await Project(db, db.MemberOrganisationMemberships.AsNoTracking().Where(x => x.Id == e.Id)).FirstAsync(ct);
        return Map(fresh);
    }

    public async Task<Result> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var e = await db.MemberOrganisationMemberships.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (e is null) return Result.Failure(Error.NotFound("membership.not_found", "Membership not found."));
        db.MemberOrganisationMemberships.Remove(e);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    private static MemberOrgMembershipDto Map(MP p) =>
        new(p.Entity.Id, p.Entity.MemberId, p.MemberIts, p.MemberName,
            p.Entity.OrganisationId, p.OrgCode, p.OrgName,
            p.Entity.Role, p.Entity.StartDate, p.Entity.EndDate, p.Entity.IsActive, p.Entity.Notes, p.Entity.CreatedAtUtc);
}
