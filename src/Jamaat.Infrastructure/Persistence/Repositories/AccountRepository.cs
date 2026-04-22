using Jamaat.Application.Accounts;
using Jamaat.Application.Common;
using Jamaat.Contracts.Accounts;
using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Infrastructure.Persistence.Repositories;

public sealed class AccountRepository(JamaatDbContext db) : IAccountRepository
{
    public Task<Account?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        db.Accounts.FirstOrDefaultAsync(x => x.Id == id, ct);

    public Task<bool> CodeExistsAsync(string code, Guid? excludeId, CancellationToken ct = default) =>
        db.Accounts.AnyAsync(x => x.Code == code && (excludeId == null || x.Id != excludeId.Value), ct);

    public Task<bool> HasChildrenAsync(Guid id, CancellationToken ct = default) =>
        db.Accounts.AnyAsync(x => x.ParentId == id, ct);

    public async Task<PagedResult<AccountDto>> ListAsync(AccountListQuery q, CancellationToken ct = default)
    {
        IQueryable<Account> query = db.Accounts.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(x => EF.Functions.Like(x.Name, $"%{s}%") || EF.Functions.Like(x.Code, $"%{s}%"));
        }
        if (q.Type is not null) query = query.Where(x => x.Type == q.Type);
        if (q.Active is not null) query = query.Where(x => x.IsActive == q.Active);

        var total = await query.CountAsync(ct);

        var sortDir = string.Equals(q.SortDir, "Desc", StringComparison.OrdinalIgnoreCase) ? SortDirection.Desc : SortDirection.Asc;
        query = (q.SortBy?.ToLowerInvariant(), sortDir) switch
        {
            ("name", SortDirection.Desc) => query.OrderByDescending(x => x.Name),
            ("name", _) => query.OrderBy(x => x.Name),
            ("type", SortDirection.Desc) => query.OrderByDescending(x => x.Type),
            ("type", _) => query.OrderBy(x => x.Type),
            (_, _) => query.OrderBy(x => x.Code),
        };

        var items = await query
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 1000))
            .Select(a => new AccountDto(
                a.Id, a.Code, a.Name, a.Type, a.ParentId,
                db.Accounts.Where(p => p.Id == a.ParentId).Select(p => p.Code).FirstOrDefault(),
                a.IsControl, a.IsActive))
            .ToListAsync(ct);

        return new PagedResult<AccountDto>(items, total, q.Page, q.PageSize);
    }

    public Task<List<AccountDto>> AllAsync(CancellationToken ct = default) =>
        db.Accounts.AsNoTracking()
            .Select(a => new AccountDto(a.Id, a.Code, a.Name, a.Type, a.ParentId, null, a.IsControl, a.IsActive))
            .ToListAsync(ct);

    public Task AddAsync(Account e, CancellationToken ct = default) => db.Accounts.AddAsync(e, ct).AsTask();
    public void Update(Account e) => db.Accounts.Update(e);
}
