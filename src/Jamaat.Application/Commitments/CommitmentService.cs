using FluentValidation;
using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.Commitments;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.Commitments;

public interface ICommitmentService
{
    Task<PagedResult<CommitmentDto>> ListAsync(CommitmentListQuery q, CancellationToken ct = default);
    Task<Result<CommitmentDetailDto>> GetAsync(Guid id, CancellationToken ct = default);
    Task<IReadOnlyList<CommitmentScheduleLineDto>> PreviewScheduleAsync(PreviewScheduleRequest req, CancellationToken ct = default);
    Task<Result<CommitmentDto>> CreateDraftAsync(CreateCommitmentDto dto, CancellationToken ct = default);
    Task<Result<CommitmentDto>> AcceptAgreementAsync(Guid id, AcceptAgreementDto dto, CancellationToken ct = default);
    Task<Result> PauseAsync(Guid id, CancellationToken ct = default);
    Task<Result> ResumeAsync(Guid id, CancellationToken ct = default);
    Task<Result> CancelAsync(Guid id, CancelCommitmentDto dto, CancellationToken ct = default);
    Task<Result> WaiveInstallmentAsync(Guid id, WaiveInstallmentDto dto, CancellationToken ct = default);
    Task<Result> RefreshOverdueAsync(Guid id, CancellationToken ct = default);
}

