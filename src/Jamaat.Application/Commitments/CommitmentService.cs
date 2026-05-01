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
    Task<Result<IReadOnlyList<CommitmentPaymentRowDto>>> ListPaymentsAsync(Guid id, CancellationToken ct = default);
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
    ICurrentUser currentUser, IClock clock, IRequestContext request,
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

        // Look up the most-recent confirmed receipt that contributed a payment to each
        // installment, so the UI can render "Last payment" as a clickable link to that receipt.
        // One DB roundtrip rather than N: GroupBy + Max(receiptDate) per installment id, then
        // join back to the receipt to get the number. Skip cancelled/reversed receipts because
        // their allocations have been rolled back - showing them would be misleading.
        var instIds = c.Installments.Select(i => i.Id).ToList();
        var lastReceiptPerInst = instIds.Count == 0
            ? new Dictionary<Guid, (Guid Id, string Number)>()
            : (await db.Receipts.AsNoTracking()
                .Where(r => r.Status == Domain.Enums.ReceiptStatus.Confirmed)
                .SelectMany(r => r.Lines, (r, l) => new { r.Id, r.ReceiptNumber, r.ReceiptDate, l.CommitmentInstallmentId })
                .Where(x => x.CommitmentInstallmentId.HasValue && instIds.Contains(x.CommitmentInstallmentId.Value))
                .ToListAsync(ct))
              .GroupBy(x => x.CommitmentInstallmentId!.Value)
              .ToDictionary(
                  g => g.Key,
                  g => g.OrderByDescending(x => x.ReceiptDate).Select(x => (Id: x.Id, Number: x.ReceiptNumber ?? "-")).First());

        var installments = c.Installments.OrderBy(i => i.InstallmentNo)
            .Select(i =>
            {
                var lastReceipt = lastReceiptPerInst.TryGetValue(i.Id, out var rec) ? ((Guid?)rec.Id, (string?)rec.Number) : (null, null);
                return new CommitmentInstallmentDto(
                    i.Id, i.InstallmentNo, i.DueDate, i.ScheduledAmount, i.PaidAmount, i.RemainingAmount,
                    i.LastPaymentDate, i.Status, i.WaiverReason, i.WaivedAtUtc, i.WaivedByUserName,
                    lastReceipt.Item1, lastReceipt.Item2);
            })
            .ToList();

        var proof = c.AgreementAcceptedAtUtc is null ? null
            : new AgreementAcceptanceProofDto(
                c.AgreementAcceptedAtUtc.Value,
                c.AgreementAcceptedByUserId,
                c.AgreementAcceptedByName,
                c.AgreementAcceptedIpAddress,
                c.AgreementAcceptedUserAgent,
                c.AgreementAcceptanceMethod);

        return new CommitmentDetailDto(dto, installments, c.AgreementTemplateId, c.AgreementTemplateVersion, c.AgreementText, proof);
    }

    public Task<IReadOnlyList<CommitmentScheduleLineDto>> PreviewScheduleAsync(PreviewScheduleRequest req, CancellationToken ct = default)
        => Task.FromResult(CommitmentScheduleBuilder.Preview(req.TotalAmount, req.NumberOfInstallments, req.Frequency, req.StartDate));

    /// Walk every receipt that has at least one line tied to this commitment and return one row
    /// per matching line. We deliberately keep cancelled/reversed receipts in the list so the
    /// cashier can see why a balance moved (status tag tells the story). Sorted newest-first.
    public async Task<Result<IReadOnlyList<CommitmentPaymentRowDto>>> ListPaymentsAsync(Guid id, CancellationToken ct = default)
    {
        var commitment = await db.Commitments.AsNoTracking()
            .Include(c => c.Installments)
            .FirstOrDefaultAsync(c => c.Id == id, ct);
        if (commitment is null)
            return Error.NotFound("commitment.not_found", "Commitment not found.");

        var instNoById = commitment.Installments.ToDictionary(i => i.Id, i => i.InstallmentNo);

        var rows = await db.Receipts.AsNoTracking()
            .Where(r => r.Lines.Any(l => l.CommitmentId == id))
            .Select(r => new
            {
                Receipt = r,
                Lines = r.Lines.Where(l => l.CommitmentId == id).Select(l => new
                {
                    l.CommitmentInstallmentId,
                    l.Amount,
                }).ToList(),
            })
            .ToListAsync(ct);

        var bankIds = rows.Select(x => x.Receipt.BankAccountId).Where(x => x.HasValue).Select(x => x!.Value).Distinct().ToList();
        var banks = bankIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.BankAccounts.AsNoTracking()
                .Where(b => bankIds.Contains(b.Id))
                .ToDictionaryAsync(b => b.Id, b => b.Name, ct);

        var result = new List<CommitmentPaymentRowDto>();
        foreach (var x in rows)
        {
            foreach (var line in x.Lines)
            {
                int? instNo = line.CommitmentInstallmentId.HasValue
                    && instNoById.TryGetValue(line.CommitmentInstallmentId.Value, out var n)
                    ? n : null;
                string? bankName = x.Receipt.BankAccountId.HasValue
                    && banks.TryGetValue(x.Receipt.BankAccountId.Value, out var bn)
                    ? bn : null;
                result.Add(new CommitmentPaymentRowDto(
                    x.Receipt.Id, x.Receipt.ReceiptNumber, x.Receipt.ReceiptDate,
                    x.Receipt.Status,
                    line.CommitmentInstallmentId, instNo,
                    line.Amount, x.Receipt.Currency,
                    x.Receipt.PaymentMode, x.Receipt.ChequeNumber, x.Receipt.ChequeDate,
                    x.Receipt.BankAccountId, bankName,
                    x.Receipt.PaymentReference, x.Receipt.Remarks,
                    x.Receipt.ConfirmedAtUtc, x.Receipt.ConfirmedByUserName));
            }
        }
        var ordered = (IReadOnlyList<CommitmentPaymentRowDto>)result
            .OrderByDescending(r => r.ReceiptDate)
            .ThenByDescending(r => r.ConfirmedAtUtc ?? DateTimeOffset.MinValue)
            .ToList();
        return Result.Success(ordered);
    }

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
        if (!fund.IsActive)
            return Error.Business("fund_type.inactive",
                $"Fund type {fund.Code} is inactive and cannot accept new commitments. Reactivate it from master data first.");
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
        if (dto.Intention != Domain.Enums.ContributionIntention.Permanent)
            commitment.SetIntention(dto.Intention);

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
            at: clock.UtcNow,
            ipAddress: request.IpAddress,
            userAgent: request.UserAgent,
            method: dto.AcceptedByAdmin ? AgreementAcceptanceMethod.Admin : AgreementAcceptanceMethod.Self);
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
        var c = await db.Commitments.Include(x => x.Installments).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return Result.Failure(Error.NotFound("commitment.not_found", "Commitment not found."));
        if (string.IsNullOrWhiteSpace(dto.Reason))
            return Result.Failure(Error.Validation("commitment.cancel_reason_required", "Cancellation reason is required."));

        // Pre-cancel checks: every instalment must be settled (Paid or Waived) AND no PDC may
        // still be in flight (Pledged or Deposited). This forces the admin to either collect,
        // waive, or return cheques first - so cancellation can't strand outstanding obligations
        // or cheques sitting in someone's drawer.
        var openInstalments = c.Installments
            .Where(i => i.Status != InstallmentStatus.Paid && i.Status != InstallmentStatus.Waived)
            .Select(i => i.InstallmentNo)
            .OrderBy(n => n)
            .ToList();
        if (openInstalments.Count > 0)
            return Result.Failure(Error.Business("commitment.cancel_blocked_unsettled_instalments",
                $"Cannot cancel: instalment(s) {string.Join(", ", openInstalments.Select(n => $"#{n}"))} are not yet Paid or Waived. Collect or waive them first."));

        var openCheques = await db.PostDatedCheques.AsNoTracking()
            .Where(p => p.CommitmentId == id
                && (p.Status == PostDatedChequeStatus.Pledged || p.Status == PostDatedChequeStatus.Deposited))
            .Select(p => new { p.ChequeNumber, p.Status })
            .ToListAsync(ct);
        if (openCheques.Count > 0)
            return Result.Failure(Error.Business("commitment.cancel_blocked_open_cheques",
                $"Cannot cancel: cheque(s) [{string.Join(", ", openCheques.Select(p => p.ChequeNumber))}] are still {string.Join("/", openCheques.Select(p => p.Status.ToString()).Distinct())}. Clear, bounce, or cancel each cheque (returning it to the contributor) first."));

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
            c.CreatedAtUtc,
            c.Intention);
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
