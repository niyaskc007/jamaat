using FluentValidation;
using Jamaat.Application.Accounting;
using Jamaat.Application.Common;
using Jamaat.Contracts.Vouchers;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Jamaat.Application.Vouchers;

public sealed class VoucherService(
    IVoucherRepository repo,
    IUnitOfWork uow,
    ITenantContext tenant,
    ICurrentUser currentUser,
    IClock clock,
    INumberingService numbering,
    IPostingService posting,
    IFxConverter fx,
    IServiceProvider services,
    IValidator<CreateVoucherDto> createV) : IVoucherService
{
    public Task<PagedResult<VoucherListItemDto>> ListAsync(VoucherListQuery q, CancellationToken ct = default) => repo.ListAsync(q, ct);

    public async Task<Result<VoucherDto>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var e = await repo.GetWithLinesAsync(id, ct);
        if (e is null) return Error.NotFound("voucher.not_found", "Voucher not found.");
        return await MapAsync(e, ct);
    }

    public async Task<Result<VoucherDto>> CreateAsync(CreateVoucherDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);

        var db = services.GetRequiredService<Application.Persistence.JamaatDbContextFacade>();

        var expenseTypes = await db.ExpenseTypes.AsNoTracking()
            .Where(x => dto.Lines.Select(l => l.ExpenseTypeId).Contains(x.Id))
            .ToListAsync(ct);
        if (expenseTypes.Count != dto.Lines.Select(l => l.ExpenseTypeId).Distinct().Count())
            return Error.Validation("voucher.expense_invalid", "One or more expense types are invalid.");

        var requiresApproval = expenseTypes.Any(et => et.RequiresApproval)
            || expenseTypes.Any(et => et.ApprovalThreshold.HasValue
                 && dto.Lines.Where(l => l.ExpenseTypeId == et.Id).Sum(l => l.Amount) >= et.ApprovalThreshold.Value);

        var baseCurrency = await fx.GetBaseCurrencyAsync(ct);
        var txnCurrency = (dto.Currency ?? baseCurrency).ToUpperInvariant();

        var v = new Voucher(Guid.NewGuid(), tenant.TenantId, dto.VoucherDate, dto.PayTo, txnCurrency);
        v.SetHeader(dto.PayTo, dto.PayeeItsNumber, dto.Purpose ?? string.Empty);
        v.SetPayment(dto.PaymentMode, dto.BankAccountId, dto.ChequeNumber, dto.ChequeDate, dto.DrawnOnBank, dto.PaymentDate);
        v.SetRemarks(dto.Remarks);
        v.ReplaceLines(dto.Lines.Select((l, i) => new VoucherLine(Guid.NewGuid(), i + 1, l.ExpenseTypeId, l.Amount, l.Narration)));

        var conversion = await fx.ConvertToBaseAsync(v.AmountTotal, txnCurrency, dto.VoucherDate, ct);
        v.ApplyFxConversion(conversion.BaseCurrency, conversion.Rate, conversion.BaseAmount);

        v.Submit(requiresApproval);

        await repo.AddAsync(v, ct);
        await uow.SaveChangesAsync(ct);

        // If no approval required, immediately pay (assign number + post)
        if (!requiresApproval)
        {
            await ApproveAndPayInternalAsync(v, expenseTypes, ct);
        }

        var fresh = await repo.GetWithLinesAsync(v.Id, ct);
        return await MapAsync(fresh!, ct);
    }

    public async Task<Result<VoucherDto>> ApproveAndPayAsync(Guid id, CancellationToken ct = default)
    {
        var v = await repo.GetWithLinesAsync(id, ct);
        if (v is null) return Error.NotFound("voucher.not_found", "Voucher not found.");
        if (v.Status != VoucherStatus.PendingApproval && v.Status != VoucherStatus.Draft)
            return Error.Business("voucher.not_pending", "Only draft or pending-approval vouchers can be approved.");

        var db = services.GetRequiredService<Application.Persistence.JamaatDbContextFacade>();
        var expenseTypes = await db.ExpenseTypes.AsNoTracking()
            .Where(x => v.Lines.Select(l => l.ExpenseTypeId).Contains(x.Id)).ToListAsync(ct);

        v.Approve(currentUser.UserId ?? Guid.Empty, currentUser.UserName ?? "system", clock.UtcNow);
        await ApproveAndPayInternalAsync(v, expenseTypes, ct);
        return await MapAsync(v, ct);
    }

    private async Task ApproveAndPayInternalAsync(Voucher v, IReadOnlyList<ExpenseType> expenseTypes, CancellationToken ct)
    {
        var db = services.GetRequiredService<Application.Persistence.JamaatDbContextFacade>();
        var period = await db.FinancialPeriods.FirstOrDefaultAsync(
            p => p.Status == PeriodStatus.Open && p.StartDate <= v.VoucherDate && p.EndDate >= v.VoucherDate, ct)
            ?? throw new InvalidOperationException("No open financial period covers this voucher's date.");

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var (seriesId, number) = await numbering.NextAsync(NumberingScope.Voucher, null, v.VoucherDate.Year, ct);
        v.MarkPaid(number, period.Id, seriesId, currentUser.UserId ?? Guid.Empty, currentUser.UserName ?? "system", clock.UtcNow);
        repo.Update(v);
        await posting.PostVoucherAsync(v, expenseTypes, ct);
        await uow.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task<Result<VoucherDto>> CancelAsync(Guid id, CancelVoucherDto dto, CancellationToken ct = default)
    {
        var e = await repo.GetByIdAsync(id, ct);
        if (e is null) return Error.NotFound("voucher.not_found", "Voucher not found.");
        if (e.Status == VoucherStatus.Paid) return Error.Business("voucher.paid", "Paid vouchers must be reversed, not cancelled.");
        if (string.IsNullOrWhiteSpace(dto.Reason)) return Error.Validation("reason_required", "A reason is required.");
        e.Cancel(dto.Reason, currentUser.UserId ?? Guid.Empty, clock.UtcNow);
        repo.Update(e);
        await uow.SaveChangesAsync(ct);
        var fresh = await repo.GetWithLinesAsync(e.Id, ct);
        return await MapAsync(fresh!, ct);
    }

    public async Task<Result<VoucherDto>> ReverseAsync(Guid id, ReverseVoucherDto dto, CancellationToken ct = default)
    {
        var e = await repo.GetByIdAsync(id, ct);
        if (e is null) return Error.NotFound("voucher.not_found", "Voucher not found.");
        if (e.Status != VoucherStatus.Paid) return Error.Business("voucher.not_paid", "Only paid vouchers can be reversed.");
        if (string.IsNullOrWhiteSpace(dto.Reason)) return Error.Validation("reason_required", "A reason is required.");

        var db = services.GetRequiredService<Application.Persistence.JamaatDbContextFacade>();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await posting.PostReversalAsync(LedgerSourceType.Voucher, e.Id, dto.Reason, ct);
        e.MarkReversed(dto.Reason, clock.UtcNow);
        repo.Update(e);
        await uow.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        var fresh = await repo.GetWithLinesAsync(e.Id, ct);
        return await MapAsync(fresh!, ct);
    }

    public async Task<Result<byte[]>> RenderPdfAsync(Guid id, CancellationToken ct = default)
    {
        var e = await repo.GetWithLinesAsync(id, ct);
        if (e is null) return Error.NotFound("voucher.not_found", "Voucher not found.");
        var renderer = services.GetRequiredService<IVoucherPdfRenderer>();
        var dto = await MapAsync(e, ct);
        return renderer.Render(dto.Value!);
    }

    private async Task<Result<VoucherDto>> MapAsync(Voucher v, CancellationToken ct)
    {
        var db = services.GetRequiredService<Application.Persistence.JamaatDbContextFacade>();
        var expenseIds = v.Lines.Select(l => l.ExpenseTypeId).Distinct().ToList();
        var ets = await db.ExpenseTypes.AsNoTracking().Where(x => expenseIds.Contains(x.Id))
            .Select(x => new { x.Id, x.Code, x.Name }).ToListAsync(ct);
        string? bankName = null;
        if (v.BankAccountId is not null)
            bankName = await db.BankAccounts.AsNoTracking().Where(b => b.Id == v.BankAccountId).Select(b => b.Name).FirstOrDefaultAsync(ct);

        return new VoucherDto(
            v.Id, v.VoucherNumber, v.VoucherDate, v.PayTo, v.PayeeItsNumber, v.Purpose, v.AmountTotal, v.Currency,
            v.FxRate, v.BaseCurrency, v.BaseAmountTotal,
            v.PaymentMode, v.ChequeNumber, v.ChequeDate, v.DrawnOnBank, v.BankAccountId, bankName, v.PaymentDate, v.Remarks,
            v.Status, v.ApprovedByUserName, v.ApprovedAtUtc, v.PaidByUserName, v.PaidAtUtc, v.CreatedAtUtc,
            v.Lines.Select(l =>
            {
                var et = ets.First(x => x.Id == l.ExpenseTypeId);
                return new VoucherLineDto(l.Id, l.LineNo, l.ExpenseTypeId, et.Code, et.Name, l.Amount, l.Narration);
            }).ToList());
    }
}

public sealed class CreateVoucherValidator : AbstractValidator<CreateVoucherDto>
{
    public CreateVoucherValidator()
    {
        RuleFor(x => x.VoucherDate).NotEmpty();
        RuleFor(x => x.PayTo).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Lines).NotEmpty();
        RuleForEach(x => x.Lines).ChildRules(l =>
        {
            l.RuleFor(x => x.ExpenseTypeId).NotEmpty();
            l.RuleFor(x => x.Amount).GreaterThan(0);
        });
        When(x => x.PaymentMode == PaymentMode.Cheque, () =>
        {
            RuleFor(x => x.ChequeNumber).NotEmpty();
            RuleFor(x => x.ChequeDate).NotEmpty();
        });
    }
}
