using Jamaat.Application.BankAccounts;
using Jamaat.Application.Common;
using Jamaat.Contracts.BankAccounts;
using Jamaat.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Infrastructure.Persistence.Repositories;

public sealed class BankAccountRepository(JamaatDbContext db) : IBankAccountRepository
{
    public Task<BankAccount?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        db.BankAccounts.FirstOrDefaultAsync(x => x.Id == id, ct);

    public Task<bool> AccountNumberExistsAsync(string number, Guid? excludeId, CancellationToken ct = default) =>
        db.BankAccounts.AnyAsync(x => x.AccountNumber == number && (excludeId == null || x.Id != excludeId.Value), ct);

    public async Task<PagedResult<BankAccountDto>> ListAsync(BankAccountListQuery q, CancellationToken ct = default)
    {
        IQueryable<BankAccount> query = db.BankAccounts.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(x => EF.Functions.Like(x.Name, $"%{s}%")
                || EF.Functions.Like(x.BankName, $"%{s}%")
                || EF.Functions.Like(x.AccountNumber, $"%{s}%"));
        }
        if (q.Active is not null) query = query.Where(x => x.IsActive == q.Active);

        var total = await query.CountAsync(ct);

        var sortDir = string.Equals(q.SortDir, "Desc", StringComparison.OrdinalIgnoreCase) ? SortDirection.Desc : SortDirection.Asc;
        query = (q.SortBy?.ToLowerInvariant(), sortDir) switch
        {
            ("name", SortDirection.Desc) => query.OrderByDescending(x => x.Name),
            ("name", _) => query.OrderBy(x => x.Name),
            ("bankname", SortDirection.Desc) => query.OrderByDescending(x => x.BankName),
            ("bankname", _) => query.OrderBy(x => x.BankName),
            (_, _) => query.OrderBy(x => x.Name),
        };

        var items = await query
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 500))
            .Select(e => new BankAccountDto(
                e.Id, e.Name, e.BankName, e.AccountNumber, e.Branch, e.Ifsc, e.SwiftCode, e.Currency,
                e.AccountingAccountId,
                db.Accounts.Where(a => a.Id == e.AccountingAccountId).Select(a => a.Name).FirstOrDefault(),
                e.IsActive))
            .ToListAsync(ct);

        return new PagedResult<BankAccountDto>(items, total, q.Page, q.PageSize);
    }

    public Task AddAsync(BankAccount e, CancellationToken ct = default) => db.BankAccounts.AddAsync(e, ct).AsTask();
    public void Update(BankAccount e) => db.BankAccounts.Update(e);
}
