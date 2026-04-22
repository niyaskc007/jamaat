using Jamaat.Application.Common;
using Jamaat.Application.NumberingSeries;
using Jamaat.Contracts.NumberingSeries;
using Microsoft.EntityFrameworkCore;
using JmDomain = Jamaat.Domain.Entities;

namespace Jamaat.Infrastructure.Persistence.Repositories;

public sealed class NumberingSeriesRepository(JamaatDbContext db) : INumberingSeriesRepository
{
    public Task<JmDomain.NumberingSeries?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        db.NumberingSeries.FirstOrDefaultAsync(x => x.Id == id, ct);

    public async Task<PagedResult<NumberingSeriesDto>> ListAsync(NumberingSeriesListQuery q, CancellationToken ct = default)
    {
        IQueryable<JmDomain.NumberingSeries> query = db.NumberingSeries.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(x => EF.Functions.Like(x.Name, $"%{s}%") || EF.Functions.Like(x.Prefix, $"%{s}%"));
        }
        if (q.Scope is not null) query = query.Where(x => x.Scope == q.Scope);
        if (q.Active is not null) query = query.Where(x => x.IsActive == q.Active);

        var total = await query.CountAsync(ct);

        var sortDir = string.Equals(q.SortDir, "Desc", StringComparison.OrdinalIgnoreCase) ? SortDirection.Desc : SortDirection.Asc;
        query = (q.SortBy?.ToLowerInvariant(), sortDir) switch
        {
            ("name", SortDirection.Desc) => query.OrderByDescending(x => x.Name),
            ("name", _) => query.OrderBy(x => x.Name),
            ("scope", SortDirection.Desc) => query.OrderByDescending(x => x.Scope),
            ("scope", _) => query.OrderBy(x => x.Scope),
            (_, _) => query.OrderBy(x => x.Scope).ThenBy(x => x.Name),
        };

        var items = await query
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 500))
            .Select(e => new NumberingSeriesDto(
                e.Id, e.Scope, e.Name, e.FundTypeId,
                db.FundTypes.Where(f => f.Id == e.FundTypeId).Select(f => f.NameEnglish).FirstOrDefault(),
                e.Prefix, e.PadLength, e.YearReset, e.CurrentValue, e.CurrentYear, e.IsActive,
                e.Prefix + (e.CurrentValue + 1).ToString()))
            .ToListAsync(ct);

        return new PagedResult<NumberingSeriesDto>(items, total, q.Page, q.PageSize);
    }

    public Task AddAsync(JmDomain.NumberingSeries e, CancellationToken ct = default) => db.NumberingSeries.AddAsync(e, ct).AsTask();
    public void Update(JmDomain.NumberingSeries e) => db.NumberingSeries.Update(e);
}
