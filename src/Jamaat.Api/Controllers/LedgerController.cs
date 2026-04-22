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
    public async Task<IActionResult> FundWise([FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct)
        => Ok(await svc.FundWiseAsync(from, to, ct));

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
    public async Task<IActionResult> FundWiseXlsx([FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct)
    {
        var rows = await svc.FundWiseAsync(from, to, ct);
        var sheet = new ExcelSheet(
            "Fund-wise",
            new[]
            {
                new ExcelColumn("Fund code"),
                new ExcelColumn("Fund name"),
                new ExcelColumn("Lines", ExcelColumnType.Number, "#,##0"),
                new ExcelColumn("Amount", ExcelColumnType.Currency),
            },
            rows.Select(r => (IReadOnlyList<object?>)new object?[] { r.FundTypeCode, r.FundTypeName, r.LineCount, r.AmountTotal }).ToList());
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
}
