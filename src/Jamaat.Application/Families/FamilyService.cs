using FluentValidation;
using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Families;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.Families;

public interface IFamilyService
{
    Task<PagedResult<FamilyDto>> ListAsync(FamilyListQuery q, CancellationToken ct = default);
    Task<Result<FamilyDetailDto>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<FamilyDto>> CreateAsync(CreateFamilyDto dto, CancellationToken ct = default);
    Task<Result<FamilyDto>> UpdateAsync(Guid id, UpdateFamilyDto dto, CancellationToken ct = default);
    Task<Result> AssignMemberAsync(Guid familyId, AssignMemberToFamilyDto dto, CancellationToken ct = default);
    Task<Result> RemoveMemberAsync(Guid familyId, Guid memberId, CancellationToken ct = default);
    Task<Result> TransferHeadshipAsync(Guid familyId, TransferHeadshipDto dto, CancellationToken ct = default);
}

public sealed class FamilyService(
    JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant,
    IValidator<CreateFamilyDto> createV, IValidator<UpdateFamilyDto> updateV) : IFamilyService
{
    public async Task<PagedResult<FamilyDto>> ListAsync(FamilyListQuery q, CancellationToken ct = default)
    {
        IQueryable<Family> query = db.Families.AsNoTracking();
        if (q.Active is not null) query = query.Where(f => f.IsActive == q.Active);
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(f => EF.Functions.Like(f.FamilyName, $"%{s}%") || EF.Functions.Like(f.Code, $"%{s}%"));
        }
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(f => f.FamilyName)
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 500))
            .Select(f => new FamilyDto(
                f.Id, f.Code, f.FamilyName, f.HeadMemberId, f.HeadItsNumber,
                db.Members.Where(m => m.Id == f.HeadMemberId).Select(m => m.FullName).FirstOrDefault(),
                f.ContactPhone, f.ContactEmail, f.Address, f.Notes, f.IsActive,
                db.Members.Count(m => m.FamilyId == f.Id && !m.IsDeleted),
                f.CreatedAtUtc))
            .ToListAsync(ct);
        return new PagedResult<FamilyDto>(items, total, q.Page, q.PageSize);
    }

    public async Task<Result<FamilyDetailDto>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var f = await db.Families.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (f is null) return Error.NotFound("family.not_found", "Family not found.");
        var members = await db.Members.AsNoTracking()
            .Where(m => m.FamilyId == id && !m.IsDeleted)
            .OrderBy(m => m.FamilyRole)
            .Select(m => new FamilyMemberDto(m.Id, m.ItsNumber.Value, m.FullName, m.FamilyRole, m.Id == f.HeadMemberId))
            .ToListAsync(ct);
        var headName = members.FirstOrDefault(m => m.IsHead)?.FullName;
        return new FamilyDetailDto(
            new FamilyDto(f.Id, f.Code, f.FamilyName, f.HeadMemberId, f.HeadItsNumber, headName,
                f.ContactPhone, f.ContactEmail, f.Address, f.Notes, f.IsActive, members.Count, f.CreatedAtUtc),
            members);
    }

    public async Task<Result<FamilyDto>> CreateAsync(CreateFamilyDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);
        var head = await db.Members.FirstOrDefaultAsync(m => m.Id == dto.HeadMemberId && !m.IsDeleted, ct);
        if (head is null) return Error.NotFound("member.not_found", "Head member not found.");

        var code = await NextCodeAsync(ct);
        var family = new Family(Guid.NewGuid(), tenant.TenantId, code, dto.FamilyName, head.Id);
        family.UpdateDetails(dto.FamilyName, dto.ContactPhone, dto.ContactEmail, dto.Address, dto.Notes);
        family.SetHead(head.Id, head.ItsNumber.Value);
        db.Families.Add(family);
        head.LinkFamily(family.Id, FamilyRole.Head);
        db.Members.Update(head);
        await uow.SaveChangesAsync(ct);

        return new FamilyDto(family.Id, family.Code, family.FamilyName, family.HeadMemberId, family.HeadItsNumber,
            head.FullName, family.ContactPhone, family.ContactEmail, family.Address, family.Notes, family.IsActive, 1, family.CreatedAtUtc);
    }

    public async Task<Result<FamilyDto>> UpdateAsync(Guid id, UpdateFamilyDto dto, CancellationToken ct = default)
    {
        await updateV.ValidateAndThrowAsync(dto, ct);
        var family = await db.Families.FirstOrDefaultAsync(f => f.Id == id, ct);
        if (family is null) return Error.NotFound("family.not_found", "Family not found.");
        family.UpdateDetails(dto.FamilyName, dto.ContactPhone, dto.ContactEmail, dto.Address, dto.Notes);
        if (dto.IsActive) family.Activate(); else family.Deactivate();
        db.Families.Update(family);
        await uow.SaveChangesAsync(ct);
        var head = await db.Members.Where(m => m.Id == family.HeadMemberId).Select(m => m.FullName).FirstOrDefaultAsync(ct);
        var count = await db.Members.CountAsync(m => m.FamilyId == family.Id && !m.IsDeleted, ct);
        return new FamilyDto(family.Id, family.Code, family.FamilyName, family.HeadMemberId, family.HeadItsNumber, head,
            family.ContactPhone, family.ContactEmail, family.Address, family.Notes, family.IsActive, count, family.CreatedAtUtc);
    }

    public async Task<Result> AssignMemberAsync(Guid familyId, AssignMemberToFamilyDto dto, CancellationToken ct = default)
    {
        var family = await db.Families.FirstOrDefaultAsync(f => f.Id == familyId, ct);
        if (family is null) return Result.Failure(Error.NotFound("family.not_found", "Family not found."));
        var member = await db.Members.FirstOrDefaultAsync(m => m.Id == dto.MemberId && !m.IsDeleted, ct);
        if (member is null) return Result.Failure(Error.NotFound("member.not_found", "Member not found."));
        if (member.FamilyId.HasValue && member.FamilyId != familyId)
            return Result.Failure(Error.Business("member.in_other_family", "Member is already in another family. Remove them first."));
        if (dto.Role == FamilyRole.Head && family.HeadMemberId != member.Id)
            return Result.Failure(Error.Business("family.head_conflict", "Use transfer-headship to change the head."));
        member.LinkFamily(familyId, dto.Role);
        db.Members.Update(member);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<Result> RemoveMemberAsync(Guid familyId, Guid memberId, CancellationToken ct = default)
    {
        var family = await db.Families.FirstOrDefaultAsync(f => f.Id == familyId, ct);
        if (family is null) return Result.Failure(Error.NotFound("family.not_found", "Family not found."));
        if (family.HeadMemberId == memberId)
            return Result.Failure(Error.Business("family.head_cannot_remove", "Transfer headship before removing the head."));
        var member = await db.Members.FirstOrDefaultAsync(m => m.Id == memberId && m.FamilyId == familyId, ct);
        if (member is null) return Result.Failure(Error.NotFound("member.not_in_family", "Member is not in this family."));
        member.UnlinkFamily();
        db.Members.Update(member);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<Result> TransferHeadshipAsync(Guid familyId, TransferHeadshipDto dto, CancellationToken ct = default)
    {
        var family = await db.Families.FirstOrDefaultAsync(f => f.Id == familyId, ct);
        if (family is null) return Result.Failure(Error.NotFound("family.not_found", "Family not found."));
        var newHead = await db.Members.FirstOrDefaultAsync(m => m.Id == dto.NewHeadMemberId && m.FamilyId == familyId, ct);
        if (newHead is null) return Result.Failure(Error.NotFound("member.not_in_family", "New head must be a member of this family."));
        if (family.HeadMemberId is Guid oldHeadId && oldHeadId != newHead.Id)
        {
            var oldHead = await db.Members.FirstOrDefaultAsync(m => m.Id == oldHeadId, ct);
            if (oldHead is not null) { oldHead.SetFamilyRole(FamilyRole.Other); db.Members.Update(oldHead); }
        }
        family.SetHead(newHead.Id, newHead.ItsNumber.Value);
        newHead.SetFamilyRole(FamilyRole.Head);
        db.Families.Update(family);
        db.Members.Update(newHead);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    private async Task<string> NextCodeAsync(CancellationToken ct)
    {
        var count = await db.Families.CountAsync(ct);
        return $"F-{(count + 1):D5}";
    }
}

public sealed class CreateFamilyValidator : AbstractValidator<CreateFamilyDto>
{
    public CreateFamilyValidator()
    {
        RuleFor(x => x.FamilyName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.HeadMemberId).NotEmpty();
    }
}
public sealed class UpdateFamilyValidator : AbstractValidator<UpdateFamilyDto>
{
    public UpdateFamilyValidator()
    {
        RuleFor(x => x.FamilyName).NotEmpty().MaximumLength(200);
    }
}
