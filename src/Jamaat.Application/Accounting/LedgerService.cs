using Jamaat.Application.Common;
using Jamaat.Contracts.Ledger;
using Jamaat.Domain.Common;
using Jamaat.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Application.Accounting;

public sealed class LedgerService(Persistence.JamaatDbContextFacade db) : ILedgerService
{
    public async Task<PagedResult<LedgerEntryDto>> ListAsync(LedgerEntryQuery q, CancellationToken ct = default)
    {
        var query = db.Entries.AsNoTracking().AsQueryable();
        if (q.AccountId is not null) query = query.Where(x => x.AccountId == q.AccountId);
        if (q.FundTypeId is not null) query = query.Where(x => x.FundTypeId == q.FundTypeId);
        if (q.SourceType is not null) query = query.Where(x => x.SourceType == q.SourceType);
        if (q.FromDate is not null) query = query.Where(x => x.PostingDate >= q.FromDate);
        if (q.ToDate is not null) query = query.Where(x => x.PostingDate <= q.ToDate);
        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim();
            query = query.Where(x => EF.Functions.Like(x.SourceReference, $"%{s}%")
                                  || (x.Narration != null && EF.Functions.Like(x.Narration, $"%{s}%")));
        }

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(x => x.PostingDate).ThenBy(x => x.Id)
            .Skip(Math.Max(0, (q.Page - 1) * q.PageSize))
            .Take(Math.Clamp(q.PageSize, 1, 1000))
            .Select(x => new LedgerEntryDto(
                x.Id, x.PostingDate, x.FinancialPeriodId,
                db.Periods.Where(p => p.Id == x.FinancialPeriodId).Select(p => p.Name).FirstOrDefault(),
                x.SourceType, x.SourceId, x.SourceReference, x.LineNo,
                x.AccountId,
                db.Accounts.Where(a => a.Id == x.AccountId).Select(a => a.Code).FirstOrDefault() ?? "",
                db.Accounts.Where(a => a.Id == x.AccountId).Select(a => a.Name).FirstOrDefault() ?? "",
                x.FundTypeId,
                db.Funds.Where(f => f.Id == x.FundTypeId).Select(f => f.NameEnglish).FirstOrDefault(),
                x.Debit, x.Credit, x.Currency, x.Narration, x.ReversalOfEntryId, x.PostedAtUtc))
            .ToListAsync(ct);
        return new PagedResult<LedgerEntryDto>(items, total, q.Page, q.PageSize);
    }

    public async Task<IReadOnlyList<AccountBalanceDto>> BalancesAsync(DateOnly? asOf, CancellationToken ct = default)
    {
        var query = db.Entries.AsNoTracking().AsQueryable();
        if (asOf is not null) query = query.Where(x => x.PostingDate <= asOf);

        var byAccount = await query
            .GroupBy(x => x.AccountId)
            .Select(g => new { AccountId = g.Key, Debit = g.Sum(x => x.Debit), Credit = g.Sum(x => x.Credit) })
            .ToListAsync(ct);

        var accountIds = byAccount.Select(b => b.AccountId).ToList();
        var accounts = await db.Accounts.AsNoTracking()
            .Where(a => accountIds.Contains(a.Id))
            .Select(a => new { a.Id, a.Code, a.Name, a.Type }).ToListAsync(ct);

        return byAccount.Select(b =>
        {
            var a = accounts.First(x => x.Id == b.AccountId);
            // For asset/expense balance = debit - credit; for liability/income/equity/fund = credit - debit
            var balance = (a.Type == Domain.Enums.AccountType.Asset || a.Type == Domain.Enums.AccountType.Expense)
                ? b.Debit - b.Credit
                : b.Credit - b.Debit;
            return new AccountBalanceDto(a.Id, a.Code, a.Name, b.Debit, b.Credit, balance);
        }).OrderBy(x => x.AccountCode).ToList();
    }
}

