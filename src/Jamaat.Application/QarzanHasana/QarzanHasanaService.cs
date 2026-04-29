using FluentValidation;
using Jamaat.Application.Accounting;
using Jamaat.Application.Common;
using Jamaat.Application.Persistence;
using Jamaat.Contracts.QarzanHasana;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.QarzanHasana;

public interface IQarzanHasanaService
{
    Task<PagedResult<QarzanHasanaLoanDto>> ListAsync(QarzanHasanaListQuery q, CancellationToken ct = default);
    Task<Result<QarzanHasanaLoanDetailDto>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<QarzanHasanaLoanDto>> CreateDraftAsync(CreateQarzanHasanaDto dto, CancellationToken ct = default);
    Task<Result<QarzanHasanaLoanDto>> UpdateDraftAsync(Guid id, UpdateQarzanHasanaDraftDto dto, CancellationToken ct = default);
    Task<Result<QarzanHasanaLoanDto>> SubmitAsync(Guid id, CancellationToken ct = default);
    Task<Result<QarzanHasanaLoanDto>> ApproveLevel1Async(Guid id, ApproveL1Dto dto, CancellationToken ct = default);
    Task<Result<QarzanHasanaLoanDto>> ApproveLevel2Async(Guid id, ApproveL2Dto dto, CancellationToken ct = default);
    Task<Result<QarzanHasanaLoanDto>> RejectAsync(Guid id, RejectQhDto dto, CancellationToken ct = default);
    Task<Result<QarzanHasanaLoanDto>> CancelAsync(Guid id, CancelQhDto dto, CancellationToken ct = default);
    Task<Result<QarzanHasanaLoanDto>> DisburseAsync(Guid id, DisburseQhDto dto, CancellationToken ct = default);
    Task<Result> WaiveInstallmentAsync(Guid id, WaiveQhInstallmentDto dto, CancellationToken ct = default);
}