public sealed class CommitmentService(
    JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant,
    ICurrentUser currentUser, IClock clock,
    IValidator<CreateCommitmentDto> createV) : ICommitmentService
{
    public async Task<PagedResult<CommitmentDto>> ListAsync(CommitmentListQuery q, CancellationToken ct = default)
    {
        IQueryable<Commitment> query = db.Commitments.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(c => EF.Functions.Like(c.Code, $"%{s}%") || EF.Functions.Like(c.PartyNameSnapshot, $"%{s}%"));
        }
        if (q.Status is not null) query = query.Where(c => c.Status == q.Status);
        if (q.PartyType is not null) query = query.Where(c => c.PartyType == q.PartyType);
        if (q.MemberId is not null) query = query.Where(c => c.MemberId == q.MemberId);
        if (q.FamilyId is not null) query = query.Where(c => c.FamilyId == q.FamilyId);
        if (q.FundTypeId is not null) query = query.Where(c => c.FundTypeId == q.FundTypeId);
        if (q.DueFrom is not null) query = query.Where(c => c.Installments.Any(i => i.DueDate >= q.DueFrom));
        if (q.DueTo is not null) query = query.Where(c => c.Installments.Any(i => i.DueDate <= q.DueTo));

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(c => c.CreatedAtUtc)
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 500))
            .Select(c => MapRow(c,
                db.Members.Where(m => m.Id == c.MemberId).Select(m => m.ItsNumber.Value).FirstOrDefault(),
                db.Families.Where(f => f.Id == c.FamilyId).Select(f => f.Code).FirstOrDefault(),
                db.FundTypes.Where(f => f.Id == c.FundTypeId).Select(f => f.Code).FirstOrDefault() ?? c.FundNameSnapshot,
                db.FundTypes.Where(f => f.Id == c.FundTypeId).Select(f => f.NameEnglish).FirstOrDefault() ?? c.FundNameSnapshot))
            .ToListAsync(ct);
        return new PagedResult<CommitmentDto>(items, total, q.Page, q.PageSize);
    }

    public async Task<Result<CommitmentDetailDto>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var c = await db.Commitments.AsNoTracking()
            .Include(x => x.Installments)
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return Error.NotFound("commitment.not_found", "Commitment not found.");

        var memberIts = c.MemberId is null ? null
            : await db.Members.AsNoTracking().Where(m => m.Id == c.MemberId).Select(m => m.ItsNumber.Value).FirstOrDefaultAsync(ct);
        var familyCode = c.FamilyId is null ? null
            : await db.Families.AsNoTracking().Where(f => f.Id == c.FamilyId).Select(f => f.Code).FirstOrDefaultAsync(ct);
        var fund = await db.FundTypes.AsNoTracking().Where(f => f.Id == c.FundTypeId)
            .Select(f => new { f.Code, f.NameEnglish }).FirstOrDefaultAsync(ct);

        var dto = MapRow(c, memberIts, familyCode, fund?.Code ?? c.FundNameSnapshot, fund?.NameEnglish ?? c.FundNameSnapshot);
        var installments = c.Installments.OrderBy(i => i.InstallmentNo)
            .Select(i => new CommitmentInstallmentDto(
                i.Id, i.InstallmentNo, i.DueDate, i.ScheduledAmount, i.PaidAmount, i.RemainingAmount,
                i.LastPaymentDate, i.Status, i.WaiverReason, i.WaivedAtUtc, i.WaivedByUserName))
            .ToList();

        return new CommitmentDetailDto(dto, installments, c.AgreementTemplateId, c.AgreementTemplateVersion, c.AgreementText);
    }

    public Task<IReadOnlyList<CommitmentScheduleLineDto>> PreviewScheduleAsync(PreviewScheduleRequest req, CancellationToken ct = default)
        => Task.FromResult(CommitmentScheduleBuilder.Preview(req.TotalAmount, req.NumberOfInstallments, req.Frequency, req.StartDate));

    public async Task<Result<CommitmentDto>> CreateDraftAsync(CreateCommitmentDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);

        string partyName;
        if (dto.PartyType == CommitmentPartyType.Member)
        {
            var member = await db.Members.AsNoTracking().FirstOrDefaultAsync(m => m.Id == dto.MemberId && !m.IsDeleted, ct);
            if (member is null) return Error.NotFound("member.not_found", "Member not found.");
            partyName = member.FullName;
        }
        else
        {
            var family = await db.Families.AsNoTracking().FirstOrDefaultAsync(f => f.Id == dto.FamilyId, ct);
            if (family is null) return Error.NotFound("family.not_found", "Family not found.");
            partyName = family.FamilyName;
        }

        var fund = await db.FundTypes.AsNoTracking().FirstOrDefaultAsync(f => f.Id == dto.FundTypeId, ct);
        if (fund is null) return Error.NotFound("fund_type.not_found", "Fund type not found.");
        if (fund.Category == Domain.Enums.FundCategory.Loan)
            return Error.Business("commitment.loan_fund", "Pledges cannot be made against loan funds. Use Qarzan Hasana for loans.");

        var currency = string.IsNullOrWhiteSpace(dto.Currency) ? "AED" : dto.Currency.ToUpperInvariant();
        var code = await NextCodeAsync(ct);

        var commitment = new Commitment(
            id: Guid.NewGuid(), tenantId: tenant.TenantId, code: code,
            partyType: dto.PartyType, memberId: dto.MemberId, familyId: dto.FamilyId,
            partyNameSnapshot: partyName, fundTypeId: fund.Id, fundNameSnapshot: fund.NameEnglish,
            currency: currency, totalAmount: dto.TotalAmount,
            frequency: dto.Frequency, numberOfInstallments: dto.NumberOfInstallments,
            startDate: dto.StartDate,
            allowPartialPayments: dto.AllowPartialPayments,
            allowAutoAdvance: dto.AllowAutoAdvance);
        if (!string.IsNullOrWhiteSpace(dto.Notes)) commitment.SetNotes(dto.Notes);

        var installments = dto.CustomSchedule is { Count: > 0 }
            ? CommitmentScheduleBuilder.BuildFromOverrides(dto.CustomSchedule)
            : CommitmentScheduleBuilder.BuildFromSchedule(
                CommitmentScheduleBuilder.Preview(dto.TotalAmount, dto.NumberOfInstallments, dto.Frequency, dto.StartDate));

        var scheduleTotal = installments.Sum(i => i.ScheduledAmount);
        if (scheduleTotal != dto.TotalAmount)
            return Error.Validation("commitment.schedule_mismatch",
                $"Schedule total {scheduleTotal} does not match commitment total {dto.TotalAmount}.");

        commitment.ReplaceSchedule(installments);
        db.Commitments.Add(commitment);
        await uow.SaveChangesAsync(ct);

        var detail = await GetAsync(commitment.Id, ct);
        return detail.IsSuccess ? detail.Value!.Commitment : Error.NotFound("commitment.not_found", "Unexpected.");
    }

    public async Task<Result<CommitmentDto>> AcceptAgreementAsync(Guid id, AcceptAgreementDto dto, CancellationToken ct = default)
    {
        var commitment = await db.Commitments.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (commitment is null) return Error.NotFound("commitment.not_found", "Commitment not found.");
        if (commitment.Status != CommitmentStatus.Draft)
            return Error.Business("commitment.not_draft", "Agreement can only be accepted on a draft commitment.");

        int? version = null;
        if (dto.TemplateId is Guid tplId)
        {
            var tpl = await db.CommitmentAgreementTemplates.AsNoTracking().FirstOrDefaultAsync(t => t.Id == tplId, ct);
            if (tpl is null) return Error.NotFound("agreement_template.not_found", "Template not found.");
            version = tpl.Version;
        }

        if (string.IsNullOrWhiteSpace(dto.RenderedText))
            return Error.Validation("commitment.agreement_empty", "Agreement text is required.");

        commitment.AcceptAgreement(
            templateId: dto.TemplateId,
            templateVersion: version,
            renderedText: dto.RenderedText,
            userId: currentUser.UserId ?? Guid.Empty,
            userName: currentUser.UserName ?? "system",
            at: clock.UtcNow);
        db.Commitments.Update(commitment);
        await uow.SaveChangesAsync(ct);

        var detail = await GetAsync(commitment.Id, ct);
        return detail.IsSuccess ? detail.Value!.Commitment : Error.NotFound("commitment.not_found", "Unexpected.");
    }

    public async Task<Result> PauseAsync(Guid id, CancellationToken ct = default)
    {
        var c = await db.Commitments.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return Result.Failure(Error.NotFound("commitment.not_found", "Commitment not found."));
        c.Pause();
        db.Commitments.Update(c);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<Result> ResumeAsync(Guid id, CancellationToken ct = default)
    {
        var c = await db.Commitments.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return Result.Failure(Error.NotFound("commitment.not_found", "Commitment not found."));
        c.Resume();
        db.Commitments.Update(c);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<Result> CancelAsync(Guid id, CancelCommitmentDto dto, CancellationToken ct = default)
    {
        var c = await db.Commitments.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return Result.Failure(Error.NotFound("commitment.not_found", "Commitment not found."));
        if (string.IsNullOrWhiteSpace(dto.Reason))
            return Result.Failure(Error.Validation("commitment.cancel_reason_required", "Cancellation reason is required."));
        c.Cancel(dto.Reason, clock.UtcNow);
        db.Commitments.Update(c);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<Result> WaiveInstallmentAsync(Guid id, WaiveInstallmentDto dto, CancellationToken ct = default)
    {
        var c = await db.Commitments.Include(x => x.Installments).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return Result.Failure(Error.NotFound("commitment.not_found", "Commitment not found."));
        if (!c.Installments.Any(i => i.Id == dto.InstallmentId))
            return Result.Failure(Error.NotFound("installment.not_found", "Installment not found."));
        if (string.IsNullOrWhiteSpace(dto.Reason))
            return Result.Failure(Error.Validation("installment.waive_reason_required", "Waiver reason is required."));

        c.WaiveInstallment(dto.InstallmentId, dto.Reason,
            currentUser.UserId ?? Guid.Empty, currentUser.UserName ?? "system", clock.UtcNow);
        db.Commitments.Update(c);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<Result> RefreshOverdueAsync(Guid id, CancellationToken ct = default)
    {
        var c = await db.Commitments.Include(x => x.Installments).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return Result.Failure(Error.NotFound("commitment.not_found", "Commitment not found."));
        c.RefreshOverdueStatuses(DateOnly.FromDateTime(clock.UtcNow.UtcDateTime));
        db.Commitments.Update(c);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    private async Task<string> NextCodeAsync(CancellationToken ct)
    {
        var count = await db.Commitments.CountAsync(ct);
        return $"C-{(count + 1):D5}";
    }

    private static CommitmentDto MapRow(Commitment c, string? memberIts, string? familyCode, string fundCode, string fundName) =>
        new(c.Id, c.Code, c.PartyType,
            c.MemberId, memberIts, c.FamilyId, familyCode,
            c.PartyNameSnapshot,
            c.FundTypeId, fundCode, fundName,
            c.Currency, c.TotalAmount, c.PaidAmount, c.RemainingAmount, c.ProgressPercent,
            c.Frequency, c.NumberOfInstallments, c.StartDate, c.EndDate,
            c.AllowPartialPayments, c.AllowAutoAdvance,
            c.Status, c.Notes,
            c.AgreementAcceptedAtUtc.HasValue,
            c.AgreementAcceptedAtUtc, c.AgreementAcceptedByName,
            c.CreatedAtUtc);
}

public sealed class CreateCommitmentValidator : AbstractValidator<CreateCommitmentDto>
{
    public CreateCommitmentValidator()
    {
        RuleFor(x => x.PartyType).IsInEnum();
        RuleFor(x => x.MemberId).NotEmpty().When(x => x.PartyType == CommitmentPartyType.Member)
            .WithMessage("MemberId is required for a member pledge.");
        RuleFor(x => x.FamilyId).NotEmpty().When(x => x.PartyType == CommitmentPartyType.Family)
            .WithMessage("FamilyId is required for a family pledge.");
        RuleFor(x => x.FundTypeId).NotEmpty();
        RuleFor(x => x.Currency).NotEmpty().Length(3);
        RuleFor(x => x.TotalAmount).GreaterThan(0);
        RuleFor(x => x.NumberOfInstallments).GreaterThan(0).LessThanOrEqualTo(600);
        RuleFor(x => x.Frequency).IsInEnum();
    }
}
