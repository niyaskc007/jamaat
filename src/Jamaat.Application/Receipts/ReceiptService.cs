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
    INotificationSender notifications,
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

        // Resolve optional family context - either explicit or inferred from member
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
            .Select(f => new { f.Id, f.Code, f.NameEnglish, f.IsActive, f.AllowedPaymentModes, f.IsReturnable, f.RequiresAgreement, f.RequiresMaturityTracking, f.RequiresNiyyath, f.RequiresApproval })
            .ToListAsync(ct);

        // Block inactive fund types up-front. Inactive funds may be temporarily disabled
        // (audit, year-end close, deprecated) and must not accept new transactions per the
        // fund-management spec; the admin can reactivate from master data if needed.
        var inactiveCodes = lineFunds.Where(f => !f.IsActive).Select(f => f.Code).ToList();
        if (inactiveCodes.Count > 0)
            return Error.Business("fund_type.inactive",
                $"Fund type(s) [{string.Join(", ", inactiveCodes)}] are inactive and cannot accept new receipts. Reactivate the fund or pick a different one.");

        // Per-fund payment-mode allowlist. AllowedPaymentModes is a bit-flag enum on FundType -
        // admins use it to constrain a fund to specific modes (e.g. cash-only Sila Fitra). When
        // 0/None is configured we treat it as "no restriction" so funds without an explicit
        // allowlist still accept any payment mode.
        var modeViolations = lineFunds
            .Where(f => f.AllowedPaymentModes != PaymentMode.None && (f.AllowedPaymentModes & dto.PaymentMode) == 0)
            .Select(f => f.Code)
            .ToList();
        if (modeViolations.Count > 0)
            return Error.Business("receipt.payment_mode_disallowed",
                $"Payment mode {dto.PaymentMode} is not allowed on fund type(s) [{string.Join(", ", modeViolations)}]. Adjust the fund's allowed-modes config or pick a different mode.");

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
        // are present in the supplied dictionary. We accept the union - the form already only
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
        receipt.RefreshMaturityState(clock.Today);
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

        // FX conversion freezes at receipt date so the saved values reflect the moment money
        // changed hands, not the moment approval lands. Applied even for drafts so any approval
        // lookahead/reports show the right base-currency amounts.
        var conversion = await fx.ConvertToBaseAsync(receipt.AmountTotal, txnCurrency, dto.ReceiptDate, ct);
        receipt.ApplyFxConversion(conversion.BaseCurrency, conversion.Rate, conversion.BaseAmount);

        // Approval gate: if any selected fund has RequiresApproval, the receipt sits in Draft
        // pending an explicit Approve action (which then runs the deferred work below). This
        // means: NO numbering, NO GL post, NO commitment/QH allocation until approved -
        // otherwise drafts would silently consume installment balances and create reports
        // that disagree with the GL.
        var requiresApproval = lineFunds.Any(f => f.RequiresApproval);
        if (requiresApproval)
        {
            await repo.AddAsync(receipt, ct);
            await uow.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            await NotifyReceiptPendingApprovalAsync(receipt, member, ct);
            var draft = await repo.GetWithLinesAsync(receipt.Id, ct);
            return await MapAsync(draft!, ct);
        }

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

        var (seriesId, number) = await numbering.NextAsync(NumberingScope.Receipt, null, dto.ReceiptDate.Year, ct);
        receipt.Confirm(number, period.Id, seriesId, currentUser.UserId ?? Guid.Empty, currentUser.UserName ?? "system", clock.UtcNow);

        await repo.AddAsync(receipt, ct);
        await posting.PostReceiptAsync(receipt, ct);
        await uow.SaveChangesAsync(ct);

        await tx.CommitAsync(ct);

        // Notify the contributor that we've recorded their money. Fire-and-forget - the sender
        // catches its own failures so SMTP flakiness can never roll back the receipt.
        await NotifyReceiptConfirmedAsync(receipt, member, ct);

        var fresh = await repo.GetWithLinesAsync(receipt.Id, ct);
        return await MapAsync(fresh!, ct);
    }

    public async Task<Result<ReceiptDto>> ApproveAsync(Guid id, CancellationToken ct = default)
    {
        var e = await repo.GetWithLinesAsync(id, ct);
        if (e is null) return Error.NotFound("receipt.not_found", "Receipt not found.");
        if (e.Status != ReceiptStatus.Draft)
            return Error.Business("receipt.not_draft", "Only draft receipts can be approved.");
        if (e.Lines.Count == 0)
            return Error.Validation("receipt.no_lines", "Receipt has no lines.");

        // Re-resolve the period at approval time (the receipt date hasn't moved, but the
        // period may have closed since the draft was created - in which case approval has
        // to wait for someone with period.open permission).
        var period = await ResolvePeriodAsync(e.ReceiptDate, ct);
        if (period is null)
            return Error.Business("period.not_open", "No open financial period covers the receipt's date. Re-open the period first.");

        var db = services.GetRequiredService<Application.Persistence.JamaatDbContextFacade>();
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        // Re-validate against CURRENT installment / loan state. The world may have moved on
        // since the draft was saved (other receipts may have been confirmed against the same
        // installment, fund types may be inactive, commitments paused). We re-load and
        // re-check rather than trusting the saved values.
        var commitmentLines = e.Lines.Where(l => l.CommitmentId.HasValue && l.CommitmentInstallmentId.HasValue).ToList();
        var commitmentIds = commitmentLines.Select(l => l.CommitmentId!.Value).Distinct().ToList();
        var commitments = commitmentIds.Count == 0
            ? new Dictionary<Guid, Commitment>()
            : (await db.Commitments.Include(c => c.Installments)
                .Where(c => commitmentIds.Contains(c.Id))
                .ToListAsync(ct))
                .ToDictionary(c => c.Id);
        foreach (var line in commitmentLines)
        {
            if (!commitments.TryGetValue(line.CommitmentId!.Value, out var cm))
                return Error.NotFound("commitment.not_found", $"Commitment for line {line.LineNo} not found.");
            if (cm.Status is CommitmentStatus.Cancelled or CommitmentStatus.Completed)
                return Error.Business("commitment.closed", $"Commitment {cm.Code} is {cm.Status}; cannot apply payment.");
            var inst = cm.Installments.FirstOrDefault(i => i.Id == line.CommitmentInstallmentId);
            if (inst is null)
                return Error.NotFound("commitment.installment_not_found", $"Installment for line {line.LineNo} not found.");
            var remaining = inst.ScheduledAmount - inst.PaidAmount;
            if (line.Amount > remaining)
                return Error.Business("commitment.overpayment",
                    $"Line {line.LineNo} amount {line.Amount:0.00} exceeds remaining instalment balance {remaining:0.00} on {cm.Code} #{inst.InstallmentNo}.");
        }

        var qhLines = e.Lines.Where(l => l.QarzanHasanaLoanId.HasValue && l.QarzanHasanaInstallmentId.HasValue).ToList();
        var qhIds = qhLines.Select(l => l.QarzanHasanaLoanId!.Value).Distinct().ToList();
        var loans = qhIds.Count == 0
            ? new Dictionary<Guid, QarzanHasanaLoan>()
            : (await db.QarzanHasanaLoans.Include(l => l.Installments)
                .Where(l => qhIds.Contains(l.Id))
                .ToListAsync(ct))
                .ToDictionary(l => l.Id);
        foreach (var line in qhLines)
        {
            if (!loans.TryGetValue(line.QarzanHasanaLoanId!.Value, out var loan))
                return Error.NotFound("qh.not_found", $"Loan for line {line.LineNo} not found.");
            var inst = loan.Installments.FirstOrDefault(i => i.Id == line.QarzanHasanaInstallmentId);
            if (inst is null)
                return Error.NotFound("qh.installment_not_found", $"Installment for line {line.LineNo} not found.");
            var remaining = inst.ScheduledAmount - inst.PaidAmount;
            if (line.Amount > remaining)
                return Error.Business("qh.overpayment",
                    $"Line {line.LineNo} amount {line.Amount:0.00} exceeds remaining instalment balance {remaining:0.00} on {loan.Code} #{inst.InstallmentNo}.");
        }

        // Apply commitment + QH allocations now that we've re-validated.
        foreach (var line in commitmentLines)
        {
            var cm = commitments[line.CommitmentId!.Value];
            _ = cm.RecordPaymentOnInstallment(line.CommitmentInstallmentId!.Value, line.Amount, e.ReceiptDate);
            db.Commitments.Update(cm);
        }
        foreach (var line in qhLines)
        {
            var loan = loans[line.QarzanHasanaLoanId!.Value];
            _ = loan.RecordRepayment(line.QarzanHasanaInstallmentId!.Value, line.Amount, e.ReceiptDate);
            db.QarzanHasanaLoans.Update(loan);
        }

        var (seriesId, number) = await numbering.NextAsync(NumberingScope.Receipt, null, e.ReceiptDate.Year, ct);
        e.Confirm(number, period.Id, seriesId, currentUser.UserId ?? Guid.Empty, currentUser.UserName ?? "system", clock.UtcNow);
        repo.Update(e);
        await posting.PostReceiptAsync(e, ct);
        await uow.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        // Now that approval cleared and the GL is posted, tell the contributor.
        var member = await db.Members.AsNoTracking().FirstOrDefaultAsync(m => m.Id == e.MemberId, ct);
        if (member is not null) await NotifyReceiptConfirmedAsync(e, member, ct);

        var fresh = await repo.GetWithLinesAsync(e.Id, ct);
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

    public async Task<Result<ReceiptDto>> ReturnContributionAsync(Guid receiptId, ReturnContributionDto dto, bool maturityOverride, CancellationToken ct = default)
    {
        var e = await repo.GetWithLinesAsync(receiptId, ct);
        if (e is null) return Error.NotFound("receipt.not_found", "Receipt not found.");

        // Pre-flight checks - all of these are also enforced server-side at the GL level (the
        // posting will throw if accounts don't balance), but we surface friendly errors first
        // so the cashier sees a useful message rather than a 500.
        if (e.Status != ReceiptStatus.Confirmed)
            return Error.Business("receipt.not_confirmed", "Only confirmed receipts can have a return processed against them.");
        if (!e.IsReturnable)
            return Error.Business("receipt.not_returnable", "This receipt is a permanent contribution; it cannot be returned. Use Reverse if it was recorded in error.");
        if (dto.Amount <= 0)
            return Error.Validation("return.amount_invalid", "Return amount must be positive.");
        if (dto.Amount > e.AmountReturnable)
            return Error.Business("return.amount_exceeds",
                $"Return amount {dto.Amount:0.00} exceeds remaining returnable balance {e.AmountReturnable:0.00}.");
        var today = clock.Today;
        if (!e.IsMatured(today) && !maturityOverride)
            return Error.Business("return.not_matured",
                $"Receipt is not yet matured (matures on {e.MaturityDate:yyyy-MM-dd}). An admin with maturity-override permission must process the return early, or wait until maturity.");
        if (dto.PaymentMode == PaymentMode.Cash && dto.BankAccountId is not null)
            return Error.Validation("return.cash_no_bank", "Cash payments must not specify a bank account.");
        if (dto.PaymentMode != PaymentMode.Cash && dto.BankAccountId is null)
            return Error.Validation("return.bank_required", "A bank account is required for non-cash returns.");

        var period = await ResolvePeriodAsync(dto.ReturnDate, ct);
        if (period is null)
            return Error.Business("period.not_open", "No open financial period covers the return date.");

        var db = services.GetRequiredService<Application.Persistence.JamaatDbContextFacade>();
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        // Build the voucher document (no lines - this is a contribution-return, not an expense).
        var voucher = Voucher.CreateContributionReturn(
            id: Guid.NewGuid(),
            tenantId: tenant.TenantId,
            sourceReceiptId: e.Id,
            voucherDate: dto.ReturnDate,
            payTo: e.MemberNameSnapshot,
            currency: e.Currency,
            amount: dto.Amount);
        voucher.SetHeader(e.MemberNameSnapshot, e.ItsNumberSnapshot, $"Return of contribution receipt {e.ReceiptNumber}");
        voucher.SetPayment(dto.PaymentMode, dto.BankAccountId, dto.ChequeNumber, dto.ChequeDate, drawnOnBank: null, paymentDate: dto.ReturnDate);
        if (!string.IsNullOrWhiteSpace(dto.Reason)) voucher.SetRemarks(dto.Reason);

        var conversion = await fx.ConvertToBaseAsync(voucher.AmountTotal, voucher.Currency, voucher.VoucherDate, ct);
        voucher.ApplyFxConversion(conversion.BaseCurrency, conversion.Rate, conversion.BaseAmount);
        voucher.Submit(requiresApproval: false);

        // Allocate a voucher number + financial period, then post the GL.
        var (seriesId, voucherNumber) = await numbering.NextAsync(NumberingScope.Voucher, null, dto.ReturnDate.Year, ct);
        voucher.MarkPaid(voucherNumber, period.Id, seriesId, currentUser.UserId ?? Guid.Empty, currentUser.UserName ?? "system", clock.UtcNow);
        db.Vouchers.Add(voucher);

        await posting.PostContributionReturnAsync(voucher, e, ct);

        // Receipt's running total moves up by the amount we just returned. This is the field
        // the report and PDF read to show "returned to date" + "outstanding".
        e.RecordReturn(dto.Amount);
        e.RefreshMaturityState(clock.Today);
        repo.Update(e);

        await uow.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        // Notify the contributor that their money is on its way back.
        var member = await db.Members.AsNoTracking().FirstOrDefaultAsync(m => m.Id == e.MemberId, ct);
        if (member is not null) await NotifyContributionReturnedAsync(e, member, dto.Amount, voucher.VoucherNumber, ct);

        var fresh = await repo.GetWithLinesAsync(e.Id, ct);
        return await MapAsync(fresh!, ct);
    }

    public async Task<Result<ReceiptDto>> SetAgreementDocumentUrlAsync(Guid receiptId, string? url, CancellationToken ct = default)
    {
        var e = await repo.GetByIdAsync(receiptId, ct);
        if (e is null) return Error.NotFound("receipt.not_found", "Receipt not found.");
        if (!e.IsReturnable && !string.IsNullOrEmpty(url))
            return Error.Business("receipt.not_returnable",
                "Agreement documents only attach to returnable receipts. Permanent contributions don't carry a return obligation.");
        e.SetAgreementDocumentUrl(url);
        repo.Update(e);
        await uow.SaveChangesAsync(ct);
        var fresh = await repo.GetWithLinesAsync(e.Id, ct);
        return await MapAsync(fresh!, ct);
    }

    // ---- Notification helpers --------------------------------------------------------------
    // Subject lines look up the per-fund TransactionLabel (Contribution / ContributionReturn)
    // so admin-configurable wording flows through to email subjects + the audit log. The body
    // is plain text - templating engines and HTML can come later.

    private async Task NotifyReceiptConfirmedAsync(Receipt receipt, Member member, CancellationToken ct)
    {
        var subjectPrefix = await ResolveLabelAsync(receipt, TransactionLabelType.Contribution, ct) ?? "Receipt";
        var subject = $"{subjectPrefix} - {receipt.ReceiptNumber} - {receipt.Currency} {receipt.AmountTotal:0.00}";
        var body = $@"Dear {member.FullName},

Thank you. We've recorded your contribution.

Receipt #     : {receipt.ReceiptNumber}
Date          : {receipt.ReceiptDate:dd MMM yyyy}
Amount        : {receipt.Currency} {receipt.AmountTotal:0.00}
Payment mode  : {receipt.PaymentMode}
Type          : {(receipt.IsReturnable ? "Returnable contribution" : "Permanent contribution")}

You can view the full receipt in your member portal.

Jamaat";
        await notifications.SendAsync(new NotificationMessage(
            Kind: NotificationKind.ReceiptConfirmed,
            Subject: subject, Body: body,
            RecipientEmail: member.Email,
            RecipientUserId: null,
            SourceId: receipt.Id,
            SourceReference: receipt.ReceiptNumber), ct);
    }

    private async Task NotifyReceiptPendingApprovalAsync(Receipt receipt, Member member, CancellationToken ct)
    {
        var subjectPrefix = await ResolveLabelAsync(receipt, TransactionLabelType.Contribution, ct) ?? "Receipt";
        // No recipient email here - we don't have a "pending-approvals distribution list" yet,
        // so the row goes to NotificationLog only. The dashboard tile already surfaces the
        // count, so approvers see the queue without depending on email.
        var subject = $"[Pending approval] {subjectPrefix} from {member.FullName}";
        var body = $@"A receipt is awaiting approval.

Member       : {member.FullName} (ITS {member.ItsNumber.Value})
Date         : {receipt.ReceiptDate:dd MMM yyyy}
Amount       : {receipt.Currency} {receipt.AmountTotal:0.00}
Payment mode : {receipt.PaymentMode}

Open the dashboard to review and approve.";
        await notifications.SendAsync(new NotificationMessage(
            Kind: NotificationKind.ReceiptPendingApproval,
            Subject: subject, Body: body,
            RecipientEmail: null,
            RecipientUserId: null,
            SourceId: receipt.Id,
            SourceReference: null), ct);
    }

    private async Task NotifyContributionReturnedAsync(Receipt receipt, Member member, decimal amount, string? voucherNumber, CancellationToken ct)
    {
        var subjectPrefix = await ResolveLabelAsync(receipt, TransactionLabelType.ContributionReturn, ct) ?? "Contribution return";
        var subject = $"{subjectPrefix} - {voucherNumber ?? receipt.ReceiptNumber} - {receipt.Currency} {amount:0.00}";
        var body = $@"Dear {member.FullName},

Your returnable contribution receipt {receipt.ReceiptNumber} has been processed for return.

Voucher #    : {voucherNumber ?? "-"}
Amount       : {receipt.Currency} {amount:0.00}
Returned to  : {(receipt.AmountReturned >= receipt.AmountTotal ? "fully" : "partially")} returned ({receipt.Currency} {receipt.AmountReturned:0.00} of {receipt.AmountTotal:0.00})

If you have questions, please reach out to the Jamaat office.

Jamaat";
        await notifications.SendAsync(new NotificationMessage(
            Kind: NotificationKind.ContributionReturned,
            Subject: subject, Body: body,
            RecipientEmail: member.Email,
            RecipientUserId: null,
            SourceId: receipt.Id,
            SourceReference: voucherNumber ?? receipt.ReceiptNumber), ct);
    }

    /// <summary>Resolve the TransactionLabel for the given type, scoped to the receipt's
    /// first-line fund. Per-fund label > system-wide label > null fallback.</summary>
    private async Task<string?> ResolveLabelAsync(Receipt receipt, TransactionLabelType labelType, CancellationToken ct)
    {
        var db = services.GetRequiredService<Application.Persistence.JamaatDbContextFacade>();
        var firstLineFundId = receipt.Lines.OrderBy(l => l.LineNo).FirstOrDefault()?.FundTypeId;
        if (firstLineFundId is Guid fid)
        {
            var perFund = await db.TransactionLabels.AsNoTracking()
                .Where(t => t.FundTypeId == fid && t.LabelType == labelType && t.IsActive)
                .Select(t => t.Label).FirstOrDefaultAsync(ct);
            if (perFund is not null) return perFund;
        }
        return await db.TransactionLabels.AsNoTracking()
            .Where(t => t.FundTypeId == null && t.LabelType == labelType && t.IsActive)
            .Select(t => t.Label).FirstOrDefaultAsync(ct);
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

        // Look up the admin-configured TransactionLabel for this receipt so the PDF can show
        // a fund-specific title (e.g. "Mohammedi Contribution" for SABEEL fund) instead of the
        // generic "Donation receipt". Resolution order: per-fund label, system-wide label,
        // built-in fallback - matches the spec's documented hierarchy.
        var firstLineFundId = e.Lines.OrderBy(l => l.LineNo).FirstOrDefault()?.FundTypeId;
        var labelType = e.IsReturnable ? TransactionLabelType.Contribution : TransactionLabelType.Contribution;
        var db = services.GetRequiredService<Application.Persistence.JamaatDbContextFacade>();
        var perFund = firstLineFundId is Guid fid
            ? await db.TransactionLabels.AsNoTracking()
                .Where(t => t.FundTypeId == fid && t.LabelType == labelType && t.IsActive)
                .Select(t => t.Label).FirstOrDefaultAsync(ct)
            : null;
        var systemLabel = perFund is null
            ? await db.TransactionLabels.AsNoTracking()
                .Where(t => t.FundTypeId == null && t.LabelType == labelType && t.IsActive)
                .Select(t => t.Label).FirstOrDefaultAsync(ct)
            : null;
        var documentTitle = perFund ?? systemLabel; // null = renderer uses its built-in default

        var bytes = renderer.Render(dto.Value!, reprint, documentTitle);
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
            e.Intention, e.NiyyathNote, e.MaturityDate, e.AgreementReference, e.AmountReturned, e.MaturityState, e.AgreementDocumentUrl);
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
    /// <param name="documentTitle">The header subtitle to print under "JAMAAT". Allows
    /// per-fund admin-configured labels (e.g. "Mohammedi Contribution") to override the
    /// built-in default. When null, the renderer falls back to "Returnable contribution
    /// receipt" / "Donation receipt" based on the receipt's intention.</param>
    byte[] Render(ReceiptDto receipt, bool reprint, string? documentTitle = null);
}