public sealed class QarzanHasanaService(
    JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant,
    ICurrentUser currentUser, IClock clock,
    IPostingService posting, IFxConverter fx, INumberingService numbering,
    IValidator<CreateQarzanHasanaDto> createV,
    IValidator<UpdateQarzanHasanaDraftDto> updateV,
    IValidator<ApproveL1Dto> approveL1V) : IQarzanHasanaService
{
    public async Task<PagedResult<QarzanHasanaLoanDto>> ListAsync(QarzanHasanaListQuery q, CancellationToken ct = default)
    {
        IQueryable<QarzanHasanaLoan> query = db.QarzanHasanaLoans.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(x => EF.Functions.Like(x.Code, $"%{s}%"));
        }
        if (q.Status is not null) query = query.Where(x => x.Status == q.Status);
        if (q.Scheme is not null) query = query.Where(x => x.Scheme == q.Scheme);
        if (q.MemberId is not null) query = query.Where(x => x.MemberId == q.MemberId);
        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(x => x.CreatedAtUtc)
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 500))
            .Select(x => ProjectRow(db, x))
            .ToListAsync(ct);
        return new PagedResult<QarzanHasanaLoanDto>(items, total, q.Page, q.PageSize);
    }

    public async Task<Result<QarzanHasanaLoanDetailDto>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var loan = await db.QarzanHasanaLoans.AsNoTracking()
            .Include(x => x.Installments)
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        if (loan is null) return Error.NotFound("qh.not_found", "Loan not found.");

        var memberInfo = await db.Members.AsNoTracking().Where(m => m.Id == loan.MemberId)
            .Select(m => new { m.ItsNumber, m.FullName }).FirstAsync(ct);
        var g1 = await db.Members.AsNoTracking().Where(m => m.Id == loan.Guarantor1MemberId).Select(m => m.FullName).FirstOrDefaultAsync(ct) ?? "";
        var g2 = await db.Members.AsNoTracking().Where(m => m.Id == loan.Guarantor2MemberId).Select(m => m.FullName).FirstOrDefaultAsync(ct) ?? "";
        string? familyCode = loan.FamilyId is null ? null
            : await db.Families.AsNoTracking().Where(f => f.Id == loan.FamilyId).Select(f => f.Code).FirstOrDefaultAsync(ct);

        var dto = Map(loan, memberInfo.ItsNumber.Value, memberInfo.FullName, familyCode, g1, g2);
        var installments = loan.Installments.OrderBy(i => i.InstallmentNo)
            .Select(i => new QarzanHasanaInstallmentDto(i.Id, i.InstallmentNo, i.DueDate,
                i.ScheduledAmount, i.PaidAmount, i.RemainingAmount, i.LastPaymentDate, i.Status,
                i.WaiverReason, i.WaivedAtUtc, i.WaivedByUserName))
            .ToList();
        return new QarzanHasanaLoanDetailDto(dto, installments);
    }

    public async Task<Result<QarzanHasanaLoanDto>> CreateDraftAsync(CreateQarzanHasanaDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);
        if (!await db.Members.AnyAsync(m => m.Id == dto.MemberId && !m.IsDeleted, ct))
            return Error.NotFound("member.not_found", "Borrower not found.");
        if (!await db.Members.AnyAsync(m => m.Id == dto.Guarantor1MemberId && !m.IsDeleted, ct))
            return Error.NotFound("guarantor.not_found", "Guarantor 1 not found.");
        if (!await db.Members.AnyAsync(m => m.Id == dto.Guarantor2MemberId && !m.IsDeleted, ct))
            return Error.NotFound("guarantor.not_found", "Guarantor 2 not found.");
        if (dto.Guarantor1MemberId == dto.MemberId || dto.Guarantor2MemberId == dto.MemberId)
            return Error.Business("qh.self_guarantee", "A borrower cannot guarantee their own loan.");

        // Guarantors cannot themselves be in default on an active QH loan (Q#4 policy).
        var guarantorIds = new[] { dto.Guarantor1MemberId, dto.Guarantor2MemberId };
        var defaultedGuarantor = await db.QarzanHasanaLoans.AsNoTracking()
            .Where(l => l.Status == QarzanHasanaStatus.Defaulted && guarantorIds.Contains(l.MemberId))
            .Select(l => l.MemberId).FirstOrDefaultAsync(ct);
        if (defaultedGuarantor != Guid.Empty)
            return Error.Business("qh.guarantor_defaulted",
                "One of the proposed guarantors is currently in default on another Qarzan Hasana loan and cannot vouch.");

        var code = await NextCodeAsync(ct);
        var loan = new QarzanHasanaLoan(Guid.NewGuid(), tenant.TenantId, code, dto.MemberId,
            dto.Scheme, dto.AmountRequested, dto.InstalmentsRequested, dto.Currency,
            dto.StartDate, dto.Guarantor1MemberId, dto.Guarantor2MemberId);
        loan.UpdateDraft(dto.AmountRequested, dto.InstalmentsRequested, dto.CashflowDocumentUrl, dto.GoldSlipDocumentUrl,
            dto.GoldAmount, dto.StartDate, dto.Guarantor1MemberId, dto.Guarantor2MemberId, dto.FamilyId);
        db.QarzanHasanaLoans.Add(loan);
        await uow.SaveChangesAsync(ct);
        return await LoadAsync(loan.Id, ct);
    }

    public async Task<Result<QarzanHasanaLoanDto>> UpdateDraftAsync(Guid id, UpdateQarzanHasanaDraftDto dto, CancellationToken ct = default)
    {
        await updateV.ValidateAndThrowAsync(dto, ct);
        var loan = await db.QarzanHasanaLoans.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (loan is null) return Error.NotFound("qh.not_found", "Loan not found.");
        loan.UpdateDraft(dto.AmountRequested, dto.InstalmentsRequested, dto.CashflowDocumentUrl, dto.GoldSlipDocumentUrl,
            dto.GoldAmount, dto.StartDate, dto.Guarantor1MemberId, dto.Guarantor2MemberId, dto.FamilyId);
        db.QarzanHasanaLoans.Update(loan);
        await uow.SaveChangesAsync(ct);
        return await LoadAsync(id, ct);
    }

    public async Task<Result<QarzanHasanaLoanDto>> SubmitAsync(Guid id, CancellationToken ct = default)
    {
        var loan = await db.QarzanHasanaLoans.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (loan is null) return Error.NotFound("qh.not_found", "Loan not found.");
        loan.Submit();
        db.QarzanHasanaLoans.Update(loan);
        await uow.SaveChangesAsync(ct);
        return await LoadAsync(id, ct);
    }

    public async Task<Result<QarzanHasanaLoanDto>> ApproveLevel1Async(Guid id, ApproveL1Dto dto, CancellationToken ct = default)
    {
        await approveL1V.ValidateAndThrowAsync(dto, ct);
        var loan = await db.QarzanHasanaLoans.Include(x => x.Installments).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (loan is null) return Error.NotFound("qh.not_found", "Loan not found.");
        loan.ApproveLevel1(currentUser.UserId ?? Guid.Empty, currentUser.UserName ?? "system", clock.UtcNow,
            dto.AmountApproved, dto.InstalmentsApproved, dto.Comments);
        db.QarzanHasanaLoans.Update(loan);
        await uow.SaveChangesAsync(ct);
        return await LoadAsync(id, ct);
    }

    public async Task<Result<QarzanHasanaLoanDto>> ApproveLevel2Async(Guid id, ApproveL2Dto dto, CancellationToken ct = default)
    {
        var loan = await db.QarzanHasanaLoans.Include(x => x.Installments).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (loan is null) return Error.NotFound("qh.not_found", "Loan not found.");
        loan.ApproveLevel2(currentUser.UserId ?? Guid.Empty, currentUser.UserName ?? "system", clock.UtcNow, dto.Comments);
        // Auto-build uniform installment schedule upon final approval.
        BuildSchedule(loan);
        // EF Core's OwnsMany change tracker sometimes marks new owned-collection items on a tracked parent as Modified
        // instead of Added; explicitly mark each fresh installment as Added so INSERTs (not UPDATEs) are issued.
        foreach (var inst in loan.Installments) db.MarkAdded(inst);
        await uow.SaveChangesAsync(ct);
        return await LoadAsync(id, ct);
    }

    public async Task<Result<QarzanHasanaLoanDto>> RejectAsync(Guid id, RejectQhDto dto, CancellationToken ct = default)
    {
        var loan = await db.QarzanHasanaLoans.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (loan is null) return Error.NotFound("qh.not_found", "Loan not found.");
        if (string.IsNullOrWhiteSpace(dto.Reason)) return Error.Validation("qh.reject_reason_required", "Reason required.");
        loan.Reject(dto.Reason, clock.UtcNow);
        db.QarzanHasanaLoans.Update(loan);
        await uow.SaveChangesAsync(ct);
        return await LoadAsync(id, ct);
    }

    public async Task<Result<QarzanHasanaLoanDto>> CancelAsync(Guid id, CancelQhDto dto, CancellationToken ct = default)
    {
        var loan = await db.QarzanHasanaLoans.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (loan is null) return Error.NotFound("qh.not_found", "Loan not found.");
        if (string.IsNullOrWhiteSpace(dto.Reason)) return Error.Validation("qh.cancel_reason_required", "Reason required.");
        loan.Cancel(dto.Reason);
        db.QarzanHasanaLoans.Update(loan);
        await uow.SaveChangesAsync(ct);
        return await LoadAsync(id, ct);
    }

    public async Task<Result<QarzanHasanaLoanDto>> DisburseAsync(Guid id, DisburseQhDto dto, CancellationToken ct = default)
    {
        var loan = await db.QarzanHasanaLoans.Include(x => x.Installments).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (loan is null) return Error.NotFound("qh.not_found", "Loan not found.");

        // Two flows:
        //   (a) BankAccountId provided -> create the disbursement voucher inline AND post the GL
        //       (Dr QH Receivable / Cr Bank). This is the correct flow that makes outstanding
        //       loans visible on the balance sheet.
        //   (b) Pre-existing VoucherId provided -> legacy "link only", no GL changes here. The
        //       voucher was created via the regular Voucher flow and posted as an expense; the
        //       admin should clean up the GL manually if they care about the asset reflection.
        Guid? voucherId = dto.VoucherId;
        if (dto.BankAccountId is Guid bankId)
        {
            var member = await db.Members.AsNoTracking().FirstOrDefaultAsync(m => m.Id == loan.MemberId, ct);
            if (member is null) return Error.NotFound("member.not_found", "Borrower record not found.");

            var period = await db.FinancialPeriods.FirstOrDefaultAsync(
                p => p.Status == PeriodStatus.Open && p.StartDate <= dto.DisbursedOn && p.EndDate >= dto.DisbursedOn, ct);
            if (period is null) return Error.Business("period.not_open", "No open financial period covers the disbursement date.");

            var disbursementAmount = loan.AmountApproved > 0 ? loan.AmountApproved : loan.AmountRequested;

            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var voucher = Voucher.CreateQhLoanDisbursement(
                id: Guid.NewGuid(),
                tenantId: tenant.TenantId,
                sourceQarzanHasanaLoanId: loan.Id,
                voucherDate: dto.DisbursedOn,
                payTo: member.FullName,
                currency: loan.Currency,
                amount: disbursementAmount);
            voucher.SetHeader(member.FullName, member.ItsNumber.Value, $"QH loan disbursement - {loan.Code}");
            voucher.SetPayment(dto.PaymentMode ?? PaymentMode.Cash, bankId, dto.ChequeNumber, dto.ChequeDate, drawnOnBank: null, paymentDate: dto.DisbursedOn);
            if (!string.IsNullOrWhiteSpace(dto.Remarks)) voucher.SetRemarks(dto.Remarks);

            var conversion = await fx.ConvertToBaseAsync(disbursementAmount, loan.Currency, dto.DisbursedOn, ct);
            voucher.ApplyFxConversion(conversion.BaseCurrency, conversion.Rate, conversion.BaseAmount);
            voucher.Submit(requiresApproval: false);

            var (seriesId, voucherNumber) = await numbering.NextAsync(NumberingScope.Voucher, null, dto.DisbursedOn.Year, ct);
            voucher.MarkPaid(voucherNumber, period.Id, seriesId, currentUser.UserId ?? Guid.Empty, currentUser.UserName ?? "system", clock.UtcNow);
            db.Vouchers.Add(voucher);

            await posting.PostQhLoanDisbursementAsync(voucher, loan, ct);

            voucherId = voucher.Id;
            loan.MarkDisbursed(voucherId, dto.DisbursedOn);
            db.QarzanHasanaLoans.Update(loan);
            await uow.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        else
        {
            loan.MarkDisbursed(voucherId, dto.DisbursedOn);
            db.QarzanHasanaLoans.Update(loan);
            await uow.SaveChangesAsync(ct);
        }
        return await LoadAsync(id, ct);
    }

    public async Task<Result> WaiveInstallmentAsync(Guid id, WaiveQhInstallmentDto dto, CancellationToken ct = default)
    {
        var loan = await db.QarzanHasanaLoans.Include(x => x.Installments).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (loan is null) return Result.Failure(Error.NotFound("qh.not_found", "Loan not found."));
        if (loan.Installments.All(i => i.Id != dto.InstallmentId))
            return Result.Failure(Error.NotFound("installment.not_found", "Installment not found."));
        if (string.IsNullOrWhiteSpace(dto.Reason))
            return Result.Failure(Error.Validation("installment.waive_reason_required", "Reason required."));
        loan.WaiveInstallment(dto.InstallmentId, dto.Reason, currentUser.UserId ?? Guid.Empty, currentUser.UserName ?? "system", clock.UtcNow);
        db.QarzanHasanaLoans.Update(loan);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    // --- helpers ---

    private static void BuildSchedule(QarzanHasanaLoan loan)
    {
        if (loan.Installments.Count > 0) return;
        if (loan.InstalmentsApproved <= 0 || loan.AmountApproved <= 0) return;
        var baseAmt = Math.Round(loan.AmountApproved / loan.InstalmentsApproved, 2, MidpointRounding.AwayFromZero);
        var running = 0m;
        var list = new List<QarzanHasanaInstallment>();
        for (int i = 0; i < loan.InstalmentsApproved; i++)
        {
            var due = loan.StartDate.AddMonths(i);
            var amt = i == loan.InstalmentsApproved - 1 ? loan.AmountApproved - running : baseAmt;
            running += amt;
            list.Add(new QarzanHasanaInstallment(Guid.NewGuid(), i + 1, due, amt));
        }
        loan.SetSchedule(list);
    }

    private async Task<string> NextCodeAsync(CancellationToken ct)
    {
        var year = clock.UtcNow.Year;
        var count = await db.QarzanHasanaLoans.CountAsync(x => x.Code.StartsWith($"QH-{year}-"), ct);
        return $"QH-{year}-{(count + 1):D5}";
    }

    private async Task<Result<QarzanHasanaLoanDto>> LoadAsync(Guid id, CancellationToken ct)
    {
        var loan = await db.QarzanHasanaLoans.AsNoTracking().Include(x => x.Installments).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (loan is null) return Error.NotFound("qh.not_found", "Loan not found.");
        var memberInfo = await db.Members.AsNoTracking().Where(m => m.Id == loan.MemberId)
            .Select(m => new { m.ItsNumber, m.FullName }).FirstAsync(ct);
        var g1 = await db.Members.AsNoTracking().Where(m => m.Id == loan.Guarantor1MemberId).Select(m => m.FullName).FirstOrDefaultAsync(ct) ?? "";
        var g2 = await db.Members.AsNoTracking().Where(m => m.Id == loan.Guarantor2MemberId).Select(m => m.FullName).FirstOrDefaultAsync(ct) ?? "";
        string? familyCode = loan.FamilyId is null ? null
            : await db.Families.AsNoTracking().Where(f => f.Id == loan.FamilyId).Select(f => f.Code).FirstOrDefaultAsync(ct);
        return Map(loan, memberInfo.ItsNumber.Value, memberInfo.FullName, familyCode, g1, g2);
    }

    private static QarzanHasanaLoanDto Map(QarzanHasanaLoan loan, string its, string name, string? familyCode, string g1Name, string g2Name) =>
        new(loan.Id, loan.Code,
            loan.MemberId, its, name,
            loan.FamilyId, familyCode,
            loan.Scheme,
            loan.AmountRequested, loan.AmountApproved, loan.AmountDisbursed, loan.AmountRepaid, loan.AmountOutstanding,
            loan.InstalmentsRequested, loan.InstalmentsApproved,
            loan.GoldAmount, loan.Currency,
            loan.StartDate, loan.EndDate,
            loan.Status,
            loan.Guarantor1MemberId, g1Name,
            loan.Guarantor2MemberId, g2Name,
            loan.CashflowDocumentUrl, loan.GoldSlipDocumentUrl,
            loan.Level1ApproverName, loan.Level1ApprovedAtUtc, loan.Level1Comments,
            loan.Level2ApproverName, loan.Level2ApprovedAtUtc, loan.Level2Comments,
            loan.DisbursedOn,
            loan.RejectionReason, loan.CancellationReason,
            loan.ProgressPercent,
            loan.CreatedAtUtc);

    private static QarzanHasanaLoanDto ProjectRow(JamaatDbContextFacade db, QarzanHasanaLoan x) =>
        new(x.Id, x.Code,
            x.MemberId,
            db.Members.Where(m => m.Id == x.MemberId).Select(m => m.ItsNumber.Value).FirstOrDefault() ?? "",
            db.Members.Where(m => m.Id == x.MemberId).Select(m => m.FullName).FirstOrDefault() ?? "",
            x.FamilyId,
            db.Families.Where(f => f.Id == x.FamilyId).Select(f => f.Code).FirstOrDefault(),
            x.Scheme,
            x.AmountRequested, x.AmountApproved, x.AmountDisbursed, x.AmountRepaid, x.AmountOutstanding,
            x.InstalmentsRequested, x.InstalmentsApproved,
            x.GoldAmount, x.Currency,
            x.StartDate, x.EndDate,
            x.Status,
            x.Guarantor1MemberId,
            db.Members.Where(m => m.Id == x.Guarantor1MemberId).Select(m => m.FullName).FirstOrDefault() ?? "",
            x.Guarantor2MemberId,
            db.Members.Where(m => m.Id == x.Guarantor2MemberId).Select(m => m.FullName).FirstOrDefault() ?? "",
            x.CashflowDocumentUrl, x.GoldSlipDocumentUrl,
            x.Level1ApproverName, x.Level1ApprovedAtUtc, x.Level1Comments,
            x.Level2ApproverName, x.Level2ApprovedAtUtc, x.Level2Comments,
            x.DisbursedOn,
            x.RejectionReason, x.CancellationReason,
            x.ProgressPercent,
            x.CreatedAtUtc);
}

public sealed class CreateQarzanHasanaValidator : AbstractValidator<CreateQarzanHasanaDto>
{
    public CreateQarzanHasanaValidator()
    {
        RuleFor(x => x.MemberId).NotEmpty();
        RuleFor(x => x.Guarantor1MemberId).NotEmpty();
        RuleFor(x => x.Guarantor2MemberId).NotEmpty()
            .NotEqual(x => x.Guarantor1MemberId).WithMessage("Guarantors must be different members.");
        RuleFor(x => x.AmountRequested).GreaterThan(0);
        RuleFor(x => x.InstalmentsRequested).GreaterThan(0).LessThanOrEqualTo(240);
        RuleFor(x => x.Currency).NotEmpty().Length(3);
    }
}

public sealed class UpdateQarzanHasanaDraftValidator : AbstractValidator<UpdateQarzanHasanaDraftDto>
{
    public UpdateQarzanHasanaDraftValidator()
    {
        RuleFor(x => x.AmountRequested).GreaterThan(0);
        RuleFor(x => x.InstalmentsRequested).GreaterThan(0).LessThanOrEqualTo(240);
        RuleFor(x => x.Guarantor2MemberId).NotEqual(x => x.Guarantor1MemberId);
    }
}

public sealed class ApproveL1Validator : AbstractValidator<ApproveL1Dto>
{
    public ApproveL1Validator()
    {
        RuleFor(x => x.AmountApproved).GreaterThan(0);
        RuleFor(x => x.InstalmentsApproved).GreaterThan(0).LessThanOrEqualTo(240);
    }
}
