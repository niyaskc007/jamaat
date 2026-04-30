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

        var memberIds = rows.Select(r => r.MemberId).Distinct().ToList();
        var memberNames = await db.Members.AsNoTracking()
            .Where(m => memberIds.Contains(m.Id))
            .ToDictionaryAsync(m => m.Id, m => m.FullName, ct);

        return rows.Select(r => new UpcomingChequePoint(
            r.Id, r.ChequeNumber, r.ChequeDate, r.Amount,
            memberNames.GetValueOrDefault(r.MemberId, "(unknown)"),
            r.Status, r.Currency)).ToList();
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
