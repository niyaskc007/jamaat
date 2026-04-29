using Jamaat.Application.Persistence;
using Jamaat.Application.Receipts;
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
    IReceiptService receipts) : IPostDatedChequeService
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
        if (pdc.CommitmentInstallmentId is null)
            return Error.Business("pdc.no_installment", "Link the cheque to an installment before clearing.");

        // Resolve the commitment's fund type - every receipt line needs it.
        var commitment = await db.Commitments
            .Include(c => c.Installments)
            .FirstOrDefaultAsync(c => c.Id == pdc.CommitmentId, ct);
        if (commitment is null) return Error.NotFound("commitment.not_found", "Commitment not found.");

        // Build the receipt DTO mirroring the cheque + installment context.
        var memberId = commitment.MemberId
            ?? throw new InvalidOperationException("Commitment has no member.");
        var receiptDto = new CreateReceiptDto(
            ReceiptDate: dto.ClearedOn,
            MemberId: memberId,
            PaymentMode: PaymentMode.Cheque,
            BankAccountId: dto.BankAccountId,
            ChequeNumber: pdc.ChequeNumber,
            ChequeDate: pdc.ChequeDate,
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
            Currency: pdc.Currency);

        var result = await receipts.CreateAndConfirmAsync(receiptDto, ct);
        if (!result.IsSuccess) return result.Error;

        pdc.MarkCleared(dto.ClearedOn, result.Value!.Id);
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

    /// <summary>Materialise the rich projection (commitment code, party name, instalment no., etc.).
    /// Called for every read path so the UI doesn't need to fan out.</summary>
    private async Task<List<PostDatedChequeDto>> ProjectAsync(IReadOnlyCollection<PostDatedCheque> rows, CancellationToken ct)
    {
        if (rows.Count == 0) return new();
        var commitmentIds = rows.Select(r => r.CommitmentId).Distinct().ToList();
        var memberIds = rows.Select(r => r.MemberId).Distinct().ToList();
        var receiptIds = rows.Where(r => r.ClearedReceiptId.HasValue).Select(r => r.ClearedReceiptId!.Value).Distinct().ToList();

        var commitments = await db.Commitments.AsNoTracking()
            .Where(c => commitmentIds.Contains(c.Id))
            .Include(c => c.Installments)
            .Select(c => new
            {
                c.Id, c.Code, c.PartyNameSnapshot,
                Installments = c.Installments.Select(i => new { i.Id, i.InstallmentNo, i.DueDate }).ToList(),
            })
            .ToListAsync(ct);
        var members = await db.Members.AsNoTracking()
            .Where(m => memberIds.Contains(m.Id))
            .Select(m => new { m.Id, ItsNumber = m.ItsNumber.Value, m.FullName })
            .ToDictionaryAsync(m => m.Id, ct);
        var receiptNumbers = receiptIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.Receipts.AsNoTracking().Where(r => receiptIds.Contains(r.Id))
                .ToDictionaryAsync(r => r.Id, r => r.ReceiptNumber ?? "-", ct);

        return rows.Select(r =>
        {
            var commitment = commitments.FirstOrDefault(c => c.Id == r.CommitmentId);
            var inst = r.CommitmentInstallmentId is Guid iid
                ? commitment?.Installments.FirstOrDefault(i => i.Id == iid) : null;
            var member = members.TryGetValue(r.MemberId, out var m) ? m : null;
            var receiptNumber = r.ClearedReceiptId is Guid rid && receiptNumbers.TryGetValue(rid, out var rn) ? rn : null;
            return new PostDatedChequeDto(
                r.Id,
                r.CommitmentId, commitment?.Code ?? "-", commitment?.PartyNameSnapshot ?? "-",
                r.CommitmentInstallmentId, inst?.InstallmentNo, inst?.DueDate,
                r.MemberId, member?.ItsNumber ?? "-", member?.FullName ?? "-",
                r.ChequeNumber, r.ChequeDate, r.DrawnOnBank,
                r.Amount, r.Currency,
                r.Status,
                r.DepositedOn, r.ClearedOn, r.ClearedReceiptId, receiptNumber,
                r.BouncedOn, r.BounceReason,
                r.CancelledOn, r.CancellationReason,
                r.ReplacedByChequeId,
                r.Notes,
                r.CreatedAtUtc);
        }).ToList();
    }
}