public sealed class ReportsService(Persistence.JamaatDbContextFacade db) : IReportsService
{
    public async Task<IReadOnlyList<ReportDailyCollectionDto>> DailyCollectionAsync(DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        // EF Core can't translate GroupBy into a record projection here (the currency field
        // is a value-object-backed string). Fetch the narrow projection first, then group in
        // memory — receipt volumes are bounded so this is cheap.
        var raw = await db.Receipts.AsNoTracking()
            .Where(r => r.Status == ReceiptStatus.Confirmed && r.ReceiptDate >= from && r.ReceiptDate <= to)
            .Select(r => new { r.ReceiptDate, r.Currency, r.AmountTotal })
            .ToListAsync(ct);
        return raw
            .GroupBy(r => new { r.ReceiptDate, r.Currency })
            .Select(g => new ReportDailyCollectionDto(g.Key.ReceiptDate, g.Count(), g.Sum(x => x.AmountTotal), g.Key.Currency))
            .OrderBy(x => x.Date)
            .ToList();
    }

    public async Task<IReadOnlyList<ReportFundWiseDto>> FundWiseAsync(DateOnly fromDate, DateOnly toDate, CancellationToken ct = default)
    {
        var lines = await (from r in db.Receipts.AsNoTracking()
                           where r.Status == ReceiptStatus.Confirmed && r.ReceiptDate >= fromDate && r.ReceiptDate <= toDate
                           from l in r.Lines
                           select new { l.FundTypeId, l.Amount }).ToListAsync(ct);

        var funds = await db.Funds.AsNoTracking().Select(f => new { f.Id, f.Code, f.NameEnglish }).ToListAsync(ct);
        return lines.GroupBy(x => x.FundTypeId)
            .Select(g =>
            {
                var f = funds.First(x => x.Id == g.Key);
                return new ReportFundWiseDto(g.Key, f.Code, f.NameEnglish, g.Count(), g.Sum(x => x.Amount));
            })
            .OrderByDescending(x => x.AmountTotal)
            .ToList();
    }

    public async Task<IReadOnlyList<ReportDailyPaymentDto>> DailyPaymentsAsync(DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        // Same GroupBy-translation issue as DailyCollectionAsync — fetch narrow then group in memory.
        var raw = await db.Vouchers.AsNoTracking()
            .Where(v => v.Status == VoucherStatus.Paid && v.VoucherDate >= from && v.VoucherDate <= to)
            .Select(v => new { v.VoucherDate, v.Currency, v.AmountTotal })
            .ToListAsync(ct);
        return raw
            .GroupBy(v => new { v.VoucherDate, v.Currency })
            .Select(g => new ReportDailyPaymentDto(g.Key.VoucherDate, g.Count(), g.Sum(x => x.AmountTotal), g.Key.Currency))
            .OrderBy(x => x.Date)
            .ToList();
    }

    public async Task<IReadOnlyList<ReportCashBookRow>> CashBookAsync(Guid accountId, DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        // Running balance on a single asset account
        var opening = await db.Entries.AsNoTracking()
            .Where(l => l.AccountId == accountId && l.PostingDate < from)
            .Select(l => (decimal?)(l.Debit - l.Credit)).SumAsync(ct) ?? 0;

        var rows = await db.Entries.AsNoTracking()
            .Where(l => l.AccountId == accountId && l.PostingDate >= from && l.PostingDate <= to)
            .OrderBy(l => l.PostingDate).ThenBy(l => l.Id)
            .Select(l => new { l.PostingDate, l.SourceReference, l.Narration, l.Debit, l.Credit })
            .ToListAsync(ct);

        var result = new List<ReportCashBookRow>();
        result.Add(new ReportCashBookRow(from, "Opening balance", "", 0, 0, opening));
        var running = opening;
        foreach (var r in rows)
        {
            running += r.Debit - r.Credit;
            result.Add(new ReportCashBookRow(r.PostingDate, r.SourceReference, r.Narration ?? "", r.Debit, r.Credit, running));
        }
        return result;
    }

    public async Task<IReadOnlyList<ReportMemberContributionRow>> MemberContributionAsync(Guid memberId, DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        // Bind parameters to non-keyword locals so the LINQ query syntax below doesn't
        // collide with the `from` / `to` C# keywords.
        var fromDate = from;
        var toDate = to;

        // Pull confirmed receipt lines for this member in the window, flat-projected so the
        // report can be exported as-is. Sorted desc so most-recent contributions appear first.
        var lines = await (
            from r in db.Receipts.AsNoTracking()
            where r.MemberId == memberId
                && r.Status == ReceiptStatus.Confirmed
                && r.ReceiptDate >= fromDate && r.ReceiptDate <= toDate
            from l in r.Lines
            join f in db.Funds.AsNoTracking() on l.FundTypeId equals f.Id
            orderby r.ReceiptDate descending
            select new
            {
                r.ReceiptDate, r.ReceiptNumber, FundCode = f.Code, FundName = f.NameEnglish,
                l.PeriodReference, l.Purpose, l.Amount, r.Currency,
                BaseAmount = r.AmountTotal == 0 ? 0 : l.Amount * (r.BaseAmountTotal / r.AmountTotal),
                BaseCurrency = r.BaseCurrency,
            }).ToListAsync(ct);

        return lines.Select(x => new ReportMemberContributionRow(
            x.ReceiptDate, x.ReceiptNumber ?? "—", x.FundCode, x.FundName,
            x.PeriodReference, x.Purpose, x.Amount, x.Currency,
            x.BaseAmount, x.BaseCurrency)).ToList();
    }

