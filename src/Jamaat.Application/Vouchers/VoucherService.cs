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
    INotificationSender notifications,
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
        else
        {
            // Sitting in PendingApproval - log the queue entry so admins see it. No recipient
            // because we don't have a per-role distribution list; the dashboard tile surfaces
            // the count for approvers anyway.
            await notifications.SendAsync(new NotificationMessage(
                Kind: NotificationKind.VoucherPendingApproval,
                Subject: $"[Pending approval] Voucher to {v.PayTo} - {v.Currency} {v.AmountTotal:0.00}",
                Body: $@"A voucher is awaiting approval.

Pay to       : {v.PayTo}
Date         : {v.VoucherDate:dd MMM yyyy}
Amount       : {v.Currency} {v.AmountTotal:0.00}
Purpose      : {v.Purpose}

Open the dashboard to review and approve.",
                RecipientEmail: null,
                RecipientUserId: null,
                SourceId: v.Id,
                SourceReference: null), ct);
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
        // Cancelling a contribution-return voucher rolls back the source receipt's running
        // AmountReturned so the contributor can be paid via a fresh return. Without this the
        // receipt would stay "partially returned" forever even though no money actually went
        // out (since cancelled draft vouchers never posted to the GL anyway).
        await RollbackContributionReturnIfNeededAsync(e, ct);
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
        // Reversing a contribution-return voucher: the GL is unwound by PostReversalAsync above,
        // and the source receipt's AmountReturned must drop back so the receipt reflects the
        // true outstanding balance. Otherwise reports show "fully returned" while the GL says
        // the obligation is still live.
        await RollbackContributionReturnIfNeededAsync(e, ct);
        await uow.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        var fresh = await repo.GetWithLinesAsync(e.Id, ct);
        return await MapAsync(fresh!, ct);
    }

    /// <summary>If the voucher being cancelled/reversed is a contribution-return, drop its
    /// amount back from the source Receipt's AmountReturned and refresh maturity-state.
    /// No-op for regular expense vouchers and QH-disbursement vouchers.</summary>
    private async Task RollbackContributionReturnIfNeededAsync(Voucher voucher, CancellationToken ct)
    {
        if (voucher.SourceReceiptId is not Guid receiptId) return;
        var db = services.GetRequiredService<Application.Persistence.JamaatDbContextFacade>();
        var receipt = await db.Receipts.FirstOrDefaultAsync(r => r.Id == receiptId, ct);
        if (receipt is null) return;
        receipt.RollbackReturn(voucher.AmountTotal);
        receipt.RefreshMaturityState(clock.Today);
        db.Receipts.Update(receipt);
    }

    public async Task<Result<byte[]>> RenderPdfAsync(Guid id, CancellationToken ct = default)
    {
        var e = await repo.GetWithLinesAsync(id, ct);
        if (e is null) return Error.NotFound("voucher.not_found", "Voucher not found.");
        var renderer = services.GetRequiredService<IVoucherPdfRenderer>();
        var dto = await MapAsync(e, ct);

        // Pick the right TransactionLabelType for this voucher's kind. Source-receipt link =>
        // contribution return; source-loan link => QH loan issue; otherwise it's a generic
        // expense payment with no admin-configured label. Resolution order: per-fund (where
        // a fund is implied by the source) -> system-wide -> fall back to renderer default.
        var db = services.GetRequiredService<Application.Persistence.JamaatDbContextFacade>();
        Domain.Enums.TransactionLabelType? labelType =
            e.SourceReceiptId.HasValue ? Domain.Enums.TransactionLabelType.ContributionReturn
            : e.SourceQarzanHasanaLoanId.HasValue ? Domain.Enums.TransactionLabelType.LoanIssue
            : null;
        string? documentTitle = null;
        if (labelType is Domain.Enums.TransactionLabelType lt)
        {
            // Resolve fund context for per-fund label override (only contribution-return has a
            // fund - it inherits from the source receipt's first line).
            Guid? scopedFundId = null;
            if (e.SourceReceiptId is Guid rid)
            {
                scopedFundId = await db.Receipts.AsNoTracking()
                    .Where(r => r.Id == rid)
                    .SelectMany(r => r.Lines.OrderBy(l => l.LineNo).Take(1).Select(l => (Guid?)l.FundTypeId))
                    .FirstOrDefaultAsync(ct);
            }
            var perFund = scopedFundId is Guid f
                ? await db.TransactionLabels.AsNoTracking()
                    .Where(t => t.FundTypeId == f && t.LabelType == lt && t.IsActive)
                    .Select(t => t.Label).FirstOrDefaultAsync(ct)
                : null;
            documentTitle = perFund ?? await db.TransactionLabels.AsNoTracking()
                .Where(t => t.FundTypeId == null && t.LabelType == lt && t.IsActive)
                .Select(t => t.Label).FirstOrDefaultAsync(ct);
        }

        return renderer.Render(dto.Value!, documentTitle);
    }

    public async Task<ImportResult> ImportAsync(Stream xlsxStream, CancellationToken ct = default)
    {
        var reader = services.GetRequiredService<IExcelReader>();
        var rows = reader.Read(xlsxStream);
        var errors = new List<ImportRowError>();
        var committed = 0;

        var db = services.GetRequiredService<Persistence.JamaatDbContextFacade>();
        var expenseByCode = await db.ExpenseTypes.AsNoTracking().Where(e => e.IsActive)
            .Select(e => new { e.Id, e.Code }).ToDictionaryAsync(x => x.Code, x => x.Id, StringComparer.OrdinalIgnoreCase, ct);
        var bankByName = await db.BankAccounts.AsNoTracking().Where(b => b.IsActive)
            .Select(b => new { b.Id, b.Name }).ToDictionaryAsync(x => x.Name, x => x.Id, StringComparer.OrdinalIgnoreCase, ct);

        foreach (var row in rows)
        {
            try
            {
                var dateStr = row.Get("Date", "Voucher date", "VoucherDate");
                if (string.IsNullOrWhiteSpace(dateStr) || !DateOnly.TryParse(dateStr, System.Globalization.CultureInfo.InvariantCulture, out var date))
                { errors.Add(new(row.RowNumber, "Date is required (yyyy-MM-dd).", "Date")); continue; }

                var payTo = row.Get("Pay to", "PayTo");
                if (string.IsNullOrWhiteSpace(payTo)) { errors.Add(new(row.RowNumber, "Pay to is required.", "Pay to")); continue; }

                var purpose = row.Get("Purpose") ?? string.Empty;

                var expenseCode = row.Get("Expense", "Expense code", "ExpenseCode");
                if (string.IsNullOrWhiteSpace(expenseCode) || !expenseByCode.TryGetValue(expenseCode, out var expenseId))
                { errors.Add(new(row.RowNumber, $"Expense code '{expenseCode}' not found.", "Expense")); continue; }

                var amountStr = row.Get("Amount");
                if (!decimal.TryParse(amountStr, System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var amount) || amount <= 0)
                { errors.Add(new(row.RowNumber, "Amount must be a positive number.", "Amount")); continue; }

                var modeStr = row.Get("Mode", "Payment mode", "PaymentMode") ?? "Cash";
                if (!Enum.TryParse<PaymentMode>(modeStr, ignoreCase: true, out var mode))
                { errors.Add(new(row.RowNumber, $"Payment mode '{modeStr}' is invalid.", "Mode")); continue; }

                Guid? bankId = null;
                var bankName = row.Get("Bank", "Bank account");
                if (!string.IsNullOrWhiteSpace(bankName))
                {
                    if (!bankByName.TryGetValue(bankName, out var b)) { errors.Add(new(row.RowNumber, $"Bank account '{bankName}' not found.", "Bank")); continue; }
                    bankId = b;
                }

                string? chequeNumber = mode == PaymentMode.Cheque ? row.Get("Cheque #", "Cheque number") : null;
                DateOnly? chequeDate = null;
                if (mode == PaymentMode.Cheque)
                {
                    var cdStr = row.Get("Cheque date", "ChequeDate");
                    if (string.IsNullOrWhiteSpace(chequeNumber) || string.IsNullOrWhiteSpace(cdStr) ||
                        !DateOnly.TryParse(cdStr, System.Globalization.CultureInfo.InvariantCulture, out var cd))
                    { errors.Add(new(row.RowNumber, "Cheque number + cheque date required for Cheque mode.", "Cheque")); continue; }
                    chequeDate = cd;
                }

                var dto = new CreateVoucherDto(
                    VoucherDate: date,
                    PayTo: payTo,
                    PayeeItsNumber: row.Get("Payee ITS", "PayeeITS"),
                    Purpose: purpose,
                    PaymentMode: mode,
                    BankAccountId: bankId,
                    ChequeNumber: chequeNumber,
                    ChequeDate: chequeDate,
                    DrawnOnBank: row.Get("Drawn on", "Drawn on bank"),
                    PaymentDate: null,
                    Remarks: row.Get("Remarks", "Notes"),
                    Lines: new[] { new CreateVoucherLineDto(expenseId, amount, row.Get("Narration")) },
                    Currency: row.Get("Currency"));

                var created = await CreateAsync(dto, ct);
                if (!created.IsSuccess) { errors.Add(new(row.RowNumber, created.Error.Message)); continue; }
                committed++;
            }
            catch (Exception ex)
            {
                errors.Add(new(row.RowNumber, ex.Message));
            }
        }

        return new ImportResult(rows.Count, committed, errors);
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
