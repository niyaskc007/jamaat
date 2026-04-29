using Jamaat.Application.Common;
using Jamaat.Application.FundTypes;
using Jamaat.Contracts.FundTypes;
using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Infrastructure.Persistence.Repositories;

public sealed class FundTypeRepository(JamaatDbContext db) : IFundTypeRepository
{
    public Task<FundType?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        db.FundTypes.FirstOrDefaultAsync(x => x.Id == id, ct);

    public async Task<bool> CodeExistsAsync(string code, Guid? excludeId, CancellationToken ct = default) =>
        await db.FundTypes.AnyAsync(x => x.Code == code && (excludeId == null || x.Id != excludeId.Value), ct);

    public async Task<PagedResult<FundTypeDto>> ListAsync(FundTypeListQuery q, CancellationToken ct = default)
    {
        IQueryable<FundType> query = db.FundTypes.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(x => EF.Functions.Like(x.NameEnglish, $"%{s}%") || EF.Functions.Like(x.Code, $"%{s}%"));
        }
        if (q.Active is not null) query = query.Where(x => x.IsActive == q.Active);
        if (q.Category is not null) query = query.Where(x => x.Category == q.Category);

        var total = await query.CountAsync(ct);

        var sortDir = string.Equals(q.SortDir, "Desc", StringComparison.OrdinalIgnoreCase) ? SortDirection.Desc : SortDirection.Asc;
        query = (q.SortBy?.ToLowerInvariant(), sortDir) switch
        {
            ("code", SortDirection.Desc) => query.OrderByDescending(x => x.Code),
            ("code", _) => query.OrderBy(x => x.Code),
            ("nameenglish", SortDirection.Desc) => query.OrderByDescending(x => x.NameEnglish),
            ("nameenglish", _) => query.OrderBy(x => x.NameEnglish),
            (_, SortDirection.Desc) => query.OrderByDescending(x => x.CreatedAtUtc),
            _ => query.OrderBy(x => x.NameEnglish),
        };

        var items = await query
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 500))
            .Select(e => new FundTypeDto(
                e.Id, e.Code, e.NameEnglish, e.NameArabic, e.NameHindi, e.NameUrdu, e.Description,
                e.IsActive, e.RequiresItsNumber, e.RequiresPeriodReference,
                e.Category, e.Category == Jamaat.Domain.Enums.FundCategory.Loan,
                (int)e.AllowedPaymentModes,
                e.CreditAccountId,
                db.Accounts.Where(a => a.Id == e.CreditAccountId).Select(a => a.Name).FirstOrDefault(),
                e.DefaultTemplateId, e.RulesJson,
                // Join the new master tables - both nullable, so left-join semantics via subselects.
                e.FundCategoryId,
                db.FundCategories.Where(c => c.Id == e.FundCategoryId).Select(c => c.Code).FirstOrDefault(),
                db.FundCategories.Where(c => c.Id == e.FundCategoryId).Select(c => c.Name).FirstOrDefault(),
                db.FundCategories.Where(c => c.Id == e.FundCategoryId).Select(c => (Jamaat.Domain.Enums.FundCategoryKind?)c.Kind).FirstOrDefault(),
                e.FundSubCategoryId,
                db.FundSubCategories.Where(s => s.Id == e.FundSubCategoryId).Select(s => s.Code).FirstOrDefault(),
                db.FundSubCategories.Where(s => s.Id == e.FundSubCategoryId).Select(s => s.Name).FirstOrDefault(),
                e.IsReturnable, e.RequiresAgreement, e.RequiresMaturityTracking, e.RequiresNiyyath,
                e.EventId,
                db.Events.Where(ev => ev.Id == e.EventId).Select(ev => ev.Name).FirstOrDefault(),
                e.CreatedAtUtc))
            .ToListAsync(ct);

        return new PagedResult<FundTypeDto>(items, total, q.Page, q.PageSize);
    }

    public Task AddAsync(FundType e, CancellationToken ct = default) => db.FundTypes.AddAsync(e, ct).AsTask();
    public void Update(FundType e) => db.FundTypes.Update(e);
}
