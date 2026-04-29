using FluentValidation;
using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.FundEnrollments;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.FundEnrollments;

public interface IFundEnrollmentService
{
    Task<PagedResult<FundEnrollmentDto>> ListAsync(FundEnrollmentListQuery q, CancellationToken ct = default);
    Task<Result<FundEnrollmentDto>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<FundEnrollmentDto>> CreateAsync(CreateFundEnrollmentDto dto, CancellationToken ct = default);
    Task<Result<FundEnrollmentDto>> UpdateAsync(Guid id, UpdateFundEnrollmentDto dto, CancellationToken ct = default);
    Task<Result<FundEnrollmentDto>> ApproveAsync(Guid id, CancellationToken ct = default);
    Task<Result<FundEnrollmentDto>> PauseAsync(Guid id, CancellationToken ct = default);
    Task<Result<FundEnrollmentDto>> ResumeAsync(Guid id, CancellationToken ct = default);
    Task<Result> CancelAsync(Guid id, CancellationToken ct = default);
}

public sealed class FundEnrollmentService(
    JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant,
    ICurrentUser currentUser, IClock clock,
    IValidator<CreateFundEnrollmentDto> createV,
    IValidator<UpdateFundEnrollmentDto> updateV) : IFundEnrollmentService
{
    public async Task<PagedResult<FundEnrollmentDto>> ListAsync(FundEnrollmentListQuery q, CancellationToken ct = default)
    {
        IQueryable<FundEnrollment> query = db.FundEnrollments.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(x => EF.Functions.Like(x.Code, $"%{s}%"));
        }
        if (q.Status is not null) query = query.Where(x => x.Status == q.Status);
        if (q.MemberId is not null) query = query.Where(x => x.MemberId == q.MemberId);
        if (q.FundTypeId is not null) query = query.Where(x => x.FundTypeId == q.FundTypeId);
        if (!string.IsNullOrWhiteSpace(q.SubType)) query = query.Where(x => x.SubType == q.SubType);

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(x => x.CreatedAtUtc)
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 500))
            .Select(x => Project(db, x))
            .ToListAsync(ct);
        return new PagedResult<FundEnrollmentDto>(items, total, q.Page, q.PageSize);
    }

    public async Task<Result<FundEnrollmentDto>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var dto = await db.FundEnrollments.AsNoTracking().Where(x => x.Id == id)
            .Select(x => Project(db, x)).FirstOrDefaultAsync(ct);
        if (dto is null) return Error.NotFound("enrollment.not_found", "Enrollment not found.");
        return dto;
    }

    public async Task<Result<FundEnrollmentDto>> CreateAsync(CreateFundEnrollmentDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);
        if (!await db.Members.AnyAsync(m => m.Id == dto.MemberId && !m.IsDeleted, ct))
            return Error.NotFound("member.not_found", "Member not found.");
        var fund = await db.FundTypes.AsNoTracking().FirstOrDefaultAsync(f => f.Id == dto.FundTypeId, ct);
        if (fund is null) return Error.NotFound("fund_type.not_found", "Fund type not found.");
        if (fund.IsLoan) return Error.Business("enrollment.loan_fund", "Enrollments cannot be opened on a loan fund.");
        if (await db.FundEnrollments.AnyAsync(e => e.MemberId == dto.MemberId && e.FundTypeId == dto.FundTypeId
                && (e.Status == FundEnrollmentStatus.Active || e.Status == FundEnrollmentStatus.Draft), ct))
            return Error.Conflict("enrollment.duplicate", "An active or draft enrollment already exists for this member and fund.");

        var code = await NextCodeAsync(ct);
        var e = new FundEnrollment(Guid.NewGuid(), tenant.TenantId, code, dto.MemberId, dto.FundTypeId,
            dto.SubType, dto.Recurrence, dto.StartDate);
        e.UpdateDetails(dto.SubType, dto.Recurrence, dto.StartDate, dto.EndDate, dto.Notes, dto.FamilyId);
        db.FundEnrollments.Add(e);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(e.Id, ct);
    }

    public async Task<Result<FundEnrollmentDto>> UpdateAsync(Guid id, UpdateFundEnrollmentDto dto, CancellationToken ct = default)
    {
        await updateV.ValidateAndThrowAsync(dto, ct);
        var e = await db.FundEnrollments.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (e is null) return Error.NotFound("enrollment.not_found", "Enrollment not found.");
        e.UpdateDetails(dto.SubType, dto.Recurrence, dto.StartDate, dto.EndDate, dto.Notes, dto.FamilyId);
        db.FundEnrollments.Update(e);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(e.Id, ct);
    }

    public async Task<Result<FundEnrollmentDto>> ApproveAsync(Guid id, CancellationToken ct = default)
    {
        var e = await db.FundEnrollments.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (e is null) return Error.NotFound("enrollment.not_found", "Enrollment not found.");
        e.Approve(currentUser.UserId ?? Guid.Empty, currentUser.UserName ?? "system", clock.UtcNow);
        db.FundEnrollments.Update(e);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(e.Id, ct);
    }

    public async Task<Result<FundEnrollmentDto>> PauseAsync(Guid id, CancellationToken ct = default)
    {
        var e = await db.FundEnrollments.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (e is null) return Error.NotFound("enrollment.not_found", "Enrollment not found.");
        e.Pause();
        db.FundEnrollments.Update(e);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(e.Id, ct);
    }

    public async Task<Result<FundEnrollmentDto>> ResumeAsync(Guid id, CancellationToken ct = default)
    {
        var e = await db.FundEnrollments.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (e is null) return Error.NotFound("enrollment.not_found", "Enrollment not found.");
        e.Resume();
        db.FundEnrollments.Update(e);
        await uow.SaveChangesAsync(ct);
        return await GetAsync(e.Id, ct);
    }

    public async Task<Result> CancelAsync(Guid id, CancellationToken ct = default)
    {
        var e = await db.FundEnrollments.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (e is null) return Result.Failure(Error.NotFound("enrollment.not_found", "Enrollment not found."));
        e.Cancel();
        db.FundEnrollments.Update(e);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    private async Task<string> NextCodeAsync(CancellationToken ct)
    {
        var count = await db.FundEnrollments.CountAsync(ct);
        return $"FE-{(count + 1):D5}";
    }

    /// <summary>Projection helper - called from EF queries (so it must be statically resolvable).</summary>
    private static FundEnrollmentDto Project(JamaatDbContextFacade db, FundEnrollment x) =>
        new(x.Id, x.Code,
            x.MemberId,
            db.Members.Where(m => m.Id == x.MemberId).Select(m => m.ItsNumber.Value).FirstOrDefault() ?? "",
            db.Members.Where(m => m.Id == x.MemberId).Select(m => m.FullName).FirstOrDefault() ?? "",
            x.FundTypeId,
            db.FundTypes.Where(f => f.Id == x.FundTypeId).Select(f => f.Code).FirstOrDefault() ?? "",
            db.FundTypes.Where(f => f.Id == x.FundTypeId).Select(f => f.NameEnglish).FirstOrDefault() ?? "",
            x.FamilyId,
            db.Families.Where(f => f.Id == x.FamilyId).Select(f => f.Code).FirstOrDefault(),
            x.SubType, x.Recurrence,
            x.StartDate, x.EndDate,
            x.Status,
            x.ApprovedByUserName, x.ApprovedAtUtc,
            x.Notes,
            db.Receipts.SelectMany(r => r.Lines).Where(l => l.FundEnrollmentId == x.Id).Sum(l => (decimal?)l.Amount) ?? 0m,
            db.Receipts.Count(r => r.Lines.Any(l => l.FundEnrollmentId == x.Id)),
            x.CreatedAtUtc);
}

public sealed class CreateFundEnrollmentValidator : AbstractValidator<CreateFundEnrollmentDto>
{
    public CreateFundEnrollmentValidator()
    {
        RuleFor(x => x.MemberId).NotEmpty();
        RuleFor(x => x.FundTypeId).NotEmpty();
        RuleFor(x => x.Recurrence).IsInEnum();
    }
}
public sealed class UpdateFundEnrollmentValidator : AbstractValidator<UpdateFundEnrollmentDto>
{
    public UpdateFundEnrollmentValidator() { RuleFor(x => x.Recurrence).IsInEnum(); }
}
