using Jamaat.Application.Accounting;
using Jamaat.Application.Common;
using Jamaat.Contracts.Ledger;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/ledger")]
public sealed class LedgerController(ILedgerService svc) : ControllerBase
{
    [HttpGet("entries")]
    [Authorize(Policy = "accounting.view")]
    public async Task<IActionResult> Entries([FromQuery] LedgerEntryQuery q, CancellationToken ct) => Ok(await svc.ListAsync(q, ct));

    [HttpGet("balances")]
    [Authorize(Policy = "accounting.view")]
    public async Task<IActionResult> Balances([FromQuery] DateOnly? asOf, CancellationToken ct) => Ok(await svc.BalancesAsync(asOf, ct));
}

[ApiController]
[Authorize]
[Route("api/v1/periods")]
public sealed class PeriodsController(IPeriodService svc) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "accounting.view")]
    public async Task<IActionResult> List(CancellationToken ct) => Ok(await svc.ListAsync(ct));

    [HttpPost]
    [Authorize(Policy = "period.open")]
    public async Task<IActionResult> Create([FromBody] CreateFinancialPeriodDto dto, CancellationToken ct)
    {
        var r = await svc.CreateAsync(dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ControllerResults.Problem(this, r.Error);
    }

    [HttpPost("{id:guid}/close")]
    [Authorize(Policy = "period.close")]
    public async Task<IActionResult> Close(Guid id, CancellationToken ct)
    {
        var r = await svc.CloseAsync(id, ct);
        return r.IsSuccess ? NoContent() : ControllerResults.Problem(this, r.Error);
    }

    [HttpPost("{id:guid}/reopen")]
    [Authorize(Policy = "period.open")]
    public async Task<IActionResult> Reopen(Guid id, CancellationToken ct)
    {
        var r = await svc.ReopenAsync(id, ct);
        return r.IsSuccess ? NoContent() : ControllerResults.Problem(this, r.Error);
    }
}

