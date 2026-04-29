using FluentValidation;
using Jamaat.Application.Accounting;
using Jamaat.Application.Common;
using Jamaat.Contracts.Receipts;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Jamaat.Application.Receipts;

public sealed class ReceiptService(
    IReceiptRepository repo,
    IUnitOfWork uow,
    ITenantContext tenant,
    ICurrentUser currentUser,
    IClock clock,
    INumberingService numbering,
    IPostingService posting,
    IFxConverter fx,
    IServiceProvider services,
    IValidator<CreateReceiptDto> createV) : IReceiptService
{
    public Task<PagedResult<ReceiptListItemDto>> ListAsync(ReceiptListQuery q, CancellationToken ct = default) => repo.ListAsync(q, ct);

    public async Task<Result<ReceiptDto>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var e = await repo.GetWithLinesAsync(id, ct);
        if (e is null) return Error.NotFound("receipt.not_found", "Receipt not found.");
        return await MapAsync(e, ct);
    }

    public async Task<Result<ReceiptDto>> CreateAndConfirmAsync(CreateReceiptDto dto, CancellationToken ct = default)
    {
        await createV.ValidateAndThrowAsync(dto, ct);

        var db = services.GetRequiredService<Application.Persistence.JamaatDbContextFacade>();
        var member = await db.Members.AsNoTracking().FirstOrDefaultAsync(m => m.Id == dto.MemberId, ct);
        if (member is null) return Error.NotFound("member.not_found", "Member not found.");

        // Resolve optional family context — either explicit or inferred from member
        Family? family = null;
        var familyId = dto.FamilyId ?? member.FamilyId;
        if (familyId is Guid fid)
        {
            family = await db.Families.AsNoTracking().FirstOrDefaultAsync(f => f.Id == fid, ct);
            if (family is null && dto.FamilyId is not null)
                return Error.NotFound("family.not_found", "Family not found.");
        }

        var period = await ResolvePeriodAsync(dto.ReceiptDate, ct);
        if (period is null) return Error.Business("period.not_open", "No open financial period covers this date. Create or reopen a period.");

        // Resolve transaction currency + base currency
        var baseCurrency = await fx.GetBaseCurrencyAsync(ct);
        var txnCurrency = (dto.Currency ?? baseCurrency).ToUpperInvariant();

        // Pre-load referenced commitments so we can validate + apply allocations in-transaction
        var commitmentIds = dto.Lines.Where(l => l.CommitmentId.HasValue).Select(l => l.CommitmentId!.Value).Distinct().ToList();
        var commitments = commitmentIds.Count == 0
            ? new Dictionary<Guid, Commitment>()
            : (await db.Commitments.Include(c => c.Installments)
                .Where(c => commitmentIds.Contains(c.Id)).ToListAsync(ct))
              .ToDictionary(c => c.Id);

        foreach (var line in dto.Lines)
        {
            if (line.CommitmentId is not Guid cId) continue;
            if (!commitments.TryGetValue(cId, out var cm))
                return Error.NotFound("commitment.not_found", $"Commitment {cId} not found.");
            if (cm.Status is CommitmentStatus.Cancelled or CommitmentStatus.Completed or CommitmentStatus.Paused)
                return Error.Business("commitment.not_payable", $"Commitment {cm.Code} is {cm.Status} and cannot accept payments.");
            if (cm.Status == CommitmentStatus.Draft)
                return Error.Business("commitment.not_active", $"Commitment {cm.Code} has no accepted agreement yet.");
            if (cm.Currency != txnCurrency)
                return Error.Business("commitment.currency_mismatch",
                    $"Commitment {cm.Code} is in {cm.Currency}; receipt is in {txnCurrency}. Payment must be in the commitment currency.");
            if (cm.FundTypeId != line.FundTypeId)
                return Error.Business("commitment.fund_mismatch",
                    $"Commitment {cm.Code} is against a different fund type than the receipt line.");
            if (line.CommitmentInstallmentId is not Guid iId || cm.Installments.All(i => i.Id != iId))
                return Error.Validation("commitment.installment_required",
                    $"An installment must be selected for commitment {cm.Code}.");
            var inst = cm.Installments.First(i => i.Id == iId);
            var due = inst.ScheduledAmount - inst.PaidAmount;
            if (!cm.AllowPartialPayments && line.Amount < due)
                return Error.Business("commitment.partial_not_allowed",
                    $"Commitment {cm.Code} does not allow partial payments; pay the full installment amount.");
            if (line.Amount > due)
                return Error.Business("commitment.overpayment",
                    $"Amount exceeds remaining installment balance ({due:0.00}) on commitment {cm.Code}.");
        }

        // Validate fund-enrollment links (Sabil/Wajebaat/Mutafariq/Niyaz collections)
        var enrollmentIds = dto.Lines.Where(l => l.FundEnrollmentId.HasValue).Select(l => l.FundEnrollmentId!.Value).Distinct().ToList();
        var enrollments = enrollmentIds.Count == 0
            ? new Dictionary<Guid, FundEnrollment>()
            : (await db.FundEnrollments.AsNoTracking().Where(e => enrollmentIds.Contains(e.Id)).ToListAsync(ct))
              .ToDictionary(e => e.Id);
        foreach (var line in dto.Lines)
        {
            if (line.FundEnrollmentId is not Guid eId) continue;
            if (!enrollments.TryGetValue(eId, out var en))
                return Error.NotFound("enrollment.not_found", $"Fund enrollment {eId} not found.");
            if (en.Status != FundEnrollmentStatus.Active)
                return Error.Business("enrollment.not_active", $"Enrollment {en.Code} is {en.Status} and cannot accept payments.");
            if (en.MemberId != dto.MemberId)
                return Error.Business("enrollment.member_mismatch", $"Enrollment {en.Code} belongs to another member.");
            if (en.FundTypeId != line.FundTypeId)
                return Error.Business("enrollment.fund_mismatch", $"Enrollment {en.Code} is against a different fund type.");
        }

        // Pre-load referenced QH loans and validate
        var loanIds = dto.Lines.Where(l => l.QarzanHasanaLoanId.HasValue).Select(l => l.QarzanHasanaLoanId!.Value).Distinct().ToList();
        var loans = loanIds.Count == 0
            ? new Dictionary<Guid, QarzanHasanaLoan>()
            : (await db.QarzanHasanaLoans.Include(l => l.Installments).Where(l => loanIds.Contains(l.Id)).ToListAsync(ct))
              .ToDictionary(l => l.Id);
        foreach (var line in dto.Lines)
        {
            if (line.QarzanHasanaLoanId is not Guid lId) continue;
            if (!loans.TryGetValue(lId, out var loan))
                return Error.NotFound("qh.not_found", $"QH loan {lId} not found.");
            if (loan.Status is not (QarzanHasanaStatus.Active or QarzanHasanaStatus.Disbursed))
                return Error.Business("qh.not_payable", $"Loan {loan.Code} is {loan.Status} and cannot accept repayments.");
            if (loan.Currency != txnCurrency)
                return Error.Business("qh.currency_mismatch",
                    $"Loan {loan.Code} is in {loan.Currency}; receipt is in {txnCurrency}.");
            if (line.QarzanHasanaInstallmentId is not Guid qId || loan.Installments.All(i => i.Id != qId))
                return Error.Validation("qh.installment_required", $"An installment must be selected for loan {loan.Code}.");
            var qi = loan.Installments.First(i => i.Id == qId);
            var remaining = qi.ScheduledAmount - qi.PaidAmount;
            if (line.Amount > remaining)
                return Error.Business("qh.overpayment",
                    $"Amount exceeds remaining installment balance ({remaining:0.00}) on loan {loan.Code}.");
        }

        // --- Intention + Niyyath + maturity validation (batch 2 of fund-management uplift) ----
        // Pull every distinct fund type referenced by the lines so we can check the behaviour flags.
        // We do this before opening the transaction so validation failures don't burn a numbering slot.
        var lineFundIds = dto.Lines.Select(l => l.FundTypeId).Distinct().ToList();
        var lineFunds = await db.FundTypes.AsNoTracking()
            .Where(f => lineFundIds.Contains(f.Id))
            .Select(f => new { f.Id, f.Code, f.NameEnglish, f.IsReturnable, f.RequiresAgreement, f.RequiresMaturityTracking, f.RequiresNiyyath })
            .ToListAsync(ct);

        if (dto.Intention == ContributionIntention.Returnable)
        {
            var nonReturnable = lineFunds.Where(f => !f.IsReturnable).Select(f => f.Code).ToList();
            if (nonReturnable.Count > 0)
                return Error.Business("receipt.intention_invalid",
                    $"Intention is Returnable but fund type(s) [{string.Join(", ", nonReturnable)}] don't accept returnable contributions.");
        }

        if (lineFunds.Any(f => f.RequiresNiyyath) && string.IsNullOrWhiteSpace(dto.NiyyathNote))
            return Error.Validation("receipt.niyyath_required",
                "The selected fund requires the contributor's Niyyath to be captured.");

        if (dto.Intention == ContributionIntention.Returnable
            && lineFunds.Any(f => f.RequiresMaturityTracking)
            && dto.MaturityDate is null)
            return Error.Validation("receipt.maturity_required",
                "The selected fund requires a maturity date for returnable contributions.");

        if (lineFunds.Any(f => f.RequiresAgreement) && string.IsNullOrWhiteSpace(dto.AgreementReference))
            return Error.Validation("receipt.agreement_required",
                "The selected fund requires an agreement reference.");

        // --- Custom field validation (batch 3) ----
        // Pull the active fields for every fund touched by this receipt and ensure required ones
        // are present in the supplied dictionary. We accept the union — the form already only
        // shows fields the user can see, but the API has to defend against direct calls too.
        var customFieldDefs = await db.FundTypeCustomFields.AsNoTracking()
            .Where(f => lineFundIds.Contains(f.FundTypeId) && f.IsActive)
            .Select(f => new { f.FundTypeId, f.FieldKey, f.Label, f.IsRequired })
            .ToListAsync(ct);
        var providedKeys = dto.CustomFieldValues?.Keys.ToHashSet(StringComparer.OrdinalIgnoreCase) ?? new HashSet<string>();
        var missingRequired = customFieldDefs
            .Where(f => f.IsRequired)
            .Where(f => !providedKeys.Contains(f.FieldKey)
                || string.IsNullOrWhiteSpace(dto.CustomFieldValues![f.FieldKey]))
            .Select(f => f.Label)
            .Distinct()
            .ToList();
        if (missingRequired.Count > 0)
            return Error.Validation("receipt.custom_field_required",
                $"Missing required custom field(s): {string.Join(", ", missingRequired)}.");

        // Begin an explicit transaction so numbering UPDLOCK, ledger posting, and receipt save commit atomically
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var receipt = new Receipt(Guid.NewGuid(), tenant.TenantId, dto.ReceiptDate, member.Id, member.ItsNumber.Value, member.FullName, txnCurrency);
        receipt.SetPayment(dto.PaymentMode, dto.BankAccountId, dto.ChequeNumber, dto.ChequeDate, dto.PaymentReference);
        receipt.SetRemarks(dto.Remarks);
        receipt.SetContributionIntention(dto.Intention, dto.NiyyathNote, dto.MaturityDate, dto.AgreementReference);
        // Persist custom-field values (if any) as a JSON map on the receipt. The receipt PDF +
        // detail page can read this map to render the captured values.
        if (dto.CustomFieldValues is { Count: > 0 })
            receipt.SetCustomFields(System.Text.Json.JsonSerializer.Serialize(dto.CustomFieldValues));

        if (family is not null)
        {
            var onBehalfJson = dto.OnBehalfOfMemberIds is { Count: > 0 }
                ? System.Text.Json.JsonSerializer.Serialize(dto.OnBehalfOfMemberIds)
                : null;
            receipt.SetFamilyContext(family.Id, family.FamilyName, onBehalfJson);
        }

        var lines = dto.Lines.Select((l, idx) => new ReceiptLine(
            Guid.NewGuid(), idx + 1, l.FundTypeId, l.Amount, l.Purpose, l.PeriodReference,
            l.CommitmentId, l.CommitmentInstallmentId,
            l.FundEnrollmentId,
            l.QarzanHasanaLoanId, l.QarzanHasanaInstallmentId)).ToList();
        receipt.ReplaceLines(lines);

        // Apply the payments onto their installments (aggregate tracks PaidAmount + status)
        foreach (var line in dto.Lines.Where(l => l.CommitmentId.HasValue && l.CommitmentInstallmentId.HasValue))
        {
            var cm = commitments[line.CommitmentId!.Value];
            _ = cm.RecordPaymentOnInstallment(line.CommitmentInstallmentId!.Value, line.Amount, dto.ReceiptDate);
            db.Commitments.Update(cm);
        }

        // Apply QH repayments onto loan installments
        foreach (var line in dto.Lines.Where(l => l.QarzanHasanaLoanId.HasValue && l.QarzanHasanaInstallmentId.HasValue))
        {
            var loan = loans[line.QarzanHasanaLoanId!.Value];
            _ = loan.RecordRepayment(line.QarzanHasanaInstallmentId!.Value, line.Amount, dto.ReceiptDate);
            db.QarzanHasanaLoans.Update(loan);
        }

        // FX conversion to base (no-op when txn currency == base)
        var conversion = await fx.ConvertToBaseAsync(receipt.AmountTotal, txnCurrency, dto.ReceiptDate, ct);
        receipt.ApplyFxConversion(conversion.BaseCurrency, conversion.Rate, conversion.BaseAmount);

        var (seriesId, number) = await numbering.NextAsync(NumberingScope.Receipt, null, dto.ReceiptDate.Year, ct);
        receipt.Confirm(number, period.Id, seriesId, currentUser.UserId ?? Guid.Empty, currentUser.UserName ?? "system", clock.UtcNow);

        await repo.AddAsync(receipt, ct);
        await posting.PostReceiptAsync(receipt, ct);
        await uow.SaveChangesAsync(ct);

        await tx.CommitAsync(ct);

        var fresh = await repo.GetWithLinesAsync(receipt.Id, ct);
        return await MapAsync(fresh!, ct);
    }

    public async Task<Result<ReceiptDto>> CancelAsync(Guid id, CancelReceiptDto dto, CancellationToken ct = default)
    {
        var e = await repo.GetByIdAsync(id, ct);
        if (e is null) return Error.NotFound("receipt.not_found", "Receipt not found.");
        if (e.Status is ReceiptStatus.Cancelled or ReceiptStatus.Reversed)
            return Error.Business("receipt.already_closed", "Receipt is already cancelled or reversed.");
        if (string.IsNullOrWhiteSpace(dto.Reason))
            return Error.Validation("cancel.reason_required", "A reason is required.");

        e.Cancel(dto.Reason, currentUser.UserId ?? Guid.Empty, clock.UtcNow);
        repo.Update(e);
        await uow.SaveChangesAsync(ct);
        var fresh = await repo.GetWithLinesAsync(e.Id, ct);
        return await MapAsync(fresh!, ct);
    }

    public async Task<Result<ReceiptDto>> ReverseAsync(Guid id, ReverseReceiptDto dto, CancellationToken ct = default)
    {
        var e = await repo.GetWithLinesAsync(id, ct);
        if (e is null) return Error.NotFound("receipt.not_found", "Receipt not found.");
        if (e.Status != ReceiptStatus.Confirmed) return Error.Business("receipt.not_confirmed", "Only confirmed receipts can be reversed.");
        if (string.IsNullOrWhiteSpace(dto.Reason)) return Error.Validation("reverse.reason_required", "A reason is required.");

        var db = services.GetRequiredService<Application.Persistence.JamaatDbContextFacade>();
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        // Rollback any commitment-installment allocations carried by this receipt's lines
        var committedLines = e.Lines.Where(l => l.CommitmentId.HasValue && l.CommitmentInstallmentId.HasValue).ToList();
        if (committedLines.Count > 0)
        {
            var cIds = committedLines.Select(l => l.CommitmentId!.Value).Distinct().ToList();
            var cms = await db.Commitments.Include(c => c.Installments)
                .Where(c => cIds.Contains(c.Id)).ToListAsync(ct);
            foreach (var l in committedLines)
            {
                var cm = cms.FirstOrDefault(c => c.Id == l.CommitmentId);
                if (cm is null) continue;
                cm.RollbackPaymentOnInstallment(l.CommitmentInstallmentId!.Value, l.Amount);
                db.Commitments.Update(cm);
            }
        }

        // Rollback any QH repayments carried by this receipt's lines
        var qhLines = e.Lines.Where(l => l.QarzanHasanaLoanId.HasValue && l.QarzanHasanaInstallmentId.HasValue).ToList();
        if (qhLines.Count > 0)
        {
            var lIds = qhLines.Select(l => l.QarzanHasanaLoanId!.Value).Distinct().ToList();
            var qhs = await db.QarzanHasanaLoans.Include(l => l.Installments)
                .Where(l => lIds.Contains(l.Id)).ToListAsync(ct);
            foreach (var l in qhLines)
            {
                var loan = qhs.FirstOrDefault(x => x.Id == l.QarzanHasanaLoanId);
                if (loan is null) continue;
                loan.RollbackRepayment(l.QarzanHasanaInstallmentId!.Value, l.Amount);
                db.QarzanHasanaLoans.Update(loan);
            }
        }

        await posting.PostReversalAsync(LedgerSourceType.Receipt, e.Id, dto.Reason, ct);
        e.MarkReversed(dto.Reason, clock.UtcNow);
        repo.Update(e);
        await uow.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        var fresh = await repo.GetWithLinesAsync(e.Id, ct);
        return await MapAsync(fresh!, ct);
    }

    public async Task<Result> LogReprintAsync(Guid id, ReprintReceiptDto dto, CancellationToken ct = default)
    {
        var db = services.GetRequiredService<Application.Persistence.JamaatDbContextFacade>();
        var e = await repo.GetByIdAsync(id, ct);
        if (e is null) return Result.Failure(Error.NotFound("receipt.not_found", "Receipt not found."));
        db.ReprintLogs.Add(new ReprintLog(
            tenant.TenantId, "Receipt", e.Id, e.ReceiptNumber ?? e.Id.ToString(),
            currentUser.UserId, currentUser.UserName, dto.Reason, clock.UtcNow));
        await db.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<Result<byte[]>> RenderPdfAsync(Guid id, bool reprint, CancellationToken ct = default)
    {
        var e = await repo.GetWithLinesAsync(id, ct);
        if (e is null) return Error.NotFound("receipt.not_found", "Receipt not found.");
        if (string.IsNullOrEmpty(e.ReceiptNumber)) return Error.Business("receipt.not_confirmed", "Receipt is not yet confirmed.");

        var renderer = services.GetRequiredService<IReceiptPdfRenderer>();
        var dto = await MapAsync(e, ct);
        var bytes = renderer.Render(dto.Value!, reprint);
        if (reprint) await LogReprintAsync(id, new ReprintReceiptDto("Reprint via API"), ct);
        return bytes;
    }

    public async Task<ImportResult> ImportAsync(Stream xlsxStream, CancellationToken ct = default)
    {
        var reader = services.GetRequiredService<IExcelReader>();
        var rows = reader.Read(xlsxStream);
        var errors = new List<ImportRowError>();
        var committed = 0;

        // Pre-load lookups so each row doesn't round-trip the DB.
        var db = services.GetRequiredService<Persistence.JamaatDbContextFacade>();
        var memberByIts = await db.Members.AsNoTracking().Where(m => !m.IsDeleted)
            .Select(m => new { m.Id, ItsNumber = m.ItsNumber.Value }).ToDictionaryAsync(m => m.ItsNumber, m => m.Id, ct);
        var fundByCode = await db.FundTypes.AsNoTracking().Where(f => f.IsActive)
            .Select(f => new { f.Id, f.Code }).ToDictionaryAsync(x => x.Code, x => x.Id, StringComparer.OrdinalIgnoreCase, ct);
        var bankByName = await db.BankAccounts.AsNoTracking().Where(b => b.IsActive)
            .Select(b => new { b.Id, b.Name }).ToDictionaryAsync(x => x.Name, x => x.Id, StringComparer.OrdinalIgnoreCase, ct);

        foreach (var row in rows)
        {
            try
            {
                var dateStr = row.Get("Date", "Receipt date", "ReceiptDate");
                if (string.IsNullOrWhiteSpace(dateStr) || !DateOnly.TryParse(dateStr, System.Globalization.CultureInfo.InvariantCulture, out var date))
                { errors.Add(new(row.RowNumber, "Date is required (yyyy-MM-dd).", "Date")); continue; }

                var its = row.Get("ITS", "ItsNumber", "ITS Number");
                if (string.IsNullOrWhiteSpace(its) || !memberByIts.TryGetValue(its, out var memberId))
                { errors.Add(new(row.RowNumber, $"ITS '{its}' not found among members.", "ITS")); continue; }

                var fundCode = row.Get("Fund", "Fund code", "FundCode");
                if (string.IsNullOrWhiteSpace(fundCode) || !fundByCode.TryGetValue(fundCode, out var fundId))
                { errors.Add(new(row.RowNumber, $"Fund code '{fundCode}' not found.", "Fund code")); continue; }

                var amountStr = row.Get("Amount");
                if (!decimal.TryParse(amountStr, System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var amount) || amount <= 0)
                { errors.Add(new(row.RowNumber, "Amount must be a positive number.", "Amount")); continue; }

                var modeStr = row.Get("Mode", "Payment mode", "PaymentMode") ?? "Cash";
                if (!Enum.TryParse<PaymentMode>(modeStr, ignoreCase: true, out var mode))
                { errors.Add(new(row.RowNumber, $"Payment mode '{modeStr}' is invalid (Cash/Cheque/BankTransfer/Upi/Card/Online).", "Mode")); continue; }

                Guid? bankId = null;
                var bankName = row.Get("Bank", "Bank account", "BankAccount");
                if (!string.IsNullOrWhiteSpace(bankName))
                {
                    if (!bankByName.TryGetValue(bankName, out var b)) { errors.Add(new(row.RowNumber, $"Bank account '{bankName}' not found.", "Bank")); continue; }
                    bankId = b;
                }

                string? chequeNumber = mode == PaymentMode.Cheque ? row.Get("Cheque #", "Cheque number", "ChequeNumber") : null;
                DateOnly? chequeDate = null;
                var chequeDateStr = row.Get("Cheque date", "ChequeDate");
                if (mode == PaymentMode.Cheque)
                {
                    if (string.IsNullOrWhiteSpace(chequeNumber)) { errors.Add(new(row.RowNumber, "Cheque number required for Cheque mode.", "Cheque #")); continue; }
                    if (string.IsNullOrWhiteSpace(chequeDateStr) || !DateOnly.TryParse(chequeDateStr, System.Globalization.CultureInfo.InvariantCulture, out var cd))
                    { errors.Add(new(row.RowNumber, "Cheque date required for Cheque mode (yyyy-MM-dd).", "Cheque date")); continue; }
                    chequeDate = cd;
                }

                var currency = row.Get("Currency");
                var purpose = row.Get("Purpose");
                var periodRef = row.Get("Period", "Period reference", "PeriodReference");
                var reference = row.Get("Reference");
                var remarks = row.Get("Remarks", "Notes");

                var dto = new CreateReceiptDto(
                    ReceiptDate: date,
                    MemberId: memberId,
                    PaymentMode: mode,
                    BankAccountId: bankId,
                    ChequeNumber: chequeNumber,
                    ChequeDate: chequeDate,
                    PaymentReference: reference,
                    Remarks: remarks,
                    Lines: new[] { new CreateReceiptLineDto(fundId, amount, purpose, periodRef) },
                    Currency: currency);

                var result = await CreateAndConfirmAsync(dto, ct);
                if (!result.IsSuccess) { errors.Add(new(row.RowNumber, result.Error.Message)); continue; }
                committed++;
            }
            catch (Exception ex)
            {
                errors.Add(new(row.RowNumber, ex.Message));
            }
        }

        return new ImportResult(rows.Count, committed, errors);
    }

    private async Task<FinancialPeriod?> ResolvePeriodAsync(DateOnly date, CancellationToken ct)
    {
        var db = services.GetRequiredService<Application.Persistence.JamaatDbContextFacade>();
        return await db.FinancialPeriods
            .FirstOrDefaultAsync(p => p.Status == PeriodStatus.Open && p.StartDate <= date && p.EndDate >= date, ct);
    }

    private async Task<Result<ReceiptDto>> MapAsync(Receipt e, CancellationToken ct)
    {
        var db = services.GetRequiredService<Application.Persistence.JamaatDbContextFacade>();
        var fundIds = e.Lines.Select(l => l.FundTypeId).Distinct().ToList();
        var funds = await db.FundTypes.AsNoTracking().Where(f => fundIds.Contains(f.Id))
            .Select(f => new { f.Id, f.Code, f.NameEnglish }).ToListAsync(ct);
        string? bankName = null;
        if (e.BankAccountId is not null)
        {
            bankName = await db.BankAccounts.AsNoTracking().Where(b => b.Id == e.BankAccountId).Select(b => b.Name).FirstOrDefaultAsync(ct);
        }

        var cmIds = e.Lines.Where(l => l.CommitmentId.HasValue).Select(l => l.CommitmentId!.Value).Distinct().ToList();
        var cmLookup = cmIds.Count == 0
            ? []
            : await db.Commitments.AsNoTracking().Where(c => cmIds.Contains(c.Id))
                .Select(c => new { c.Id, c.Code }).ToDictionaryAsync(x => x.Id, x => x.Code, ct);
        var instIds = e.Lines.Where(l => l.CommitmentInstallmentId.HasValue).Select(l => l.CommitmentInstallmentId!.Value).Distinct().ToList();
        var instLookup = instIds.Count == 0
            ? new Dictionary<Guid, int>()
            : await db.Commitments.AsNoTracking().SelectMany(c => c.Installments)
                .Where(i => instIds.Contains(i.Id))
                .Select(i => new { i.Id, i.InstallmentNo })
                .ToDictionaryAsync(x => x.Id, x => x.InstallmentNo, ct);

        var enrollIds = e.Lines.Where(l => l.FundEnrollmentId.HasValue).Select(l => l.FundEnrollmentId!.Value).Distinct().ToList();
        var enrollLookup = enrollIds.Count == 0
            ? []
            : await db.FundEnrollments.AsNoTracking().Where(x => enrollIds.Contains(x.Id))
                .Select(x => new { x.Id, x.Code }).ToDictionaryAsync(x => x.Id, x => x.Code, ct);

        var loanIds = e.Lines.Where(l => l.QarzanHasanaLoanId.HasValue).Select(l => l.QarzanHasanaLoanId!.Value).Distinct().ToList();
        var loanLookup = loanIds.Count == 0
            ? []
            : await db.QarzanHasanaLoans.AsNoTracking().Where(x => loanIds.Contains(x.Id))
                .Select(x => new { x.Id, x.Code }).ToDictionaryAsync(x => x.Id, x => x.Code, ct);
        var qhInstIds = e.Lines.Where(l => l.QarzanHasanaInstallmentId.HasValue).Select(l => l.QarzanHasanaInstallmentId!.Value).Distinct().ToList();
        var qhInstLookup = qhInstIds.Count == 0
            ? new Dictionary<Guid, int>()
            : await db.QarzanHasanaLoans.AsNoTracking().SelectMany(l => l.Installments)
                .Where(i => qhInstIds.Contains(i.Id))
                .Select(i => new { i.Id, i.InstallmentNo })
                .ToDictionaryAsync(x => x.Id, x => x.InstallmentNo, ct);

        return new ReceiptDto(
            e.Id, e.ReceiptNumber, e.ReceiptDate, e.MemberId, e.ItsNumberSnapshot, e.MemberNameSnapshot,
            e.AmountTotal, e.Currency, e.FxRate, e.BaseCurrency, e.BaseAmountTotal,
            e.PaymentMode, e.ChequeNumber, e.ChequeDate,
            e.BankAccountId, bankName, e.PaymentReference, e.Remarks, e.Status,
            e.ConfirmedAtUtc, e.ConfirmedByUserName, e.CreatedAtUtc,
            e.Lines.Select(l =>
            {
                var f = funds.First(x => x.Id == l.FundTypeId);
                var cmCode = l.CommitmentId is Guid cid && cmLookup.TryGetValue(cid, out var c) ? c : null;
                var instNo = l.CommitmentInstallmentId is Guid iid && instLookup.TryGetValue(iid, out var n) ? (int?)n : null;
                var enrollCode = l.FundEnrollmentId is Guid eid && enrollLookup.TryGetValue(eid, out var ec) ? ec : null;
                var loanCode = l.QarzanHasanaLoanId is Guid lid2 && loanLookup.TryGetValue(lid2, out var lc) ? lc : null;
                var qhInstNo = l.QarzanHasanaInstallmentId is Guid qid && qhInstLookup.TryGetValue(qid, out var qn) ? (int?)qn : null;
                return new ReceiptLineDto(l.Id, l.LineNo, l.FundTypeId, f.Code, f.NameEnglish, l.Amount, l.Purpose, l.PeriodReference,
                    l.CommitmentId, cmCode, l.CommitmentInstallmentId, instNo,
                    l.FundEnrollmentId, enrollCode,
                    l.QarzanHasanaLoanId, loanCode, l.QarzanHasanaInstallmentId, qhInstNo);
            }).ToList(),
            e.Intention, e.NiyyathNote, e.MaturityDate, e.AgreementReference, e.AmountReturned);
    }
}

public sealed class CreateReceiptValidator : AbstractValidator<CreateReceiptDto>
{
    public CreateReceiptValidator()
    {
        RuleFor(x => x.ReceiptDate).NotEmpty();
        RuleFor(x => x.MemberId).NotEmpty();
        RuleFor(x => x.Lines).NotEmpty().WithMessage("At least one line is required.");
        RuleForEach(x => x.Lines).ChildRules(l =>
        {
            l.RuleFor(x => x.FundTypeId).NotEmpty();
            l.RuleFor(x => x.Amount).GreaterThan(0).WithMessage("Line amount must be greater than zero.");
        });
        When(x => x.PaymentMode == PaymentMode.Cheque, () =>
        {
            RuleFor(x => x.ChequeNumber).NotEmpty().WithMessage("Cheque number is required for cheque payments.");
            RuleFor(x => x.ChequeDate).NotEmpty().WithMessage("Cheque date is required for cheque payments.");
        });
    }
}

public interface IReceiptPdfRenderer
{
    byte[] Render(ReceiptDto receipt, bool reprint);
}
