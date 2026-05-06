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
    /// <summary>List receipts that contributed to this patronage. Matches by direct
    /// FundEnrollmentId on a receipt line first; falls back to member+fund match for
    /// older receipts created before the FK was wired up.</summary>
    Task<Result<IReadOnlyList<PatronageReceiptDto>>> ListReceiptsAsync(Guid id, CancellationToken ct = default);
}

/// <summary>Slim receipt projection for the patronage detail page payment-history table.</summary>
public sealed record PatronageReceiptDto(
    Guid ReceiptId,
    string? ReceiptNumber,
    DateOnly ReceiptDate,
    decimal Amount,
    string Currency,
    int Status,
    int PaymentMode,
    string? ChequeNumber);

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
        if (!fund.IsActive)
            return Error.Business("fund_type.inactive",
                $"Fund type {fund.Code} is inactive and cannot accept new enrollments.");
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

    public async Task<Result<IReadOnlyList<PatronageReceiptDto>>> ListReceiptsAsync(Guid id, CancellationToken ct = default)
    {
        var enrollment = await db.FundEnrollments.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (enrollment is null) return Error.NotFound("enrollment.not_found", "Enrollment not found.");

        // Direct FK match - any receipt with a line carrying this FundEnrollmentId.
        // Then UNION with member+fund match for legacy receipts that pre-date the FK,
        // de-duplicated by ReceiptId. We only show Confirmed receipts here - drafts and
        // cancelled rows would clutter the patronage history.
        var directIds = await db.Receipts.AsNoTracking()
            .Where(r => r.Lines.Any(l => l.FundEnrollmentId == id))
            .Select(r => r.Id)
            .ToListAsync(ct);

        var fallbackIds = await db.Receipts.AsNoTracking()
            .Where(r => r.MemberId == enrollment.MemberId
                && r.Status == ReceiptStatus.Confirmed
                && r.Lines.Any(l => l.FundTypeId == enrollment.FundTypeId)
                && !directIds.Contains(r.Id))
            .Select(r => r.Id)
            .ToListAsync(ct);

        var allIds = directIds.Concat(fallbackIds).ToList();
        if (allIds.Count == 0) return new List<PatronageReceiptDto>();

        var rows = await db.Receipts.AsNoTracking()
            .Where(r => allIds.Contains(r.Id))
            .OrderByDescending(r => r.ReceiptDate)
            .Select(r => new PatronageReceiptDto(
                r.Id, r.ReceiptNumber, r.ReceiptDate,
                // Sum only the lines that belong to this enrollment / fund - not the whole receipt total.
                r.Lines.Where(l => l.FundEnrollmentId == id || l.FundTypeId == enrollment.FundTypeId)
                    .Sum(l => l.Amount),
                r.Currency,
                (int)r.Status,
                (int)r.PaymentMode,
                r.ChequeNumber))
            .ToListAsync(ct);
        return rows;
    }

    private async Task<string> NextCodeAsync(CancellationToken ct)
    {
        var count = await db.FundEnrollments.CountAsync(ct);
        return $"FE-{(count + 1):D5}";
    }

    /// <summary>Projection helper - called from EF queries (so it must be statically resolvable).
    /// TotalCollected + ReceiptCount mirror the same direct-FK + legacy member+fund fallback
    /// that <see cref="ListReceiptsAsync"/> uses, so the dashboard / detail "Total collected"
    /// number always agrees with the receipt list shown directly underneath. Without the
    /// fallback, receipts issued before the FundEnrollmentId line link was wired up don't
    /// count even though they show up in the receipt history (the bug we just fixed).</summary>
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
            x.ApprovedByUserId, x.ApprovedByUserName, x.ApprovedAtUtc,
            x.Notes,
            // Sum only Confirmed-receipt lines that are either FK-linked to this enrollment OR
            // (legacy fallback) belong to the same member + same fund-type. Same predicate used
            // by ListReceiptsAsync, kept in sync so the detail page numbers are consistent.
            db.Receipts
                .Where(r => r.Status == ReceiptStatus.Confirmed
                    && (r.Lines.Any(l => l.FundEnrollmentId == x.Id)
                        || (r.MemberId == x.MemberId && r.Lines.Any(l => l.FundTypeId == x.FundTypeId))))
                .SelectMany(r => r.Lines)
                .Where(l => l.FundEnrollmentId == x.Id || l.FundTypeId == x.FundTypeId)
                .Sum(l => (decimal?)l.Amount) ?? 0m,
            db.Receipts.Count(r => r.Status == ReceiptStatus.Confirmed
                && (r.Lines.Any(l => l.FundEnrollmentId == x.Id)
                    || (r.MemberId == x.MemberId && r.Lines.Any(l => l.FundTypeId == x.FundTypeId)))),
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
