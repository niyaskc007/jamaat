using Jamaat.Application.Persistence;
using Jamaat.Application.Receipts;
using Jamaat.Application.Vouchers;
using Jamaat.Contracts.PostDatedCheques;
using Jamaat.Contracts.Receipts;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.PostDatedCheques;

public interface IPostDatedChequeService
{
    Task<IReadOnlyList<PostDatedChequeDto>> ListByCommitmentAsync(Guid commitmentId, CancellationToken ct = default);
    Task<IReadOnlyList<PostDatedChequeDto>> ListAsync(PostDatedChequeStatus? status, CancellationToken ct = default);
    Task<Result<PostDatedChequeDto>> AddAsync(CreatePostDatedChequeDto dto, CancellationToken ct = default);
    Task<Result<PostDatedChequeDto>> MarkDepositedAsync(Guid id, DepositPostDatedChequeDto dto, CancellationToken ct = default);
    Task<Result<PostDatedChequeDto>> MarkClearedAsync(Guid id, ClearPostDatedChequeDto dto, CancellationToken ct = default);
    Task<Result<PostDatedChequeDto>> MarkBouncedAsync(Guid id, BouncePostDatedChequeDto dto, CancellationToken ct = default);
    Task<Result<PostDatedChequeDto>> MarkCancelledAsync(Guid id, CancelPostDatedChequeDto dto, CancellationToken ct = default);
}