    public async Task<IReadOnlyList<ReportChequeWiseRow>> ChequeWiseAsync(DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        var fromDate = from;
        var toDate = to;
        // Cheque mode (PaymentMode.Cheque). We include all statuses so reconciliation
        // can cross-reference cancelled/reversed cheques.
        var rows = await (
            from r in db.Receipts.AsNoTracking()
            where r.PaymentMode == PaymentMode.Cheque
                && r.ReceiptDate >= fromDate && r.ReceiptDate <= toDate
            join b in db.BankAccounts.AsNoTracking() on r.BankAccountId equals b.Id into bg
            from b in bg.DefaultIfEmpty()
            orderby r.ReceiptDate descending, r.ReceiptNumber descending
            select new
            {
                r.ReceiptDate, r.ReceiptNumber, ItsNumber = r.ItsNumberSnapshot, r.MemberNameSnapshot,
                r.ChequeNumber, r.ChequeDate, BankAccountName = b != null ? b.Name : null,
                r.AmountTotal, r.Currency, r.Status,
            }).ToListAsync(ct);

        return rows.Select(x => new ReportChequeWiseRow(
            x.ReceiptDate, x.ReceiptNumber, x.ItsNumber, x.MemberNameSnapshot,
            x.ChequeNumber, x.ChequeDate, x.BankAccountName,
            x.AmountTotal, x.Currency, x.Status.ToString())).ToList();
    }
}

public sealed class DashboardService(Persistence.JamaatDbContextFacade db, Domain.Abstractions.IClock clock) : IDashboardService
{
    public async Task<DashboardStatsDto> StatsAsync(CancellationToken ct = default)
    {
        var today = clock.Today;
        var yesterday = today.AddDays(-1);
        var monthStart = new DateOnly(today.Year, today.Month, 1);

        var todayTotal = await db.Receipts.AsNoTracking()
            .Where(r => r.Status == ReceiptStatus.Confirmed && r.ReceiptDate == today)
            .SumAsync(r => (decimal?)r.AmountTotal, ct) ?? 0;
        var todayCount = await db.Receipts.AsNoTracking()
            .Where(r => r.Status == ReceiptStatus.Confirmed && r.ReceiptDate == today)
            .CountAsync(ct);
        var ydayTotal = await db.Receipts.AsNoTracking()
            .Where(r => r.Status == ReceiptStatus.Confirmed && r.ReceiptDate == yesterday)
            .SumAsync(r => (decimal?)r.AmountTotal, ct) ?? 0;
        var ydayCount = await db.Receipts.AsNoTracking()
            .Where(r => r.Status == ReceiptStatus.Confirmed && r.ReceiptDate == yesterday)
            .CountAsync(ct);
        var mtdTotal = await db.Receipts.AsNoTracking()
            .Where(r => r.Status == ReceiptStatus.Confirmed && r.ReceiptDate >= monthStart && r.ReceiptDate <= today)
            .SumAsync(r => (decimal?)r.AmountTotal, ct) ?? 0;
        var members = await db.Members.AsNoTracking().CountAsync(m => m.Status == MemberStatus.Active, ct);
        var pending = await db.Vouchers.AsNoTracking().CountAsync(v => v.Status == VoucherStatus.PendingApproval, ct);
        var syncErrors = await db.ErrorLogs.AsNoTracking().CountAsync(e => e.Status == ErrorStatus.Reported, ct);

        return new DashboardStatsDto(
            todayTotal, todayCount, members, mtdTotal,
            ydayTotal, ydayCount, pending, syncErrors, "INR");
    }

