using Jamaat.Application.Common;
using Jamaat.Application.Receipts;
using Jamaat.Contracts.Receipts;
using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Infrastructure.Persistence.Repositories;

public sealed class ReceiptRepository(JamaatDbContext db) : IReceiptRepository
{
    public Task<Receipt?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        db.Receipts.FirstOrDefaultAsync(x => x.Id == id, ct);

    public Task<Receipt?> GetWithLinesAsync(Guid id, CancellationToken ct = default) =>
        db.Receipts.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id, ct);

    public async Task<PagedResult<ReceiptListItemDto>> ListAsync(ReceiptListQuery q, CancellationToken ct = default)
    {
        IQueryable<Receipt> query = db.Receipts.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(x =>
                (x.ReceiptNumber != null && EF.Functions.Like(x.ReceiptNumber, $"%{s}%")) ||
                EF.Functions.Like(x.MemberNameSnapshot, $"%{s}%") ||
                EF.Functions.Like(x.ItsNumberSnapshot, $"%{s}%"));
        }
        if (q.Status is not null) query = query.Where(x => x.Status == q.Status);
        if (q.PaymentMode is not null) query = query.Where(x => x.PaymentMode == q.PaymentMode);
        if (q.FromDate is not null) query = query.Where(x => x.ReceiptDate >= q.FromDate);
        if (q.ToDate is not null) query = query.Where(x => x.ReceiptDate <= q.ToDate);
        if (q.MemberId is not null) query = query.Where(x => x.MemberId == q.MemberId);
        if (q.FundTypeId is not null) query = query.Where(x => x.Lines.Any(l => l.FundTypeId == q.FundTypeId));

        var total = await query.CountAsync(ct);

        var sortDir = string.Equals(q.SortDir, "Asc", StringComparison.OrdinalIgnoreCase) ? SortDirection.Asc : SortDirection.Desc;
        query = (q.SortBy?.ToLowerInvariant(), sortDir) switch
        {
            ("receiptnumber", SortDirection.Asc) => query.OrderBy(x => x.ReceiptNumber),
            ("receiptnumber", SortDirection.Desc) => query.OrderByDescending(x => x.ReceiptNumber),
            ("amounttotal", SortDirection.Asc) => query.OrderBy(x => x.AmountTotal),
            ("amounttotal", SortDirection.Desc) => query.OrderByDescending(x => x.AmountTotal),
            ("receiptdate", SortDirection.Asc) => query.OrderBy(x => x.ReceiptDate),
            (_, _) => query.OrderByDescending(x => x.CreatedAtUtc),
        };

        var items = await query
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 500))
            .Select(x => new ReceiptListItemDto(
                x.Id, x.ReceiptNumber, x.ReceiptDate, x.ItsNumberSnapshot, x.MemberNameSnapshot,
                x.AmountTotal, x.Currency, x.PaymentMode, x.Status, x.CreatedAtUtc))
            .ToListAsync(ct);

        return new PagedResult<ReceiptListItemDto>(items, total, q.Page, q.PageSize);
    }

    public Task AddAsync(Receipt e, CancellationToken ct = default) => db.Receipts.AddAsync(e, ct).AsTask();
    public void Update(Receipt e) => db.Receipts.Update(e);
}
