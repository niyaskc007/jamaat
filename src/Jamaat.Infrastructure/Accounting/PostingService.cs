using Jamaat.Application.Accounting;
using Jamaat.Domain.Abstractions;
using Jamaat.Domain.Entities;
using Jamaat.Domain.Enums;
using Jamaat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Jamaat.Infrastructure.Accounting;

/// <summary>
/// Double-entry posting engine. For Receipts:
///   - DEBIT: Cash / Bank asset account (from BankAccount.AccountingAccountId, or a default 'Cash' account)
///   - CREDIT: FundType.CreditAccountId for each line (or a default Income account)
/// For Vouchers (mirror):
///   - DEBIT: ExpenseType.DebitAccountId for each line (or a default Expense account)
///   - CREDIT: Cash / Bank asset account
/// Reversals emit mirror rows. The resulting sum(Debit) - sum(Credit) per source_id = 0.
/// </summary>
public sealed class PostingService(
    JamaatDbContext db,
    ITenantContext tenant,
    ICurrentUser currentUser,
    IClock clock) : IPostingService
{
    public async Task PostReceiptAsync(Receipt receipt, CancellationToken ct = default)
    {
        var periodId = receipt.FinancialPeriodId
            ?? throw new InvalidOperationException("Receipt must be assigned to a financial period before posting.");

        var assetAccountId = await ResolveAssetAccountAsync(receipt.BankAccountId, ct);
        var fundTypes = await db.FundTypes.AsNoTracking()
            .Where(f => receipt.Lines.Select(l => l.FundTypeId).Contains(f.Id))
            .ToListAsync(ct);

        var defaultIncomeAccountId = await ResolveAccountByCodeAsync("4000", ct); // Donations Income

        var entries = new List<LedgerEntry>();
        int lineNo = 1;
        decimal totalDebit = 0, totalCredit = 0;

        // DEBIT lumps all lines (in base currency) to the cash/bank asset
        entries.Add(new LedgerEntry(
            tenantId: tenant.TenantId,
            postingDate: receipt.ReceiptDate,
            financialPeriodId: periodId,
            sourceType: LedgerSourceType.Receipt,
            sourceId: receipt.Id,
            sourceReference: receipt.ReceiptNumber!,
            lineNo: lineNo++,
            accountId: assetAccountId,
            fundTypeId: null,
            debit: receipt.BaseAmountTotal,
            credit: 0,
            currency: receipt.BaseCurrency,
            narration: $"Receipt {receipt.ReceiptNumber} from {receipt.MemberNameSnapshot}"
                       + (receipt.Currency != receipt.BaseCurrency ? $" ({receipt.Currency} {receipt.AmountTotal:F2} @ {receipt.FxRate})" : string.Empty),
            reversalOfEntryId: null,
            at: clock.UtcNow,
            userId: currentUser.UserId));
        totalDebit += receipt.BaseAmountTotal;

        // CREDIT per line in base currency; balance any rounding diff onto the last line
        var creditsList = receipt.Lines.Select(ln => new
        {
            Line = ln,
            BaseAmount = Math.Round(ln.Amount * receipt.FxRate, 2, MidpointRounding.AwayFromZero),
        }).ToList();
        var creditsSum = creditsList.Sum(x => x.BaseAmount);
        var rounding = receipt.BaseAmountTotal - creditsSum;
        if (rounding != 0 && creditsList.Count > 0)
        {
            // Absorb rounding into the last line so debit == credit
            var last = creditsList[^1];
            creditsList[^1] = new { Line = last.Line, BaseAmount = last.BaseAmount + rounding };
        }

        foreach (var item in creditsList)
        {
            var fund = fundTypes.FirstOrDefault(f => f.Id == item.Line.FundTypeId);
            var creditAccountId = fund?.CreditAccountId ?? defaultIncomeAccountId;

            entries.Add(new LedgerEntry(
                tenantId: tenant.TenantId,
                postingDate: receipt.ReceiptDate,
                financialPeriodId: periodId,
                sourceType: LedgerSourceType.Receipt,
                sourceId: receipt.Id,
                sourceReference: receipt.ReceiptNumber!,
                lineNo: lineNo++,
                accountId: creditAccountId,
                fundTypeId: item.Line.FundTypeId,
                debit: 0,
                credit: item.BaseAmount,
                currency: receipt.BaseCurrency,
                narration: string.IsNullOrWhiteSpace(item.Line.Purpose) ? fund?.NameEnglish : item.Line.Purpose,
                reversalOfEntryId: null,
                at: clock.UtcNow,
                userId: currentUser.UserId));
            totalCredit += item.BaseAmount;
        }

        EnsureBalanced(totalDebit, totalCredit);
        db.LedgerEntries.AddRange(entries);
    }

    public async Task PostVoucherAsync(Voucher voucher, IReadOnlyList<ExpenseType> expenseTypes, CancellationToken ct = default)
    {
        var periodId = voucher.FinancialPeriodId
            ?? throw new InvalidOperationException("Voucher must be assigned to a financial period before posting.");
        var assetAccountId = await ResolveAssetAccountAsync(voucher.BankAccountId, ct);
        var defaultExpenseAccountId = await ResolveAccountByCodeAsync("5000", ct); // Generic Expense

        var entries = new List<LedgerEntry>();
        int lineNo = 1;
        decimal totalDebit = 0, totalCredit = 0;

        // DEBITs per line in base currency; rounding absorbed by last line
        var debitsList = voucher.Lines.Select(ln => new
        {
            Line = ln,
            BaseAmount = Math.Round(ln.Amount * voucher.FxRate, 2, MidpointRounding.AwayFromZero),
        }).ToList();
        var debitsSum = debitsList.Sum(x => x.BaseAmount);
        var rounding = voucher.BaseAmountTotal - debitsSum;
        if (rounding != 0 && debitsList.Count > 0)
        {
            var last = debitsList[^1];
            debitsList[^1] = new { Line = last.Line, BaseAmount = last.BaseAmount + rounding };
        }

        foreach (var item in debitsList)
        {
            var et = expenseTypes.FirstOrDefault(x => x.Id == item.Line.ExpenseTypeId);
            var debitAccountId = et?.DebitAccountId ?? defaultExpenseAccountId;

            entries.Add(new LedgerEntry(
                tenantId: tenant.TenantId,
                postingDate: voucher.VoucherDate,
                financialPeriodId: periodId,
                sourceType: LedgerSourceType.Voucher,
                sourceId: voucher.Id,
                sourceReference: voucher.VoucherNumber!,
                lineNo: lineNo++,
                accountId: debitAccountId,
                fundTypeId: null,
                debit: item.BaseAmount,
                credit: 0,
                currency: voucher.BaseCurrency,
                narration: item.Line.Narration ?? et?.Name,
                reversalOfEntryId: null,
                at: clock.UtcNow,
                userId: currentUser.UserId));
            totalDebit += item.BaseAmount;
        }

        // One CREDIT (cash/bank) in base currency
        entries.Add(new LedgerEntry(
            tenantId: tenant.TenantId,
            postingDate: voucher.VoucherDate,
            financialPeriodId: periodId,
            sourceType: LedgerSourceType.Voucher,
            sourceId: voucher.Id,
            sourceReference: voucher.VoucherNumber!,
            lineNo: lineNo++,
            accountId: assetAccountId,
            fundTypeId: null,
            debit: 0,
            credit: voucher.BaseAmountTotal,
            currency: voucher.BaseCurrency,
            narration: $"Voucher {voucher.VoucherNumber} paid to {voucher.PayTo}",
            reversalOfEntryId: null,
            at: clock.UtcNow,
            userId: currentUser.UserId));
        totalCredit += voucher.BaseAmountTotal;

        EnsureBalanced(totalDebit, totalCredit);
        db.LedgerEntries.AddRange(entries);
    }

    public async Task PostReversalAsync(LedgerSourceType sourceType, Guid sourceId, string reason, CancellationToken ct = default)
    {
        var originals = await db.LedgerEntries.AsNoTracking()
            .Where(l => l.SourceType == sourceType && l.SourceId == sourceId && l.ReversalOfEntryId == null)
            .ToListAsync(ct);

        if (originals.Count == 0) throw new InvalidOperationException("No entries found to reverse.");

        var lineNo = originals.Max(o => o.LineNo) + 1;
        foreach (var o in originals)
        {
            db.LedgerEntries.Add(new LedgerEntry(
                tenantId: o.TenantId,
                postingDate: clock.Today,
                financialPeriodId: o.FinancialPeriodId,
                sourceType: LedgerSourceType.Reversal,
                sourceId: o.SourceId,
                sourceReference: o.SourceReference,
                lineNo: lineNo++,
                accountId: o.AccountId,
                fundTypeId: o.FundTypeId,
                debit: o.Credit,   // swapped
                credit: o.Debit,
                currency: o.Currency,
                narration: $"Reversal of {o.SourceReference} — {reason}",
                reversalOfEntryId: o.Id,
                at: clock.UtcNow,
                userId: currentUser.UserId));
        }
    }

    private async Task<Guid> ResolveAssetAccountAsync(Guid? bankAccountId, CancellationToken ct)
    {
        if (bankAccountId is not null)
        {
            var bank = await db.BankAccounts.AsNoTracking().FirstOrDefaultAsync(b => b.Id == bankAccountId, ct);
            if (bank?.AccountingAccountId is not null) return bank.AccountingAccountId.Value;
        }
        // Fallback to a well-known cash account '1000'
        return await ResolveAccountByCodeAsync("1000", ct);
    }

    private async Task<Guid> ResolveAccountByCodeAsync(string code, CancellationToken ct)
    {
        var acct = await db.Accounts.AsNoTracking().FirstOrDefaultAsync(a => a.Code == code && a.IsActive, ct);
        if (acct is null) throw new InvalidOperationException($"No active account with code '{code}'. Configure your chart of accounts first.");
        return acct.Id;
    }

    private static void EnsureBalanced(decimal debit, decimal credit)
    {
        if (Math.Round(debit - credit, 2, MidpointRounding.AwayFromZero) != 0)
            throw new InvalidOperationException($"Ledger posting is unbalanced: debit={debit}, credit={credit}.");
    }
}