    public async Task<IReadOnlyList<DashboardActivityDto>> RecentActivityAsync(int take, CancellationToken ct = default)
    {
        var receipts = await db.Receipts.AsNoTracking()
            .Where(r => r.Status == ReceiptStatus.Confirmed)
            .OrderByDescending(r => r.ConfirmedAtUtc)
            .Take(take)
            .Select(r => new DashboardActivityDto(
                "Receipt", r.ReceiptNumber ?? "", r.MemberNameSnapshot, r.AmountTotal, r.Currency, r.Status.ToString(), r.ConfirmedAtUtc ?? r.CreatedAtUtc))
            .ToListAsync(ct);
        var vouchers = await db.Vouchers.AsNoTracking()
            .Where(v => v.Status == VoucherStatus.Paid)
            .OrderByDescending(v => v.PaidAtUtc)
            .Take(take)
            .Select(v => new DashboardActivityDto(
                "Voucher", v.VoucherNumber ?? "", v.PayTo, v.AmountTotal, v.Currency, v.Status.ToString(), v.PaidAtUtc ?? v.CreatedAtUtc))
            .ToListAsync(ct);

        return receipts.Concat(vouchers).OrderByDescending(x => x.AtUtc).Take(take).ToList();
    }

    public async Task<IReadOnlyList<DashboardFundSliceDto>> FundSliceAsync(DateOnly fromDate, DateOnly toDate, CancellationToken ct = default)
    {
        var lines = await (from r in db.Receipts.AsNoTracking()
                           where r.Status == ReceiptStatus.Confirmed && r.ReceiptDate >= fromDate && r.ReceiptDate <= toDate
                           from l in r.Lines
                           select new { l.FundTypeId, l.Amount }).ToListAsync(ct);
        var funds = await db.Funds.AsNoTracking().Select(f => new { f.Id, f.Code, f.NameEnglish }).ToListAsync(ct);
        return lines.GroupBy(x => x.FundTypeId)
            .Select(g =>
            {
                var f = funds.First(x => x.Id == g.Key);
                return new DashboardFundSliceDto(g.Key, f.NameEnglish, f.Code, g.Sum(x => x.Amount));
            })
            .OrderByDescending(x => x.Amount)
            .ToList();
    }
}

public sealed class PeriodService(Persistence.JamaatDbContextFacade db, Domain.Abstractions.IUnitOfWork uow,
    Domain.Abstractions.ITenantContext tenant, Domain.Abstractions.ICurrentUser currentUser, Domain.Abstractions.IClock clock) : IPeriodService
{
    public async Task<IReadOnlyList<FinancialPeriodDto>> ListAsync(CancellationToken ct = default) =>
        await db.Periods.AsNoTracking()
            .OrderByDescending(p => p.StartDate)
            .Select(p => new FinancialPeriodDto(p.Id, p.Name, p.StartDate, p.EndDate, p.Status, p.ClosedAtUtc, p.ClosedByUserName))
            .ToListAsync(ct);

    public async Task<Result<FinancialPeriodDto>> CreateAsync(CreateFinancialPeriodDto dto, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(dto.Name)) return Domain.Common.Error.Validation("period.name_required", "Name is required.");
        if (dto.EndDate < dto.StartDate) return Domain.Common.Error.Validation("period.dates", "End date must be on or after start date.");
        var p = new Domain.Entities.FinancialPeriod(Guid.NewGuid(), tenant.TenantId, dto.Name, dto.StartDate, dto.EndDate);
        db.Periods.Add(p);
        await uow.SaveChangesAsync(ct);
        return new FinancialPeriodDto(p.Id, p.Name, p.StartDate, p.EndDate, p.Status, null, null);
    }

    public async Task<Result> CloseAsync(Guid id, CancellationToken ct = default)
    {
        var p = await db.Periods.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (p is null) return Result.Failure(Domain.Common.Error.NotFound("period.not_found", "Period not found."));
        p.Close(currentUser.UserId ?? Guid.Empty, currentUser.UserName ?? "system", clock.UtcNow);
        db.Periods.Update(p);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<Result> ReopenAsync(Guid id, CancellationToken ct = default)
    {
        var p = await db.Periods.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (p is null) return Result.Failure(Domain.Common.Error.NotFound("period.not_found", "Period not found."));
        p.Reopen();
        db.Periods.Update(p);
        await uow.SaveChangesAsync(ct);
        return Result.Success();
    }
}
