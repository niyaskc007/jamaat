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
        if (q.SourceId is not null) query = query.Where(x => x.SourceId == q.SourceId);
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
        // memory - receipt volumes are bounded so this is cheap.
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

    public Task<IReadOnlyList<ReportFundWiseDto>> FundWiseAsync(DateOnly fromDate, DateOnly toDate, CancellationToken ct = default)
        => FundWiseAsync(new ReportFundWiseQuery(fromDate, toDate), ct);

    public async Task<IReadOnlyList<ReportFundWiseDto>> FundWiseAsync(ReportFundWiseQuery q, CancellationToken ct = default)
    {
        // Pre-filter the funds set by event / category before pulling lines, so an event scope
        // doesn't fetch millions of unrelated receipt lines first.
        var fundsQuery = db.Funds.AsNoTracking().AsQueryable();
        if (q.EventId is not null) fundsQuery = fundsQuery.Where(f => f.EventId == q.EventId);
        if (q.FundCategoryId is not null) fundsQuery = fundsQuery.Where(f => f.FundCategoryId == q.FundCategoryId);
        var funds = await fundsQuery.Select(f => new { f.Id, f.Code, f.NameEnglish }).ToListAsync(ct);
        if (funds.Count == 0) return Array.Empty<ReportFundWiseDto>();
        var fundIds = funds.Select(f => f.Id).ToHashSet();

        var lines = await (from r in db.Receipts.AsNoTracking()
                           where r.Status == ReceiptStatus.Confirmed && r.ReceiptDate >= q.From && r.ReceiptDate <= q.To
                           from l in r.Lines
                           where fundIds.Contains(l.FundTypeId)
                           select new { l.FundTypeId, l.Amount, r.PaymentMode }).ToListAsync(ct);

        return lines.GroupBy(x => x.FundTypeId)
            .Select(g =>
            {
                var f = funds.First(x => x.Id == g.Key);
                // Per-mode subtotals so the report column can show how a fund's collections split
                // across cash / cheque / digital. Helps reconciliation against bank statements.
                decimal sumByMode(PaymentMode mode) => g.Where(x => x.PaymentMode == mode).Sum(x => x.Amount);
                return new ReportFundWiseDto(
                    g.Key, f.Code, f.NameEnglish,
                    g.Count(), g.Sum(x => x.Amount),
                    sumByMode(PaymentMode.Cash),
                    sumByMode(PaymentMode.Cheque),
                    sumByMode(PaymentMode.BankTransfer),
                    sumByMode(PaymentMode.Card),
                    sumByMode(PaymentMode.Online),
                    sumByMode(PaymentMode.Upi));
            })
            .OrderByDescending(x => x.AmountTotal)
            .ToList();
    }

    public async Task<IReadOnlyList<ReportDailyPaymentDto>> DailyPaymentsAsync(DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        // Same GroupBy-translation issue as DailyCollectionAsync - fetch narrow then group in memory.
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
            x.ReceiptDate, x.ReceiptNumber ?? "-", x.FundCode, x.FundName,
            x.PeriodReference, x.Purpose, x.Amount, x.Currency,
            x.BaseAmount, x.BaseCurrency)).ToList();
    }

    public async Task<ReportFundBalanceDto> FundBalanceAsync(Guid fundTypeId, CancellationToken ct = default)
    {
        // Total cash received (any status that posted to the ledger - Confirmed only) per
        // intention. We aggregate by line amount because returnable receipts post to a
        // liability account, but the user-facing total is what they put in the cash drawer.
        var fund = await db.Funds.AsNoTracking().FirstOrDefaultAsync(f => f.Id == fundTypeId, ct);
        if (fund is null) throw new InvalidOperationException("Fund type not found.");

        // Pull receipts that touch this fund - any line.FundTypeId == fundTypeId - that are Confirmed.
        var raw = await (from r in db.Receipts.AsNoTracking()
                         where r.Status == ReceiptStatus.Confirmed
                            && r.Lines.Any(l => l.FundTypeId == fundTypeId)
                         from l in r.Lines
                         where l.FundTypeId == fundTypeId
                         select new { r.Id, l.Amount, r.Currency, r.Intention, r.AmountReturned, r.AmountTotal })
                       .ToListAsync(ct);

        // PermanentReceived = sum of Permanent lines for this fund.
        // ReturnableReceived = sum of Returnable lines.
        // AlreadyReturned: pro-rata share of the receipt's AmountReturned that maps to this fund's lines
        //   (most of our returnable receipts are single-line, so this devolves to the simple case).
        var permanentReceived = raw.Where(x => x.Intention == ContributionIntention.Permanent).Sum(x => x.Amount);
        var returnableReceived = raw.Where(x => x.Intention == ContributionIntention.Returnable).Sum(x => x.Amount);
        var alreadyReturned = raw.Where(x => x.Intention == ContributionIntention.Returnable)
            .GroupBy(x => x.Id)
            .Sum(g =>
            {
                var receiptTotal = g.First().AmountTotal;
                var receiptReturned = g.First().AmountReturned;
                var fundShare = g.Sum(x => x.Amount);
                return receiptTotal == 0 ? 0 : Math.Round(receiptReturned * fundShare / receiptTotal, 2, MidpointRounding.AwayFromZero);
            });

        var totalCashReceived = permanentReceived + returnableReceived;
        var outstanding = Math.Max(0m, returnableReceived - alreadyReturned);
        var netFundStrength = totalCashReceived - outstanding;

        var currency = raw.Select(x => x.Currency).FirstOrDefault() ?? "AED";
        var receiptCount = raw.Select(x => x.Id).Distinct().Count();

        return new ReportFundBalanceDto(
            fundTypeId, fund.Code, fund.NameEnglish, currency,
            totalCashReceived, permanentReceived, returnableReceived,
            alreadyReturned, outstanding, netFundStrength, receiptCount);
    }

    public async Task<IReadOnlyList<ReportReturnableContributionRow>> ReturnableContributionsAsync(Guid? fundTypeId, CancellationToken ct = default)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // One row per receipt-line matching a returnable receipt (so admins can see which fund
        // each line went to even when the receipt has multiple). Most returnable receipts are
        // single-line, so this is usually 1:1 with the receipt.
        var rows = await (from r in db.Receipts.AsNoTracking()
                          where r.Status == ReceiptStatus.Confirmed
                             && r.Intention == ContributionIntention.Returnable
                          from l in r.Lines
                          where !fundTypeId.HasValue || l.FundTypeId == fundTypeId.Value
                          join f in db.Funds.AsNoTracking() on l.FundTypeId equals f.Id
                          orderby r.MaturityDate, r.ReceiptDate descending
                          select new
                          {
                              r.Id, r.ReceiptNumber, r.ReceiptDate,
                              r.ItsNumberSnapshot, r.MemberNameSnapshot,
                              FundCode = f.Code, FundName = f.NameEnglish,
                              l.Amount, // line amount within this receipt
                              r.AmountReturned, r.AmountTotal, r.Currency,
                              r.MaturityDate, r.AgreementReference, r.NiyyathNote,
                          }).ToListAsync(ct);

        return rows.Select(x =>
        {
            // Pro-rata: per-line returned share + remaining.
            var fundShareReturned = x.AmountTotal == 0 ? 0m : Math.Round(x.AmountReturned * x.Amount / x.AmountTotal, 2, MidpointRounding.AwayFromZero);
            var remaining = Math.Max(0m, x.Amount - fundShareReturned);
            var matured = !x.MaturityDate.HasValue || today >= x.MaturityDate.Value;
            return new ReportReturnableContributionRow(
                x.Id, x.ReceiptNumber, x.ReceiptDate,
                x.ItsNumberSnapshot, x.MemberNameSnapshot,
                x.FundCode, x.FundName,
                x.Amount, fundShareReturned, remaining, x.Currency,
                x.MaturityDate, matured, x.AgreementReference, x.NiyyathNote);
        }).ToList();
    }

    public async Task<IReadOnlyList<ReportOutstandingLoanRow>> OutstandingLoansAsync(ReportOutstandingLoansQuery q, CancellationToken ct = default)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var query = db.QarzanHasanaLoans.AsNoTracking()
            .Include(l => l.Installments)
            .AsQueryable();
        // Restrict to loans that have actually been disbursed (so AmountOutstanding makes sense)
        // and that still owe money. Cancelled/Closed loans are excluded by default; the Status
        // filter lets the user opt back in for audits.
        if (q.Status is not null)
            query = query.Where(l => l.Status == q.Status.Value);
        else
            query = query.Where(l => l.Status != QarzanHasanaStatus.Completed && l.Status != QarzanHasanaStatus.Cancelled && l.Status != QarzanHasanaStatus.Rejected);
        if (q.MemberId is not null) query = query.Where(l => l.MemberId == q.MemberId);
        var loans = await query.ToListAsync(ct);

        // Lookup members in one query rather than N+1.
        var memberIds = loans.Select(l => l.MemberId).Distinct().ToList();
        var members = memberIds.Count == 0
            ? new Dictionary<Guid, (string ItsNumber, string FullName)>()
            : await db.Members.AsNoTracking().Where(m => memberIds.Contains(m.Id))
                .ToDictionaryAsync(m => m.Id, m => ValueTuple.Create(m.ItsNumber.Value, m.FullName), ct);

        var rows = loans
            .Where(l => l.AmountOutstanding > 0)
            .Select(l =>
            {
                var lastPaid = l.Installments
                    .Where(i => i.LastPaymentDate.HasValue)
                    .OrderByDescending(i => i.LastPaymentDate)
                    .FirstOrDefault()?.LastPaymentDate;
                var overdue = l.Installments.Count(i => i.Status == QarzanHasanaInstallmentStatus.Overdue
                    || (i.Status == QarzanHasanaInstallmentStatus.Pending && i.DueDate < today));
                int? age = l.DisbursedOn is DateOnly d ? today.DayNumber - d.DayNumber : null;
                var (its, name) = members.TryGetValue(l.MemberId, out var m) ? m : ("-", "-");
                return new ReportOutstandingLoanRow(
                    l.Id, l.Code,
                    l.MemberId, its, name,
                    l.AmountDisbursed, l.AmountRepaid, l.AmountOutstanding, l.ProgressPercent,
                    l.Currency,
                    l.DisbursedOn, lastPaid, age,
                    l.Installments.Count, overdue,
                    l.Status);
            })
            .Where(r => q.OverdueOnly != true || r.OverdueInstallments > 0)
            .OrderByDescending(r => r.OverdueInstallments)
            .ThenByDescending(r => r.AmountOutstanding)
            .ToList();
        return rows;
    }

    public async Task<IReadOnlyList<ReportPendingCommitmentRow>> PendingCommitmentsAsync(ReportPendingCommitmentsQuery q, CancellationToken ct = default)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var query = db.Commitments.AsNoTracking()
            .Include(c => c.Installments)
            .AsQueryable();
        // Default: active or paused commitments only - completed/cancelled/draft don't have
        // pending money to chase. Override with explicit Status filter for audit views.
        if (q.Status is not null)
            query = query.Where(c => c.Status == q.Status.Value);
        else
            query = query.Where(c => c.Status == CommitmentStatus.Active || c.Status == CommitmentStatus.Paused);
        if (q.MemberId is not null) query = query.Where(c => c.MemberId == q.MemberId);
        if (q.FamilyId is not null) query = query.Where(c => c.FamilyId == q.FamilyId);
        if (q.FundTypeId is not null) query = query.Where(c => c.FundTypeId == q.FundTypeId);
        var commitments = await query.ToListAsync(ct);

        var memberIds = commitments.Where(c => c.MemberId.HasValue).Select(c => c.MemberId!.Value).Distinct().ToList();
        var members = memberIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.Members.AsNoTracking().Where(m => memberIds.Contains(m.Id))
                .ToDictionaryAsync(m => m.Id, m => m.ItsNumber.Value, ct);
        var familyIds = commitments.Where(c => c.FamilyId.HasValue).Select(c => c.FamilyId!.Value).Distinct().ToList();
        var families = familyIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.Families.AsNoTracking().Where(f => familyIds.Contains(f.Id))
                .ToDictionaryAsync(f => f.Id, f => f.Code, ct);
        var fundIds = commitments.Select(c => c.FundTypeId).Distinct().ToList();
        var funds = fundIds.Count == 0
            ? new Dictionary<Guid, (string Code, string Name)>()
            : await db.Funds.AsNoTracking().Where(f => fundIds.Contains(f.Id))
                .ToDictionaryAsync(f => f.Id, f => ValueTuple.Create(f.Code, f.NameEnglish), ct);

        var rows = commitments
            .Where(c => c.RemainingAmount > 0)
            .Select(c =>
            {
                var paidCount = c.Installments.Count(i => i.Status == InstallmentStatus.Paid || i.Status == InstallmentStatus.Waived);
                var overdueCount = c.Installments.Count(i => i.Status == InstallmentStatus.Overdue
                    || (i.Status == InstallmentStatus.Pending && i.DueDate < today));
                var nextDue = c.Installments
                    .Where(i => i.Status != InstallmentStatus.Paid && i.Status != InstallmentStatus.Waived)
                    .OrderBy(i => i.DueDate)
                    .Select(i => (DateOnly?)i.DueDate)
                    .FirstOrDefault();
                var (fundCode, fundName) = funds.TryGetValue(c.FundTypeId, out var f) ? f : (c.FundNameSnapshot, c.FundNameSnapshot);
                var memberIts = c.MemberId.HasValue && members.TryGetValue(c.MemberId.Value, out var its) ? its : null;
                var familyCode = c.FamilyId.HasValue && families.TryGetValue(c.FamilyId.Value, out var fc) ? fc : null;
                return new ReportPendingCommitmentRow(
                    c.Id, c.Code, c.PartyType,
                    c.MemberId, memberIts, c.FamilyId, familyCode,
                    c.PartyNameSnapshot,
                    c.FundTypeId, fundCode, fundName,
                    c.Currency,
                    c.TotalAmount, c.PaidAmount, c.RemainingAmount, c.ProgressPercent,
                    c.Installments.Count, paidCount, overdueCount,
                    nextDue,
                    c.Status);
            })
            .Where(r => q.OverdueOnly != true || r.OverdueInstallments > 0)
            .OrderByDescending(r => r.OverdueInstallments)
            .ThenBy(r => r.NextDueDate ?? DateOnly.MaxValue)
            .ToList();
        return rows;
    }

    public async Task<IReadOnlyList<ReportOverdueReturnRow>> OverdueReturnsAsync(ReportOverdueReturnsQuery q, CancellationToken ct = default)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        // Returnable receipts past their maturity date that still have outstanding balance.
        // The matured-but-not-returned cohort is the "exit door is open but money hasn't gone
        // out yet" set the cashier should be processing.
        var query = db.Receipts.AsNoTracking()
            .Where(r => r.Status == ReceiptStatus.Confirmed
                && r.Intention == ContributionIntention.Returnable
                && r.MaturityDate.HasValue
                && r.MaturityDate.Value <= today
                && r.AmountReturned < r.AmountTotal);
        if (q.MemberId is not null) query = query.Where(r => r.MemberId == q.MemberId);
        var receipts = await query.OrderBy(r => r.MaturityDate).ToListAsync(ct);
        if (receipts.Count == 0) return Array.Empty<ReportOverdueReturnRow>();

        // For per-line fund attribution we'd need to expand lines, but the report shows ONE
        // row per receipt with the fund of the FIRST line (most returnable receipts are
        // single-line). Multi-line returnables are rare; we accept the simplification.
        var receiptIds = receipts.Select(r => r.Id).ToList();
        var firstLinesRaw = await db.Receipts.AsNoTracking()
            .Where(r => receiptIds.Contains(r.Id))
            .SelectMany(r => r.Lines.OrderBy(l => l.LineNo).Take(1).Select(l => new { ReceiptId = r.Id, l.FundTypeId }))
            .ToListAsync(ct);
        var firstLines = firstLinesRaw.ToDictionary(x => x.ReceiptId, x => x.FundTypeId);

        var fundIds = firstLines.Values.Distinct().ToList();
        var funds = fundIds.Count == 0
            ? new Dictionary<Guid, (string Code, string Name)>()
            : await db.Funds.AsNoTracking().Where(f => fundIds.Contains(f.Id))
                .ToDictionaryAsync(f => f.Id, f => ValueTuple.Create(f.Code, f.NameEnglish), ct);

        var rows = receipts
            .Where(r => firstLines.ContainsKey(r.Id))
            .Where(r => q.FundTypeId is null || firstLines[r.Id] == q.FundTypeId)
            .Select(r =>
            {
                var fundId = firstLines[r.Id];
                var (fundCode, fundName) = funds.TryGetValue(fundId, out var f) ? f : ("-", "-");
                var daysOverdue = today.DayNumber - r.MaturityDate!.Value.DayNumber;
                return new ReportOverdueReturnRow(
                    r.Id, r.ReceiptNumber, r.ReceiptDate,
                    r.MemberId, r.ItsNumberSnapshot, r.MemberNameSnapshot,
                    fundId, fundCode, fundName,
                    r.AmountTotal, r.AmountReturned, r.AmountTotal - r.AmountReturned,
                    r.Currency,
                    r.MaturityDate.Value, daysOverdue,
                    r.AgreementReference, r.NiyyathNote);
            })
            .Where(r => q.MinDaysOverdue is null || r.DaysOverdue >= q.MinDaysOverdue.Value)
            .OrderByDescending(r => r.DaysOverdue)
            .ToList();
        return rows;
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
        var pendingReceipts = await db.Receipts.AsNoTracking().CountAsync(r => r.Status == ReceiptStatus.Draft, ct);
        var syncErrors = await db.ErrorLogs.AsNoTracking().CountAsync(e => e.Status == ErrorStatus.Reported, ct);

        return new DashboardStatsDto(
            todayTotal, todayCount, members, mtdTotal,
            ydayTotal, ydayCount, pending, syncErrors, "INR",
            pendingReceipts);
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

    public async Task<DashboardInsightsDto> InsightsAsync(CancellationToken ct = default)
    {
        var today = clock.Today;
        var trendStart = today.AddDays(-29); // 30-day window inclusive

        // Collection trend - daily totals for the last 30 days. Materialise narrow projection
        // first because EF can't translate the GroupBy + projection back to SQL when the key
        // includes a value-object-backed string.
        var trendRaw = await db.Receipts.AsNoTracking()
            .Where(r => r.Status == ReceiptStatus.Confirmed && r.ReceiptDate >= trendStart && r.ReceiptDate <= today)
            .Select(r => new { r.ReceiptDate, r.AmountTotal })
            .ToListAsync(ct);
        var byDate = trendRaw.GroupBy(x => x.ReceiptDate)
            .ToDictionary(g => g.Key, g => new { Amount = g.Sum(x => x.AmountTotal), Count = g.Count() });
        var trend = new List<DailyCollectionPoint>(30);
        for (var d = trendStart; d <= today; d = d.AddDays(1))
        {
            var hit = byDate.TryGetValue(d, out var v) ? v : null;
            trend.Add(new DailyCollectionPoint(d, hit?.Amount ?? 0m, hit?.Count ?? 0));
        }

        // Outstanding QH loan balance - sum across all non-terminal loans.
        var outstandingLoans = await db.QarzanHasanaLoans.AsNoTracking()
            .Where(l => l.Status != QarzanHasanaStatus.Completed && l.Status != QarzanHasanaStatus.Cancelled && l.Status != QarzanHasanaStatus.Rejected)
            .SumAsync(l => (decimal?)(l.AmountDisbursed - l.AmountRepaid), ct) ?? 0m;

        // Outstanding returnable obligations - confirmed returnable receipts minus what's been returned.
        var outstandingReturnable = await db.Receipts.AsNoTracking()
            .Where(r => r.Status == ReceiptStatus.Confirmed && r.Intention == ContributionIntention.Returnable)
            .SumAsync(r => (decimal?)(r.AmountTotal - r.AmountReturned), ct) ?? 0m;

        // Pending commitment money - active/paused commitments with remaining > 0.
        var pendingCommitments = await db.Commitments.AsNoTracking()
            .Where(c => (c.Status == CommitmentStatus.Active || c.Status == CommitmentStatus.Paused)
                && c.PaidAmount < c.TotalAmount)
            .SumAsync(c => (decimal?)(c.TotalAmount - c.PaidAmount), ct) ?? 0m;

        // Overdue returns - returnable receipts past maturity with non-zero balance.
        var overdueReturns = await db.Receipts.AsNoTracking()
            .Where(r => r.Status == ReceiptStatus.Confirmed
                && r.Intention == ContributionIntention.Returnable
                && r.MaturityDate.HasValue && r.MaturityDate.Value <= today
                && r.AmountReturned < r.AmountTotal)
            .CountAsync(ct);

        // Cheque pipeline - count + amount per status. Drives the bar chart on the dashboard.
        var pdcs = await db.PostDatedCheques.AsNoTracking()
            .GroupBy(p => p.Status)
            .Select(g => new { Status = (int)g.Key, Count = g.Count(), Amount = g.Sum(p => p.Amount) })
            .ToListAsync(ct);
        var statusLabels = new Dictionary<int, string>
        {
            [1] = "Pledged", [2] = "Deposited", [3] = "Cleared", [4] = "Bounced", [5] = "Cancelled",
        };
        var pipeline = pdcs
            .Select(p => new ChequePipelinePoint(p.Status, statusLabels.TryGetValue(p.Status, out var l) ? l : $"#{p.Status}", p.Count, p.Amount))
            .OrderBy(p => p.Status)
            .ToList();

        // Default currency from Tenant or fall back to the most-common receipt currency. Cheap
        // approximation - gets the dashboard rendering even if the base-currency setting is unset.
        var currency = await db.Receipts.AsNoTracking()
            .Where(r => r.Status == ReceiptStatus.Confirmed)
            .GroupBy(r => r.Currency).OrderByDescending(g => g.Count())
            .Select(g => g.Key).FirstOrDefaultAsync(ct) ?? "AED";

        return new DashboardInsightsDto(trend, outstandingLoans, outstandingReturnable, pendingCommitments,
            overdueReturns, pipeline, currency);
    }

    public async Task<IReadOnlyList<IncomeExpensePoint>> IncomeExpenseTrendAsync(int months, CancellationToken ct = default)
    {
        if (months <= 0) months = 12;
        var today = clock.Today;
        var startMonth = today.AddMonths(-(months - 1));
        var startDate = new DateOnly(startMonth.Year, startMonth.Month, 1);

        // Pull just the columns we aggregate, server-side. GroupBy in memory because EF can't
        // translate the Year+Month grouping cleanly across Receipt + Voucher unions.
        var receipts = await db.Receipts.AsNoTracking()
            .Where(r => r.Status == ReceiptStatus.Confirmed && r.ReceiptDate >= startDate)
            .Select(r => new { r.ReceiptDate, r.AmountTotal, r.Currency })
            .ToListAsync(ct);
        var vouchers = await db.Vouchers.AsNoTracking()
            .Where(v => v.Status == VoucherStatus.Paid && v.VoucherDate >= startDate)
            .Select(v => new { Date = v.VoucherDate, v.AmountTotal, v.Currency })
            .ToListAsync(ct);

        var currency = receipts.Select(r => r.Currency).FirstOrDefault()
            ?? vouchers.Select(v => v.Currency).FirstOrDefault()
            ?? "AED";

        var points = new List<IncomeExpensePoint>(months);
        for (int i = 0; i < months; i++)
        {
            var m = startMonth.AddMonths(i);
            var income = receipts.Where(r => r.ReceiptDate.Year == m.Year && r.ReceiptDate.Month == m.Month).Sum(r => r.AmountTotal);
            var expense = vouchers.Where(v => v.Date.Year == m.Year && v.Date.Month == m.Month).Sum(v => v.AmountTotal);
            points.Add(new IncomeExpensePoint(m.Year, m.Month, income, expense, currency));
        }
        return points;
    }

    public async Task<IReadOnlyList<TopContributorPoint>> TopContributorsAsync(int days, int take, CancellationToken ct = default)
    {
        if (days <= 0) days = 30;
        if (take <= 0) take = 5;
        var since = clock.Today.AddDays(-days);

        var rows = await (from r in db.Receipts.AsNoTracking()
                          where r.Status == ReceiptStatus.Confirmed && r.ReceiptDate >= since
                          group r by new { r.MemberId, r.Currency } into g
                          select new
                          {
                              g.Key.MemberId,
                              g.Key.Currency,
                              Amount = g.Sum(x => x.AmountTotal),
                              Count = g.Count(),
                          })
                          .OrderByDescending(x => x.Amount)
                          .Take(take)
                          .ToListAsync(ct);

        var memberIds = rows.Select(r => r.MemberId).Distinct().ToList();
        var members = await db.Members.AsNoTracking()
            .Where(m => memberIds.Contains(m.Id))
            .Select(m => new { m.Id, m.ItsNumber, m.FullName })
            .ToListAsync(ct);

        return rows.Select(r =>
        {
            var m = members.FirstOrDefault(x => x.Id == r.MemberId);
            return new TopContributorPoint(
                r.MemberId,
                m?.ItsNumber.Value ?? "",
                m?.FullName ?? "(unknown)",
                r.Amount, r.Count, r.Currency);
        }).ToList();
    }

    public async Task<IReadOnlyList<OutflowByCategoryPoint>> OutflowByCategoryAsync(int days, int take, CancellationToken ct = default)
    {
        if (days <= 0) days = 30;
        if (take <= 0) take = 5;
        var since = clock.Today.AddDays(-days);

        // Group by Voucher.Purpose - free-text, but in practice users type a small set of repeated
        // strings. Bucket the rest into "Other" so the chart stays readable.
        var rows = await db.Vouchers.AsNoTracking()
            .Where(v => v.Status == VoucherStatus.Paid && v.VoucherDate >= since)
            .Select(v => new { v.Purpose, v.AmountTotal, v.Currency })
            .ToListAsync(ct);

        var currency = rows.Select(r => r.Currency).FirstOrDefault() ?? "AED";

        var grouped = rows
            .GroupBy(r => string.IsNullOrWhiteSpace(r.Purpose) ? "Uncategorized" : r.Purpose.Trim())
            .Select(g => new { Category = g.Key, Amount = g.Sum(x => x.AmountTotal), Count = g.Count() })
            .OrderByDescending(x => x.Amount)
            .ToList();

        var top = grouped.Take(take).ToList();
        var others = grouped.Skip(take).ToList();
        var result = top.Select(g => new OutflowByCategoryPoint(g.Category, g.Amount, g.Count, currency)).ToList();
        if (others.Count > 0)
        {
            result.Add(new OutflowByCategoryPoint("Other", others.Sum(o => o.Amount), others.Sum(o => o.Count), currency));
        }
        return result;
    }

    public async Task<IReadOnlyList<UpcomingChequePoint>> UpcomingChequesAsync(int days, CancellationToken ct = default)
    {
        if (days <= 0) days = 30;
        var today = clock.Today;
        var horizon = today.AddDays(days);

        // "Upcoming" = Pledged or Deposited (not yet cleared/bounced/cancelled). Capped at 50 to
        // keep the calendar list tractable; admins who need more should use the cheques workbench.
        var rows = await (from p in db.PostDatedCheques.AsNoTracking()
                          where (p.Status == PostDatedChequeStatus.Pledged || p.Status == PostDatedChequeStatus.Deposited)
                                && p.ChequeDate >= today && p.ChequeDate <= horizon
                          orderby p.ChequeDate
                          select new
                          {
                              p.Id, p.ChequeNumber, p.ChequeDate, p.Amount, p.Currency, p.MemberId,
                              Status = (int)p.Status,
                          })
                          .Take(50)
                          .ToListAsync(ct);

        // PDC.MemberId is nullable now (Voucher-source PDCs are paid to non-member vendors and
        // carry MemberId=null). Drop the nulls when querying the member-name dictionary, then
        // resolve each row to either the looked-up name, "(non-member payee)", or "(unknown)".
        var memberIds = rows.Where(r => r.MemberId.HasValue).Select(r => r.MemberId!.Value).Distinct().ToList();
        var memberNames = await db.Members.AsNoTracking()
            .Where(m => memberIds.Contains(m.Id))
            .ToDictionaryAsync(m => m.Id, m => m.FullName, ct);

        return rows.Select(r => new UpcomingChequePoint(
            r.Id, r.ChequeNumber, r.ChequeDate, r.Amount,
            r.MemberId.HasValue
                ? memberNames.GetValueOrDefault(r.MemberId.Value, "(unknown)")
                : "(non-member payee)",
            r.Status, r.Currency)).ToList();
    }

    public async Task<QhPortfolioDto> QhPortfolioAsync(CancellationToken ct = default)
    {
        var today = clock.Today;
        var trendStart = new DateOnly(today.Year, today.Month, 1).AddMonths(-11);

        var loans = await db.QarzanHasanaLoans.AsNoTracking()
            .Include(l => l.Installments)
            .ToListAsync(ct);

        var memberIds = loans.Select(l => l.MemberId).Distinct().ToList();
        var members = memberIds.Count == 0
            ? new Dictionary<Guid, (string Its, string Name)>()
            : await db.Members.AsNoTracking().Where(m => memberIds.Contains(m.Id))
                .ToDictionaryAsync(m => m.Id, m => ValueTuple.Create(m.ItsNumber.Value, m.FullName), ct);

        var currency = loans.Select(l => l.Currency).FirstOrDefault() ?? "AED";
        var totalDisbursed = loans.Sum(l => l.AmountDisbursed);
        var totalRepaid = loans.Sum(l => l.AmountRepaid);
        var totalOutstanding = loans.Sum(l => l.AmountOutstanding);

        var statusGroups = loans.GroupBy(l => l.Status)
            .Select(g => new { Status = g.Key, Count = g.Count(), Outstanding = g.Sum(l => l.AmountOutstanding) })
            .ToList();
        var byStatus = statusGroups
            .Select(g => new QhStatusBucket((int)g.Status, g.Status.ToString(), g.Count, g.Outstanding))
            .OrderBy(b => b.Status)
            .ToList();

        int countOf(QarzanHasanaStatus s) => statusGroups.Where(g => g.Status == s).Sum(g => g.Count);
        var activeCount = countOf(QarzanHasanaStatus.Active) + countOf(QarzanHasanaStatus.Disbursed);
        var completedCount = countOf(QarzanHasanaStatus.Completed);
        var defaultedCount = countOf(QarzanHasanaStatus.Defaulted);
        var inApprovalCount = countOf(QarzanHasanaStatus.PendingLevel1) + countOf(QarzanHasanaStatus.PendingLevel2)
            + countOf(QarzanHasanaStatus.Approved) + countOf(QarzanHasanaStatus.Draft);

        var sanctioned = activeCount + completedCount + defaultedCount;
        var defaultRate = sanctioned == 0 ? 0m : Math.Round(defaultedCount * 100m / sanctioned, 2);

        // Repayment trend: per month, sum of AmountDisbursed (by DisbursedOn) and sum of installment
        // PaidAmount (by LastPaymentDate). Walk 12 buckets so the chart always has the same x-axis.
        var trendByMonth = new Dictionary<(int Y, int M), (decimal D, decimal R)>();
        for (var d = trendStart; d <= today; d = d.AddMonths(1))
            trendByMonth[(d.Year, d.Month)] = (0m, 0m);
        foreach (var l in loans.Where(l => l.DisbursedOn.HasValue && l.DisbursedOn.Value >= trendStart))
        {
            var k = (l.DisbursedOn!.Value.Year, l.DisbursedOn.Value.Month);
            if (trendByMonth.TryGetValue(k, out var v)) trendByMonth[k] = (v.D + l.AmountDisbursed, v.R);
        }
        foreach (var inst in loans.SelectMany(l => l.Installments).Where(i => i.LastPaymentDate.HasValue && i.LastPaymentDate.Value >= trendStart))
        {
            var k = (inst.LastPaymentDate!.Value.Year, inst.LastPaymentDate.Value.Month);
            if (trendByMonth.TryGetValue(k, out var v)) trendByMonth[k] = (v.D, v.R + inst.PaidAmount);
        }
        var repaymentTrend = trendByMonth
            .OrderBy(kv => kv.Key.Y).ThenBy(kv => kv.Key.M)
            .Select(kv => new QhMonthlyPoint(kv.Key.Y, kv.Key.M, kv.Value.D, kv.Value.R))
            .ToList();

        var topBorrowers = loans
            .Where(l => l.AmountOutstanding > 0)
            .GroupBy(l => l.MemberId)
            .Select(g =>
            {
                var (its, name) = members.TryGetValue(g.Key, out var m) ? m : ("-", "-");
                return new QhBorrowerRow(g.Key, its, name, g.Sum(l => l.AmountOutstanding), g.Count());
            })
            .OrderByDescending(b => b.Outstanding)
            .Take(5)
            .ToList();

        var horizon = today.AddDays(30);
        var upcoming = loans
            .SelectMany(l => l.Installments
                .Where(i => i.Status != QarzanHasanaInstallmentStatus.Paid && i.Status != QarzanHasanaInstallmentStatus.Waived)
                .Where(i => i.DueDate >= today && i.DueDate <= horizon)
                .Select(i =>
                {
                    var (_, name) = members.TryGetValue(l.MemberId, out var m) ? m : ("-", "-");
                    return new QhUpcomingInstallment(l.Id, l.Code, l.MemberId, name, i.InstallmentNo, i.DueDate, i.RemainingAmount);
                }))
            .OrderBy(u => u.DueDate)
            .Take(20)
            .ToList();

        var disbursedLoans = loans.Where(l => l.AmountDisbursed > 0).ToList();
        var avgLoanSize = disbursedLoans.Count == 0 ? 0m : disbursedLoans.Average(l => l.AmountDisbursed);
        var avgInstallments = disbursedLoans.Count == 0 ? 0
            : (int)Math.Round(disbursedLoans.Average(l => l.Installments.Count == 0 ? l.InstalmentsApproved : l.Installments.Count));
        var goldBacked = loans.Where(l => (l.GoldAmount ?? 0m) > 0m || (l.GoldWeightGrams ?? 0m) > 0m).ToList();
        var goldBackedTotal = goldBacked.Sum(l => l.GoldAmount ?? 0m);
        var goldBackedCount = goldBacked.Count;

        var bySchemeMix = loans.GroupBy(l => l.Scheme)
            .Select(g => new QhStatusBucket((int)g.Key, g.Key.ToString(), g.Count(), g.Sum(l => l.AmountOutstanding)))
            .OrderBy(b => b.Status)
            .ToList();

        var overdueInstallmentsTotal = loans.SelectMany(l => l.Installments).Count(i =>
            i.Status == QarzanHasanaInstallmentStatus.Overdue
            || (i.Status == QarzanHasanaInstallmentStatus.Pending && i.DueDate < today));
        var overduePrincipal = loans.SelectMany(l => l.Installments)
            .Where(i => i.Status == QarzanHasanaInstallmentStatus.Overdue
                || (i.Status == QarzanHasanaInstallmentStatus.Pending && i.DueDate < today))
            .Sum(i => i.RemainingAmount);

        return new QhPortfolioDto(
            currency, loans.Count, activeCount, completedCount, defaultedCount, inApprovalCount,
            totalDisbursed, totalRepaid, totalOutstanding, defaultRate,
            byStatus, repaymentTrend, topBorrowers, upcoming,
            avgLoanSize, avgInstallments, goldBackedTotal, goldBackedCount, bySchemeMix,
            overdueInstallmentsTotal, overduePrincipal);
    }

    public async Task<ReceivablesAgingDto> ReceivablesAgingAsync(CancellationToken ct = default)
    {
        var today = clock.Today;

        // Commitments: open installments past due. We bucket by overdue days; a "current" bucket
        // collects future-due unpaid installments so the user sees the full pipeline.
        var openCommitments = await db.Commitments.AsNoTracking()
            .Include(c => c.Installments)
            .Where(c => c.Status == CommitmentStatus.Active || c.Status == CommitmentStatus.Paused)
            .Where(c => c.PaidAmount < c.TotalAmount)
            .ToListAsync(ct);

        var commitmentMemberIds = openCommitments.Where(c => c.MemberId.HasValue).Select(c => c.MemberId!.Value).Distinct().ToList();
        var commitmentMembers = commitmentMemberIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.Members.AsNoTracking().Where(m => commitmentMemberIds.Contains(m.Id))
                .ToDictionaryAsync(m => m.Id, m => m.FullName, ct);

        var commitmentInstallments = openCommitments
            .SelectMany(c => c.Installments
                .Where(i => i.Status != InstallmentStatus.Paid && i.Status != InstallmentStatus.Waived)
                .Select(i => new
                {
                    Commitment = c,
                    Installment = i,
                    DaysOverdue = today.DayNumber - i.DueDate.DayNumber,
                }))
            .ToList();

        var commitmentsOutstanding = openCommitments.Sum(c => c.RemainingAmount);
        var commitmentsOverdueCount = commitmentInstallments.Count(x => x.DaysOverdue > 0);
        var commitmentBuckets = BuildBuckets(commitmentInstallments.Select(x => (x.DaysOverdue, x.Installment.RemainingAmount)));

        // Returnable receipts: matured but still outstanding. Same bucket math, except we
        // measure overdue from MaturityDate.
        var openReturnables = await db.Receipts.AsNoTracking()
            .Where(r => r.Status == ReceiptStatus.Confirmed
                && r.Intention == ContributionIntention.Returnable
                && r.AmountReturned < r.AmountTotal)
            .Select(r => new
            {
                r.Id,
                r.ReceiptNumber,
                r.MemberNameSnapshot,
                r.AmountTotal,
                r.AmountReturned,
                r.MaturityDate,
            })
            .ToListAsync(ct);

        var returnableRows = openReturnables.Select(r => new
        {
            r.Id,
            r.ReceiptNumber,
            r.MemberNameSnapshot,
            Outstanding = r.AmountTotal - r.AmountReturned,
            r.MaturityDate,
            DaysOverdue = r.MaturityDate.HasValue ? today.DayNumber - r.MaturityDate.Value.DayNumber : -1,
        }).ToList();

        var returnablesOutstanding = returnableRows.Sum(r => r.Outstanding);
        var returnablesOverdueCount = returnableRows.Count(r => r.DaysOverdue > 0);
        var returnableBuckets = BuildBuckets(returnableRows.Select(r => (r.DaysOverdue, r.Outstanding)));

        var pdcAgg = await db.PostDatedCheques.AsNoTracking()
            .Where(p => p.Status == PostDatedChequeStatus.Pledged)
            .GroupBy(p => 1)
            .Select(g => new { Count = g.Count(), Amount = g.Sum(p => p.Amount) })
            .FirstOrDefaultAsync(ct);
        var chequesPledgedCount = pdcAgg?.Count ?? 0;
        var chequesPledgedAmount = pdcAgg?.Amount ?? 0m;

        // Top 10 oldest open obligations across both kinds. Sorted by days-overdue desc so the
        // worst offenders appear first.
        var oldest = new List<OldestObligationRow>();
        oldest.AddRange(commitmentInstallments
            .Where(x => x.DaysOverdue > 0)
            .Select(x =>
            {
                var memberName = x.Commitment.MemberId.HasValue && commitmentMembers.TryGetValue(x.Commitment.MemberId.Value, out var n)
                    ? n : x.Commitment.PartyNameSnapshot;
                return new OldestObligationRow(
                    "Commitment", x.Commitment.Code, memberName ?? "-",
                    x.Installment.DueDate, x.DaysOverdue, x.Installment.RemainingAmount);
            }));
        oldest.AddRange(returnableRows
            .Where(x => x.DaysOverdue > 0 && x.MaturityDate.HasValue)
            .Select(x => new OldestObligationRow(
                "Returnable", x.ReceiptNumber ?? "-", x.MemberNameSnapshot,
                x.MaturityDate!.Value, x.DaysOverdue, x.Outstanding)));
        var oldestTop = oldest.OrderByDescending(o => o.DaysOverdue).Take(10).ToList();

        var currency = openCommitments.Select(c => c.Currency).FirstOrDefault()
            ?? await db.Receipts.AsNoTracking()
                .Where(r => r.Status == ReceiptStatus.Confirmed)
                .GroupBy(r => r.Currency).OrderByDescending(g => g.Count())
                .Select(g => g.Key).FirstOrDefaultAsync(ct) ?? "AED";

        // Cheque pipeline by status. Mirrors what the operations dashboard already shows but
        // contextualised here as part of the receivables picture - cheques are receivables in
        // flight until cleared.
        var pdcGroups = await db.PostDatedCheques.AsNoTracking()
            .GroupBy(p => p.Status)
            .Select(g => new { Status = (int)g.Key, Count = g.Count(), Amount = g.Sum(p => p.Amount) })
            .ToListAsync(ct);
        var pdcLabels = new Dictionary<int, string>
        {
            [1] = "Pledged", [2] = "Deposited", [3] = "Cleared", [4] = "Bounced", [5] = "Cancelled",
        };
        var chequePipeline = pdcGroups
            .Select(p => new ChequePipelinePoint(p.Status, pdcLabels.TryGetValue(p.Status, out var l) ? l : $"#{p.Status}", p.Count, p.Amount))
            .OrderBy(p => p.Status)
            .ToList();

        // Upcoming maturities - returnable receipts maturing in the next 30 days that still
        // have outstanding balance. Counterpart to the overdue list - the "what's about to
        // come due" pipeline.
        var horizon = today.AddDays(30);
        var upcomingMaturities = openReturnables
            .Where(r => r.MaturityDate.HasValue && r.MaturityDate.Value > today && r.MaturityDate.Value <= horizon)
            .Select(r => new UpcomingMaturityRow(
                r.Id, r.ReceiptNumber ?? "-", r.MemberNameSnapshot,
                r.MaturityDate!.Value, r.AmountTotal - r.AmountReturned))
            .OrderBy(r => r.MaturityDate)
            .Take(15)
            .ToList();

        // Commitments by fund. Helps spot which fund's recovery queue is heaviest.
        var commitmentFundIds = openCommitments.Select(c => c.FundTypeId).Distinct().ToList();
        var commitmentFunds = commitmentFundIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.Funds.AsNoTracking().Where(f => commitmentFundIds.Contains(f.Id))
                .ToDictionaryAsync(f => f.Id, f => f.NameEnglish, ct);
        var commitmentsByFund = openCommitments
            .GroupBy(c => c.FundTypeId)
            .Select(g => new NamedCountPoint(
                commitmentFunds.TryGetValue(g.Key, out var n) ? n : g.First().FundNameSnapshot,
                g.Count()))
            .OrderByDescending(p => p.Count)
            .Take(8)
            .ToList();

        return new ReceivablesAgingDto(
            currency,
            commitmentsOutstanding, commitmentsOverdueCount,
            returnablesOutstanding, returnablesOverdueCount,
            chequesPledgedAmount, chequesPledgedCount,
            commitmentBuckets, returnableBuckets, oldestTop,
            chequePipeline, upcomingMaturities, commitmentsByFund);
    }

    private static IReadOnlyList<AgingBucket> BuildBuckets(IEnumerable<(int DaysOverdue, decimal Amount)> rows)
    {
        var buckets = new[]
        {
            (Label: "Current", Min: int.MinValue, Max: 0),
            (Label: "1-30",   Min: 1,             Max: 30),
            (Label: "31-60",  Min: 31,            Max: 60),
            (Label: "61-90",  Min: 61,            Max: 90),
            (Label: "90+",    Min: 91,            Max: int.MaxValue),
        };
        var list = rows.ToList();
        return buckets.Select(b => new AgingBucket(b.Label,
            list.Count(r => r.DaysOverdue >= b.Min && r.DaysOverdue <= b.Max),
            list.Where(r => r.DaysOverdue >= b.Min && r.DaysOverdue <= b.Max).Sum(r => r.Amount))).ToList();
    }

    public async Task<MemberEngagementDto> MemberEngagementAsync(int months, CancellationToken ct = default)
    {
        if (months <= 0) months = 12;
        var today = clock.Today;
        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var yearStart = new DateOnly(today.Year, 1, 1);
        var trendStart = monthStart.AddMonths(-(months - 1));

        var snapshot = await db.Members.AsNoTracking()
            .Select(m => new
            {
                m.Status,
                Verification = m.DataVerificationStatus,
                Created = m.CreatedAtUtc,
                m.Gender,
                m.MaritalStatus,
                m.HajjStatus,
                m.MisaqStatus,
                m.FamilyRole,
                m.SectorId,
                m.DateOfBirth,
            })
            .ToListAsync(ct);

        int countByStatus(MemberStatus s) => snapshot.Count(x => x.Status == s);
        int countByVerif(VerificationStatus v) => snapshot.Count(x => x.Verification == v);

        var trendByMonth = new Dictionary<(int Y, int M), int>();
        for (var d = trendStart; d <= monthStart; d = d.AddMonths(1))
            trendByMonth[(d.Year, d.Month)] = 0;
        foreach (var s in snapshot)
        {
            var key = (s.Created.Year, s.Created.Month);
            if (trendByMonth.TryGetValue(key, out var existing)) trendByMonth[key] = existing + 1;
        }
        var trend = trendByMonth
            .OrderBy(kv => kv.Key.Y).ThenBy(kv => kv.Key.M)
            .Select(kv => new MemberMonthlyPoint(kv.Key.Y, kv.Key.M, kv.Value))
            .ToList();

        var newThisMonth = snapshot.Count(x => x.Created >= monthStart.ToDateTime(TimeOnly.MinValue));
        var newThisYear = snapshot.Count(x => x.Created >= yearStart.ToDateTime(TimeOnly.MinValue));

        var genderSplit = snapshot.GroupBy(x => x.Gender)
            .Select(g => new NamedCountPoint(g.Key.ToString(), g.Count()))
            .OrderByDescending(p => p.Count).ToList();
        var maritalSplit = snapshot.GroupBy(x => x.MaritalStatus)
            .Select(g => new NamedCountPoint(g.Key.ToString(), g.Count()))
            .OrderByDescending(p => p.Count).ToList();
        var hajjSplit = snapshot.GroupBy(x => x.HajjStatus)
            .Select(g => new NamedCountPoint(g.Key.ToString(), g.Count()))
            .OrderByDescending(p => p.Count).ToList();
        var misaqSplit = snapshot.GroupBy(x => x.MisaqStatus)
            .Select(g => new NamedCountPoint(g.Key.ToString(), g.Count()))
            .OrderByDescending(p => p.Count).ToList();

        // Family-role distribution. Use the FamilyRoleLabel domain helper... but the enum
        // shape lives in the domain so we just use .ToString() here. Members with no role
        // captured land in "Unspecified".
        var familyRoleSplit = snapshot
            .GroupBy(x => x.FamilyRole.HasValue ? x.FamilyRole.Value.ToString() : "Unspecified")
            .Select(g => new NamedCountPoint(g.Key, g.Count()))
            .OrderByDescending(p => p.Count)
            .Take(10)
            .ToList();

        // Age brackets. DOB is optional; rows missing DOB go in "Unknown".
        string ageBracket(DateOnly? dob)
        {
            if (!dob.HasValue) return "Unknown";
            var age = today.Year - dob.Value.Year - (today < dob.Value.AddYears(today.Year - dob.Value.Year) ? 1 : 0);
            if (age < 18) return "Under 18";
            if (age < 30) return "18-29";
            if (age < 45) return "30-44";
            if (age < 60) return "45-59";
            return "60+";
        }
        var ageOrder = new[] { "Under 18", "18-29", "30-44", "45-59", "60+", "Unknown" };
        var ageBrackets = snapshot.GroupBy(x => ageBracket(x.DateOfBirth))
            .Select(g => new NamedCountPoint(g.Key, g.Count()))
            .OrderBy(p => Array.IndexOf(ageOrder, p.Label))
            .ToList();

        // Sector split - resolve names in one query rather than N+1.
        var sectorIds = snapshot.Where(x => x.SectorId.HasValue).Select(x => x.SectorId!.Value).Distinct().ToList();
        var sectorNames = sectorIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.Sectors.AsNoTracking().Where(s => sectorIds.Contains(s.Id))
                .ToDictionaryAsync(s => s.Id, s => s.Name, ct);
        var sectorSplit = snapshot
            .GroupBy(x => x.SectorId.HasValue && sectorNames.TryGetValue(x.SectorId.Value, out var n) ? n : "Unassigned")
            .Select(g => new NamedCountPoint(g.Key, g.Count()))
            .OrderByDescending(p => p.Count)
            .ToList();

        return new MemberEngagementDto(
            snapshot.Count,
            countByStatus(MemberStatus.Active),
            countByStatus(MemberStatus.Inactive),
            countByStatus(MemberStatus.Deceased),
            countByStatus(MemberStatus.Suspended),
            countByVerif(VerificationStatus.Verified),
            countByVerif(VerificationStatus.Pending),
            countByVerif(VerificationStatus.NotStarted),
            countByVerif(VerificationStatus.Rejected),
            newThisMonth, newThisYear,
            trend,
            genderSplit, maritalSplit, ageBrackets, hajjSplit, misaqSplit, sectorSplit, familyRoleSplit);
    }

    public async Task<ComplianceDashboardDto> ComplianceAsync(int days = 30, CancellationToken ct = default)
    {
        if (days <= 0) days = 30;
        if (days > 365) days = 365;
        var today = clock.Today;
        var since = today.AddDays(-(days - 1));
        var sinceUtc = since.ToDateTime(TimeOnly.MinValue);

        var auditCount = await db.AuditLogs.AsNoTracking()
            .CountAsync(a => a.AtUtc >= sinceUtc, ct);
        var openErrors = await db.ErrorLogs.AsNoTracking()
            .CountAsync(e => e.Status == ErrorStatus.Reported, ct);
        var pendingChangeRequests = await db.MemberChangeRequests.AsNoTracking()
            .CountAsync(r => r.Status == MemberChangeRequestStatus.Pending, ct);
        var pendingVoucherApprovals = await db.Vouchers.AsNoTracking()
            .CountAsync(v => v.Status == VoucherStatus.PendingApproval, ct);
        var draftReceipts = await db.Receipts.AsNoTracking()
            .CountAsync(r => r.Status == ReceiptStatus.Draft, ct);
        var unverifiedMembers = await db.Members.AsNoTracking()
            .CountAsync(m => m.DataVerificationStatus != VerificationStatus.Verified, ct);

        var openPeriod = await db.Periods.AsNoTracking()
            .Where(p => p.Status == PeriodStatus.Open)
            .OrderByDescending(p => p.StartDate)
            .Select(p => new { p.Name, p.StartDate })
            .FirstOrDefaultAsync(ct);
        int? periodOpenDays = openPeriod is null ? null : Math.Max(0, today.DayNumber - openPeriod.StartDate.DayNumber);

        // Daily audit volume. Materialise narrow then group/fill in memory so the chart has
        // a contiguous x-axis even on quiet days.
        var auditRaw = await db.AuditLogs.AsNoTracking()
            .Where(a => a.AtUtc >= sinceUtc)
            .Select(a => new { a.AtUtc, a.UserName, a.EntityName })
            .ToListAsync(ct);
        var byDate = auditRaw.GroupBy(x => DateOnly.FromDateTime(x.AtUtc.UtcDateTime))
            .ToDictionary(g => g.Key, g => g.Count());
        var auditTrend = new List<DailyCountPoint>(days);
        for (var d = since; d <= today; d = d.AddDays(1))
            auditTrend.Add(new DailyCountPoint(d, byDate.TryGetValue(d, out var c) ? c : 0));

        var topUsers = auditRaw
            .Where(x => !string.IsNullOrWhiteSpace(x.UserName) && x.UserName != "system")
            .GroupBy(x => x.UserName)
            .Select(g => new NamedCountPoint(g.Key, g.Count()))
            .OrderByDescending(p => p.Count)
            .Take(8)
            .ToList();
        var topEntities = auditRaw
            .GroupBy(x => x.EntityName)
            .Select(g => new NamedCountPoint(g.Key, g.Count()))
            .OrderByDescending(p => p.Count)
            .Take(8)
            .ToList();

        var errorBuckets = await db.ErrorLogs.AsNoTracking()
            .Where(e => e.Status == ErrorStatus.Reported)
            .GroupBy(e => e.Severity)
            .Select(g => new { Severity = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        var errorsBySeverity = errorBuckets
            .Select(b => new NamedCountPoint(b.Severity.ToString(), b.Count))
            .OrderByDescending(b => b.Count)
            .ToList();

        var errorBySource = await db.ErrorLogs.AsNoTracking()
            .Where(e => e.Status == ErrorStatus.Reported)
            .GroupBy(e => e.Source)
            .Select(g => new { Source = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        var errorsBySource = errorBySource
            .Select(b => new NamedCountPoint(b.Source.ToString(), b.Count))
            .OrderByDescending(b => b.Count)
            .ToList();

        // Error trend over the same window. Same materialise-then-fill pattern as audits.
        var errorRaw = await db.ErrorLogs.AsNoTracking()
            .Where(e => e.OccurredAtUtc >= sinceUtc)
            .Select(e => e.OccurredAtUtc)
            .ToListAsync(ct);
        var errorByDate = errorRaw.GroupBy(d => DateOnly.FromDateTime(d.UtcDateTime))
            .ToDictionary(g => g.Key, g => g.Count());
        var errorTrend = new List<DailyCountPoint>(days);
        for (var d = since; d <= today; d = d.AddDays(1))
            errorTrend.Add(new DailyCountPoint(d, errorByDate.TryGetValue(d, out var c) ? c : 0));

        var changeReqBuckets = await db.MemberChangeRequests.AsNoTracking()
            .GroupBy(r => r.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        var changeRequestsByStatus = changeReqBuckets
            .Select(b => new NamedCountPoint(b.Status.ToString(), b.Count))
            .OrderBy(b => b.Label)
            .ToList();

        return new ComplianceDashboardDto(
            auditCount, openErrors, pendingChangeRequests, pendingVoucherApprovals,
            draftReceipts, unverifiedMembers,
            openPeriod is not null, openPeriod?.Name, periodOpenDays,
            auditTrend, errorsBySeverity, changeRequestsByStatus,
            topUsers, topEntities, errorTrend, errorsBySource, days);
    }

    // -- Events dashboard ----------------------------------------------------

    public async Task<EventsDashboardDto> EventsAsync(int months = 12, CancellationToken ct = default)
    {
        if (months <= 0) months = 12;
        if (months > 24) months = 24;
        var today = clock.Today;
        var trendStart = new DateOnly(today.Year, today.Month, 1).AddMonths(-(months - 1));
        var trendStartUtc = trendStart.ToDateTime(TimeOnly.MinValue);

        var events = await db.Events.AsNoTracking()
            .Select(e => new { e.Id, e.Slug, e.Name, e.EventDate, e.Category, e.IsActive, e.Capacity })
            .ToListAsync(ct);

        var totalEvents = events.Count;
        var activeEvents = events.Count(e => e.IsActive);
        var upcomingEvents = events.Count(e => e.EventDate >= today && e.IsActive);
        var pastEvents = totalEvents - upcomingEvents;

        var regs = await db.EventRegistrations.AsNoTracking()
            .Select(r => new { r.EventId, r.Status, r.RegisteredAtUtc })
            .ToListAsync(ct);

        var totalRegs = regs.Count;
        var confirmed = regs.Count(r => r.Status == RegistrationStatus.Confirmed);
        var checkedIn = regs.Count(r => r.Status == RegistrationStatus.CheckedIn);
        var cancelled = regs.Count(r => r.Status == RegistrationStatus.Cancelled);
        var thisMonthStartUtc = new DateOnly(today.Year, today.Month, 1).ToDateTime(TimeOnly.MinValue);
        var newThisMonth = regs.Count(r => r.RegisteredAtUtc.UtcDateTime >= thisMonthStartUtc);

        var byEventCount = regs
            .Where(r => r.Status != RegistrationStatus.Cancelled && r.Status != RegistrationStatus.NoShow)
            .GroupBy(r => r.EventId)
            .ToDictionary(g => g.Key, g => g.Count());
        var byEventCheckedIn = regs
            .Where(r => r.Status == RegistrationStatus.CheckedIn)
            .GroupBy(r => r.EventId)
            .ToDictionary(g => g.Key, g => g.Count());

        var avgFill = 0;
        var capped = events.Where(e => e.Capacity is > 0).ToList();
        if (capped.Count > 0)
        {
            decimal fillSum = 0m;
            foreach (var e in capped)
            {
                var regCount = byEventCount.TryGetValue(e.Id, out var c) ? c : 0;
                fillSum += Math.Min(100m, (decimal)regCount * 100m / e.Capacity!.Value);
            }
            avgFill = (int)Math.Round(fillSum / capped.Count);
        }

        var byStatus = regs.GroupBy(r => r.Status)
            .Select(g => new NamedCountPoint(g.Key.ToString(), g.Count()))
            .OrderByDescending(p => p.Count)
            .ToList();

        var byCategory = events.GroupBy(e => e.Category)
            .Select(g => new NamedCountPoint(g.Key.ToString(), g.Count()))
            .OrderByDescending(p => p.Count)
            .ToList();

        var trendBuckets = new Dictionary<(int Y, int M), int>();
        for (var d = trendStart; d <= today; d = d.AddMonths(1))
            trendBuckets[(d.Year, d.Month)] = 0;
        foreach (var r in regs.Where(r => r.RegisteredAtUtc.UtcDateTime >= trendStartUtc))
        {
            var d = DateOnly.FromDateTime(r.RegisteredAtUtc.UtcDateTime);
            var k = (d.Year, d.Month);
            if (trendBuckets.TryGetValue(k, out var c)) trendBuckets[k] = c + 1;
        }
        var trend = trendBuckets
            .OrderBy(kv => kv.Key.Y).ThenBy(kv => kv.Key.M)
            .Select(kv => new MemberMonthlyPoint(kv.Key.Y, kv.Key.M, kv.Value))
            .ToList();

        var topEvents = events
            .OrderByDescending(e => byEventCount.TryGetValue(e.Id, out var c) ? c : 0)
            .ThenByDescending(e => e.EventDate)
            .Take(8)
            .Select(e =>
            {
                var regCount = byEventCount.TryGetValue(e.Id, out var c) ? c : 0;
                var ciCount = byEventCheckedIn.TryGetValue(e.Id, out var ci) ? ci : 0;
                var fill = e.Capacity is > 0
                    ? (int)Math.Round(Math.Min(100m, (decimal)regCount * 100m / e.Capacity.Value))
                    : 0;
                return new TopEventRow(e.Id, e.Slug, e.Name, e.EventDate, regCount, ciCount, e.Capacity, fill);
            })
            .ToList();

        var upcomingList = events
            .Where(e => e.EventDate >= today && e.IsActive)
            .OrderBy(e => e.EventDate)
            .Take(8)
            .Select(e => new UpcomingEventRow(e.Id, e.Slug, e.Name, e.EventDate, e.Category.ToString(),
                byEventCount.TryGetValue(e.Id, out var c) ? c : 0, e.Capacity))
            .ToList();

        return new EventsDashboardDto(
            totalEvents, activeEvents, upcomingEvents, pastEvents,
            totalRegs, confirmed, checkedIn, cancelled, newThisMonth, avgFill,
            byStatus, byCategory, trend, topEvents, upcomingList);
    }

    // -- Cheques portfolio ---------------------------------------------------

    public async Task<ChequesDashboardDto> ChequesAsync(CancellationToken ct = default)
    {
        var today = clock.Today;
        var bouncedSince = today.AddDays(-90);
        var maturityHorizon = today.AddDays(7 * 12);

        var cheques = await db.PostDatedCheques.AsNoTracking()
            .Select(c => new
            {
                c.Id, c.ChequeNumber, c.ChequeDate, c.DrawnOnBank, c.Amount, c.Currency,
                c.Status, c.MemberId, c.DepositedOn, c.BouncedOn, c.BounceReason,
            })
            .ToListAsync(ct);

        var currency = cheques.Select(c => c.Currency).FirstOrDefault() ?? "AED";
        var totalCheques = cheques.Count;

        int countOf(PostDatedChequeStatus s) => cheques.Count(c => c.Status == s);
        decimal sumOf(PostDatedChequeStatus s) => cheques.Where(c => c.Status == s).Sum(c => c.Amount);

        var pledgedCount = countOf(PostDatedChequeStatus.Pledged);
        var depositedCount = countOf(PostDatedChequeStatus.Deposited);
        var clearedCount = countOf(PostDatedChequeStatus.Cleared);
        var bouncedCount = countOf(PostDatedChequeStatus.Bounced);
        var cancelledCount = countOf(PostDatedChequeStatus.Cancelled);

        var pledgedAmount = sumOf(PostDatedChequeStatus.Pledged);
        var depositedAmount = sumOf(PostDatedChequeStatus.Deposited);
        var clearedAmount = sumOf(PostDatedChequeStatus.Cleared);
        var bouncedAmount90d = cheques
            .Where(c => c.Status == PostDatedChequeStatus.Bounced && c.BouncedOn.HasValue && c.BouncedOn.Value >= bouncedSince)
            .Sum(c => c.Amount);

        var overdueDeposits = cheques
            .Where(c => c.Status == PostDatedChequeStatus.Pledged && c.ChequeDate <= today)
            .ToList();
        var overdueDepositCount = overdueDeposits.Count;
        var overdueDepositAmount = overdueDeposits.Sum(c => c.Amount);

        var upcoming = cheques
            .Where(c => (c.Status == PostDatedChequeStatus.Pledged || c.Status == PostDatedChequeStatus.Deposited)
                && c.ChequeDate > today && c.ChequeDate <= maturityHorizon)
            .ToList();

        var statusMix = new[]
        {
            new NamedAmountPoint("Pledged", pledgedCount, pledgedAmount),
            new NamedAmountPoint("Deposited", depositedCount, depositedAmount),
            new NamedAmountPoint("Cleared", clearedCount, clearedAmount),
            new NamedAmountPoint("Bounced", bouncedCount, sumOf(PostDatedChequeStatus.Bounced)),
            new NamedAmountPoint("Cancelled", cancelledCount, sumOf(PostDatedChequeStatus.Cancelled)),
        }.Where(p => p.Count > 0).ToList();

        var byBank = cheques
            .GroupBy(c => string.IsNullOrWhiteSpace(c.DrawnOnBank) ? "(Unknown)" : c.DrawnOnBank.Trim())
            .Select(g => new NamedAmountPoint(g.Key, g.Count(), g.Sum(c => c.Amount)))
            .OrderByDescending(p => p.Count)
            .Take(8)
            .ToList();

        // Maturity timeline: 12 weeks ahead, weekly buckets keyed by Monday of each ISO week.
        var dow = (int)today.DayOfWeek;
        var mondayOffset = dow == 0 ? -6 : 1 - dow;
        var weekStart = today.AddDays(mondayOffset);
        var timeline = new List<MaturityWeekPoint>();
        for (var w = weekStart; w < weekStart.AddDays(7 * 12); w = w.AddDays(7))
        {
            var weekEnd = w.AddDays(7);
            var weekCheques = upcoming.Where(c => c.ChequeDate >= w && c.ChequeDate < weekEnd).ToList();
            timeline.Add(new MaturityWeekPoint(w, weekCheques.Count, weekCheques.Sum(c => c.Amount)));
        }

        var memberIds = cheques.Where(c => c.MemberId.HasValue).Select(c => c.MemberId!.Value).Distinct().ToList();
        var members = memberIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.Members.AsNoTracking().Where(m => memberIds.Contains(m.Id))
                .ToDictionaryAsync(m => m.Id, m => m.FullName, ct);

        var recentBounces = cheques
            .Where(c => c.Status == PostDatedChequeStatus.Bounced && c.BouncedOn.HasValue)
            .OrderByDescending(c => c.BouncedOn)
            .Take(8)
            .Select(c => new RecentBounceRow(c.Id, c.ChequeNumber,
                c.MemberId.HasValue && members.TryGetValue(c.MemberId.Value, out var n) ? n : "(non-member)",
                c.DrawnOnBank, c.Amount, c.BouncedOn!.Value, c.BounceReason))
            .ToList();

        var topPledgers = cheques
            .Where(c => c.MemberId.HasValue)
            .GroupBy(c => c.MemberId!.Value)
            .Select(g => new TopPledgerRow(g.Key,
                members.TryGetValue(g.Key, out var n) ? n : "(member)",
                g.Count(), g.Sum(c => c.Amount)))
            .OrderByDescending(r => r.TotalAmount)
            .Take(8)
            .ToList();

        return new ChequesDashboardDto(
            currency, totalCheques,
            pledgedCount, depositedCount, clearedCount, bouncedCount, cancelledCount,
            pledgedAmount, depositedAmount, clearedAmount, bouncedAmount90d,
            overdueDepositCount, overdueDepositAmount,
            upcoming.Count, upcoming.Sum(c => c.Amount),
            statusMix, byBank, timeline, recentBounces, topPledgers);
    }

    // -- Families dashboard --------------------------------------------------

    public async Task<FamiliesDashboardDto> FamiliesAsync(int months = 12, CancellationToken ct = default)
    {
        if (months <= 0) months = 12;
        if (months > 24) months = 24;
        var today = clock.Today;
        var ytdStart = new DateOnly(today.Year, 1, 1);
        var trendStart = new DateOnly(today.Year, today.Month, 1).AddMonths(-(months - 1));
        var trendStartUtc = trendStart.ToDateTime(TimeOnly.MinValue);

        var families = await db.Families.AsNoTracking()
            .Select(f => new { f.Id, f.Code, f.FamilyName, f.HeadMemberId, f.IsActive, f.CreatedAtUtc })
            .ToListAsync(ct);

        var membersByFamily = await db.FamilyMemberLinks.AsNoTracking()
            .GroupBy(l => l.FamilyId)
            .Select(g => new { FamilyId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.FamilyId, g => g.Count, ct);

        var totalFamilies = families.Count;
        var activeFamilies = families.Count(f => f.IsActive);
        var inactiveFamilies = totalFamilies - activeFamilies;
        var withHead = families.Count(f => f.HeadMemberId.HasValue);
        var withoutHead = totalFamilies - withHead;
        var totalLinkedMembers = membersByFamily.Values.Sum();
        var avgFamilySize = totalFamilies == 0 ? 0m : Math.Round((decimal)totalLinkedMembers / totalFamilies, 2);

        int sizeOf(Guid fid) => membersByFamily.TryGetValue(fid, out var c) ? c : 0;

        var bucketEdges = new (int Max, string Label)[] { (0, "Empty"), (1, "1"), (3, "2-3"), (5, "4-5"), (int.MaxValue, "6+") };
        var bucketCounts = new int[bucketEdges.Length];
        foreach (var f in families)
        {
            var s = sizeOf(f.Id);
            for (var i = 0; i < bucketEdges.Length; i++)
            {
                if (s <= bucketEdges[i].Max) { bucketCounts[i]++; break; }
            }
        }
        var sizeBucketsOut = bucketEdges
            .Select((b, i) => new NamedCountPoint(b.Label, bucketCounts[i]))
            .ToList();

        var trendBuckets = new Dictionary<(int Y, int M), int>();
        for (var d = trendStart; d <= today; d = d.AddMonths(1))
            trendBuckets[(d.Year, d.Month)] = 0;
        foreach (var f in families.Where(f => f.CreatedAtUtc.UtcDateTime >= trendStartUtc))
        {
            var d = DateOnly.FromDateTime(f.CreatedAtUtc.UtcDateTime);
            var k = (d.Year, d.Month);
            if (trendBuckets.TryGetValue(k, out var c)) trendBuckets[k] = c + 1;
        }
        var trend = trendBuckets
            .OrderBy(kv => kv.Key.Y).ThenBy(kv => kv.Key.M)
            .Select(kv => new MemberMonthlyPoint(kv.Key.Y, kv.Key.M, kv.Value))
            .ToList();

        var ytdReceipts = await db.Receipts.AsNoTracking()
            .Where(r => r.Status == ReceiptStatus.Confirmed && r.ReceiptDate >= ytdStart && r.FamilyId.HasValue)
            .Select(r => new { FamilyId = r.FamilyId!.Value, r.AmountTotal, r.Currency })
            .ToListAsync(ct);
        var currency = ytdReceipts.Select(r => r.Currency).FirstOrDefault() ?? "AED";
        var contribByFamily = ytdReceipts
            .GroupBy(r => r.FamilyId)
            .ToDictionary(g => g.Key, g => g.Sum(r => r.AmountTotal));
        var familiesWithContributions = contribByFamily.Count;
        var totalContribYtd = contribByFamily.Values.Sum();

        var familyById = families.ToDictionary(f => f.Id, f => f);
        var topByContrib = contribByFamily
            .OrderByDescending(kv => kv.Value)
            .Take(8)
            .Select(kv =>
            {
                var f = familyById.TryGetValue(kv.Key, out var fam) ? fam : null;
                return new TopFamilyRow(kv.Key,
                    f?.Code ?? "-",
                    f?.FamilyName ?? "(unknown)",
                    sizeOf(kv.Key),
                    kv.Value);
            })
            .ToList();

        var largest = families
            .OrderByDescending(f => sizeOf(f.Id))
            .ThenBy(f => f.FamilyName)
            .Take(8)
            .Select(f => new TopFamilyRow(f.Id, f.Code, f.FamilyName, sizeOf(f.Id),
                contribByFamily.TryGetValue(f.Id, out var amt) ? amt : 0m))
            .ToList();

        return new FamiliesDashboardDto(
            currency, totalFamilies, activeFamilies, inactiveFamilies,
            totalLinkedMembers, avgFamilySize, withHead, withoutHead,
            familiesWithContributions, totalContribYtd,
            sizeBucketsOut, trend, topByContrib, largest);
    }

    // -- Fund Enrollments dashboard ------------------------------------------

    public async Task<FundEnrollmentsDashboardDto> FundEnrollmentsAsync(int months = 12, CancellationToken ct = default)
    {
        if (months <= 0) months = 12;
        if (months > 24) months = 24;
        var today = clock.Today;
        var thisMonthStart = new DateOnly(today.Year, today.Month, 1);
        var thisYearStart = new DateOnly(today.Year, 1, 1);
        var trendStart = thisMonthStart.AddMonths(-(months - 1));
        var trendStartUtc = trendStart.ToDateTime(TimeOnly.MinValue);
        var thisMonthStartUtc = thisMonthStart.ToDateTime(TimeOnly.MinValue);
        var thisYearStartUtc = thisYearStart.ToDateTime(TimeOnly.MinValue);

        var enrollments = await db.FundEnrollments.AsNoTracking()
            .Select(e => new { e.Id, e.FundTypeId, e.Status, e.Recurrence, e.CreatedAtUtc })
            .ToListAsync(ct);

        var totalEnrollments = enrollments.Count;
        int countOf(FundEnrollmentStatus s) => enrollments.Count(e => e.Status == s);
        var activeCount = countOf(FundEnrollmentStatus.Active);
        var draftCount = countOf(FundEnrollmentStatus.Draft);
        var pausedCount = countOf(FundEnrollmentStatus.Paused);
        var cancelledCount = countOf(FundEnrollmentStatus.Cancelled);
        var expiredCount = countOf(FundEnrollmentStatus.Expired);

        var newThisMonth = enrollments.Count(e => e.CreatedAtUtc.UtcDateTime >= thisMonthStartUtc);
        var newThisYear = enrollments.Count(e => e.CreatedAtUtc.UtcDateTime >= thisYearStartUtc);

        var oneTimeActive = enrollments.Count(e =>
            e.Status == FundEnrollmentStatus.Active && e.Recurrence == FundEnrollmentRecurrence.OneTime);
        var recurringActive = activeCount - oneTimeActive;

        var statusMix = enrollments.GroupBy(e => e.Status)
            .Select(g => new NamedCountPoint(g.Key.ToString(), g.Count()))
            .OrderByDescending(p => p.Count)
            .ToList();

        var recurrenceMix = enrollments.GroupBy(e => e.Recurrence)
            .Select(g => new NamedCountPoint(g.Key.ToString(), g.Count()))
            .OrderByDescending(p => p.Count)
            .ToList();

        var fundTypeIds = enrollments.Select(e => e.FundTypeId).Distinct().ToList();
        var fundTypes = fundTypeIds.Count == 0
            ? new Dictionary<Guid, (string Code, string Name)>()
            : await db.FundTypes.AsNoTracking().Where(f => fundTypeIds.Contains(f.Id))
                .ToDictionaryAsync(f => f.Id, f => ValueTuple.Create(f.Code, f.NameEnglish), ct);

        var byFundType = enrollments.GroupBy(e => e.FundTypeId)
            .Select(g =>
            {
                var (_, name) = fundTypes.TryGetValue(g.Key, out var ft) ? ft : ("-", "(unknown)");
                return new NamedCountPoint(name, g.Count());
            })
            .OrderByDescending(p => p.Count)
            .Take(8)
            .ToList();

        var trendBuckets = new Dictionary<(int Y, int M), int>();
        for (var d = trendStart; d <= today; d = d.AddMonths(1))
            trendBuckets[(d.Year, d.Month)] = 0;
        foreach (var e in enrollments.Where(e => e.CreatedAtUtc.UtcDateTime >= trendStartUtc))
        {
            var d = DateOnly.FromDateTime(e.CreatedAtUtc.UtcDateTime);
            var k = (d.Year, d.Month);
            if (trendBuckets.TryGetValue(k, out var c)) trendBuckets[k] = c + 1;
        }
        var trend = trendBuckets
            .OrderBy(kv => kv.Key.Y).ThenBy(kv => kv.Key.M)
            .Select(kv => new MemberMonthlyPoint(kv.Key.Y, kv.Key.M, kv.Value))
            .ToList();

        var topFunds = enrollments.GroupBy(e => e.FundTypeId)
            .Select(g =>
            {
                var (code, name) = fundTypes.TryGetValue(g.Key, out var ft) ? ft : ("-", "(unknown)");
                var active = g.Count(x => x.Status == FundEnrollmentStatus.Active);
                return new TopFundEnrollmentRow(g.Key, code, name, active, g.Count());
            })
            .OrderByDescending(r => r.ActiveEnrollments)
            .ThenByDescending(r => r.TotalEnrollments)
            .Take(8)
            .ToList();

        return new FundEnrollmentsDashboardDto(
            totalEnrollments, activeCount, draftCount, pausedCount, cancelledCount, expiredCount,
            newThisMonth, newThisYear, recurringActive, oneTimeActive,
            statusMix, recurrenceMix, byFundType, trend, topFunds);
    }

    // -- Per-event detail ----------------------------------------------------

    public async Task<EventDetailDashboardDto?> EventDetailAsync(Guid eventId, CancellationToken ct = default)
    {
        var ev = await db.Events.AsNoTracking()
            .Where(e => e.Id == eventId)
            .Select(e => new
            {
                e.Id, e.Slug, e.Name, e.EventDate, e.Category, e.Place, e.Capacity,
                e.IsActive, e.RegistrationsEnabled,
            })
            .FirstOrDefaultAsync(ct);
        if (ev is null) return null;

        var today = clock.Today;
        var daysUntil = ev.EventDate.DayNumber - today.DayNumber;

        var regs = await db.EventRegistrations.AsNoTracking()
            .Where(r => r.EventId == eventId)
            .Include(r => r.Guests)
            .Select(r => new
            {
                r.Id, r.Status, r.RegisteredAtUtc, r.CheckedInAtUtc,
                Guests = r.Guests.Select(g => new { g.AgeBand, g.Relationship, g.CheckedIn }).ToList(),
            })
            .ToListAsync(ct);

        var totalRegs = regs.Count;
        int countOf(RegistrationStatus s) => regs.Count(r => r.Status == s);
        var pending = countOf(RegistrationStatus.Pending);
        var confirmed = countOf(RegistrationStatus.Confirmed);
        var waitlisted = countOf(RegistrationStatus.Waitlisted);
        var cancelled = countOf(RegistrationStatus.Cancelled);
        var checkedIn = countOf(RegistrationStatus.CheckedIn);
        var noShow = countOf(RegistrationStatus.NoShow);

        var totalGuests = regs.Sum(r => r.Guests.Count);
        var checkedInGuests = regs.Sum(r => r.Guests.Count(g => g.CheckedIn));
        var totalSeats = regs.Where(r => r.Status != RegistrationStatus.Cancelled && r.Status != RegistrationStatus.NoShow)
            .Sum(r => 1 + r.Guests.Count);
        var fillPercent = ev.Capacity is > 0
            ? (int)Math.Round(Math.Min(100m, (decimal)totalSeats * 100m / ev.Capacity.Value))
            : 0;

        var statusMix = regs.GroupBy(r => r.Status)
            .Select(g => new NamedCountPoint(g.Key.ToString(), g.Count()))
            .OrderByDescending(p => p.Count)
            .ToList();

        var ageBandMix = regs.SelectMany(r => r.Guests).GroupBy(g => g.AgeBand)
            .Select(g => new NamedCountPoint(g.Key.ToString(), g.Count()))
            .OrderByDescending(p => p.Count)
            .ToList();

        var relationshipMix = regs.SelectMany(r => r.Guests)
            .Where(g => !string.IsNullOrWhiteSpace(g.Relationship))
            .GroupBy(g => g.Relationship!)
            .Select(g => new NamedCountPoint(g.Key, g.Count()))
            .OrderByDescending(p => p.Count)
            .Take(8)
            .ToList();

        // Daily registration curve - last 30 days up to today (or up to the event date when in the past).
        var curveEnd = ev.EventDate < today ? ev.EventDate : today;
        var curveStart = curveEnd.AddDays(-29);
        var curveStartUtc = curveStart.ToDateTime(TimeOnly.MinValue);
        var byDay = regs.Where(r => r.RegisteredAtUtc.UtcDateTime >= curveStartUtc)
            .GroupBy(r => DateOnly.FromDateTime(r.RegisteredAtUtc.UtcDateTime))
            .ToDictionary(g => g.Key, g => g.Count());
        var curve = new List<DailyCountPoint>();
        for (var d = curveStart; d <= curveEnd; d = d.AddDays(1))
            curve.Add(new DailyCountPoint(d, byDay.TryGetValue(d, out var c) ? c : 0));

        // Hourly check-in pattern across the event day(s) - bucketed 0..23 in event-day local hours
        // (UTC for now; aligning to a tenant timezone is a separate concern).
        var checkIns = regs.Where(r => r.CheckedInAtUtc.HasValue).Select(r => r.CheckedInAtUtc!.Value.UtcDateTime.Hour).ToList();
        var hourlyMap = checkIns.GroupBy(h => h).ToDictionary(g => g.Key, g => g.Count());
        var hourly = new List<HourlyCountPoint>();
        for (var h = 0; h < 24; h++) hourly.Add(new HourlyCountPoint(h, hourlyMap.TryGetValue(h, out var c) ? c : 0));

        return new EventDetailDashboardDto(
            ev.Id, ev.Slug, ev.Name, ev.EventDate, ev.Category.ToString(),
            ev.Place, ev.Capacity, ev.IsActive, ev.RegistrationsEnabled,
            totalRegs, confirmed, checkedIn, cancelled, waitlisted, noShow, pending,
            totalSeats, fillPercent, totalGuests, checkedInGuests, daysUntil,
            statusMix, ageBandMix, relationshipMix, curve, hourly);
    }

    // -- Per-fund-type detail ------------------------------------------------

    public async Task<FundTypeDetailDashboardDto?> FundTypeDetailAsync(Guid fundTypeId, int months = 12, CancellationToken ct = default)
    {
        if (months <= 0) months = 12;
        if (months > 36) months = 36;

        var fund = await db.FundTypes.AsNoTracking()
            .Where(f => f.Id == fundTypeId)
            .Select(f => new { f.Id, f.Code, f.NameEnglish, f.IsReturnable, f.IsActive })
            .FirstOrDefaultAsync(ct);
        if (fund is null) return null;

        var today = clock.Today;
        var thisMonthStart = new DateOnly(today.Year, today.Month, 1);
        var thisYearStart = new DateOnly(today.Year, 1, 1);
        var trendStart = thisMonthStart.AddMonths(-(months - 1));

        // All confirmed receipt lines for this fund. Pull narrow.
        var lines = await (
            from r in db.Receipts.AsNoTracking()
            from l in r.Lines
            where r.Status == ReceiptStatus.Confirmed && l.FundTypeId == fundTypeId
            select new
            {
                r.Id, r.MemberId, r.MemberNameSnapshot, r.ItsNumberSnapshot,
                r.ReceiptDate, r.Currency, r.Intention, r.AmountReturned, r.MaturityState,
                LineAmount = l.Amount, ReceiptTotal = r.AmountTotal,
            }).ToListAsync(ct);

        var currency = lines.Select(x => x.Currency).FirstOrDefault() ?? "AED";
        var totalReceived = lines.Sum(x => x.LineAmount);
        var receivedThisMonth = lines.Where(x => x.ReceiptDate >= thisMonthStart).Sum(x => x.LineAmount);
        var receivedThisYear = lines.Where(x => x.ReceiptDate >= thisYearStart).Sum(x => x.LineAmount);
        var receiptCount = lines.Select(x => x.Id).Distinct().Count();
        var receiptCountThisMonth = lines.Where(x => x.ReceiptDate >= thisMonthStart).Select(x => x.Id).Distinct().Count();
        var avg = receiptCount == 0 ? 0m : Math.Round(totalReceived / receiptCount, 2);

        // Returnable balances: sum of (line amount) on returnable receipts, minus the returned portion.
        // The receipt-level AmountReturned applies to the whole receipt; we approximate per-line by line-share.
        var returnableLines = lines.Where(x => x.Intention == ContributionIntention.Returnable).ToList();
        var returnableOutstanding = returnableLines.Sum(x =>
            x.ReceiptTotal == 0 ? 0m : x.LineAmount * Math.Max(0m, x.ReceiptTotal - x.AmountReturned) / x.ReceiptTotal);
        var returnableMatured = returnableLines
            .Where(x => x.MaturityState == ReturnableMaturityState.Matured || x.MaturityState == ReturnableMaturityState.PartiallyReturned)
            .Sum(x => x.ReceiptTotal == 0 ? 0m : x.LineAmount * Math.Max(0m, x.ReceiptTotal - x.AmountReturned) / x.ReceiptTotal);

        // Monthly inflow trend
        var monthlyMap = new Dictionary<(int Y, int M), (decimal Amt, int N)>();
        for (var d = trendStart; d <= today; d = d.AddMonths(1))
            monthlyMap[(d.Year, d.Month)] = (0m, 0);
        foreach (var x in lines.Where(x => x.ReceiptDate >= trendStart))
        {
            var k = (x.ReceiptDate.Year, x.ReceiptDate.Month);
            if (monthlyMap.TryGetValue(k, out var v)) monthlyMap[k] = (v.Amt + x.LineAmount, v.N + 1);
        }
        var monthlyTrend = monthlyMap
            .OrderBy(kv => kv.Key.Y).ThenBy(kv => kv.Key.M)
            .Select(kv => new MonthlyAmountPoint(kv.Key.Y, kv.Key.M, kv.Value.Amt, kv.Value.N))
            .ToList();

        // Top contributors (across all time, by total to this fund)
        var topContributors = lines
            .GroupBy(x => x.MemberId)
            .Select(g => new TopContributorPoint(
                g.Key, g.First().ItsNumberSnapshot, g.First().MemberNameSnapshot,
                g.Sum(x => x.LineAmount), g.Select(x => x.Id).Distinct().Count(), currency))
            .OrderByDescending(p => p.Amount)
            .Take(8)
            .ToList();

        var uniqueContributors = lines.Select(x => x.MemberId).Distinct().Count();

        // Enrollment counts
        var enrollments = await db.FundEnrollments.AsNoTracking()
            .Where(e => e.FundTypeId == fundTypeId)
            .Select(e => new { e.Status, e.Recurrence })
            .ToListAsync(ct);
        var totalEnrollments = enrollments.Count;
        var activeEnrollments = enrollments.Count(e => e.Status == FundEnrollmentStatus.Active);
        var enrollmentStatusMix = enrollments.GroupBy(e => e.Status)
            .Select(g => new NamedCountPoint(g.Key.ToString(), g.Count()))
            .OrderByDescending(p => p.Count)
            .ToList();
        var enrollmentRecurrenceMix = enrollments.GroupBy(e => e.Recurrence)
            .Select(g => new NamedCountPoint(g.Key.ToString(), g.Count()))
            .OrderByDescending(p => p.Count)
            .ToList();

        return new FundTypeDetailDashboardDto(
            fund.Id, fund.Code, fund.NameEnglish, fund.IsReturnable, fund.IsActive, currency,
            totalReceived, receivedThisMonth, receivedThisYear,
            receiptCount, receiptCountThisMonth, avg,
            activeEnrollments, totalEnrollments, uniqueContributors,
            returnableOutstanding, returnableMatured,
            monthlyTrend, topContributors, enrollmentRecurrenceMix, enrollmentStatusMix);
    }

    // -- Cashflow ------------------------------------------------------------

    public async Task<CashflowDashboardDto> CashflowAsync(int days = 90, CancellationToken ct = default)
    {
        if (days <= 0) days = 90;
        if (days > 365) days = 365;
        var today = clock.Today;
        var since = today.AddDays(-(days - 1));
        var thisMonthStart = new DateOnly(today.Year, today.Month, 1);
        var dayOfMonth = today.Day;
        var priorMonthStart = thisMonthStart.AddMonths(-1);
        var priorMonthMtdEnd = priorMonthStart.AddDays(dayOfMonth - 1);

        var receipts = await db.Receipts.AsNoTracking()
            .Where(r => r.Status == ReceiptStatus.Confirmed && r.ReceiptDate >= since)
            .Select(r => new { r.Id, r.ReceiptDate, r.AmountTotal, r.Currency, r.PaymentMode })
            .ToListAsync(ct);

        var vouchers = await db.Vouchers.AsNoTracking()
            .Where(v => v.VoucherDate >= since)
            .Select(v => new { v.Id, v.VoucherDate, v.AmountTotal, v.Currency, v.PaymentMode, v.Status, v.Purpose })
            .ToListAsync(ct);

        var paidVouchers = vouchers.Where(v => v.Status == VoucherStatus.Paid).ToList();
        var pendingVouchers = vouchers.Where(v => v.Status == VoucherStatus.PendingApproval || v.Status == VoucherStatus.Approved).ToList();
        var pendingClearance = vouchers.Where(v => v.Status == VoucherStatus.PendingClearance).ToList();

        var currency = receipts.Select(r => r.Currency).FirstOrDefault() ?? paidVouchers.Select(v => v.Currency).FirstOrDefault() ?? "AED";

        var totalInflow = receipts.Sum(r => r.AmountTotal);
        var totalOutflow = paidVouchers.Sum(v => v.AmountTotal);

        var inflowThisMonth = receipts.Where(r => r.ReceiptDate >= thisMonthStart).Sum(r => r.AmountTotal);
        var outflowThisMonth = paidVouchers.Where(v => v.VoucherDate >= thisMonthStart).Sum(v => v.AmountTotal);
        var inflowMtdPrior = receipts.Where(r => r.ReceiptDate >= priorMonthStart && r.ReceiptDate <= priorMonthMtdEnd).Sum(r => r.AmountTotal);
        var outflowMtdPrior = paidVouchers.Where(v => v.VoucherDate >= priorMonthStart && v.VoucherDate <= priorMonthMtdEnd).Sum(v => v.AmountTotal);

        // Daily curve
        var inflowByDay = receipts.GroupBy(r => r.ReceiptDate).ToDictionary(g => g.Key, g => g.Sum(r => r.AmountTotal));
        var outflowByDay = paidVouchers.GroupBy(v => v.VoucherDate).ToDictionary(g => g.Key, g => g.Sum(v => v.AmountTotal));
        var dailyCurve = new List<DailyCashflowPoint>();
        for (var d = since; d <= today; d = d.AddDays(1))
        {
            var inn = inflowByDay.TryGetValue(d, out var i) ? i : 0m;
            var outt = outflowByDay.TryGetValue(d, out var o) ? o : 0m;
            dailyCurve.Add(new DailyCashflowPoint(d, inn, outt, inn - outt));
        }

        // Inflow by fund - need lines for receipts in window
        var inflowByFund = await (
            from r in db.Receipts.AsNoTracking()
            from l in r.Lines
            join f in db.FundTypes.AsNoTracking() on l.FundTypeId equals f.Id
            where r.Status == ReceiptStatus.Confirmed && r.ReceiptDate >= since
            group l.Amount by f.NameEnglish into g
            select new { Label = g.Key, Count = g.Count(), Amount = g.Sum() })
            .ToListAsync(ct);
        var inflowByFundOut = inflowByFund
            .Select(x => new NamedAmountPoint(x.Label, x.Count, x.Amount))
            .OrderByDescending(p => p.Amount)
            .Take(8).ToList();

        // Outflow by purpose (top 8)
        var outflowByPurpose = paidVouchers
            .GroupBy(v => string.IsNullOrWhiteSpace(v.Purpose) ? "(Uncategorised)" : v.Purpose)
            .Select(g => new NamedAmountPoint(g.Key, g.Count(), g.Sum(v => v.AmountTotal)))
            .OrderByDescending(p => p.Amount)
            .Take(8)
            .ToList();

        // Payment-mode mix - PaymentMode is a flags enum so a single value can carry multiple bits;
        // for the dashboard we pick the highest-priority bit set.
        static string ModeLabel(PaymentMode m)
        {
            if (m.HasFlag(PaymentMode.Cash)) return "Cash";
            if (m.HasFlag(PaymentMode.Cheque)) return "Cheque";
            if (m.HasFlag(PaymentMode.BankTransfer)) return "Bank transfer";
            if (m.HasFlag(PaymentMode.Card)) return "Card";
            if (m.HasFlag(PaymentMode.Online)) return "Online";
            if (m.HasFlag(PaymentMode.Upi)) return "UPI";
            return "Other";
        }
        var inflowByMode = receipts.GroupBy(r => ModeLabel(r.PaymentMode))
            .Select(g => new NamedAmountPoint(g.Key, g.Count(), g.Sum(r => r.AmountTotal)))
            .OrderByDescending(p => p.Amount)
            .ToList();
        var outflowByMode = paidVouchers.GroupBy(v => ModeLabel(v.PaymentMode))
            .Select(g => new NamedAmountPoint(g.Key, g.Count(), g.Sum(v => v.AmountTotal)))
            .OrderByDescending(p => p.Amount)
            .ToList();

        return new CashflowDashboardDto(
            currency, days,
            totalInflow, totalOutflow, totalInflow - totalOutflow,
            pendingVouchers.Sum(v => v.AmountTotal),
            pendingClearance.Sum(v => v.AmountTotal),
            inflowThisMonth, outflowThisMonth, inflowMtdPrior, outflowMtdPrior,
            receipts.Count, paidVouchers.Count,
            dailyCurve, inflowByFundOut, outflowByPurpose, inflowByMode, outflowByMode);
    }

    // -- QH funnel -----------------------------------------------------------

    public async Task<QhFunnelDashboardDto> QhFunnelAsync(int months = 12, CancellationToken ct = default)
    {
        if (months <= 0) months = 12;
        if (months > 24) months = 24;
        var today = clock.Today;
        var trendStart = new DateOnly(today.Year, today.Month, 1).AddMonths(-(months - 1));
        var trendStartUtc = trendStart.ToDateTime(TimeOnly.MinValue);

        var loans = await db.QarzanHasanaLoans.AsNoTracking()
            .Select(l => new
            {
                l.Id, l.MemberId, l.Status, l.AmountRequested, l.AmountApproved, l.AmountDisbursed, l.AmountRepaid,
                l.CreatedAtUtc, l.Level1ApprovedAtUtc, l.Level2ApprovedAtUtc, l.DisbursedOn,
            })
            .ToListAsync(ct);

        var totalRequests = loans.Count;
        int countOf(QarzanHasanaStatus s) => loans.Count(l => l.Status == s);
        var pending = countOf(QarzanHasanaStatus.PendingLevel1) + countOf(QarzanHasanaStatus.PendingLevel2) + countOf(QarzanHasanaStatus.Draft);
        var approved = countOf(QarzanHasanaStatus.Approved);
        var disbursed = countOf(QarzanHasanaStatus.Disbursed);
        var active = countOf(QarzanHasanaStatus.Active);
        var completed = countOf(QarzanHasanaStatus.Completed);
        var defaulted = countOf(QarzanHasanaStatus.Defaulted);
        var rejected = countOf(QarzanHasanaStatus.Rejected);
        var cancelled = countOf(QarzanHasanaStatus.Cancelled);

        var totalRequested = loans.Sum(l => l.AmountRequested);
        var totalApproved = loans.Sum(l => l.AmountApproved);
        var totalDisbursed = loans.Sum(l => l.AmountDisbursed);
        var totalRepaid = loans.Sum(l => l.AmountRepaid);

        var sanctioned = approved + disbursed + active + completed + defaulted;
        var actedOn = sanctioned + rejected + cancelled;
        var approvalRate = actedOn == 0 ? 0 : (int)Math.Round(sanctioned * 100m / actedOn);
        var disbursementRate = sanctioned == 0 ? 0 : (int)Math.Round((disbursed + active + completed + defaulted) * 100m / sanctioned);

        // Average days to approve (Level2) and to disburse, only on loans that reached those states
        var lvl2Times = loans.Where(l => l.Level2ApprovedAtUtc.HasValue)
            .Select(l => (l.Level2ApprovedAtUtc!.Value - l.CreatedAtUtc).TotalDays)
            .Where(d => d >= 0).ToList();
        var disbTimes = loans.Where(l => l.DisbursedOn.HasValue)
            .Select(l => (decimal)(l.DisbursedOn!.Value.DayNumber - DateOnly.FromDateTime(l.CreatedAtUtc.UtcDateTime).DayNumber))
            .Where(d => d >= 0).ToList();
        var avgApprove = lvl2Times.Count == 0 ? 0m : Math.Round((decimal)lvl2Times.Average(), 1);
        var avgDisburse = disbTimes.Count == 0 ? 0m : Math.Round(disbTimes.Average(), 1);

        // Heuristic: contributions to the loan pool = sum of confirmed receipts whose lines hit any
        // FundType marked IsReturnable=true. This is the closest in-schema approximation to "money
        // available for QH lending" without a dedicated flag.
        var returnableFundIds = await db.FundTypes.AsNoTracking()
            .Where(f => f.IsReturnable)
            .Select(f => f.Id).ToListAsync(ct);
        decimal contribsToPool = 0m;
        if (returnableFundIds.Count > 0)
        {
            contribsToPool = await (
                from r in db.Receipts.AsNoTracking()
                from l in r.Lines
                where r.Status == ReceiptStatus.Confirmed && returnableFundIds.Contains(l.FundTypeId)
                select l.Amount).SumAsync(ct);
        }
        var availablePool = contribsToPool - (totalDisbursed - totalRepaid);

        // Monthly trend - requests by created month, disbursements by disbursed month
        var monthMap = new Dictionary<(int Y, int M), (int RC, int DC, decimal RA, decimal DA)>();
        for (var d = trendStart; d <= today; d = d.AddMonths(1))
            monthMap[(d.Year, d.Month)] = (0, 0, 0m, 0m);
        foreach (var l in loans.Where(l => l.CreatedAtUtc.UtcDateTime >= trendStartUtc))
        {
            var d = DateOnly.FromDateTime(l.CreatedAtUtc.UtcDateTime);
            var k = (d.Year, d.Month);
            if (monthMap.TryGetValue(k, out var v)) monthMap[k] = (v.RC + 1, v.DC, v.RA + l.AmountRequested, v.DA);
        }
        foreach (var l in loans.Where(l => l.DisbursedOn.HasValue && l.DisbursedOn.Value >= trendStart))
        {
            var k = (l.DisbursedOn!.Value.Year, l.DisbursedOn.Value.Month);
            if (monthMap.TryGetValue(k, out var v)) monthMap[k] = (v.RC, v.DC + 1, v.RA, v.DA + l.AmountDisbursed);
        }
        var monthlyTrend = monthMap.OrderBy(kv => kv.Key.Y).ThenBy(kv => kv.Key.M)
            .Select(kv => new MonthlyRequestVsDisbursementPoint(kv.Key.Y, kv.Key.M, kv.Value.RC, kv.Value.DC, kv.Value.RA, kv.Value.DA))
            .ToList();

        // Status funnel as ordered list (each row = count + cumulative-amount-at-that-stage)
        var funnel = new List<NamedAmountPoint>
        {
            new("Requested", totalRequests, totalRequested),
            new("Approved", approved + disbursed + active + completed + defaulted, totalApproved),
            new("Disbursed", disbursed + active + completed + defaulted, totalDisbursed),
            new("Repaid", completed, totalRepaid),
        };

        // Top borrowers by current outstanding (disbursed - repaid > 0)
        var memberIds = loans.Select(l => l.MemberId).Distinct().ToList();
        var members = memberIds.Count == 0
            ? new Dictionary<Guid, (string Its, string Name)>()
            : await db.Members.AsNoTracking().Where(m => memberIds.Contains(m.Id))
                .ToDictionaryAsync(m => m.Id, m => ValueTuple.Create(m.ItsNumber.Value, m.FullName), ct);
        var topBorrowers = loans
            .GroupBy(l => l.MemberId)
            .Select(g =>
            {
                var (its, name) = members.TryGetValue(g.Key, out var m) ? m : ("-", "-");
                return new QhBorrowerRow(g.Key, its, name,
                    Math.Max(0m, g.Sum(l => l.AmountDisbursed) - g.Sum(l => l.AmountRepaid)),
                    g.Count());
            })
            .Where(b => b.Outstanding > 0)
            .OrderByDescending(b => b.Outstanding)
            .Take(8)
            .ToList();

        var currency = "AED";

        return new QhFunnelDashboardDto(
            currency,
            totalRequests, pending, approved, disbursed, active, completed, defaulted, rejected, cancelled,
            totalRequested, totalApproved, totalDisbursed, totalRepaid,
            approvalRate, disbursementRate,
            contribsToPool, availablePool,
            avgApprove, avgDisburse,
            monthlyTrend, funnel, topBorrowers);
    }

    // -- Commitment types ----------------------------------------------------

    public async Task<CommitmentTypesDashboardDto> CommitmentTypesAsync(CancellationToken ct = default)
    {
        var today = clock.Today;
        var trendStart = new DateOnly(today.Year, today.Month, 1).AddMonths(-11);
        var trendStartUtc = trendStart.ToDateTime(TimeOnly.MinValue);

        var commitments = await db.Commitments.AsNoTracking()
            .Select(c => new
            {
                c.Id, c.AgreementTemplateId, c.FundTypeId, c.Status, c.TotalAmount, c.PaidAmount,
                c.Currency, c.CreatedAtUtc,
            })
            .ToListAsync(ct);

        var currency = commitments.Select(c => c.Currency).FirstOrDefault() ?? "AED";
        var totalCommitments = commitments.Count;
        int countOf(CommitmentStatus s) => commitments.Count(c => c.Status == s);
        var activeCount = countOf(CommitmentStatus.Active);
        var completedCount = countOf(CommitmentStatus.Completed);
        var defaultedCount = countOf(CommitmentStatus.Defaulted);
        var cancelledCount = countOf(CommitmentStatus.Cancelled);

        var totalCommitted = commitments.Sum(c => c.TotalAmount);
        var totalPaid = commitments.Sum(c => c.PaidAmount);
        var totalRemaining = Math.Max(0m, totalCommitted - totalPaid);
        var overallProgress = totalCommitted == 0 ? 0 : (int)Math.Round(totalPaid * 100m / totalCommitted);

        var templateIds = commitments.Where(c => c.AgreementTemplateId.HasValue)
            .Select(c => c.AgreementTemplateId!.Value).Distinct().ToList();
        var templates = templateIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.CommitmentAgreementTemplates.AsNoTracking()
                .Where(t => templateIds.Contains(t.Id))
                .ToDictionaryAsync(t => t.Id, t => t.Name, ct);

        var byTemplate = commitments.GroupBy(c => c.AgreementTemplateId)
            .Select(g =>
            {
                var name = g.Key.HasValue && templates.TryGetValue(g.Key.Value, out var n) ? n : "(no template)";
                var committed = g.Sum(c => c.TotalAmount);
                var paid = g.Sum(c => c.PaidAmount);
                var prog = committed == 0 ? 0 : (int)Math.Round(paid * 100m / committed);
                return new CommitmentTemplateRow(
                    g.Key, name, g.Count(),
                    g.Count(c => c.Status == CommitmentStatus.Active),
                    committed, paid, prog,
                    g.Count(c => c.Status == CommitmentStatus.Defaulted));
            })
            .OrderByDescending(r => r.Committed)
            .ToList();

        var fundIds = commitments.Select(c => c.FundTypeId).Distinct().ToList();
        var funds = fundIds.Count == 0
            ? new Dictionary<Guid, (string Code, string Name)>()
            : await db.FundTypes.AsNoTracking().Where(f => fundIds.Contains(f.Id))
                .ToDictionaryAsync(f => f.Id, f => ValueTuple.Create(f.Code, f.NameEnglish), ct);
        var byFund = commitments.GroupBy(c => c.FundTypeId)
            .Select(g =>
            {
                var (code, name) = funds.TryGetValue(g.Key, out var f) ? f : ("-", "(unknown)");
                return new CommitmentByFundRow(g.Key, code, name, g.Count(),
                    g.Sum(c => c.TotalAmount), g.Sum(c => c.PaidAmount));
            })
            .OrderByDescending(r => r.Committed)
            .Take(8)
            .ToList();

        var statusMix = commitments.GroupBy(c => c.Status)
            .Select(g => new NamedCountPoint(g.Key.ToString(), g.Count()))
            .OrderByDescending(p => p.Count)
            .ToList();

        var trendMap = new Dictionary<(int Y, int M), int>();
        for (var d = trendStart; d <= today; d = d.AddMonths(1))
            trendMap[(d.Year, d.Month)] = 0;
        foreach (var c in commitments.Where(c => c.CreatedAtUtc.UtcDateTime >= trendStartUtc))
        {
            var d = DateOnly.FromDateTime(c.CreatedAtUtc.UtcDateTime);
            var k = (d.Year, d.Month);
            if (trendMap.TryGetValue(k, out var n)) trendMap[k] = n + 1;
        }
        var trend = trendMap.OrderBy(kv => kv.Key.Y).ThenBy(kv => kv.Key.M)
            .Select(kv => new MemberMonthlyPoint(kv.Key.Y, kv.Key.M, kv.Value))
            .ToList();

        return new CommitmentTypesDashboardDto(
            currency, totalCommitments, activeCount, completedCount, defaultedCount, cancelledCount,
            totalCommitted, totalPaid, totalRemaining, overallProgress,
            byTemplate, byFund, statusMix, trend);
    }

    // -- Vouchers dashboard --------------------------------------------------

    public async Task<VouchersDashboardDto> VouchersAsync(DateOnly? from, DateOnly? to, CancellationToken ct = default)
    {
        var today = clock.Today;
        var windowTo = to ?? today;
        var windowFrom = from ?? today.AddDays(-89);
        if (windowFrom > windowTo) (windowFrom, windowTo) = (windowTo, windowFrom);

        var vouchers = await db.Vouchers.AsNoTracking()
            .Where(v => v.VoucherDate >= windowFrom && v.VoucherDate <= windowTo)
            .Include(v => v.Lines)
            .Select(v => new
            {
                v.Id, v.VoucherDate, v.AmountTotal, v.Currency, v.Status, v.PaymentMode,
                v.Purpose, v.PayTo,
                Lines = v.Lines.Select(l => new { l.ExpenseTypeId, l.Amount }).ToList(),
            })
            .ToListAsync(ct);

        var currency = vouchers.Select(v => v.Currency).FirstOrDefault() ?? "AED";
        var totalCount = vouchers.Count;
        int countOf(VoucherStatus s) => vouchers.Count(v => v.Status == s);
        var paid = vouchers.Where(v => v.Status == VoucherStatus.Paid).ToList();
        var pendingApproval = vouchers.Where(v => v.Status == VoucherStatus.PendingApproval).ToList();
        var approvedNotPaid = vouchers.Where(v => v.Status == VoucherStatus.Approved).ToList();

        var totalPaid = paid.Sum(v => v.AmountTotal);
        var avgPaid = paid.Count == 0 ? 0m : Math.Round(totalPaid / paid.Count, 2);
        var maxPaid = paid.Count == 0 ? 0m : paid.Max(v => v.AmountTotal);

        var statusMix = new[]
        {
            new NamedAmountPoint("Draft", countOf(VoucherStatus.Draft), vouchers.Where(v => v.Status == VoucherStatus.Draft).Sum(v => v.AmountTotal)),
            new NamedAmountPoint("Pending approval", pendingApproval.Count, pendingApproval.Sum(v => v.AmountTotal)),
            new NamedAmountPoint("Approved", approvedNotPaid.Count, approvedNotPaid.Sum(v => v.AmountTotal)),
            new NamedAmountPoint("Paid", paid.Count, totalPaid),
            new NamedAmountPoint("Cancelled", countOf(VoucherStatus.Cancelled), vouchers.Where(v => v.Status == VoucherStatus.Cancelled).Sum(v => v.AmountTotal)),
            new NamedAmountPoint("Reversed", countOf(VoucherStatus.Reversed), vouchers.Where(v => v.Status == VoucherStatus.Reversed).Sum(v => v.AmountTotal)),
            new NamedAmountPoint("Pending clearance", countOf(VoucherStatus.PendingClearance), vouchers.Where(v => v.Status == VoucherStatus.PendingClearance).Sum(v => v.AmountTotal)),
        }.Where(p => p.Count > 0).ToList();

        static string ModeLabel(PaymentMode m)
        {
            if (m.HasFlag(PaymentMode.Cash)) return "Cash";
            if (m.HasFlag(PaymentMode.Cheque)) return "Cheque";
            if (m.HasFlag(PaymentMode.BankTransfer)) return "Bank transfer";
            if (m.HasFlag(PaymentMode.Card)) return "Card";
            if (m.HasFlag(PaymentMode.Online)) return "Online";
            if (m.HasFlag(PaymentMode.Upi)) return "UPI";
            return "Other";
        }
        var byMode = paid.GroupBy(v => ModeLabel(v.PaymentMode))
            .Select(g => new NamedAmountPoint(g.Key, g.Count(), g.Sum(v => v.AmountTotal)))
            .OrderByDescending(p => p.Amount)
            .ToList();

        var byPurpose = paid.GroupBy(v => string.IsNullOrWhiteSpace(v.Purpose) ? "(Uncategorised)" : v.Purpose)
            .Select(g => new NamedAmountPoint(g.Key, g.Count(), g.Sum(v => v.AmountTotal)))
            .OrderByDescending(p => p.Amount)
            .Take(8).ToList();

        var topPayees = paid.GroupBy(v => string.IsNullOrWhiteSpace(v.PayTo) ? "(Unknown)" : v.PayTo)
            .Select(g => new NamedAmountPoint(g.Key, g.Count(), g.Sum(v => v.AmountTotal)))
            .OrderByDescending(p => p.Amount)
            .Take(8).ToList();

        // By expense type — pull names for the top expense type ids referenced by paid vouchers.
        var lineGroups = paid.SelectMany(v => v.Lines)
            .GroupBy(l => l.ExpenseTypeId)
            .Select(g => new { Id = g.Key, Count = g.Count(), Amount = g.Sum(l => l.Amount) })
            .OrderByDescending(g => g.Amount)
            .Take(8)
            .ToList();
        var expenseTypeIds = lineGroups.Select(g => g.Id).ToList();
        var expenseTypes = expenseTypeIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.ExpenseTypes.AsNoTracking()
                .Where(e => expenseTypeIds.Contains(e.Id))
                .ToDictionaryAsync(e => e.Id, e => e.Name, ct);
        var byExpenseType = lineGroups
            .Select(g => new NamedAmountPoint(expenseTypes.TryGetValue(g.Id, out var n) ? n : "(unknown)", g.Count, g.Amount))
            .ToList();

        // Daily outflow curve (paid vouchers only)
        var byDay = paid.GroupBy(v => v.VoucherDate)
            .ToDictionary(g => g.Key, g => new { Count = g.Count(), Amount = g.Sum(v => v.AmountTotal) });
        var daily = new List<DailyAmountPoint>();
        for (var d = windowFrom; d <= windowTo; d = d.AddDays(1))
        {
            if (byDay.TryGetValue(d, out var cell)) daily.Add(new DailyAmountPoint(d, cell.Count, cell.Amount));
            else daily.Add(new DailyAmountPoint(d, 0, 0m));
        }

        // Monthly count - last 12 months ending today
        var monthStart = new DateOnly(today.Year, today.Month, 1).AddMonths(-11);
        var monthMap = new Dictionary<(int Y, int M), int>();
        for (var d = monthStart; d <= today; d = d.AddMonths(1)) monthMap[(d.Year, d.Month)] = 0;
        var allRecent = await db.Vouchers.AsNoTracking()
            .Where(v => v.VoucherDate >= monthStart)
            .Select(v => v.VoucherDate)
            .ToListAsync(ct);
        foreach (var d in allRecent)
        {
            var k = (d.Year, d.Month);
            if (monthMap.TryGetValue(k, out var c)) monthMap[k] = c + 1;
        }
        var monthly = monthMap.OrderBy(kv => kv.Key.Y).ThenBy(kv => kv.Key.M)
            .Select(kv => new MemberMonthlyPoint(kv.Key.Y, kv.Key.M, kv.Value))
            .ToList();

        return new VouchersDashboardDto(
            currency, totalCount,
            countOf(VoucherStatus.Draft), pendingApproval.Count, approvedNotPaid.Count, paid.Count,
            countOf(VoucherStatus.Cancelled), countOf(VoucherStatus.Reversed), countOf(VoucherStatus.PendingClearance),
            totalPaid, pendingApproval.Sum(v => v.AmountTotal), approvedNotPaid.Sum(v => v.AmountTotal),
            avgPaid, maxPaid, windowFrom, windowTo,
            statusMix, byMode, byPurpose, byExpenseType, topPayees,
            daily, monthly);
    }

    // -- Receipts dashboard --------------------------------------------------

    public async Task<ReceiptsDashboardDto> ReceiptsAsync(DateOnly? from, DateOnly? to, Guid? fundTypeId, CancellationToken ct = default)
    {
        var today = clock.Today;
        var windowTo = to ?? today;
        var windowFrom = from ?? today.AddDays(-89);
        if (windowFrom > windowTo) (windowFrom, windowTo) = (windowTo, windowFrom);

        var receipts = await db.Receipts.AsNoTracking()
            .Where(r => r.ReceiptDate >= windowFrom && r.ReceiptDate <= windowTo)
            .Include(r => r.Lines)
            .Select(r => new
            {
                r.Id, r.ReceiptDate, r.AmountTotal, r.Currency, r.Status, r.PaymentMode,
                r.Intention, r.MemberId, r.MemberNameSnapshot, r.ItsNumberSnapshot,
                Lines = r.Lines.Select(l => new { l.FundTypeId, l.Amount }).ToList(),
            })
            .ToListAsync(ct);

        // If a fund filter is set, retain only receipts that have at least one line for that fund,
        // and treat the per-receipt amount as the sum of matching lines.
        if (fundTypeId is { } ftid)
        {
            receipts = receipts
                .Select(r => new
                {
                    r.Id, r.ReceiptDate,
                    AmountTotal = r.Lines.Where(l => l.FundTypeId == ftid).Sum(l => l.Amount),
                    r.Currency, r.Status, r.PaymentMode, r.Intention,
                    r.MemberId, r.MemberNameSnapshot, r.ItsNumberSnapshot,
                    Lines = r.Lines.Where(l => l.FundTypeId == ftid).ToList(),
                })
                .Where(r => r.AmountTotal > 0)
                .ToList();
        }

        var currency = receipts.Select(r => r.Currency).FirstOrDefault() ?? "AED";
        var total = receipts.Count;
        int countOf(ReceiptStatus s) => receipts.Count(r => r.Status == s);
        var confirmed = receipts.Where(r => r.Status == ReceiptStatus.Confirmed).ToList();
        var totalAmount = confirmed.Sum(r => r.AmountTotal);
        var permanent = confirmed.Where(r => r.Intention == ContributionIntention.Permanent).Sum(r => r.AmountTotal);
        var returnable = confirmed.Where(r => r.Intention == ContributionIntention.Returnable).Sum(r => r.AmountTotal);
        var avg = confirmed.Count == 0 ? 0m : Math.Round(totalAmount / confirmed.Count, 2);
        var max = confirmed.Count == 0 ? 0m : confirmed.Max(r => r.AmountTotal);
        var unique = confirmed.Select(r => r.MemberId).Distinct().Count();

        static string ModeLabel(PaymentMode m)
        {
            if (m.HasFlag(PaymentMode.Cash)) return "Cash";
            if (m.HasFlag(PaymentMode.Cheque)) return "Cheque";
            if (m.HasFlag(PaymentMode.BankTransfer)) return "Bank transfer";
            if (m.HasFlag(PaymentMode.Card)) return "Card";
            if (m.HasFlag(PaymentMode.Online)) return "Online";
            if (m.HasFlag(PaymentMode.Upi)) return "UPI";
            return "Other";
        }
        var byMode = confirmed.GroupBy(r => ModeLabel(r.PaymentMode))
            .Select(g => new NamedAmountPoint(g.Key, g.Count(), g.Sum(r => r.AmountTotal)))
            .OrderByDescending(p => p.Amount).ToList();

        // By fund - pull names for the fund ids that show up
        var fundIds = confirmed.SelectMany(r => r.Lines.Select(l => l.FundTypeId)).Distinct().ToList();
        var funds = fundIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.FundTypes.AsNoTracking().Where(f => fundIds.Contains(f.Id))
                .ToDictionaryAsync(f => f.Id, f => f.NameEnglish, ct);
        var byFund = confirmed.SelectMany(r => r.Lines)
            .GroupBy(l => l.FundTypeId)
            .Select(g => new NamedAmountPoint(funds.TryGetValue(g.Key, out var n) ? n : "(unknown)", g.Count(), g.Sum(l => l.Amount)))
            .OrderByDescending(p => p.Amount).Take(8).ToList();

        var intentionSplit = new[]
        {
            new NamedAmountPoint("Permanent", confirmed.Count(r => r.Intention == ContributionIntention.Permanent), permanent),
            new NamedAmountPoint("Returnable", confirmed.Count(r => r.Intention == ContributionIntention.Returnable), returnable),
        }.Where(p => p.Count > 0).ToList();

        var byDay = confirmed.GroupBy(r => r.ReceiptDate)
            .ToDictionary(g => g.Key, g => new { Count = g.Count(), Amount = g.Sum(r => r.AmountTotal) });
        var daily = new List<DailyAmountPoint>();
        for (var d = windowFrom; d <= windowTo; d = d.AddDays(1))
        {
            if (byDay.TryGetValue(d, out var cell)) daily.Add(new DailyAmountPoint(d, cell.Count, cell.Amount));
            else daily.Add(new DailyAmountPoint(d, 0, 0m));
        }

        var monthStart = new DateOnly(today.Year, today.Month, 1).AddMonths(-11);
        var monthMap = new Dictionary<(int Y, int M), int>();
        for (var d = monthStart; d <= today; d = d.AddMonths(1)) monthMap[(d.Year, d.Month)] = 0;
        var allRecent = await db.Receipts.AsNoTracking()
            .Where(r => r.ReceiptDate >= monthStart && r.Status == ReceiptStatus.Confirmed)
            .Select(r => r.ReceiptDate).ToListAsync(ct);
        foreach (var d in allRecent)
        {
            var k = (d.Year, d.Month);
            if (monthMap.TryGetValue(k, out var c)) monthMap[k] = c + 1;
        }
        var monthly = monthMap.OrderBy(kv => kv.Key.Y).ThenBy(kv => kv.Key.M)
            .Select(kv => new MemberMonthlyPoint(kv.Key.Y, kv.Key.M, kv.Value)).ToList();

        var topContribs = confirmed.GroupBy(r => r.MemberId)
            .Select(g => new TopContributorPoint(
                g.Key, g.First().ItsNumberSnapshot, g.First().MemberNameSnapshot,
                g.Sum(r => r.AmountTotal), g.Count(), currency))
            .OrderByDescending(p => p.Amount)
            .Take(8).ToList();

        string? scopedFundName = null;
        if (fundTypeId is { } id)
        {
            scopedFundName = await db.FundTypes.AsNoTracking()
                .Where(f => f.Id == id)
                .Select(f => f.NameEnglish)
                .FirstOrDefaultAsync(ct);
        }

        return new ReceiptsDashboardDto(
            currency, total,
            confirmed.Count, countOf(ReceiptStatus.Draft), countOf(ReceiptStatus.Cancelled),
            countOf(ReceiptStatus.Reversed), countOf(ReceiptStatus.PendingClearance),
            totalAmount, permanent, returnable,
            avg, max, unique,
            windowFrom, windowTo, fundTypeId, scopedFundName,
            byMode, byFund, intentionSplit, daily, monthly, topContribs);
    }

    // -- Member assets dashboard ---------------------------------------------

    public async Task<MemberAssetsDashboardDto> MemberAssetsAsync(Guid? sectorId, CancellationToken ct = default)
    {
        var today = clock.Today;

        // Build the member set first (so we can filter assets by sector).
        var memberQ = db.Members.AsNoTracking().Where(m => !m.IsDeleted);
        if (sectorId is { } sid) memberQ = memberQ.Where(m => m.SectorId == sid);
        var members = await memberQ
            .Select(m => new { m.Id, m.SectorId, FullName = m.FullName, ItsNumber = m.ItsNumber.Value })
            .ToListAsync(ct);
        var memberIds = members.Select(m => m.Id).ToHashSet();

        var assets = await db.MemberAssets.AsNoTracking()
            .Select(a => new { a.Id, a.MemberId, a.Kind, a.EstimatedValue, a.Currency, a.CreatedAtUtc })
            .ToListAsync(ct);
        if (sectorId is not null) assets = assets.Where(a => memberIds.Contains(a.MemberId)).ToList();

        var currency = assets.Select(a => a.Currency).FirstOrDefault() ?? "AED";
        var totalAssets = assets.Count;
        var membersWithAssets = assets.Select(a => a.MemberId).Distinct().Count();
        var totalValue = assets.Sum(a => a.EstimatedValue ?? 0m);
        var avg = totalAssets == 0 ? 0m : Math.Round(totalValue / totalAssets, 2);
        var max = totalAssets == 0 ? 0m : assets.Max(a => a.EstimatedValue ?? 0m);

        var byKind = assets.GroupBy(a => a.Kind)
            .Select(g => new NamedAmountPoint(g.Key.ToString(), g.Count(), g.Sum(a => a.EstimatedValue ?? 0m)))
            .OrderByDescending(p => p.Amount)
            .ToList();

        var memberById = members.ToDictionary(m => m.Id, m => m);
        var topMembers = assets.GroupBy(a => a.MemberId)
            .Select(g =>
            {
                var m = memberById.TryGetValue(g.Key, out var mm) ? mm : null;
                return new TopAssetMemberRow(
                    g.Key, m?.ItsNumber ?? "-", m?.FullName ?? "(unknown)",
                    g.Count(), g.Sum(a => a.EstimatedValue ?? 0m));
            })
            .OrderByDescending(r => r.TotalValue)
            .Take(10).ToList();

        var monthStart = new DateOnly(today.Year, today.Month, 1).AddMonths(-11);
        var monthStartUtc = monthStart.ToDateTime(TimeOnly.MinValue);
        var monthMap = new Dictionary<(int Y, int M), int>();
        for (var d = monthStart; d <= today; d = d.AddMonths(1)) monthMap[(d.Year, d.Month)] = 0;
        foreach (var a in assets.Where(a => a.CreatedAtUtc.UtcDateTime >= monthStartUtc))
        {
            var d = DateOnly.FromDateTime(a.CreatedAtUtc.UtcDateTime);
            var k = (d.Year, d.Month);
            if (monthMap.TryGetValue(k, out var c)) monthMap[k] = c + 1;
        }
        var trend = monthMap.OrderBy(kv => kv.Key.Y).ThenBy(kv => kv.Key.M)
            .Select(kv => new MemberMonthlyPoint(kv.Key.Y, kv.Key.M, kv.Value)).ToList();

        // Assets by sector across the entire (non-filtered) member base, for context.
        var sectorMap = await db.Members.AsNoTracking()
            .Where(m => !m.IsDeleted && m.SectorId.HasValue)
            .Select(m => new { m.Id, m.SectorId })
            .ToListAsync(ct);
        var sectorOfMember = sectorMap.ToDictionary(x => x.Id, x => x.SectorId!.Value);
        var sectorIds = sectorOfMember.Values.Distinct().ToList();
        var sectors = sectorIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.Sectors.AsNoTracking().Where(s => sectorIds.Contains(s.Id))
                .ToDictionaryAsync(s => s.Id, s => s.Name, ct);
        var allAssets = await db.MemberAssets.AsNoTracking().Select(a => a.MemberId).ToListAsync(ct);
        var assetsBySector = allAssets
            .Where(mid => sectorOfMember.ContainsKey(mid))
            .GroupBy(mid => sectorOfMember[mid])
            .Select(g => new NamedCountPoint(sectors.TryGetValue(g.Key, out var n) ? n : "(unknown)", g.Count()))
            .OrderByDescending(p => p.Count)
            .Take(8).ToList();

        string? scopedSectorName = null;
        if (sectorId is { } s)
        {
            scopedSectorName = await db.Sectors.AsNoTracking()
                .Where(x => x.Id == s).Select(x => x.Name).FirstOrDefaultAsync(ct);
        }

        return new MemberAssetsDashboardDto(
            currency, totalAssets, membersWithAssets,
            totalValue, avg, max,
            sectorId, scopedSectorName,
            byKind, topMembers, trend, assetsBySector);
    }

    // -- Sectors dashboard ---------------------------------------------------

    public async Task<SectorsDashboardDto> SectorsAsync(CancellationToken ct = default)
    {
        var today = clock.Today;
        var ytdStart = new DateOnly(today.Year, 1, 1);

        var sectors = await db.Sectors.AsNoTracking()
            .Select(s => new { s.Id, s.Code, s.Name, s.IsActive })
            .ToListAsync(ct);

        var members = await db.Members.AsNoTracking()
            .Where(m => !m.IsDeleted)
            .Select(m => new { m.Id, m.SectorId, m.Status, m.DataVerificationStatus, m.FamilyId })
            .ToListAsync(ct);

        var totalMembers = members.Count;
        var noSector = members.Count(m => !m.SectorId.HasValue);

        var receipts = await db.Receipts.AsNoTracking()
            .Where(r => r.Status == ReceiptStatus.Confirmed && r.ReceiptDate >= ytdStart)
            .Select(r => new { r.MemberId, r.AmountTotal, r.Currency })
            .ToListAsync(ct);
        var currency = receipts.Select(r => r.Currency).FirstOrDefault() ?? "AED";
        var totalContrib = receipts.Sum(r => r.AmountTotal);

        var memberSectorMap = members.Where(m => m.SectorId.HasValue)
            .GroupBy(m => m.SectorId!.Value)
            .ToDictionary(g => g.Key, g => g.ToList());

        var contribByMember = receipts.GroupBy(r => r.MemberId)
            .ToDictionary(g => g.Key, g => g.Sum(r => r.AmountTotal));

        var commitments = await db.Commitments.AsNoTracking()
            .Where(c => c.Status == CommitmentStatus.Active && c.MemberId.HasValue)
            .Select(c => c.MemberId!.Value)
            .ToListAsync(ct);
        var commitByMember = commitments.GroupBy(m => m).ToDictionary(g => g.Key, g => g.Count());

        var assets = await db.MemberAssets.AsNoTracking()
            .Select(a => new { a.MemberId, Value = a.EstimatedValue ?? 0m })
            .ToListAsync(ct);
        var assetsByMember = assets.GroupBy(a => a.MemberId)
            .ToDictionary(g => g.Key, g => g.Sum(a => a.Value));

        var rows = sectors
            .Select(s =>
            {
                var sectorMembers = memberSectorMap.TryGetValue(s.Id, out var ms) ? ms : new();
                var memberIds = sectorMembers.Select(m => m.Id).ToHashSet();
                var familyIds = sectorMembers.Where(m => m.FamilyId.HasValue).Select(m => m.FamilyId!.Value).Distinct().Count();
                var contrib = sectorMembers.Sum(m => contribByMember.TryGetValue(m.Id, out var v) ? v : 0m);
                var commitCount = sectorMembers.Sum(m => commitByMember.TryGetValue(m.Id, out var c) ? c : 0);
                var assetTotal = sectorMembers.Sum(m => assetsByMember.TryGetValue(m.Id, out var a) ? a : 0m);
                var active = sectorMembers.Count(m => m.Status == MemberStatus.Active);
                var verified = sectorMembers.Count(m => m.DataVerificationStatus == VerificationStatus.Verified);
                return new SectorRow(
                    s.Id, s.Code, s.Name, s.IsActive,
                    sectorMembers.Count, active, verified,
                    familyIds, commitCount, contrib, assetTotal);
            })
            .OrderByDescending(r => r.MemberCount)
            .ToList();

        return new SectorsDashboardDto(
            currency, sectors.Count, sectors.Count(s => s.IsActive),
            totalMembers, noSector, totalContrib, rows);
    }

    // -- Returnable receipts dashboard --------------------------------------

    public async Task<ReturnablesDashboardDto> ReturnablesAsync(Guid? fundTypeId, CancellationToken ct = default)
    {
        var today = clock.Today;

        var receipts = await db.Receipts.AsNoTracking()
            .Where(r => r.Intention == ContributionIntention.Returnable && r.Status == ReceiptStatus.Confirmed)
            .Include(r => r.Lines)
            .Select(r => new
            {
                r.Id, r.ReceiptDate, r.AmountTotal, r.AmountReturned, r.MaturityDate, r.MaturityState,
                r.Currency, r.MemberId, r.MemberNameSnapshot, r.ItsNumberSnapshot,
                Lines = r.Lines.Select(l => new { l.FundTypeId, l.Amount }).ToList(),
            })
            .ToListAsync(ct);

        if (fundTypeId is { } ftid)
        {
            receipts = receipts.Where(r => r.Lines.Any(l => l.FundTypeId == ftid)).ToList();
        }

        var currency = receipts.Select(r => r.Currency).FirstOrDefault() ?? "AED";
        var totalIssued = receipts.Sum(r => r.AmountTotal);
        var totalReturned = receipts.Sum(r => r.AmountReturned);
        var outstanding = Math.Max(0m, totalIssued - totalReturned);

        // Overdue: matured but not fully returned. Maturity passed and remaining > 0.
        var overdueReceipts = receipts.Where(r =>
            r.MaturityDate.HasValue && r.MaturityDate.Value < today
            && r.AmountReturned < r.AmountTotal).ToList();
        var maturedNotReturned = receipts.Where(r =>
            r.MaturityState == ReturnableMaturityState.Matured
            || r.MaturityState == ReturnableMaturityState.PartiallyReturned).ToList();

        // Age buckets (by receipt date)
        (int hi, string label)[] edges = { (30, "0-30 days"), (60, "31-60 days"), (90, "61-90 days"), (180, "91-180 days"), (int.MaxValue, "180+ days") };
        var bucketCounts = new int[edges.Length];
        var bucketAmounts = new decimal[edges.Length];
        foreach (var r in receipts)
        {
            var age = today.DayNumber - r.ReceiptDate.DayNumber;
            for (var i = 0; i < edges.Length; i++)
            {
                if (age <= edges[i].hi)
                {
                    bucketCounts[i]++;
                    bucketAmounts[i] += r.AmountTotal - r.AmountReturned;
                    break;
                }
            }
        }
        var ageBuckets = edges.Select((e, i) => new NamedAmountPoint(e.label, bucketCounts[i], bucketAmounts[i])).ToList();

        // By fund - pull names
        var fundIds = receipts.SelectMany(r => r.Lines.Select(l => l.FundTypeId)).Distinct().ToList();
        var funds = fundIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.FundTypes.AsNoTracking().Where(f => fundIds.Contains(f.Id))
                .ToDictionaryAsync(f => f.Id, f => f.NameEnglish, ct);
        var byFund = receipts.SelectMany(r => r.Lines.Select(l => new { l.FundTypeId, l.Amount, r.AmountReturned, r.AmountTotal }))
            .GroupBy(x => x.FundTypeId)
            .Select(g =>
            {
                var amount = g.Sum(x => x.AmountTotal == 0 ? 0m : x.Amount * Math.Max(0m, x.AmountTotal - x.AmountReturned) / x.AmountTotal);
                return new NamedAmountPoint(funds.TryGetValue(g.Key, out var n) ? n : "(unknown)", g.Count(), amount);
            })
            .OrderByDescending(p => p.Amount)
            .Take(8).ToList();

        var maturityStateMix = receipts.GroupBy(r => r.MaturityState)
            .Select(g => new NamedAmountPoint(g.Key.ToString(), g.Count(),
                g.Sum(r => Math.Max(0m, r.AmountTotal - r.AmountReturned))))
            .OrderByDescending(p => p.Count)
            .ToList();

        var topHolders = receipts
            .GroupBy(r => r.MemberId)
            .Select(g => new TopReturnableHolderRow(
                g.Key, g.First().MemberNameSnapshot, g.First().ItsNumberSnapshot,
                g.Count(), g.Sum(r => r.AmountTotal),
                Math.Max(0m, g.Sum(r => r.AmountTotal) - g.Sum(r => r.AmountReturned))))
            .OrderByDescending(r => r.Outstanding)
            .Take(8)
            .ToList();

        // Upcoming maturity timeline (next 12 weeks)
        var dow = (int)today.DayOfWeek;
        var mondayOffset = dow == 0 ? -6 : 1 - dow;
        var weekStart = today.AddDays(mondayOffset);
        var timeline = new List<MaturityWeekPoint>();
        for (var w = weekStart; w < weekStart.AddDays(7 * 12); w = w.AddDays(7))
        {
            var weekEnd = w.AddDays(7);
            var weekRows = receipts.Where(r => r.MaturityDate.HasValue
                && r.MaturityDate.Value >= w && r.MaturityDate.Value < weekEnd
                && r.AmountReturned < r.AmountTotal).ToList();
            timeline.Add(new MaturityWeekPoint(w, weekRows.Count, weekRows.Sum(r => Math.Max(0m, r.AmountTotal - r.AmountReturned))));
        }

        string? scopedFundName = null;
        if (fundTypeId is { } id)
        {
            scopedFundName = await db.FundTypes.AsNoTracking()
                .Where(f => f.Id == id).Select(f => f.NameEnglish).FirstOrDefaultAsync(ct);
        }

        return new ReturnablesDashboardDto(
            currency, receipts.Count, totalIssued, totalReturned, outstanding,
            overdueReceipts.Count, overdueReceipts.Sum(r => r.AmountTotal - r.AmountReturned),
            maturedNotReturned.Count, maturedNotReturned.Sum(r => Math.Max(0m, r.AmountTotal - r.AmountReturned)),
            fundTypeId, scopedFundName,
            ageBuckets, byFund, maturityStateMix, topHolders, timeline);
    }

    // -- Per-member drill-in -------------------------------------------------

    public async Task<MemberDetailDashboardDto?> MemberDetailAsync(Guid memberId, CancellationToken ct = default)
    {
        var m = await db.Members.AsNoTracking()
            .Where(x => x.Id == memberId && !x.IsDeleted)
            .Select(x => new
            {
                x.Id, x.FullName, x.Phone, x.Email, x.DateOfBirth,
                ItsNumber = x.ItsNumber.Value,
                x.Status, x.DataVerificationStatus, x.MisaqStatus, x.HajjStatus,
                x.FamilyId, x.FamilyRole, x.SectorId,
            })
            .FirstOrDefaultAsync(ct);
        if (m is null) return null;

        var today = clock.Today;
        var ytdStart = new DateOnly(today.Year, 1, 1);
        var thisMonthStart = new DateOnly(today.Year, today.Month, 1);
        var trendStart = thisMonthStart.AddMonths(-11);

        var receipts = await db.Receipts.AsNoTracking()
            .Where(r => r.MemberId == memberId && r.Status == ReceiptStatus.Confirmed)
            .Include(r => r.Lines)
            .Select(r => new
            {
                r.Id, r.ReceiptNumber, r.ReceiptDate, r.AmountTotal, r.Currency, r.Status, r.PaymentMode,
                Lines = r.Lines.Select(l => new { l.FundTypeId, l.Amount }).ToList(),
            })
            .ToListAsync(ct);

        var currency = receipts.Select(r => r.Currency).FirstOrDefault() ?? "AED";
        var lifetime = receipts.Sum(r => r.AmountTotal);
        var ytd = receipts.Where(r => r.ReceiptDate >= ytdStart).Sum(r => r.AmountTotal);
        var monthSum = receipts.Where(r => r.ReceiptDate >= thisMonthStart).Sum(r => r.AmountTotal);

        var fundIds = receipts.SelectMany(r => r.Lines.Select(l => l.FundTypeId)).Distinct().ToList();
        var funds = fundIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.FundTypes.AsNoTracking().Where(f => fundIds.Contains(f.Id))
                .ToDictionaryAsync(f => f.Id, f => f.NameEnglish, ct);
        var byFund = receipts.SelectMany(r => r.Lines)
            .GroupBy(l => l.FundTypeId)
            .Select(g => new NamedAmountPoint(funds.TryGetValue(g.Key, out var n) ? n : "(unknown)",
                g.Count(), g.Sum(l => l.Amount)))
            .OrderByDescending(p => p.Amount).Take(8).ToList();

        var monthMap = new Dictionary<(int Y, int M), (decimal A, int N)>();
        for (var d = trendStart; d <= today; d = d.AddMonths(1)) monthMap[(d.Year, d.Month)] = (0m, 0);
        foreach (var r in receipts.Where(r => r.ReceiptDate >= trendStart))
        {
            var k = (r.ReceiptDate.Year, r.ReceiptDate.Month);
            if (monthMap.TryGetValue(k, out var v)) monthMap[k] = (v.A + r.AmountTotal, v.N + 1);
        }
        var monthlyTrend = monthMap.OrderBy(kv => kv.Key.Y).ThenBy(kv => kv.Key.M)
            .Select(kv => new MonthlyAmountPoint(kv.Key.Y, kv.Key.M, kv.Value.A, kv.Value.N)).ToList();

        var commitments = await db.Commitments.AsNoTracking()
            .Where(c => c.MemberId == memberId)
            .Include(c => c.Installments)
            .Select(c => new
            {
                c.Id, c.FundTypeId, c.TotalAmount, c.PaidAmount, c.Status,
                Installments = c.Installments.Select(i => new { i.Status, i.DueDate }).ToList(),
            })
            .ToListAsync(ct);

        var commitFundIds = commitments.Select(c => c.FundTypeId).Distinct().ToList();
        var commitFunds = commitFundIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await db.FundTypes.AsNoTracking().Where(f => commitFundIds.Contains(f.Id))
                .ToDictionaryAsync(f => f.Id, f => f.NameEnglish, ct);
        var commitmentRows = commitments.Select(c =>
        {
            var paid = c.Installments.Count(i => i.Status == InstallmentStatus.Paid);
            var overdue = c.Installments.Count(i => i.Status == InstallmentStatus.Overdue
                || (i.Status == InstallmentStatus.Pending && i.DueDate < today));
            return new MemberCommitmentRow(c.Id,
                commitFunds.TryGetValue(c.FundTypeId, out var n) ? n : "(unknown)",
                c.TotalAmount, c.PaidAmount, (int)c.Status,
                c.Installments.Count, paid, overdue);
        }).OrderByDescending(r => r.TotalAmount).ToList();

        var loansRaw = await db.QarzanHasanaLoans.AsNoTracking()
            .Where(l => l.MemberId == memberId)
            .Select(l => new MemberLoanRow(l.Id, l.Code, (int)l.Status,
                l.AmountDisbursed, l.AmountRepaid, l.AmountOutstanding, l.DisbursedOn))
            .ToListAsync(ct);
        var loans = loansRaw
            .OrderByDescending(l => l.DisbursedOn ?? DateOnly.MinValue)
            .ToList();

        var assets = await db.MemberAssets.AsNoTracking()
            .Where(a => a.MemberId == memberId)
            .Select(a => a.EstimatedValue ?? 0m)
            .ToListAsync(ct);

        var eventRegs = await db.EventRegistrations.AsNoTracking()
            .Where(er => er.MemberId == memberId)
            .Select(er => er.Status)
            .ToListAsync(ct);

        Guid? familyId = m.FamilyId;
        string? familyName = null; string? familyCode = null;
        if (familyId is { } fid)
        {
            var fam = await db.Families.AsNoTracking().Where(f => f.Id == fid)
                .Select(f => new { f.FamilyName, f.Code }).FirstOrDefaultAsync(ct);
            familyName = fam?.FamilyName;
            familyCode = fam?.Code;
        }

        string? sectorName = null;
        if (m.SectorId is { } sid)
        {
            sectorName = await db.Sectors.AsNoTracking().Where(s => s.Id == sid)
                .Select(s => s.Name).FirstOrDefaultAsync(ct);
        }

        var recent = receipts.OrderByDescending(r => r.ReceiptDate).Take(8)
            .Select(r => new MemberRecentReceiptRow(r.Id, r.ReceiptNumber, r.ReceiptDate,
                r.AmountTotal, (int)r.Status, (int)r.PaymentMode))
            .ToList();

        return new MemberDetailDashboardDto(
            m.Id, m.ItsNumber, m.FullName,
            (int)m.Status, m.Phone, m.Email, m.DateOfBirth,
            (int)m.DataVerificationStatus, (int)m.MisaqStatus, (int)m.HajjStatus,
            familyId, familyName, familyCode, m.FamilyRole.HasValue ? (int)m.FamilyRole.Value : 0,
            m.SectorId, sectorName,
            currency,
            lifetime, ytd, monthSum,
            receipts.Count, receipts.Count(r => r.ReceiptDate >= ytdStart),
            commitments.Count, commitments.Sum(c => c.TotalAmount), commitments.Sum(c => c.PaidAmount),
            commitments.Count(c => c.Status == CommitmentStatus.Defaulted),
            loans.Count, loans.Sum(l => l.AmountDisbursed), loans.Sum(l => l.AmountRepaid),
            loans.Sum(l => l.AmountOutstanding),
            assets.Count, assets.Sum(),
            eventRegs.Count,
            eventRegs.Count(s => s == RegistrationStatus.CheckedIn),
            monthlyTrend, byFund, commitmentRows, loans, recent);
    }

    // -- Per-commitment drill-in ---------------------------------------------

    public async Task<CommitmentDetailDashboardDto?> CommitmentDetailAsync(Guid commitmentId, CancellationToken ct = default)
    {
        var c = await db.Commitments.AsNoTracking()
            .Where(x => x.Id == commitmentId)
            .Include(x => x.Installments)
            .Select(x => new
            {
                x.Id, x.MemberId, x.FundTypeId, x.AgreementTemplateId,
                x.TotalAmount, x.PaidAmount, x.Status, x.Currency, x.CreatedAtUtc,
                Installments = x.Installments.Select(i => new
                {
                    i.Id, i.InstallmentNo, i.DueDate, i.ScheduledAmount, i.PaidAmount, i.Status,
                }).OrderBy(i => i.InstallmentNo).ToList(),
            })
            .FirstOrDefaultAsync(ct);
        if (c is null) return null;

        var today = clock.Today;
        var fund = await db.FundTypes.AsNoTracking().Where(f => f.Id == c.FundTypeId)
            .Select(f => new { f.Code, f.NameEnglish }).FirstOrDefaultAsync(ct);

        string? memberName = null; string? memberIts = null;
        if (c.MemberId is { } mid)
        {
            var mem = await db.Members.AsNoTracking().Where(m => m.Id == mid)
                .Select(m => new { m.FullName, ItsNumber = m.ItsNumber.Value }).FirstOrDefaultAsync(ct);
            memberName = mem?.FullName;
            memberIts = mem?.ItsNumber;
        }

        string? templateName = null;
        if (c.AgreementTemplateId is { } tid)
        {
            templateName = await db.CommitmentAgreementTemplates.AsNoTracking()
                .Where(t => t.Id == tid).Select(t => t.Name).FirstOrDefaultAsync(ct);
        }

        var schedule = c.Installments.Select(i =>
        {
            var remaining = Math.Max(0m, i.ScheduledAmount - i.PaidAmount);
            var overdueDays = i.Status != InstallmentStatus.Paid && i.DueDate < today
                ? today.DayNumber - i.DueDate.DayNumber : 0;
            return new CommitmentInstallmentRow(i.Id, i.InstallmentNo, i.DueDate,
                i.ScheduledAmount, i.PaidAmount, remaining, (int)i.Status, overdueDays);
        }).ToList();

        var paidCount = c.Installments.Count(i => i.Status == InstallmentStatus.Paid);
        var pendingCount = c.Installments.Count(i => i.Status == InstallmentStatus.Pending);
        var overdueCount = c.Installments.Count(i => i.Status == InstallmentStatus.Overdue
            || (i.Status == InstallmentStatus.Pending && i.DueDate < today));
        var nextDue = c.Installments.Where(i => i.Status != InstallmentStatus.Paid && i.Status != InstallmentStatus.Waived)
            .OrderBy(i => i.DueDate).FirstOrDefault();

        var installmentNoById = c.Installments.ToDictionary(i => i.Id, i => i.InstallmentNo);
        var installmentIds = installmentNoById.Keys.ToList();
        var paymentRows = installmentIds.Count == 0
            ? new()
            : await (
                from r in db.Receipts.AsNoTracking()
                from l in r.Lines
                where r.Status == ReceiptStatus.Confirmed
                    && l.CommitmentInstallmentId.HasValue
                    && installmentIds.Contains(l.CommitmentInstallmentId.Value)
                select new
                {
                    ReceiptId = r.Id, r.ReceiptNumber, r.ReceiptDate,
                    InstId = l.CommitmentInstallmentId!.Value, l.Amount,
                })
                .ToListAsync(ct);
        var payments = paymentRows
            .OrderByDescending(p => p.ReceiptDate)
            .Select(p => new CommitmentPaymentRow(
                p.ReceiptId, p.ReceiptNumber, p.ReceiptDate,
                installmentNoById.TryGetValue(p.InstId, out var no) ? no : 0,
                p.Amount))
            .ToList();

        var prog = c.TotalAmount == 0 ? 0 : (int)Math.Round(c.PaidAmount * 100m / c.TotalAmount);

        return new CommitmentDetailDashboardDto(
            c.Id, c.Currency,
            c.MemberId, memberName, memberIts,
            c.FundTypeId, fund?.Code ?? "-", fund?.NameEnglish ?? "(unknown)",
            c.AgreementTemplateId, templateName,
            (int)c.Status, c.TotalAmount, c.PaidAmount, Math.Max(0m, c.TotalAmount - c.PaidAmount),
            prog,
            c.Installments.Count, paidCount, pendingCount, overdueCount,
            nextDue?.DueDate, nextDue?.ScheduledAmount,
            DateOnly.FromDateTime(c.CreatedAtUtc.UtcDateTime),
            schedule, payments);
    }

    // -- Notifications dashboard ---------------------------------------------

    public async Task<NotificationsDashboardDto> NotificationsAsync(DateOnly? from, DateOnly? to, CancellationToken ct = default)
    {
        var today = clock.Today;
        var windowTo = to ?? today;
        var windowFrom = from ?? today.AddDays(-29);
        if (windowFrom > windowTo) (windowFrom, windowTo) = (windowTo, windowFrom);
        var fromUtc = windowFrom.ToDateTime(TimeOnly.MinValue);
        var toUtc = windowTo.ToDateTime(TimeOnly.MaxValue);

        var logs = await db.NotificationLogs.AsNoTracking()
            .Where(n => n.AttemptedAtUtc >= fromUtc && n.AttemptedAtUtc <= toUtc)
            .Select(n => new { n.Id, n.AttemptedAtUtc, n.Channel, n.Status, n.Kind, n.FailureReason, n.Subject })
            .ToListAsync(ct);

        var total = logs.Count;
        int countOf(NotificationStatus s) => logs.Count(l => l.Status == s);
        var sent = countOf(NotificationStatus.Sent);
        var failed = countOf(NotificationStatus.Failed);
        var skipped = countOf(NotificationStatus.Skipped);
        var actionable = sent + failed;
        var deliveryRate = actionable == 0 ? 0 : (int)Math.Round(sent * 100m / actionable);

        var byChannel = logs.GroupBy(l => l.Channel)
            .Select(g => new NamedCountPoint(g.Key.ToString(), g.Count()))
            .OrderByDescending(p => p.Count).ToList();

        var byStatus = logs.GroupBy(l => l.Status)
            .Select(g => new NamedCountPoint(g.Key.ToString(), g.Count()))
            .OrderByDescending(p => p.Count).ToList();

        var byKind = logs.GroupBy(l => l.Kind)
            .Select(g => new NamedCountPoint(g.Key.ToString(), g.Count()))
            .OrderByDescending(p => p.Count).Take(8).ToList();

        var topFailures = logs.Where(l => l.Status == NotificationStatus.Failed && !string.IsNullOrWhiteSpace(l.FailureReason))
            .GroupBy(l => l.FailureReason!)
            .Select(g => new NamedCountPoint(g.Key.Length > 80 ? string.Concat(g.Key.AsSpan(0, 80), "…") : g.Key, g.Count()))
            .OrderByDescending(p => p.Count).Take(6).ToList();

        var byDay = logs.GroupBy(l => DateOnly.FromDateTime(l.AttemptedAtUtc.UtcDateTime))
            .ToDictionary(g => g.Key, g => g.Count());
        var daily = new List<DailyCountPoint>();
        for (var d = windowFrom; d <= windowTo; d = d.AddDays(1))
            daily.Add(new DailyCountPoint(d, byDay.TryGetValue(d, out var c) ? c : 0));

        var recent = logs.Where(l => l.Status == NotificationStatus.Failed)
            .OrderByDescending(l => l.AttemptedAtUtc).Take(8)
            .Select(l => new NotificationFailureRow(l.Id, l.AttemptedAtUtc, (int)l.Channel, (int)l.Kind,
                l.FailureReason, l.Subject))
            .ToList();

        return new NotificationsDashboardDto(
            total, sent, failed, skipped, deliveryRate,
            windowFrom, windowTo,
            byChannel, byStatus, byKind, topFailures, daily, recent);
    }

    // -- User activity dashboard ---------------------------------------------

    public async Task<UserActivityDashboardDto> UserActivityAsync(DateOnly? from, DateOnly? to, CancellationToken ct = default)
    {
        var today = clock.Today;
        var windowTo = to ?? today;
        var windowFrom = from ?? today.AddDays(-29);
        if (windowFrom > windowTo) (windowFrom, windowTo) = (windowTo, windowFrom);
        var fromUtc = windowFrom.ToDateTime(TimeOnly.MinValue);
        var toUtc = windowTo.ToDateTime(TimeOnly.MaxValue);

        var events = await db.AuditLogs.AsNoTracking()
            .Where(a => a.AtUtc >= fromUtc && a.AtUtc <= toUtc)
            .Select(a => new { a.AtUtc, a.UserName, a.UserId, a.EntityName, a.EntityId, a.Action })
            .ToListAsync(ct);

        var total = events.Count;
        var uniqueUsers = events.Where(e => !string.IsNullOrWhiteSpace(e.UserName) && e.UserName != "system")
            .Select(e => e.UserName).Distinct().Count();
        var uniqueEntities = events.Select(e => e.EntityName).Distinct().Count();

        var topUsers = events.Where(e => !string.IsNullOrWhiteSpace(e.UserName) && e.UserName != "system")
            .GroupBy(e => e.UserName)
            .Select(g => new NamedCountPoint(g.Key, g.Count()))
            .OrderByDescending(p => p.Count).Take(8).ToList();

        var topEntities = events.GroupBy(e => e.EntityName)
            .Select(g => new NamedCountPoint(g.Key, g.Count()))
            .OrderByDescending(p => p.Count).Take(8).ToList();

        var actionMix = events.GroupBy(e => e.Action)
            .Select(g => new NamedCountPoint(g.Key, g.Count()))
            .OrderByDescending(p => p.Count).ToList();

        var byDay = events.GroupBy(e => DateOnly.FromDateTime(e.AtUtc.UtcDateTime))
            .ToDictionary(g => g.Key, g => g.Count());
        var daily = new List<DailyCountPoint>();
        for (var d = windowFrom; d <= windowTo; d = d.AddDays(1))
            daily.Add(new DailyCountPoint(d, byDay.TryGetValue(d, out var c) ? c : 0));

        var hourly = new List<HourlyCountPoint>();
        var byHour = events.GroupBy(e => e.AtUtc.UtcDateTime.Hour)
            .ToDictionary(g => g.Key, g => g.Count());
        for (var h = 0; h < 24; h++) hourly.Add(new HourlyCountPoint(h, byHour.TryGetValue(h, out var c) ? c : 0));

        var recent = events.OrderByDescending(e => e.AtUtc).Take(15)
            .Select(e => new UserActivityRecentRow(e.AtUtc, e.UserId, e.UserName, e.EntityName, e.Action, e.EntityId))
            .ToList();

        return new UserActivityDashboardDto(
            total, uniqueUsers, uniqueEntities,
            windowFrom, windowTo,
            topUsers, topEntities, actionMix, daily, hourly, recent);
    }

    // -- Change requests dashboard ------------------------------------------

    public async Task<ChangeRequestsDashboardDto> ChangeRequestsAsync(DateOnly? from, DateOnly? to, CancellationToken ct = default)
    {
        var today = clock.Today;
        var windowTo = to ?? today;
        var windowFrom = from ?? today.AddDays(-89);
        if (windowFrom > windowTo) (windowFrom, windowTo) = (windowTo, windowFrom);
        var fromUtc = windowFrom.ToDateTime(TimeOnly.MinValue);
        var toUtc = windowTo.ToDateTime(TimeOnly.MaxValue);

        var requests = await db.MemberChangeRequests.AsNoTracking()
            .Where(r => r.RequestedAtUtc >= fromUtc && r.RequestedAtUtc <= toUtc)
            .Select(r => new
            {
                r.Id, r.MemberId, r.Section, r.Status, r.RequestedByUserName, r.RequestedAtUtc,
            })
            .ToListAsync(ct);

        // Always count pending across all time (not bounded by window) - the queue is what matters.
        var allPending = await db.MemberChangeRequests.AsNoTracking()
            .Where(r => r.Status == MemberChangeRequestStatus.Pending)
            .Select(r => new { r.Id, r.MemberId, r.Section, r.RequestedByUserId, r.RequestedByUserName, r.RequestedAtUtc })
            .ToListAsync(ct);

        var total = requests.Count;
        var pending = allPending.Count;
        var approved = requests.Count(r => r.Status == MemberChangeRequestStatus.Approved);
        var rejected = requests.Count(r => r.Status == MemberChangeRequestStatus.Rejected);

        var oldestPendingDays = allPending.Count == 0 ? 0
            : (int)Math.Floor((clock.UtcNow - allPending.Min(r => r.RequestedAtUtc)).TotalDays);

        var bySection = requests.GroupBy(r => r.Section)
            .Select(g => new NamedCountPoint(g.Key, g.Count()))
            .OrderByDescending(p => p.Count).ToList();
        var byStatus = requests.GroupBy(r => r.Status)
            .Select(g => new NamedCountPoint(g.Key.ToString(), g.Count()))
            .OrderByDescending(p => p.Count).ToList();
        var byRequester = requests.GroupBy(r => r.RequestedByUserName)
            .Select(g => new NamedCountPoint(g.Key, g.Count()))
            .OrderByDescending(p => p.Count).Take(8).ToList();

        var byDay = requests.GroupBy(r => DateOnly.FromDateTime(r.RequestedAtUtc.UtcDateTime))
            .ToDictionary(g => g.Key, g => g.Count());
        var daily = new List<DailyCountPoint>();
        for (var d = windowFrom; d <= windowTo; d = d.AddDays(1))
            daily.Add(new DailyCountPoint(d, byDay.TryGetValue(d, out var c) ? c : 0));

        // Oldest pending - hydrate member name + ITS for the worklist
        var pendingMemberIds = allPending.Select(r => r.MemberId).Distinct().ToList();
        var members = pendingMemberIds.Count == 0
            ? new Dictionary<Guid, (string Name, string Its)>()
            : await db.Members.AsNoTracking().Where(m => pendingMemberIds.Contains(m.Id))
                .ToDictionaryAsync(m => m.Id, m => ValueTuple.Create(m.FullName, m.ItsNumber.Value), ct);
        var oldest = allPending
            .OrderBy(r => r.RequestedAtUtc)
            .Take(10)
            .Select(r =>
            {
                var (name, its) = members.TryGetValue(r.MemberId, out var m) ? m : ("(unknown)", "-");
                var age = (int)Math.Floor((clock.UtcNow - r.RequestedAtUtc).TotalDays);
                return new ChangeRequestRow(r.Id, r.MemberId, name, its, r.Section,
                    r.RequestedByUserId, r.RequestedByUserName, r.RequestedAtUtc, age);
            })
            .ToList();

        return new ChangeRequestsDashboardDto(
            total, pending, approved, rejected, oldestPendingDays,
            windowFrom, windowTo,
            bySection, byStatus, byRequester, daily, oldest);
    }

    // -- Expense types dashboard --------------------------------------------

    public async Task<ExpenseTypesDashboardDto> ExpenseTypesAsync(DateOnly? from, DateOnly? to, CancellationToken ct = default)
    {
        var today = clock.Today;
        var windowTo = to ?? today;
        var windowFrom = from ?? today.AddDays(-89);
        if (windowFrom > windowTo) (windowFrom, windowTo) = (windowTo, windowFrom);

        var expenseTypes = await db.ExpenseTypes.AsNoTracking()
            .Select(e => new { e.Id, e.Code, e.Name, e.IsActive })
            .ToListAsync(ct);

        var lines = await (
            from v in db.Vouchers.AsNoTracking()
            from l in v.Lines
            where v.VoucherDate >= windowFrom && v.VoucherDate <= windowTo
                && v.Status == VoucherStatus.Paid
            select new { v.Id, v.VoucherDate, v.Currency, l.ExpenseTypeId, l.Amount })
            .ToListAsync(ct);

        var currency = lines.Select(l => l.Currency).FirstOrDefault() ?? "AED";
        var totalSpend = lines.Sum(l => l.Amount);
        var usedExpenseTypeIds = lines.Select(l => l.ExpenseTypeId).Distinct().ToHashSet();

        var grouped = lines.GroupBy(l => l.ExpenseTypeId)
            .ToDictionary(g => g.Key, g => new
            {
                Count = g.Select(x => x.Id).Distinct().Count(),
                Total = g.Sum(x => x.Amount),
                LastUsed = g.Max(x => x.VoucherDate),
            });

        var rows = expenseTypes
            .Select(e =>
            {
                var s = grouped.TryGetValue(e.Id, out var v) ? v : null;
                var count = s?.Count ?? 0;
                var amt = s?.Total ?? 0m;
                var avg = count == 0 ? 0m : Math.Round(amt / count, 2);
                return new ExpenseTypeRow(e.Id, e.Code, e.Name, e.IsActive,
                    count, amt, avg, s?.LastUsed);
            })
            .OrderByDescending(r => r.TotalAmount)
            .ToList();

        // 12-month trend irrespective of the current filter window - users want to see seasonality.
        var monthStart = new DateOnly(today.Year, today.Month, 1).AddMonths(-11);
        var trendRaw = await db.Vouchers.AsNoTracking()
            .Where(v => v.VoucherDate >= monthStart && v.Status == VoucherStatus.Paid)
            .Select(v => new { v.VoucherDate, v.AmountTotal })
            .ToListAsync(ct);
        var trendMap = new Dictionary<(int Y, int M), (decimal Amt, int N)>();
        for (var d = monthStart; d <= today; d = d.AddMonths(1)) trendMap[(d.Year, d.Month)] = (0m, 0);
        foreach (var v in trendRaw)
        {
            var k = (v.VoucherDate.Year, v.VoucherDate.Month);
            if (trendMap.TryGetValue(k, out var current)) trendMap[k] = (current.Amt + v.AmountTotal, current.N + 1);
        }
        var monthlyTrend = trendMap
            .OrderBy(kv => kv.Key.Y).ThenBy(kv => kv.Key.M)
            .Select(kv => new MonthlyAmountPoint(kv.Key.Y, kv.Key.M, kv.Value.Amt, kv.Value.N))
            .ToList();

        return new ExpenseTypesDashboardDto(
            currency, expenseTypes.Count,
            expenseTypes.Count(e => e.IsActive),
            usedExpenseTypeIds.Count,
            totalSpend, windowFrom, windowTo, rows, monthlyTrend);
    }

    // -- Periods management dashboard ---------------------------------------

    public async Task<PeriodsDashboardDto> PeriodsAsync(CancellationToken ct = default)
    {
        var today = clock.Today;
        var periods = await db.Periods.AsNoTracking()
            .OrderByDescending(p => p.StartDate)
            .Select(p => new { p.Id, p.Name, p.StartDate, p.EndDate, p.Status, p.ClosedAtUtc, p.ClosedByUserName })
            .ToListAsync(ct);

        var open = periods.Where(p => p.Status == PeriodStatus.Open).ToList();
        var closed = periods.Where(p => p.Status == PeriodStatus.Closed).ToList();

        // "Current" period = the open one whose date range covers today, falling back to the most
        // recent open period. If multiple are open and none cover today, prefer the latest start date.
        var current = open.FirstOrDefault(p => p.StartDate <= today && today <= p.EndDate)
            ?? open.OrderByDescending(p => p.StartDate).FirstOrDefault();
        int? currentOpenDays = current is null ? null : Math.Max(0, today.DayNumber - current.StartDate.DayNumber);

        // Readiness check: open period must have no draft receipts and no pending voucher approvals
        // dated within its window. This isn't a hard close-prevention rule but a hint to the cashier
        // that the queue is empty before they close.
        var draftReceiptsInWindow = 0;
        var pendingVouchersInWindow = 0;
        if (current is not null)
        {
            draftReceiptsInWindow = await db.Receipts.AsNoTracking()
                .CountAsync(r => r.Status == ReceiptStatus.Draft
                    && r.ReceiptDate >= current.StartDate && r.ReceiptDate <= current.EndDate, ct);
            pendingVouchersInWindow = await db.Vouchers.AsNoTracking()
                .CountAsync(v => (v.Status == VoucherStatus.PendingApproval || v.Status == VoucherStatus.Approved)
                    && v.VoucherDate >= current.StartDate && v.VoucherDate <= current.EndDate, ct);
        }

        var readyToClose = current is not null && draftReceiptsInWindow == 0 && pendingVouchersInWindow == 0;

        var rows = periods.Select(p =>
        {
            var age = Math.Max(0, today.DayNumber - p.StartDate.DayNumber);
            return new PeriodRow(p.Id, p.Name, p.StartDate, p.EndDate, (int)p.Status,
                age, p.ClosedAtUtc, p.ClosedByUserName);
        }).ToList();

        return new PeriodsDashboardDto(
            periods.Count, open.Count, closed.Count,
            current?.Id, current?.Name, currentOpenDays,
            draftReceiptsInWindow, pendingVouchersInWindow, readyToClose,
            rows);
    }

    // -- Annual summary report ----------------------------------------------

    public async Task<AnnualSummaryDto> AnnualSummaryAsync(int year, CancellationToken ct = default)
    {
        if (year < 2000 || year > 3000) year = clock.Today.Year;
        var yearStart = new DateOnly(year, 1, 1);
        var yearEnd = new DateOnly(year, 12, 31);

        var receipts = await db.Receipts.AsNoTracking()
            .Where(r => r.Status == ReceiptStatus.Confirmed && r.ReceiptDate >= yearStart && r.ReceiptDate <= yearEnd)
            .Include(r => r.Lines)
            .Select(r => new
            {
                r.ReceiptDate, r.AmountTotal, r.Currency,
                Lines = r.Lines.Select(l => new { l.FundTypeId, l.Amount }).ToList(),
            })
            .ToListAsync(ct);

        var vouchers = await db.Vouchers.AsNoTracking()
            .Where(v => v.Status == VoucherStatus.Paid && v.VoucherDate >= yearStart && v.VoucherDate <= yearEnd)
            .Select(v => new { v.VoucherDate, v.AmountTotal, v.Currency, v.Purpose })
            .ToListAsync(ct);

        var currency = receipts.Select(r => r.Currency).FirstOrDefault()
            ?? vouchers.Select(v => v.Currency).FirstOrDefault() ?? "AED";
        var totalIncome = receipts.Sum(r => r.AmountTotal);
        var totalExpense = vouchers.Sum(v => v.AmountTotal);

        var monthly = new List<MonthlyIncomeExpensePoint>(12);
        for (var m = 1; m <= 12; m++)
        {
            var income = receipts.Where(r => r.ReceiptDate.Month == m).Sum(r => r.AmountTotal);
            var expense = vouchers.Where(v => v.VoucherDate.Month == m).Sum(v => v.AmountTotal);
            monthly.Add(new MonthlyIncomeExpensePoint(m, income, expense, income - expense));
        }

        var fundIds = receipts.SelectMany(r => r.Lines.Select(l => l.FundTypeId)).Distinct().ToList();
        var funds = fundIds.Count == 0
            ? new Dictionary<Guid, (string Code, string Name)>()
            : await db.FundTypes.AsNoTracking().Where(f => fundIds.Contains(f.Id))
                .ToDictionaryAsync(f => f.Id, f => ValueTuple.Create(f.Code, f.NameEnglish), ct);
        var byFund = receipts.SelectMany(r => r.Lines.Select(l => new { l.FundTypeId, l.Amount, ReceiptId = r }))
            .GroupBy(x => x.FundTypeId)
            .Select(g =>
            {
                var (code, name) = funds.TryGetValue(g.Key, out var f) ? f : ("-", "(unknown)");
                return new AnnualByFundRow(g.Key, code, name,
                    g.Sum(x => x.Amount),
                    g.Select(x => x.ReceiptId).Distinct().Count());
            })
            .OrderByDescending(r => r.Income)
            .ToList();

        var byPurpose = vouchers
            .GroupBy(v => string.IsNullOrWhiteSpace(v.Purpose) ? "(Uncategorised)" : v.Purpose)
            .Select(g => new NamedAmountPoint(g.Key, g.Count(), g.Sum(v => v.AmountTotal)))
            .OrderByDescending(p => p.Amount)
            .Take(20)
            .ToList();

        return new AnnualSummaryDto(
            year, currency, totalIncome, totalExpense, totalIncome - totalExpense,
            monthly, byFund, byPurpose);
    }

    // -- Account reconciliation dashboard -----------------------------------

    public async Task<ReconciliationDashboardDto> ReconciliationAsync(CancellationToken ct = default)
    {
        var today = clock.Today;
        var staleThresholdDays = 30;

        // Pull the COA + ledger aggregates once. Account.Type is the discriminator that decides
        // whether balance = debits-credits (Asset/Expense) or credits-debits (Liability/Income/etc.).
        var accounts = await db.Accounts.AsNoTracking()
            .Select(a => new { a.Id, a.Code, a.Name, a.Type, a.IsActive }).ToListAsync(ct);

        var ledgerAgg = await db.Entries.AsNoTracking()
            .GroupBy(e => e.AccountId)
            .Select(g => new
            {
                AccountId = g.Key,
                Debit = g.Sum(e => e.Debit),
                Credit = g.Sum(e => e.Credit),
                Count = g.Count(),
                LastDate = g.Max(e => (DateOnly?)e.PostingDate),
            })
            .ToDictionaryAsync(x => x.AccountId, ct);

        // Bank accounts + their linked accounting accounts. The treasurer cares about bank
        // accounts most because those reconcile against actual statements.
        var bankAccounts = await db.BankAccounts.AsNoTracking()
            .Select(b => new
            {
                b.Id, b.Name, b.BankName, b.AccountNumber, b.Currency, b.IsActive,
                b.AccountingAccountId,
            })
            .ToListAsync(ct);

        var bankRows = new List<BankAccountReconciliationRow>();
        decimal totalBankBalance = 0m;
        var bankCurrency = bankAccounts.Select(b => b.Currency).FirstOrDefault() ?? "AED";

        foreach (var b in bankAccounts)
        {
            decimal ledgerBalance = 0m;
            DateOnly? lastEntry = null;
            string? acctCode = null, acctName = null;
            if (b.AccountingAccountId is { } aid && ledgerAgg.TryGetValue(aid, out var agg))
            {
                var acct = accounts.FirstOrDefault(a => a.Id == aid);
                if (acct is not null)
                {
                    acctCode = acct.Code;
                    acctName = acct.Name;
                    ledgerBalance = (acct.Type == AccountType.Asset || acct.Type == AccountType.Expense)
                        ? agg.Debit - agg.Credit : agg.Credit - agg.Debit;
                }
                lastEntry = agg.LastDate;
            }
            else if (b.AccountingAccountId is { } aid2)
            {
                var acct = accounts.FirstOrDefault(a => a.Id == aid2);
                if (acct is not null) { acctCode = acct.Code; acctName = acct.Name; }
            }

            // In-transit: cheques received but not yet cleared (Pledged/Deposited).
            var inTransit = await db.PostDatedCheques.AsNoTracking()
                .Where(c => (c.Status == PostDatedChequeStatus.Pledged || c.Status == PostDatedChequeStatus.Deposited))
                .Select(c => new { c.Amount }).ToListAsync(ct);
            // Pending vouchers paid through this bank account = vouchers awaiting approval/payment
            // referencing this BankAccountId. The Voucher entity stores BankAccountId on
            // bank-mode payments; we filter on it here.
            var pendingVouchers = await db.Vouchers.AsNoTracking()
                .Where(v => v.BankAccountId == b.Id
                    && (v.Status == VoucherStatus.PendingApproval
                        || v.Status == VoucherStatus.Approved
                        || v.Status == VoucherStatus.PendingClearance))
                .Select(v => new { v.AmountTotal }).ToListAsync(ct);

            var daysSince = lastEntry.HasValue ? today.DayNumber - lastEntry.Value.DayNumber : (int?)null;
            var readiness = !b.IsActive ? "Inactive"
                : b.AccountingAccountId is null ? "Not linked to COA"
                : (daysSince is null) ? "No activity yet"
                : (daysSince > staleThresholdDays) ? "Stale — verify"
                : "Healthy";

            bankRows.Add(new BankAccountReconciliationRow(
                b.Id, b.Name, b.BankName,
                MaskAccountNumber(b.AccountNumber),
                b.Currency, b.IsActive,
                b.AccountingAccountId, acctCode, acctName,
                ledgerBalance,
                // The PDC list above is global, not per-bank. Refining requires a deposit-bank
                // field on PostDatedCheque which the schema doesn't carry today, so we surface
                // the global figure on the dashboard summary KPI rather than per-row.
                0, 0m,
                pendingVouchers.Count, pendingVouchers.Sum(v => v.AmountTotal),
                lastEntry, daysSince,
                readiness));
            if (b.IsActive) totalBankBalance += ledgerBalance;
        }

        // Global in-transit cheques + global pending voucher count for KPI strip
        var allInTransit = await db.PostDatedCheques.AsNoTracking()
            .Where(c => c.Status == PostDatedChequeStatus.Pledged || c.Status == PostDatedChequeStatus.Deposited)
            .Select(c => c.Amount).ToListAsync(ct);
        var allPendingVouchers = await db.Vouchers.AsNoTracking()
            .Where(v => v.Status == VoucherStatus.PendingApproval
                || v.Status == VoucherStatus.Approved
                || v.Status == VoucherStatus.PendingClearance)
            .Select(v => v.AmountTotal).ToListAsync(ct);

        // Per-COA-account list: skip Income/Expense (those churn naturally and aren't reconciled
        // the same way) — focus on Assets, Liabilities, and Funds where balances should be stable.
        var coaRows = accounts
            .Where(a => a.Type == AccountType.Asset || a.Type == AccountType.Liability
                || a.Type == AccountType.Fund || a.Type == AccountType.Equity)
            .Select(a =>
            {
                var agg = ledgerAgg.TryGetValue(a.Id, out var ag) ? ag : null;
                var balance = agg is null ? 0m
                    : (a.Type == AccountType.Asset)
                        ? agg.Debit - agg.Credit
                        : agg.Credit - agg.Debit;
                var entryCount = agg?.Count ?? 0;
                var lastDate = agg?.LastDate;
                var daysSince = lastDate.HasValue ? today.DayNumber - lastDate.Value.DayNumber : (int?)null;
                var isStale = a.IsActive && balance != 0m && (daysSince is null || daysSince > staleThresholdDays);
                return new CoaAccountReconciliationRow(
                    a.Id, a.Code, a.Name, (int)a.Type,
                    balance, entryCount, lastDate, daysSince, isStale);
            })
            .OrderBy(r => r.Code)
            .ToList();

        var staleCount = coaRows.Count(r => r.IsStale);

        return new ReconciliationDashboardDto(
            bankCurrency,
            bankAccounts.Count,
            bankAccounts.Count(b => b.IsActive),
            totalBankBalance,
            allInTransit.Sum(), allInTransit.Count,
            allPendingVouchers.Sum(), allPendingVouchers.Count,
            coaRows.Count, staleCount,
            bankRows, coaRows);
    }

    /// <summary>Mask an account number for display - keep last 4 digits, replace the rest with •.</summary>
    private static string MaskAccountNumber(string accountNumber)
    {
        if (string.IsNullOrWhiteSpace(accountNumber)) return "—";
        var s = accountNumber.Trim();
        if (s.Length <= 4) return s;
        return new string('•', s.Length - 4) + s[^4..];
    }
}

public sealed class PeriodService(Persistence.JamaatDbContextFacade db, Domain.Abstractions.IUnitOfWork uow,
    Domain.Abstractions.ITenantContext tenant, Domain.Abstractions.ICurrentUser currentUser, Domain.Abstractions.IClock clock) : IPeriodService
{
    public async Task<IReadOnlyList<FinancialPeriodDto>> ListAsync(CancellationToken ct = default) =>
        await db.Periods.AsNoTracking()
            .OrderByDescending(p => p.StartDate)
            .Select(p => new FinancialPeriodDto(p.Id, p.Name, p.StartDate, p.EndDate, p.Status, p.ClosedAtUtc, p.ClosedByUserId, p.ClosedByUserName))
            .ToListAsync(ct);

    public async Task<Result<FinancialPeriodDto>> CreateAsync(CreateFinancialPeriodDto dto, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(dto.Name)) return Domain.Common.Error.Validation("period.name_required", "Name is required.");
        if (dto.EndDate < dto.StartDate) return Domain.Common.Error.Validation("period.dates", "End date must be on or after start date.");
        var p = new Domain.Entities.FinancialPeriod(Guid.NewGuid(), tenant.TenantId, dto.Name, dto.StartDate, dto.EndDate);
        db.Periods.Add(p);
        await uow.SaveChangesAsync(ct);
        return new FinancialPeriodDto(p.Id, p.Name, p.StartDate, p.EndDate, p.Status, null, null, null);
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