[ApiController]
[Authorize]
[Route("api/v1/reports")]
public sealed class ReportsController(IReportsService svc, IExcelExporter excel) : ControllerBase
{
    [HttpGet("daily-collection")]
    [Authorize(Policy = "reports.view")]
    public async Task<IActionResult> DailyCollection([FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct)
        => Ok(await svc.DailyCollectionAsync(from, to, ct));

    [HttpGet("fund-wise")]
    [Authorize(Policy = "reports.view")]
    public async Task<IActionResult> FundWise([FromQuery] ReportFundWiseQuery q, CancellationToken ct)
        => Ok(await svc.FundWiseAsync(q, ct));

    [HttpGet("daily-payments")]
    [Authorize(Policy = "reports.view")]
    public async Task<IActionResult> DailyPayments([FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct)
        => Ok(await svc.DailyPaymentsAsync(from, to, ct));

    [HttpGet("cash-book")]
    [Authorize(Policy = "reports.view")]
    public async Task<IActionResult> CashBook([FromQuery] Guid accountId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct)
        => Ok(await svc.CashBookAsync(accountId, from, to, ct));

    // --- XLSX exports -----------------------------------------------------
    // Each endpoint reuses the matching JSON report service call, then formats
    // via the shared ExcelExporter. Filenames embed the date range so downloads
    // don't collide when a user exports the same report multiple times.

    [HttpGet("daily-collection.xlsx")]
    [Authorize(Policy = "reports.export")]
    public async Task<IActionResult> DailyCollectionXlsx([FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct)
    {
        var rows = await svc.DailyCollectionAsync(from, to, ct);
        var sheet = new ExcelSheet(
            "Daily Collection",
            new[]
            {
                new ExcelColumn("Date", ExcelColumnType.Date),
                new ExcelColumn("Receipts", ExcelColumnType.Number, "#,##0"),
                new ExcelColumn("Amount", ExcelColumnType.Currency),
                new ExcelColumn("Currency"),
            },
            rows.Select(r => (IReadOnlyList<object?>)new object?[] { r.Date, r.ReceiptCount, r.AmountTotal, r.Currency }).ToList());
        return Xlsx(excel.Build(new[] { sheet }), $"daily-collection_{from:yyyyMMdd}_{to:yyyyMMdd}.xlsx");
    }

    [HttpGet("fund-wise.xlsx")]
    [Authorize(Policy = "reports.export")]
    public async Task<IActionResult> FundWiseXlsx([FromQuery] ReportFundWiseQuery q, CancellationToken ct)
    {
        var rows = await svc.FundWiseAsync(q, ct);
        var from = q.From; var to = q.To;
        var sheet = new ExcelSheet(
            "Fund-wise",
            new[]
            {
                new ExcelColumn("Fund code"),
                new ExcelColumn("Fund name"),
                new ExcelColumn("Lines", ExcelColumnType.Number, "#,##0"),
                new ExcelColumn("Amount", ExcelColumnType.Currency),
                new ExcelColumn("Cash", ExcelColumnType.Currency),
                new ExcelColumn("Cheque", ExcelColumnType.Currency),
                new ExcelColumn("Bank xfer", ExcelColumnType.Currency),
                new ExcelColumn("Card", ExcelColumnType.Currency),
                new ExcelColumn("Online", ExcelColumnType.Currency),
                new ExcelColumn("UPI", ExcelColumnType.Currency),
            },
            rows.Select(r => (IReadOnlyList<object?>)new object?[]
            {
                r.FundTypeCode, r.FundTypeName, r.LineCount, r.AmountTotal,
                r.AmountCash, r.AmountCheque, r.AmountBankTransfer, r.AmountCard, r.AmountOnline, r.AmountUpi,
            }).ToList());
        return Xlsx(excel.Build(new[] { sheet }), $"fund-wise_{from:yyyyMMdd}_{to:yyyyMMdd}.xlsx");
    }

    [HttpGet("daily-payments.xlsx")]
    [Authorize(Policy = "reports.export")]
    public async Task<IActionResult> DailyPaymentsXlsx([FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct)
    {
        var rows = await svc.DailyPaymentsAsync(from, to, ct);
        var sheet = new ExcelSheet(
            "Daily Payments",
            new[]
            {
                new ExcelColumn("Date", ExcelColumnType.Date),
                new ExcelColumn("Vouchers", ExcelColumnType.Number, "#,##0"),
                new ExcelColumn("Amount", ExcelColumnType.Currency),
                new ExcelColumn("Currency"),
            },
            rows.Select(r => (IReadOnlyList<object?>)new object?[] { r.Date, r.VoucherCount, r.AmountTotal, r.Currency }).ToList());
        return Xlsx(excel.Build(new[] { sheet }), $"daily-payments_{from:yyyyMMdd}_{to:yyyyMMdd}.xlsx");
    }

    [HttpGet("cash-book.xlsx")]
    [Authorize(Policy = "reports.export")]
    public async Task<IActionResult> CashBookXlsx([FromQuery] Guid accountId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct)
    {
        var rows = await svc.CashBookAsync(accountId, from, to, ct);
        var sheet = new ExcelSheet(
            "Cash Book",
            new[]
            {
                new ExcelColumn("Date", ExcelColumnType.Date),
                new ExcelColumn("Reference"),
                new ExcelColumn("Narration"),
                new ExcelColumn("Debit", ExcelColumnType.Currency),
                new ExcelColumn("Credit", ExcelColumnType.Currency),
                new ExcelColumn("Balance", ExcelColumnType.Currency),
            },
            rows.Select(r => (IReadOnlyList<object?>)new object?[] { r.Date, r.Reference, r.Narration, r.Debit, r.Credit, r.Balance }).ToList());
        return Xlsx(excel.Build(new[] { sheet }), $"cash-book_{from:yyyyMMdd}_{to:yyyyMMdd}.xlsx");
    }

    // --- Member Contribution History --------------------------------------

    [HttpGet("member-contribution")]
    [Authorize(Policy = "reports.view")]
    public async Task<IActionResult> MemberContribution([FromQuery] Guid memberId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct)
        => Ok(await svc.MemberContributionAsync(memberId, from, to, ct));

    [HttpGet("member-contribution.xlsx")]
    [Authorize(Policy = "reports.export")]
    public async Task<IActionResult> MemberContributionXlsx([FromQuery] Guid memberId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct)
    {
        var rows = await svc.MemberContributionAsync(memberId, from, to, ct);
        var sheet = new ExcelSheet(
            "Member Contribution",
            new[]
            {
                new ExcelColumn("Date", ExcelColumnType.Date),
                new ExcelColumn("Receipt #"),
                new ExcelColumn("Fund code"),
                new ExcelColumn("Fund name"),
                new ExcelColumn("Period"),
                new ExcelColumn("Purpose"),
                new ExcelColumn("Amount", ExcelColumnType.Currency),
                new ExcelColumn("Currency"),
                new ExcelColumn("Base amount", ExcelColumnType.Currency),
                new ExcelColumn("Base currency"),
            },
            rows.Select(r => (IReadOnlyList<object?>)new object?[] {
                r.ReceiptDate, r.ReceiptNumber, r.FundCode, r.FundName,
                r.PeriodReference, r.Purpose, r.Amount, r.Currency,
                r.BaseAmount, r.BaseCurrency,
            }).ToList());
        return Xlsx(excel.Build(new[] { sheet }), $"member-contribution_{memberId:N}_{from:yyyyMMdd}_{to:yyyyMMdd}.xlsx");
    }

    // --- Cheque-wise Receipts ---------------------------------------------

    [HttpGet("cheque-wise")]
    [Authorize(Policy = "reports.view")]
    public async Task<IActionResult> ChequeWise([FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct)
        => Ok(await svc.ChequeWiseAsync(from, to, ct));

    [HttpGet("cheque-wise.xlsx")]
    [Authorize(Policy = "reports.export")]
    public async Task<IActionResult> ChequeWiseXlsx([FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct)
    {
        var rows = await svc.ChequeWiseAsync(from, to, ct);
        var sheet = new ExcelSheet(
            "Cheque-wise",
            new[]
            {
                new ExcelColumn("Receipt date", ExcelColumnType.Date),
                new ExcelColumn("Receipt #"),
                new ExcelColumn("ITS"),
                new ExcelColumn("Member"),
                new ExcelColumn("Cheque #"),
                new ExcelColumn("Cheque date", ExcelColumnType.Date),
                new ExcelColumn("Bank account"),
                new ExcelColumn("Amount", ExcelColumnType.Currency),
                new ExcelColumn("Currency"),
                new ExcelColumn("Status"),
            },
            rows.Select(r => (IReadOnlyList<object?>)new object?[] {
                r.ReceiptDate, r.ReceiptNumber, r.ItsNumber, r.MemberName,
                r.ChequeNumber, r.ChequeDate, r.BankAccountName,
                r.Amount, r.Currency, r.Status,
            }).ToList());
        return Xlsx(excel.Build(new[] { sheet }), $"cheque-wise_{from:yyyyMMdd}_{to:yyyyMMdd}.xlsx");
    }

    // --- Fund balance (dual view) -----------------------------------------

    [HttpGet("fund-balance")]
    [Authorize(Policy = "reports.view")]
    public async Task<IActionResult> FundBalance([FromQuery] Guid fundTypeId, CancellationToken ct)
        => Ok(await svc.FundBalanceAsync(fundTypeId, ct));

    // --- Returnable contributions / maturity -------------------------------

    [HttpGet("returnable-contributions")]
    [Authorize(Policy = "reports.view")]
    public async Task<IActionResult> ReturnableContributions([FromQuery] Guid? fundTypeId, CancellationToken ct)
        => Ok(await svc.ReturnableContributionsAsync(fundTypeId, ct));

    [HttpGet("returnable-contributions.xlsx")]
    [Authorize(Policy = "reports.export")]
    public async Task<IActionResult> ReturnableContributionsXlsx([FromQuery] Guid? fundTypeId, CancellationToken ct)
    {
        var rows = await svc.ReturnableContributionsAsync(fundTypeId, ct);
        var sheet = new ExcelSheet(
            "Returnable contributions",
            new[]
            {
                new ExcelColumn("Receipt date", ExcelColumnType.Date),
                new ExcelColumn("Receipt #"),
                new ExcelColumn("ITS"),
                new ExcelColumn("Member"),
                new ExcelColumn("Fund code"),
                new ExcelColumn("Fund name"),
                new ExcelColumn("Amount", ExcelColumnType.Currency),
                new ExcelColumn("Returned", ExcelColumnType.Currency),
                new ExcelColumn("Outstanding", ExcelColumnType.Currency),
                new ExcelColumn("Currency"),
                new ExcelColumn("Maturity", ExcelColumnType.Date),
                new ExcelColumn("Matured?"),
                new ExcelColumn("Agreement"),
                new ExcelColumn("Niyyath"),
            },
            rows.Select(r => (IReadOnlyList<object?>)new object?[]
            {
                r.ReceiptDate, r.ReceiptNumber, r.ItsNumber, r.MemberName,
                r.FundTypeCode, r.FundTypeName,
                r.AmountTotal, r.AmountReturned, r.AmountReturnable, r.Currency,
                r.MaturityDate, r.IsMatured ? "Yes" : "No",
                r.AgreementReference, r.NiyyathNote,
            }).ToList());
        return Xlsx(excel.Build(new[] { sheet }),
            $"returnable-contributions_{(fundTypeId is Guid f ? f.ToString("N") + "_" : string.Empty)}{DateTime.UtcNow:yyyyMMdd}.xlsx");
    }

    // --- Outstanding QH loan balances --------------------------------------

    [HttpGet("outstanding-loans")]
    [Authorize(Policy = "reports.view")]
    public async Task<IActionResult> OutstandingLoans([FromQuery] ReportOutstandingLoansQuery q, CancellationToken ct)
        => Ok(await svc.OutstandingLoansAsync(q, ct));

    [HttpGet("outstanding-loans.xlsx")]
    [Authorize(Policy = "reports.export")]
    public async Task<IActionResult> OutstandingLoansXlsx([FromQuery] ReportOutstandingLoansQuery q, CancellationToken ct)
    {
        var rows = await svc.OutstandingLoansAsync(q, ct);
        var sheet = new ExcelSheet(
            "Outstanding loans",
            new[]
            {
                new ExcelColumn("Loan #"),
                new ExcelColumn("ITS"),
                new ExcelColumn("Member"),
                new ExcelColumn("Disbursed", ExcelColumnType.Currency),
                new ExcelColumn("Repaid", ExcelColumnType.Currency),
                new ExcelColumn("Outstanding", ExcelColumnType.Currency),
                new ExcelColumn("Currency"),
                new ExcelColumn("Progress %", ExcelColumnType.Number, "0.0"),
                new ExcelColumn("Disbursed on", ExcelColumnType.Date),
                new ExcelColumn("Last payment", ExcelColumnType.Date),
                new ExcelColumn("Age (days)", ExcelColumnType.Number, "#,##0"),
                new ExcelColumn("Instalments", ExcelColumnType.Number, "#,##0"),
                new ExcelColumn("Overdue", ExcelColumnType.Number, "#,##0"),
                new ExcelColumn("Status"),
            },
            rows.Select(r => (IReadOnlyList<object?>)new object?[]
            {
                r.Code, r.MemberItsNumber, r.MemberName,
                r.AmountDisbursed, r.AmountRepaid, r.AmountOutstanding, r.Currency, r.ProgressPercent,
                r.DisbursedOn, r.LastPaymentDate, r.AgeDays,
                r.InstallmentCount, r.OverdueInstallments, r.Status.ToString(),
            }).ToList());
        return Xlsx(excel.Build(new[] { sheet }), $"outstanding-loans_{DateTime.UtcNow:yyyyMMdd}.xlsx");
    }

    // --- Pending commitments ----------------------------------------------

    [HttpGet("pending-commitments")]
    [Authorize(Policy = "reports.view")]
    public async Task<IActionResult> PendingCommitments([FromQuery] ReportPendingCommitmentsQuery q, CancellationToken ct)
        => Ok(await svc.PendingCommitmentsAsync(q, ct));

    [HttpGet("pending-commitments.xlsx")]
    [Authorize(Policy = "reports.export")]
    public async Task<IActionResult> PendingCommitmentsXlsx([FromQuery] ReportPendingCommitmentsQuery q, CancellationToken ct)
    {
        var rows = await svc.PendingCommitmentsAsync(q, ct);
        var sheet = new ExcelSheet(
            "Pending commitments",
            new[]
            {
                new ExcelColumn("Code"),
                new ExcelColumn("Party"),
                new ExcelColumn("ITS / Family"),
                new ExcelColumn("Fund code"),
                new ExcelColumn("Fund"),
                new ExcelColumn("Total", ExcelColumnType.Currency),
                new ExcelColumn("Paid", ExcelColumnType.Currency),
                new ExcelColumn("Remaining", ExcelColumnType.Currency),
                new ExcelColumn("Currency"),
                new ExcelColumn("Progress %", ExcelColumnType.Number, "0.0"),
                new ExcelColumn("Inst (paid/total)"),
                new ExcelColumn("Overdue", ExcelColumnType.Number, "#,##0"),
                new ExcelColumn("Next due", ExcelColumnType.Date),
                new ExcelColumn("Status"),
            },
            rows.Select(r => (IReadOnlyList<object?>)new object?[]
            {
                r.Code, r.PartyName, r.MemberItsNumber ?? r.FamilyCode,
                r.FundTypeCode, r.FundTypeName,
                r.TotalAmount, r.PaidAmount, r.RemainingAmount, r.Currency, r.ProgressPercent,
                $"{r.PaidInstallments}/{r.InstallmentCount}",
                r.OverdueInstallments, r.NextDueDate, r.Status.ToString(),
            }).ToList());
        return Xlsx(excel.Build(new[] { sheet }), $"pending-commitments_{DateTime.UtcNow:yyyyMMdd}.xlsx");
    }

    // --- Overdue (matured but not returned) returnable contributions ------

    [HttpGet("overdue-returns")]
    [Authorize(Policy = "reports.view")]
    public async Task<IActionResult> OverdueReturns([FromQuery] ReportOverdueReturnsQuery q, CancellationToken ct)
        => Ok(await svc.OverdueReturnsAsync(q, ct));

    [HttpGet("overdue-returns.xlsx")]
    [Authorize(Policy = "reports.export")]
    public async Task<IActionResult> OverdueReturnsXlsx([FromQuery] ReportOverdueReturnsQuery q, CancellationToken ct)
    {
        var rows = await svc.OverdueReturnsAsync(q, ct);
        var sheet = new ExcelSheet(
            "Overdue returns",
            new[]
            {
                new ExcelColumn("Receipt #"),
                new ExcelColumn("Receipt date", ExcelColumnType.Date),
                new ExcelColumn("ITS"),
                new ExcelColumn("Member"),
                new ExcelColumn("Fund code"),
                new ExcelColumn("Fund"),
                new ExcelColumn("Amount", ExcelColumnType.Currency),
                new ExcelColumn("Returned", ExcelColumnType.Currency),
                new ExcelColumn("Outstanding", ExcelColumnType.Currency),
                new ExcelColumn("Currency"),
                new ExcelColumn("Maturity", ExcelColumnType.Date),
                new ExcelColumn("Days overdue", ExcelColumnType.Number, "#,##0"),
                new ExcelColumn("Agreement"),
                new ExcelColumn("Niyyath"),
            },
            rows.Select(r => (IReadOnlyList<object?>)new object?[]
            {
                r.ReceiptNumber, r.ReceiptDate, r.ItsNumber, r.MemberName,
                r.FundTypeCode, r.FundTypeName,
                r.AmountTotal, r.AmountReturned, r.AmountOutstanding, r.Currency,
                r.MaturityDate, r.DaysOverdue,
                r.AgreementReference, r.NiyyathNote,
            }).ToList());
        return Xlsx(excel.Build(new[] { sheet }), $"overdue-returns_{DateTime.UtcNow:yyyyMMdd}.xlsx");
    }

    private FileContentResult Xlsx(byte[] bytes, string filename) =>
        File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename);
}

[ApiController]
[Authorize]
[Route("api/v1/dashboard")]
public sealed class DashboardController(IDashboardService svc) : ControllerBase
{
    [HttpGet("stats")]
    public async Task<IActionResult> Stats(CancellationToken ct) => Ok(await svc.StatsAsync(ct));

    [HttpGet("recent-activity")]
    public async Task<IActionResult> Recent([FromQuery] int take = 10, CancellationToken ct = default) => Ok(await svc.RecentActivityAsync(take, ct));

    [HttpGet("fund-slice")]
    public async Task<IActionResult> Fund([FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct)
        => Ok(await svc.FundSliceAsync(from, to, ct));

    /// <summary>BI insights bundle: 30-day collection trend + obligations strip + cheque
    /// pipeline. Replaces the 4-5 separate calls a chart-heavy dashboard would otherwise need.</summary>
    [HttpGet("insights")]
    public async Task<IActionResult> Insights(CancellationToken ct) => Ok(await svc.InsightsAsync(ct));
}