public sealed class PostDatedChequeService(
    JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant,
    IReceiptService receipts, IVoucherService vouchers) : IPostDatedChequeService
{
    public Task<IReadOnlyList<PostDatedChequeDto>> ListByCommitmentAsync(Guid commitmentId, CancellationToken ct = default)
        => ListInternalAsync(c => c.CommitmentId == commitmentId, ct);

    public Task<IReadOnlyList<PostDatedChequeDto>> ListAsync(PostDatedChequeStatus? status, CancellationToken ct = default)
        => ListInternalAsync(c => status == null || c.Status == status, ct);

    private async Task<IReadOnlyList<PostDatedChequeDto>> ListInternalAsync(
        System.Linq.Expressions.Expression<Func<PostDatedCheque, bool>> filter, CancellationToken ct)
    {
        var rows = await db.PostDatedCheques.AsNoTracking().Where(filter)
            .OrderBy(c => c.ChequeDate).ThenBy(c => c.CreatedAtUtc)
            .ToListAsync(ct);
        return await ProjectAsync(rows, ct);
    }

    public async Task<Result<PostDatedChequeDto>> AddAsync(CreatePostDatedChequeDto dto, CancellationToken ct = default)
    {
        var commitment = await db.Commitments
            .Include(c => c.Installments)
            .FirstOrDefaultAsync(c => c.Id == dto.CommitmentId, ct);
        if (commitment is null) return Error.NotFound("commitment.not_found", "Commitment not found.");

        if (dto.CommitmentInstallmentId is Guid iid
            && !commitment.Installments.Any(i => i.Id == iid))
            return Error.NotFound("commitment.installment_not_found", "Installment doesn't belong to this commitment.");

        if (string.IsNullOrWhiteSpace(dto.ChequeNumber))
            return Error.Validation("pdc.cheque_number_required", "Cheque number is required.");
        if (dto.Amount <= 0)
            return Error.Validation("pdc.amount_invalid", "Amount must be positive.");

        var memberId = commitment.MemberId
            ?? throw new InvalidOperationException("Commitment has no MemberId - PDC requires a member context.");

        var currency = (dto.Currency ?? commitment.Currency).ToUpperInvariant();
        if (currency != commitment.Currency)
            return Error.Business("pdc.currency_mismatch",
                $"Cheque currency {currency} doesn't match commitment currency {commitment.Currency}.");

        // Check the installment's remaining balance - a PDC for more than the line owes means
        // either a multi-instalment cheque (uncommon) or a typo.
        if (dto.CommitmentInstallmentId is Guid iId)
        {
            var inst = commitment.Installments.First(x => x.Id == iId);
            var remaining = inst.ScheduledAmount - inst.PaidAmount;
            if (dto.Amount > remaining)
                return Error.Business("pdc.amount_exceeds_remaining",
                    $"Cheque amount {dto.Amount:0.00} exceeds remaining installment balance {remaining:0.00}.");
        }

        var pdc = new PostDatedCheque(
            Guid.NewGuid(), tenant.TenantId,
            dto.CommitmentId, dto.CommitmentInstallmentId,
            memberId,
            dto.ChequeNumber, dto.ChequeDate, dto.DrawnOnBank,
            dto.Amount, currency);
        pdc.SetNotes(dto.Notes);
        db.PostDatedCheques.Add(pdc);
        await uow.SaveChangesAsync(ct);
        return (await ProjectAsync(new[] { pdc }, ct)).First();
    }

    public async Task<Result<PostDatedChequeDto>> MarkDepositedAsync(Guid id, DepositPostDatedChequeDto dto, CancellationToken ct = default)
    {
        var pdc = await db.PostDatedCheques.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (pdc is null) return Error.NotFound("pdc.not_found", "Post-dated cheque not found.");
        try { pdc.MarkDeposited(dto.DepositedOn); }
        catch (InvalidOperationException ex) { return Error.Business("pdc.invalid_transition", ex.Message); }
        db.PostDatedCheques.Update(pdc);
        await uow.SaveChangesAsync(ct);
        return (await ProjectAsync(new[] { pdc }, ct)).First();
    }

    public async Task<Result<PostDatedChequeDto>> MarkClearedAsync(Guid id, ClearPostDatedChequeDto dto, CancellationToken ct = default)
    {
        var pdc = await db.PostDatedCheques.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (pdc is null) return Error.NotFound("pdc.not_found", "Post-dated cheque not found.");
        if (pdc.IsTerminal) return Error.Business("pdc.invalid_transition", $"Cheque is already {pdc.Status}.");

        // Polymorphic clearance: every source has a different "what does cleared mean" answer.
        // - Commitment: no source doc exists yet, so we issue a fresh Receipt allocated to the
        //   linked installment (legacy behaviour).
        // - Receipt: the source receipt is already drafted in PendingClearance; finalize it
        //   (allocate, number, post GL).
        // - Voucher: the source voucher is in PendingClearance; finalize it (number, post GL).
        Guid? clearedReceiptId = null;
        switch (pdc.Source)
        {
            case PostDatedChequeSource.Commitment:
            {
                if (pdc.CommitmentInstallmentId is null)
                    return Error.Business("pdc.no_installment", "Link the cheque to an installment before clearing.");
                if (!pdc.CommitmentId.HasValue)
                    return Error.Business("pdc.no_commitment", "Commitment-source cheque is missing CommitmentId.");

                var commitment = await db.Commitments
                    .Include(c => c.Installments)
                    .FirstOrDefaultAsync(c => c.Id == pdc.CommitmentId.Value, ct);
                if (commitment is null) return Error.NotFound("commitment.not_found", "Commitment not found.");

                var memberId = commitment.MemberId
                    ?? throw new InvalidOperationException("Commitment has no member.");
                var receiptDto = new CreateReceiptDto(
                    ReceiptDate: dto.ClearedOn,
                    MemberId: memberId,
                    PaymentMode: PaymentMode.Cheque,
                    BankAccountId: dto.BankAccountId,
                    ChequeNumber: pdc.ChequeNumber,
                    // Use TODAY (not the cheque's printed future date) because this receipt is
                    // being created at clearance time and ChequeDate > today would re-trigger
                    // the future-cheque branch in ReceiptService and infinitely defer.
                    ChequeDate: dto.ClearedOn,
                    PaymentReference: $"PDC {pdc.Id:N}",
                    Remarks: $"Cleared post-dated cheque (drawn on {pdc.DrawnOnBank})",
                    Lines: new[]
                    {
                        new CreateReceiptLineDto(
                            FundTypeId: commitment.FundTypeId,
                            Amount: pdc.Amount,
                            Purpose: $"PDC clear - commitment {commitment.Code}",
                            PeriodReference: null,
                            CommitmentId: pdc.CommitmentId,
                            CommitmentInstallmentId: pdc.CommitmentInstallmentId),
                    },
                    Currency: pdc.Currency,
                    DrawnOnBank: pdc.DrawnOnBank);

                var newReceipt = await receipts.CreateAndConfirmAsync(receiptDto, ct);
                if (!newReceipt.IsSuccess) return newReceipt.Error;
                clearedReceiptId = newReceipt.Value!.Id;
                break;
            }

            case PostDatedChequeSource.Receipt:
            {
                if (!pdc.SourceReceiptId.HasValue)
                    return Error.Business("pdc.no_source_receipt", "Receipt-source cheque is missing SourceReceiptId.");
                var confirmed = await receipts.ConfirmPendingAsync(pdc.SourceReceiptId.Value, dto.ClearedOn, ct);
                if (!confirmed.IsSuccess) return confirmed.Error;
                clearedReceiptId = pdc.SourceReceiptId;
                break;
            }

            case PostDatedChequeSource.Voucher:
            {
                if (!pdc.SourceVoucherId.HasValue)
                    return Error.Business("pdc.no_source_voucher", "Voucher-source cheque is missing SourceVoucherId.");
                var confirmed = await vouchers.ConfirmPendingAsync(pdc.SourceVoucherId.Value, dto.ClearedOn, ct);
                if (!confirmed.IsSuccess) return confirmed.Error;
                // No receipt produced on the voucher path - leave clearedReceiptId null.
                break;
            }
        }

        pdc.MarkCleared(dto.ClearedOn, clearedReceiptId);
        db.PostDatedCheques.Update(pdc);
        await uow.SaveChangesAsync(ct);
        return (await ProjectAsync(new[] { pdc }, ct)).First();
    }

    public async Task<Result<PostDatedChequeDto>> MarkBouncedAsync(Guid id, BouncePostDatedChequeDto dto, CancellationToken ct = default)
    {
        var pdc = await db.PostDatedCheques.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (pdc is null) return Error.NotFound("pdc.not_found", "Post-dated cheque not found.");

        try { pdc.MarkBounced(dto.BouncedOn, dto.Reason); }
        catch (InvalidOperationException ex) { return Error.Business("pdc.invalid_transition", ex.Message); }
        catch (ArgumentException ex) { return Error.Validation("pdc.invalid_input", ex.Message); }

        // Cascade to the source document for Receipt/Voucher PDCs - the source is in
        // PendingClearance and a bounce means cancelling it (no GL impact since none was made).
        // Commitment-source PDCs have no source doc to cascade into.
        var bounceReason = $"Cheque bounced: {dto.Reason}";
        switch (pdc.Source)
        {
            case PostDatedChequeSource.Receipt when pdc.SourceReceiptId.HasValue:
            {
                var cancelled = await receipts.CancelPendingAsync(pdc.SourceReceiptId.Value, bounceReason, ct);
                if (!cancelled.IsSuccess) return cancelled.Error;
                break;
            }
            case PostDatedChequeSource.Voucher when pdc.SourceVoucherId.HasValue:
            {
                var cancelled = await vouchers.CancelPendingAsync(pdc.SourceVoucherId.Value, bounceReason, ct);
                if (!cancelled.IsSuccess) return cancelled.Error;
                break;
            }
        }

        db.PostDatedCheques.Update(pdc);
        await uow.SaveChangesAsync(ct);
        return (await ProjectAsync(new[] { pdc }, ct)).First();
    }

    public async Task<Result<PostDatedChequeDto>> MarkCancelledAsync(Guid id, CancelPostDatedChequeDto dto, CancellationToken ct = default)
    {
        var pdc = await db.PostDatedCheques.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (pdc is null) return Error.NotFound("pdc.not_found", "Post-dated cheque not found.");
        try { pdc.MarkCancelled(dto.CancelledOn, dto.Reason); }
        catch (InvalidOperationException ex) { return Error.Business("pdc.invalid_transition", ex.Message); }
        catch (ArgumentException ex) { return Error.Validation("pdc.invalid_input", ex.Message); }
        db.PostDatedCheques.Update(pdc);
        await uow.SaveChangesAsync(ct);
        return (await ProjectAsync(new[] { pdc }, ct)).First();
    }

    /// <summary>Materialise the rich projection. Polymorphic: gathers extra context per source
    /// (commitment + installment for Commitment-source rows; receipt number for Receipt-source;
    /// voucher number + payee for Voucher-source). One call per related table, regardless of
    /// row count, so the cheques workbench stays cheap to render.</summary>
    private async Task<List<PostDatedChequeDto>> ProjectAsync(IReadOnlyCollection<PostDatedCheque> rows, CancellationToken ct)
    {
        if (rows.Count == 0) return new();

        var commitmentIds = rows.Where(r => r.CommitmentId.HasValue).Select(r => r.CommitmentId!.Value).Distinct().ToList();
        var memberIds = rows.Where(r => r.MemberId.HasValue).Select(r => r.MemberId!.Value).Distinct().ToList();
        var sourceReceiptIds = rows.Where(r => r.SourceReceiptId.HasValue).Select(r => r.SourceReceiptId!.Value).Distinct().ToList();
        var sourceVoucherIds = rows.Where(r => r.SourceVoucherId.HasValue).Select(r => r.SourceVoucherId!.Value).Distinct().ToList();
        // ClearedReceiptId may overlap SourceReceiptId for Receipt-source PDCs that have cleared
        // (because the same receipt is the source AND the cleared one) - dedupe to keep the lookup small.
        var clearedReceiptIds = rows.Where(r => r.ClearedReceiptId.HasValue).Select(r => r.ClearedReceiptId!.Value).Distinct().ToList();
        var allReceiptIds = sourceReceiptIds.Union(clearedReceiptIds).ToList();

        var commitments = commitmentIds.Count == 0 ? new List<CommitmentProjection>() :
            await db.Commitments.AsNoTracking()
                .Where(c => commitmentIds.Contains(c.Id))
                .Include(c => c.Installments)
                .Select(c => new CommitmentProjection(
                    c.Id, c.Code, c.PartyNameSnapshot,
                    c.Installments.Select(i => new InstallmentProjection(i.Id, i.InstallmentNo, i.DueDate)).ToList()))
                .ToListAsync(ct);
        var members = memberIds.Count == 0 ? new Dictionary<Guid, MemberProjection>() :
            await db.Members.AsNoTracking()
                .Where(m => memberIds.Contains(m.Id))
                .Select(m => new MemberProjection(m.Id, m.ItsNumber.Value, m.FullName))
                .ToDictionaryAsync(m => m.Id, ct);
        var receiptInfo = allReceiptIds.Count == 0 ? new Dictionary<Guid, string>() :
            await db.Receipts.AsNoTracking()
                .Where(r => allReceiptIds.Contains(r.Id))
                .ToDictionaryAsync(r => r.Id, r => r.ReceiptNumber ?? "-", ct);
        var voucherInfo = sourceVoucherIds.Count == 0 ? new Dictionary<Guid, VoucherProjection>() :
            await db.Vouchers.AsNoTracking()
                .Where(v => sourceVoucherIds.Contains(v.Id))
                .Select(v => new VoucherProjection(v.Id, v.VoucherNumber ?? "-", v.PayTo))
                .ToDictionaryAsync(v => v.Id, ct);

        return rows.Select(r =>
        {
            var commitment = r.CommitmentId.HasValue ? commitments.FirstOrDefault(c => c.Id == r.CommitmentId.Value) : null;
            var inst = r.CommitmentInstallmentId is Guid iid && commitment is not null
                ? commitment.Installments.FirstOrDefault(i => i.Id == iid) : null;
            var member = r.MemberId.HasValue && members.TryGetValue(r.MemberId.Value, out var m) ? m : null;
            var clearedReceiptNumber = r.ClearedReceiptId is Guid clrId && receiptInfo.TryGetValue(clrId, out var clrNum) ? clrNum : null;
            var sourceReceiptNumber = r.SourceReceiptId is Guid srcRid && receiptInfo.TryGetValue(srcRid, out var srcRnum) ? srcRnum : null;
            var sourceVoucher = r.SourceVoucherId is Guid srcVid && voucherInfo.TryGetValue(srcVid, out var srcV) ? srcV : null;

            return new PostDatedChequeDto(
                r.Id,
                r.Source,
                r.CommitmentId, commitment?.Code, commitment?.PartyNameSnapshot,
                r.CommitmentInstallmentId, inst?.InstallmentNo, inst?.DueDate,
                r.SourceReceiptId, sourceReceiptNumber,
                r.SourceVoucherId, sourceVoucher?.VoucherNumber, sourceVoucher?.PayTo,
                r.MemberId, member?.ItsNumber, member?.FullName,
                r.ChequeNumber, r.ChequeDate, r.DrawnOnBank,
                r.Amount, r.Currency,
                r.Status,
                r.DepositedOn, r.ClearedOn, r.ClearedReceiptId, clearedReceiptNumber,
                r.BouncedOn, r.BounceReason,
                r.CancelledOn, r.CancellationReason,
                r.ReplacedByChequeId,
                r.Notes,
                r.CreatedAtUtc);
        }).ToList();
    }

    private sealed record CommitmentProjection(Guid Id, string Code, string PartyNameSnapshot, List<InstallmentProjection> Installments);
    private sealed record InstallmentProjection(Guid Id, int InstallmentNo, DateOnly DueDate);
    private sealed record MemberProjection(Guid Id, string ItsNumber, string FullName);
    private sealed record VoucherProjection(Guid Id, string VoucherNumber, string PayTo);
}
