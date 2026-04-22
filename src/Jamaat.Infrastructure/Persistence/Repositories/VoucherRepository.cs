using Jamaat.Application.Common;
using Jamaat.Application.Vouchers;
using Jamaat.Contracts.Vouchers;
using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Infrastructure.Persistence.Repositories;

public sealed class VoucherRepository(JamaatDbContext db) : IVoucherRepository
{
    public Task<Voucher?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        db.Vouchers.FirstOrDefaultAsync(x => x.Id == id, ct);

    public Task<Voucher?> GetWithLinesAsync(Guid id, CancellationToken ct = default) =>
        db.Vouchers.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id, ct);

    public async Task<PagedResult<VoucherListItemDto>> ListAsync(VoucherListQuery q, CancellationToken ct = default)
    {
        IQueryable<Voucher> query = db.Vouchers.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(x =>
                (x.VoucherNumber != null && EF.Functions.Like(x.VoucherNumber, $"%{s}%")) ||
                EF.Functions.Like(x.PayTo, $"%{s}%") ||
                EF.Functions.Like(x.Purpose, $"%{s}%"));
        }
        if (q.Status is not null) query = query.Where(x => x.Status == q.Status);
        if (q.PaymentMode is not null) query = query.Where(x => x.PaymentMode == q.PaymentMode);
        if (q.FromDate is not null) query = query.Where(x => x.VoucherDate >= q.FromDate);
        if (q.ToDate is not null) query = query.Where(x => x.VoucherDate <= q.ToDate);

        var total = await query.CountAsync(ct);

        var sortDir = string.Equals(q.SortDir, "Asc", StringComparison.OrdinalIgnoreCase) ? SortDirection.Asc : SortDirection.Desc;
        query = (q.SortBy?.ToLowerInvariant(), sortDir) switch
        {
            ("vouchernumber", SortDirection.Asc) => query.OrderBy(x => x.VoucherNumber),
            ("vouchernumber", SortDirection.Desc) => query.OrderByDescending(x => x.VoucherNumber),
            ("amounttotal", SortDirection.Asc) => query.OrderBy(x => x.AmountTotal),
            ("amounttotal", SortDirection.Desc) => query.OrderByDescending(x => x.AmountTotal),
            ("voucherdate", SortDirection.Asc) => query.OrderBy(x => x.VoucherDate),
            (_, _) => query.OrderByDescending(x => x.CreatedAtUtc),
        };

        var items = await query
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 500))
            .Select(x => new VoucherListItemDto(x.Id, x.VoucherNumber, x.VoucherDate, x.PayTo, x.AmountTotal, x.Currency, x.PaymentMode, x.Status, x.CreatedAtUtc))
            .ToListAsync(ct);

        return new PagedResult<VoucherListItemDto>(items, total, q.Page, q.PageSize);
    }

    public Task AddAsync(Voucher e, CancellationToken ct = default) => db.Vouchers.AddAsync(e, ct).AsTask();
    public void Update(Voucher e) => db.Vouchers.Update(e);
}
