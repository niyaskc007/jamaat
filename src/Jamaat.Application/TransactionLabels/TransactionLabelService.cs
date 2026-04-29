using Jamaat.Application.Persistence;
using Jamaat.Contracts.TransactionLabels;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Common;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.TransactionLabels;

public interface ITransactionLabelService
{
    Task<IReadOnlyList<TransactionLabelDto>> ListAsync(Guid? fundTypeId, TransactionLabelType? labelType, CancellationToken ct = default);
    /// <summary>Resolve the label string for a (fundType, type) pair: prefers the per-fund label,
    /// falls back to the system-wide override, then to the built-in default.</summary>
    Task<string> ResolveAsync(Guid? fundTypeId, TransactionLabelType labelType, CancellationToken ct = default);
    Task<Result<TransactionLabelDto>> CreateAsync(CreateTransactionLabelDto dto, CancellationToken ct = default);
    Task<Result<TransactionLabelDto>> UpdateAsync(Guid id, UpdateTransactionLabelDto dto, CancellationToken ct = default);
    Task<Result> DeleteAsync(Guid id, CancellationToken ct = default);
}

public sealed class TransactionLabelService(JamaatDbContextFacade db, IUnitOfWork uow, ITenantContext tenant) : ITransactionLabelService
{
    public async Task<IReadOnlyList<TransactionLabelDto>> ListAsync(Guid? fundTypeId, TransactionLabelType? labelType, CancellationToken ct = default)
    {
        var q = db.TransactionLabels.AsNoTracking();
        if (fundTypeId is Guid f) q = q.Where(l => l.FundTypeId == f);
        if (labelType is TransactionLabelType t) q = q.Where(l => l.LabelType == t);
        var items = await q.OrderBy(l => l.LabelType).ThenBy(l => l.Label).ToListAsync(ct);
        // Join fund type name in-memory to keep the query simple (small set).
        var fundIds = items.Where(i => i.FundTypeId.HasValue).Select(i => i.FundTypeId!.Value).Distinct().ToList();
        var fundLookup = await db.FundTypes.AsNoTracking()
            .Where(ft => fundIds.Contains(ft.Id))
            .Select(ft => new { ft.Id, ft.Code, ft.NameEnglish })
            .ToDictionaryAsync(x => x.Id, ct);
        return items.Select(l =>
        {
            var fund = l.FundTypeId.HasValue && fundLookup.TryGetValue(l.FundTypeId.Value, out var f) ? f : null;
            return new TransactionLabelDto(l.Id, l.FundTypeId, fund?.Code, fund?.NameEnglish, l.LabelType, l.Label, l.Notes, l.IsActive, l.CreatedAtUtc);
        }).ToList();
    }

    public async Task<string> ResolveAsync(Guid? fundTypeId, TransactionLabelType labelType, CancellationToken ct = default)
    {
        // Per-fund override wins; otherwise the system-wide one (FundTypeId IS NULL); otherwise default.
        if (fundTypeId is Guid f)
        {
            var perFund = await db.TransactionLabels.AsNoTracking()
                .Where(l => l.IsActive && l.FundTypeId == f && l.LabelType == labelType)
                .Select(l => l.Label)
                .FirstOrDefaultAsync(ct);
            if (perFund is not null) return perFund;
        }
        var systemWide = await db.TransactionLabels.AsNoTracking()
            .Where(l => l.IsActive && l.FundTypeId == null && l.LabelType == labelType)
            .Select(l => l.Label)
            .FirstOrDefaultAsync(ct);
        return systemWide ?? DefaultLabel(labelType);
    }

    public static string DefaultLabel(TransactionLabelType t) => t switch
    {
        TransactionLabelType.Contribution => "Contribution Approval",
        TransactionLabelType.LoanIssue => "Qarzan Hasana Loan Approval",
        TransactionLabelType.LoanRepayment => "Loan Repayment Approval",
        TransactionLabelType.ContributionReturn => "Contribution Return Approval",
        TransactionLabelType.Refund => "Refund Approval",
        TransactionLabelType.Cancellation => "Cancellation Approval",
        TransactionLabelType.Reversal => "Reversal Approval",
        TransactionLabelType.FundTransfer => "Fund Transfer Approval",
        _ => "Transaction Approval",
    };

    public async Task<Result<TransactionLabelDto>> CreateAsync(CreateTransactionLabelDto dto, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(dto.Label)) return Error.Validation("label.invalid", "Label is required.");
        if (dto.FundTypeId is Guid f && !await db.FundTypes.AnyAsync(ft => ft.Id == f, ct))
            return Error.NotFound("fundtype.not_found", "Fund type not found.");
        if (await db.TransactionLabels.AnyAsync(l => l.FundTypeId == dto.FundTypeId && l.LabelType == dto.LabelType, ct))
            return Error.Conflict("label.duplicate", "A label for this fund type and transaction type already exists.");

        var entity = new TransactionLabel(Guid.NewGuid(), tenant.TenantId, dto.FundTypeId, dto.LabelType, dto.Label);
        entity.Update(dto.Label, dto.Notes, isActive: true);
        db.TransactionLabels.Add(entity);
        await uow.SaveChangesAsync(ct);
        return (await ListAsync(dto.FundTypeId, dto.LabelType, ct)).First(x => x.Id == entity.Id);
    }

    public async Task<Result<TransactionLabelDto>> UpdateAsync(Guid id, UpdateTransactionLabelDto dto, CancellationToken ct = default)
    {
        var entity = await db.TransactionLabels.FirstOrDefaultAsync(l => l.Id == id, ct);
        if (entity is null) return Error.NotFound("label.not_found", "Label not found.");
        entity.Update(dto.Label, dto.Notes, dto.IsActive);
        db.TransactionLabels.Update(entity);
        await uow.SaveChangesAsync(ct);
        return (await ListAsync(entity.FundTypeId, entity.LabelType, ct)).First(x => x.Id == id);
    }

    public async Task<Result> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var entity = await db.TransactionLabels.FirstOrDefaultAsync(l => l.Id == id, ct);
        if (entity is null) return Result.Failure(Error.NotFound("label.not_found", "Label not found."));
        db.TransactionLabels.Remove(entity);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }
}
