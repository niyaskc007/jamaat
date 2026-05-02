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
        var sheet = await BuildDailyCollectionSheet(from, to, ct);
        return Xlsx(excel.Build(new[] { sheet }), $"daily-collection_{from:yyyyMMdd}_{to:yyyyMMdd}.xlsx");
    }

    /// CSV companion - same data, single-sheet plain CSV with UTF-8 BOM. Useful for piping
    /// into pandas / R / PowerBI etc. without an Excel dependency.
    [HttpGet("daily-collection.csv")]
    [Authorize(Policy = "reports.export")]
    public async Task<IActionResult> DailyCollectionCsv([FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct)
    {
        var sheet = await BuildDailyCollectionSheet(from, to, ct);
        return Csv(excel.BuildCsv(sheet), $"daily-collection_{from:yyyyMMdd}_{to:yyyyMMdd}.csv");
    }

    private async Task<ExcelSheet> BuildDailyCollectionSheet(DateOnly from, DateOnly to, CancellationToken ct)
    {
        var rows = await svc.DailyCollectionAsync(from, to, ct);
        return new ExcelSheet(
            "Daily Collection",
            new[]
            {
                new ExcelColumn("Date", ExcelColumnType.Date),
                new ExcelColumn("Receipts", ExcelColumnType.Number, "#,##0"),
                new ExcelColumn("Amount", ExcelColumnType.Currency),
                new ExcelColumn("Currency"),
            },
            rows.Select(r => (IReadOnlyList<object?>)new object?[] { r.Date, r.ReceiptCount, r.AmountTotal, r.Currency }).ToList());
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

    private FileContentResult Csv(byte[] bytes, string filename) =>
        File(bytes, "text/csv", filename);
}

[ApiController]
[Authorize]
[Route("api/v1/dashboard")]
public sealed class DashboardController(IDashboardService svc, IExcelExporter excel) : ControllerBase
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

    /// <summary>Monthly income vs expense for the last N months. Drives the Accounting page's
    /// headline trend chart.</summary>
    [HttpGet("income-expense-trend")]
    [Authorize(Policy = "accounting.view")]
    public async Task<IActionResult> IncomeExpense([FromQuery] int months = 12, CancellationToken ct = default)
        => Ok(await svc.IncomeExpenseTrendAsync(months, ct));

    /// <summary>Top contributors by amount in the last N days.</summary>
    [HttpGet("top-contributors")]
    public async Task<IActionResult> TopContributors([FromQuery] int days = 30, [FromQuery] int take = 5, CancellationToken ct = default)
        => Ok(await svc.TopContributorsAsync(days, take, ct));

    /// <summary>Voucher outflow grouped by Purpose (top N + Other).</summary>
    [HttpGet("outflow-by-category")]
    [Authorize(Policy = "accounting.view")]
    public async Task<IActionResult> OutflowByCategory([FromQuery] int days = 30, [FromQuery] int take = 5, CancellationToken ct = default)
        => Ok(await svc.OutflowByCategoryAsync(days, take, ct));

    /// <summary>Cheques maturing in the next N days.</summary>
    [HttpGet("upcoming-cheques")]
    public async Task<IActionResult> UpcomingCheques([FromQuery] int days = 30, CancellationToken ct = default)
        => Ok(await svc.UpcomingChequesAsync(days, ct));

    /// <summary>QH portfolio dashboard data.</summary>
    [HttpGet("qh-portfolio")]
    [Authorize(Policy = "qh.view")]
    public async Task<IActionResult> QhPortfolio(CancellationToken ct) => Ok(await svc.QhPortfolioAsync(ct));

    /// <summary>Receivables aging across commitments + returnable receipts.</summary>
    [HttpGet("receivables-aging")]
    [Authorize(Policy = "reports.view")]
    public async Task<IActionResult> ReceivablesAging(CancellationToken ct) => Ok(await svc.ReceivablesAgingAsync(ct));

    /// <summary>Member status / verification breakdown + new-member trend.</summary>
    [HttpGet("member-engagement")]
    [Authorize(Policy = "member.view")]
    public async Task<IActionResult> MemberEngagement([FromQuery] int months = 12, CancellationToken ct = default)
        => Ok(await svc.MemberEngagementAsync(months, ct));

    /// <summary>Compliance + audit dashboard - audit volume, error counts, queues.
    /// `days` controls the audit/error trend window (clamped 1..365, default 30).</summary>
    [HttpGet("compliance")]
    [Authorize(Policy = "admin.audit")]
    public async Task<IActionResult> Compliance([FromQuery] int days = 30, CancellationToken ct = default)
        => Ok(await svc.ComplianceAsync(days, ct));

    /// <summary>Events dashboard - event status counts, registration mix, fill rates,
    /// monthly registration trend, top events + upcoming list.</summary>
    [HttpGet("events")]
    [Authorize(Policy = "event.view")]
    public async Task<IActionResult> Events([FromQuery] int months = 12, CancellationToken ct = default)
        => Ok(await svc.EventsAsync(months, ct));

    /// <summary>Post-dated cheque portfolio - status mix, bank distribution, maturity timeline,
    /// recent bounces, top pledgers.</summary>
    [HttpGet("cheques")]
    [Authorize(Policy = "accounting.view")]
    public async Task<IActionResult> Cheques(CancellationToken ct = default)
        => Ok(await svc.ChequesAsync(ct));

    /// <summary>Families analytics - size distribution, growth trend,
    /// top contributing + largest families.</summary>
    [HttpGet("families")]
    [Authorize(Policy = "family.view")]
    public async Task<IActionResult> Families([FromQuery] int months = 12, CancellationToken ct = default)
        => Ok(await svc.FamiliesAsync(months, ct));

    /// <summary>Fund enrollments dashboard - status mix, recurrence mix, by-fund-type,
    /// monthly enrollment trend.</summary>
    [HttpGet("fund-enrollments")]
    [Authorize(Policy = "enrollment.view")]
    public async Task<IActionResult> FundEnrollments([FromQuery] int months = 12, CancellationToken ct = default)
        => Ok(await svc.FundEnrollmentsAsync(months, ct));

    /// <summary>Per-event drill-in - returns 404 when the event id is unknown.</summary>
    [HttpGet("events/{eventId:guid}")]
    [Authorize(Policy = "event.view")]
    public async Task<IActionResult> EventDetail(Guid eventId, CancellationToken ct = default)
    {
        var dto = await svc.EventDetailAsync(eventId, ct);
        return dto is null ? NotFound() : Ok(dto);
    }

    /// <summary>Per-fund-type drill-in - returns 404 when the fund id is unknown.</summary>
    [HttpGet("fund-types/{fundTypeId:guid}")]
    [Authorize(Policy = "accounting.view")]
    public async Task<IActionResult> FundTypeDetail(Guid fundTypeId, [FromQuery] int months = 12, CancellationToken ct = default)
    {
        var dto = await svc.FundTypeDetailAsync(fundTypeId, months, ct);
        return dto is null ? NotFound() : Ok(dto);
    }

    /// <summary>System-wide cashflow over the last N days (clamped 1..365).</summary>
    [HttpGet("cashflow")]
    [Authorize(Policy = "accounting.view")]
    public async Task<IActionResult> Cashflow([FromQuery] int days = 90, CancellationToken ct = default)
        => Ok(await svc.CashflowAsync(days, ct));

    /// <summary>QH funnel - requests vs approvals vs disbursements, repayment, available pool.</summary>
    [HttpGet("qh-funnel")]
    [Authorize(Policy = "qh.view")]
    public async Task<IActionResult> QhFunnel([FromQuery] int months = 12, CancellationToken ct = default)
        => Ok(await svc.QhFunnelAsync(months, ct));

    /// <summary>Per-commitment-template analysis (counts, committed, paid, completion %).</summary>
    [HttpGet("commitment-types")]
    [Authorize(Policy = "reports.view")]
    public async Task<IActionResult> CommitmentTypes(CancellationToken ct = default)
        => Ok(await svc.CommitmentTypesAsync(ct));

    /// <summary>Vouchers dashboard - status mix, mode mix, payee/purpose roll-ups, daily outflow.
    /// Defaults to last 90 days when from/to omitted.</summary>
    [HttpGet("vouchers")]
    [Authorize(Policy = "accounting.view")]
    public async Task<IActionResult> Vouchers([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct = default)
        => Ok(await svc.VouchersAsync(from, to, ct));

    /// <summary>Receipts dashboard - inflow analysis. Optional fundTypeId scopes to a single fund.</summary>
    [HttpGet("receipts")]
    [Authorize(Policy = "accounting.view")]
    public async Task<IActionResult> Receipts([FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
        [FromQuery] Guid? fundTypeId, CancellationToken ct = default)
        => Ok(await svc.ReceiptsAsync(from, to, fundTypeId, ct));

    /// <summary>Member assets portfolio. Optional sectorId filters to one sector.</summary>
    [HttpGet("member-assets")]
    [Authorize(Policy = "member.view")]
    public async Task<IActionResult> MemberAssets([FromQuery] Guid? sectorId, CancellationToken ct = default)
        => Ok(await svc.MemberAssetsAsync(sectorId, ct));

    /// <summary>Sectors overview - per-sector member counts, contributions, families, commitments.</summary>
    [HttpGet("sectors")]
    [Authorize(Policy = "member.view")]
    public async Task<IActionResult> Sectors(CancellationToken ct = default)
        => Ok(await svc.SectorsAsync(ct));

    /// <summary>Returnable receipts portfolio - outstanding, age buckets, top holders, maturity timeline.</summary>
    [HttpGet("returnables")]
    [Authorize(Policy = "accounting.view")]
    public async Task<IActionResult> Returnables([FromQuery] Guid? fundTypeId, CancellationToken ct = default)
        => Ok(await svc.ReturnablesAsync(fundTypeId, ct));

    /// <summary>Per-member 360 view. 404 when the member id is unknown.</summary>
    [HttpGet("members/{memberId:guid}")]
    [Authorize(Policy = "member.view")]
    public async Task<IActionResult> MemberDetail(Guid memberId, CancellationToken ct = default)
    {
        var dto = await svc.MemberDetailAsync(memberId, ct);
        return dto is null ? NotFound() : Ok(dto);
    }

    /// <summary>Per-commitment drill-in. 404 when the commitment id is unknown.</summary>
    [HttpGet("commitments/{commitmentId:guid}")]
    [Authorize(Policy = "reports.view")]
    public async Task<IActionResult> CommitmentDetail(Guid commitmentId, CancellationToken ct = default)
    {
        var dto = await svc.CommitmentDetailAsync(commitmentId, ct);
        return dto is null ? NotFound() : Ok(dto);
    }

    /// <summary>Notifications engagement dashboard.</summary>
    [HttpGet("notifications")]
    [Authorize(Policy = "admin.audit")]
    public async Task<IActionResult> Notifications([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct = default)
        => Ok(await svc.NotificationsAsync(from, to, ct));

    /// <summary>User activity heatmap (admin audit events).</summary>
    [HttpGet("user-activity")]
    [Authorize(Policy = "admin.audit")]
    public async Task<IActionResult> UserActivity([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct = default)
        => Ok(await svc.UserActivityAsync(from, to, ct));

    // -- XLSX exports for the most-used dashboards -------------------------
    // These mirror the on-page tables the user sees so they can drop them straight into Excel
    // for further analysis or sharing with non-app users. All wrap the same service methods that
    // back the JSON dashboard endpoints, so numbers always reconcile.

    /// <summary>Cashflow XLSX export - daily inflow/outflow rows + by-fund + by-purpose rolls.</summary>
    [HttpGet("cashflow.xlsx")]
    [Authorize(Policy = "accounting.view")]
    public async Task<IActionResult> CashflowXlsx([FromQuery] int days = 90, CancellationToken ct = default)
    {
        var d = await svc.CashflowAsync(days, ct);
        var summarySheet = new ExcelSheet(
            "Summary",
            new[]
            {
                new ExcelColumn("Metric"),
                new ExcelColumn("Value", ExcelColumnType.Currency),
                new ExcelColumn("Currency"),
            },
            new IReadOnlyList<object?>[]
            {
                new object?[] { "Total inflow", d.TotalInflow, d.Currency },
                new object?[] { "Total outflow", d.TotalOutflow, d.Currency },
                new object?[] { "Net cashflow", d.NetCashflow, d.Currency },
                new object?[] { "Pending outflow", d.PendingOutflow, d.Currency },
                new object?[] { "Inflow this month", d.InflowThisMonth, d.Currency },
                new object?[] { "Outflow this month", d.OutflowThisMonth, d.Currency },
                new object?[] { "Inflow MTD prior month", d.InflowMtdPriorMonth, d.Currency },
                new object?[] { "Outflow MTD prior month", d.OutflowMtdPriorMonth, d.Currency },
            });
        var dailySheet = new ExcelSheet(
            "Daily curve",
            new[]
            {
                new ExcelColumn("Date", ExcelColumnType.Date),
                new ExcelColumn("Inflow", ExcelColumnType.Currency),
                new ExcelColumn("Outflow", ExcelColumnType.Currency),
                new ExcelColumn("Net", ExcelColumnType.Currency),
            },
            d.DailyCurve.Select(p => (IReadOnlyList<object?>)new object?[] { p.Date, p.Inflow, p.Outflow, p.Net }).ToList());
        var byFundSheet = new ExcelSheet(
            "Inflow by fund",
            new[] { new ExcelColumn("Fund"), new ExcelColumn("Receipts", ExcelColumnType.Number, "#,##0"), new ExcelColumn("Amount", ExcelColumnType.Currency) },
            d.InflowByFund.Select(x => (IReadOnlyList<object?>)new object?[] { x.Label, x.Count, x.Amount }).ToList());
        var byPurposeSheet = new ExcelSheet(
            "Outflow by purpose",
            new[] { new ExcelColumn("Purpose"), new ExcelColumn("Vouchers", ExcelColumnType.Number, "#,##0"), new ExcelColumn("Amount", ExcelColumnType.Currency) },
            d.OutflowByPurpose.Select(x => (IReadOnlyList<object?>)new object?[] { x.Label, x.Count, x.Amount }).ToList());
        return Xlsx(excel.Build(new[] { summarySheet, dailySheet, byFundSheet, byPurposeSheet }),
            $"cashflow_{DateTime.UtcNow:yyyyMMdd}.xlsx");
    }

    /// <summary>Vouchers dashboard XLSX export - status mix + payment-mode mix + top payees + by-purpose.</summary>
    [HttpGet("vouchers.xlsx")]
    [Authorize(Policy = "accounting.view")]
    public async Task<IActionResult> VouchersXlsx([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct = default)
    {
        var d = await svc.VouchersAsync(from, to, ct);
        var summarySheet = new ExcelSheet(
            "Summary",
            new[] { new ExcelColumn("Metric"), new ExcelColumn("Value", ExcelColumnType.Number, "#,##0") },
            new IReadOnlyList<object?>[]
            {
                new object?[] { "Total vouchers", d.TotalVouchers },
                new object?[] { "Draft", d.DraftCount },
                new object?[] { "Pending approval", d.PendingApprovalCount },
                new object?[] { "Approved", d.ApprovedCount },
                new object?[] { "Paid", d.PaidCount },
                new object?[] { "Cancelled", d.CancelledCount },
                new object?[] { "Reversed", d.ReversedCount },
                new object?[] { "Pending clearance", d.PendingClearanceCount },
                new object?[] { "Total paid amount", d.TotalPaidAmount },
                new object?[] { "Pending approval amount", d.PendingApprovalAmount },
                new object?[] { "Average voucher", d.AverageVoucherAmount },
            });
        var statusSheet = new ExcelSheet(
            "Status mix",
            new[] { new ExcelColumn("Status"), new ExcelColumn("Count", ExcelColumnType.Number, "#,##0"), new ExcelColumn("Amount", ExcelColumnType.Currency) },
            d.StatusMix.Select(x => (IReadOnlyList<object?>)new object?[] { x.Label, x.Count, x.Amount }).ToList());
        var payeesSheet = new ExcelSheet(
            "Top payees",
            new[] { new ExcelColumn("Payee"), new ExcelColumn("Vouchers", ExcelColumnType.Number, "#,##0"), new ExcelColumn("Amount", ExcelColumnType.Currency) },
            d.TopPayees.Select(x => (IReadOnlyList<object?>)new object?[] { x.Label, x.Count, x.Amount }).ToList());
        var purposeSheet = new ExcelSheet(
            "By purpose",
            new[] { new ExcelColumn("Purpose"), new ExcelColumn("Vouchers", ExcelColumnType.Number, "#,##0"), new ExcelColumn("Amount", ExcelColumnType.Currency) },
            d.ByPurpose.Select(x => (IReadOnlyList<object?>)new object?[] { x.Label, x.Count, x.Amount }).ToList());
        var dailySheet = new ExcelSheet(
            "Daily outflow",
            new[] { new ExcelColumn("Date", ExcelColumnType.Date), new ExcelColumn("Vouchers", ExcelColumnType.Number, "#,##0"), new ExcelColumn("Amount", ExcelColumnType.Currency) },
            d.DailyOutflow.Select(p => (IReadOnlyList<object?>)new object?[] { p.Date, p.Count, p.Amount }).ToList());
        return Xlsx(excel.Build(new[] { summarySheet, statusSheet, payeesSheet, purposeSheet, dailySheet }),
            $"vouchers_{DateTime.UtcNow:yyyyMMdd}.xlsx");
    }

    /// <summary>Receipts dashboard XLSX export.</summary>
    [HttpGet("receipts.xlsx")]
    [Authorize(Policy = "accounting.view")]
    public async Task<IActionResult> ReceiptsXlsx([FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
        [FromQuery] Guid? fundTypeId, CancellationToken ct = default)
    {
        var d = await svc.ReceiptsAsync(from, to, fundTypeId, ct);
        var summarySheet = new ExcelSheet(
            "Summary",
            new[] { new ExcelColumn("Metric"), new ExcelColumn("Value") },
            new IReadOnlyList<object?>[]
            {
                new object?[] { "Total receipts", d.TotalReceipts },
                new object?[] { "Confirmed", d.Confirmed },
                new object?[] { "Total amount", d.TotalAmount },
                new object?[] { "Permanent", d.PermanentAmount },
                new object?[] { "Returnable", d.ReturnableAmount },
                new object?[] { "Unique contributors", d.UniqueContributors },
                new object?[] { "Average receipt", d.AverageReceipt },
                new object?[] { "Largest receipt", d.LargestReceipt },
                new object?[] { "Currency", d.Currency },
                new object?[] { "Window from", d.WindowFrom?.ToString("yyyy-MM-dd") ?? "" },
                new object?[] { "Window to", d.WindowTo?.ToString("yyyy-MM-dd") ?? "" },
                new object?[] { "Scoped fund", d.ScopedFundName ?? "(all)" },
            });
        var byFundSheet = new ExcelSheet(
            "By fund",
            new[] { new ExcelColumn("Fund"), new ExcelColumn("Receipts", ExcelColumnType.Number, "#,##0"), new ExcelColumn("Amount", ExcelColumnType.Currency) },
            d.ByFund.Select(x => (IReadOnlyList<object?>)new object?[] { x.Label, x.Count, x.Amount }).ToList());
        var byModeSheet = new ExcelSheet(
            "By payment mode",
            new[] { new ExcelColumn("Mode"), new ExcelColumn("Receipts", ExcelColumnType.Number, "#,##0"), new ExcelColumn("Amount", ExcelColumnType.Currency) },
            d.ByPaymentMode.Select(x => (IReadOnlyList<object?>)new object?[] { x.Label, x.Count, x.Amount }).ToList());
        var topSheet = new ExcelSheet(
            "Top contributors",
            new[]
            {
                new ExcelColumn("ITS"),
                new ExcelColumn("Member"),
                new ExcelColumn("Receipts", ExcelColumnType.Number, "#,##0"),
                new ExcelColumn("Amount", ExcelColumnType.Currency),
            },
            d.TopContributors.Select(p => (IReadOnlyList<object?>)new object?[] { p.ItsNumber, p.FullName, p.ReceiptCount, p.Amount }).ToList());
        var dailySheet = new ExcelSheet(
            "Daily inflow",
            new[] { new ExcelColumn("Date", ExcelColumnType.Date), new ExcelColumn("Receipts", ExcelColumnType.Number, "#,##0"), new ExcelColumn("Amount", ExcelColumnType.Currency) },
            d.DailyInflow.Select(p => (IReadOnlyList<object?>)new object?[] { p.Date, p.Count, p.Amount }).ToList());
        return Xlsx(excel.Build(new[] { summarySheet, byFundSheet, byModeSheet, topSheet, dailySheet }),
            $"receipts_{DateTime.UtcNow:yyyyMMdd}.xlsx");
    }

    /// <summary>Per-member statement XLSX - profile + lifetime/YTD totals + commitments + loans + recent receipts.
    /// This is the "Member Statement" the operations team has been asking for. Reuses the per-member
    /// drill-in service method so figures always reconcile with the on-page dashboard.</summary>
    [HttpGet("members/{memberId:guid}.xlsx")]
    [Authorize(Policy = "member.view")]
    public async Task<IActionResult> MemberStatementXlsx(Guid memberId, CancellationToken ct = default)
    {
        var d = await svc.MemberDetailAsync(memberId, ct);
        if (d is null) return NotFound();
        var profileSheet = new ExcelSheet(
            "Profile",
            new[] { new ExcelColumn("Field"), new ExcelColumn("Value") },
            new IReadOnlyList<object?>[]
            {
                new object?[] { "ITS number", d.ItsNumber },
                new object?[] { "Full name", d.FullName },
                new object?[] { "Phone", d.Phone ?? "" },
                new object?[] { "Email", d.Email ?? "" },
                new object?[] { "Family", d.FamilyName ?? "" },
                new object?[] { "Sector", d.SectorName ?? "" },
                new object?[] { "Currency", d.Currency },
                new object?[] { "Lifetime contribution", d.LifetimeContribution },
                new object?[] { "YTD contribution", d.YtdContribution },
                new object?[] { "Lifetime receipts", d.LifetimeReceiptCount },
                new object?[] { "Active commitments", d.CommitmentCount },
                new object?[] { "Committed total", d.CommittedTotal },
                new object?[] { "Committed paid", d.CommittedPaid },
                new object?[] { "Loans (count)", d.LoanCount },
                new object?[] { "Loans outstanding", d.LoansOutstanding },
                new object?[] { "Asset value", d.AssetValue },
                new object?[] { "Event registrations", d.EventRegistrationCount },
                new object?[] { "Event check-ins", d.EventCheckedInCount },
            });
        var trendSheet = new ExcelSheet(
            "Monthly trend",
            new[] { new ExcelColumn("Year", ExcelColumnType.Number), new ExcelColumn("Month", ExcelColumnType.Number),
                new ExcelColumn("Amount", ExcelColumnType.Currency), new ExcelColumn("Receipts", ExcelColumnType.Number, "#,##0") },
            d.MonthlyContributionTrend.Select(p => (IReadOnlyList<object?>)new object?[] { p.Year, p.Month, p.Amount, p.Count }).ToList());
        var byFundSheet = new ExcelSheet(
            "By fund",
            new[] { new ExcelColumn("Fund"), new ExcelColumn("Receipts", ExcelColumnType.Number, "#,##0"), new ExcelColumn("Amount", ExcelColumnType.Currency) },
            d.ContributionByFund.Select(x => (IReadOnlyList<object?>)new object?[] { x.Label, x.Count, x.Amount }).ToList());
        var commitmentsSheet = new ExcelSheet(
            "Commitments",
            new[]
            {
                new ExcelColumn("Fund"), new ExcelColumn("Total", ExcelColumnType.Currency),
                new ExcelColumn("Paid", ExcelColumnType.Currency), new ExcelColumn("Status"),
                new ExcelColumn("Installments", ExcelColumnType.Number, "#,##0"),
                new ExcelColumn("Paid #", ExcelColumnType.Number, "#,##0"),
                new ExcelColumn("Overdue #", ExcelColumnType.Number, "#,##0"),
            },
            d.Commitments.Select(c => (IReadOnlyList<object?>)new object?[] { c.FundName, c.TotalAmount, c.PaidAmount,
                c.Status.ToString(), c.InstallmentsTotal, c.InstallmentsPaid, c.OverdueInstallments }).ToList());
        var loansSheet = new ExcelSheet(
            "Loans",
            new[]
            {
                new ExcelColumn("Code"), new ExcelColumn("Status"),
                new ExcelColumn("Disbursed", ExcelColumnType.Currency),
                new ExcelColumn("Repaid", ExcelColumnType.Currency),
                new ExcelColumn("Outstanding", ExcelColumnType.Currency),
                new ExcelColumn("Disbursed on", ExcelColumnType.Date),
            },
            d.Loans.Select(l => (IReadOnlyList<object?>)new object?[] { l.LoanCode, l.Status.ToString(),
                l.AmountDisbursed, l.AmountRepaid, l.AmountOutstanding, l.DisbursedOn }).ToList());
        var recentSheet = new ExcelSheet(
            "Recent receipts",
            new[]
            {
                new ExcelColumn("Receipt #"), new ExcelColumn("Date", ExcelColumnType.Date),
                new ExcelColumn("Amount", ExcelColumnType.Currency), new ExcelColumn("Status"),
            },
            d.RecentReceipts.Select(r => (IReadOnlyList<object?>)new object?[] { r.ReceiptNumber ?? "—", r.ReceiptDate, r.Amount, r.Status.ToString() }).ToList());
        return Xlsx(excel.Build(new[] { profileSheet, trendSheet, byFundSheet, commitmentsSheet, loansSheet, recentSheet }),
            $"member-statement_{d.ItsNumber}_{DateTime.UtcNow:yyyyMMdd}.xlsx");
    }

    /// <summary>Member change-requests queue dashboard.</summary>
    [HttpGet("change-requests")]
    [Authorize(Policy = "member.view")]
    public async Task<IActionResult> ChangeRequests([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct = default)
        => Ok(await svc.ChangeRequestsAsync(from, to, ct));

    /// <summary>Expense-type analytics dashboard - voucher outflow grouped by ExpenseType.</summary>
    [HttpGet("expense-types")]
    [Authorize(Policy = "accounting.view")]
    public async Task<IActionResult> ExpenseTypes([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct = default)
        => Ok(await svc.ExpenseTypesAsync(from, to, ct));

    /// <summary>Periods management overview - list periods + status + close-readiness signals.</summary>
    [HttpGet("periods")]
    [Authorize(Policy = "accounting.view")]
    public async Task<IActionResult> Periods(CancellationToken ct = default)
        => Ok(await svc.PeriodsAsync(ct));

    /// <summary>Annual summary report (JSON) - per-month income/expense + by-fund roll-up.</summary>
    [HttpGet("annual-summary")]
    [Authorize(Policy = "reports.view")]
    public async Task<IActionResult> AnnualSummary([FromQuery] int year, CancellationToken ct = default)
        => Ok(await svc.AnnualSummaryAsync(year, ct));

    /// <summary>Account reconciliation dashboard - bank accounts + COA balances with stale-flag.</summary>
    [HttpGet("reconciliation")]
    [Authorize(Policy = "accounting.view")]
    public async Task<IActionResult> Reconciliation(CancellationToken ct = default)
        => Ok(await svc.ReconciliationAsync(ct));

    /// <summary>Annual summary XLSX export - 3 sheets: Summary, Monthly, By fund.</summary>
    [HttpGet("annual-summary.xlsx")]
    [Authorize(Policy = "reports.export")]
    public async Task<IActionResult> AnnualSummaryXlsx([FromQuery] int year, CancellationToken ct = default)
    {
        var d = await svc.AnnualSummaryAsync(year, ct);
        var summarySheet = new ExcelSheet(
            $"Summary {d.Year}",
            new[] { new ExcelColumn("Metric"), new ExcelColumn("Value", ExcelColumnType.Currency) },
            new IReadOnlyList<object?>[]
            {
                new object?[] { "Total income", d.TotalIncome },
                new object?[] { "Total expense", d.TotalExpense },
                new object?[] { "Net", d.Net },
                new object?[] { $"Currency = {d.Currency}", null },
            });
        var monthlySheet = new ExcelSheet(
            "Monthly",
            new[] { new ExcelColumn("Month", ExcelColumnType.Number), new ExcelColumn("Income", ExcelColumnType.Currency),
                new ExcelColumn("Expense", ExcelColumnType.Currency), new ExcelColumn("Net", ExcelColumnType.Currency) },
            d.Monthly.Select(p => (IReadOnlyList<object?>)new object?[] { p.Month, p.Income, p.Expense, p.Net }).ToList());
        var fundSheet = new ExcelSheet(
            "By fund",
            new[] { new ExcelColumn("Code"), new ExcelColumn("Fund"),
                new ExcelColumn("Income", ExcelColumnType.Currency),
                new ExcelColumn("Receipts", ExcelColumnType.Number, "#,##0") },
            d.ByFund.Select(r => (IReadOnlyList<object?>)new object?[] { r.FundCode, r.FundName, r.Income, r.ReceiptCount }).ToList());
        var purposeSheet = new ExcelSheet(
            "By voucher purpose",
            new[] { new ExcelColumn("Purpose"), new ExcelColumn("Vouchers", ExcelColumnType.Number, "#,##0"),
                new ExcelColumn("Amount", ExcelColumnType.Currency) },
            d.ByVoucherPurpose.Select(p => (IReadOnlyList<object?>)new object?[] { p.Label, p.Count, p.Amount }).ToList());
        return Xlsx(excel.Build(new[] { summarySheet, monthlySheet, fundSheet, purposeSheet }),
            $"annual-summary_{d.Year}.xlsx");
    }

    /// <summary>User-activity (audit) XLSX export.</summary>
    [HttpGet("user-activity.xlsx")]
    [Authorize(Policy = "admin.audit")]
    public async Task<IActionResult> UserActivityXlsx([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct = default)
    {
        var d = await svc.UserActivityAsync(from, to, ct);
        var summarySheet = new ExcelSheet(
            "Summary",
            new[] { new ExcelColumn("Metric"), new ExcelColumn("Value", ExcelColumnType.Number, "#,##0") },
            new IReadOnlyList<object?>[]
            {
                new object?[] { "Total events", d.TotalEvents },
                new object?[] { "Unique users", d.UniqueUsers },
                new object?[] { "Unique entities", d.UniqueEntities },
            });
        var topUsersSheet = new ExcelSheet(
            "Top users",
            new[] { new ExcelColumn("User"), new ExcelColumn("Events", ExcelColumnType.Number, "#,##0") },
            d.TopUsers.Select(x => (IReadOnlyList<object?>)new object?[] { x.Label, x.Count }).ToList());
        var topEntsSheet = new ExcelSheet(
            "Top entities",
            new[] { new ExcelColumn("Entity"), new ExcelColumn("Events", ExcelColumnType.Number, "#,##0") },
            d.TopEntities.Select(x => (IReadOnlyList<object?>)new object?[] { x.Label, x.Count }).ToList());
        var recentSheet = new ExcelSheet(
            "Recent events",
            new[]
            {
                new ExcelColumn("When", ExcelColumnType.DateTime),
                new ExcelColumn("User"),
                new ExcelColumn("Action"),
                new ExcelColumn("Entity"),
                new ExcelColumn("Entity id"),
            },
            d.RecentEvents.Select(r => (IReadOnlyList<object?>)new object?[] { r.AtUtc.UtcDateTime, r.UserName, r.Action, r.EntityName, r.EntityId ?? "" }).ToList());
        return Xlsx(excel.Build(new[] { summarySheet, topUsersSheet, topEntsSheet, recentSheet }),
            $"user-activity_{DateTime.UtcNow:yyyyMMdd}.xlsx");
    }

    // -- CSV companions for the most-used dashboard exports ----------------
    // CSV is single-sheet by nature. Each .csv endpoint picks the most-useful primary sheet
    // (the daily/monthly time-series usually) - users who need the multi-sheet workbook stick
    // with the .xlsx endpoint.

    [HttpGet("cashflow.csv")]
    [Authorize(Policy = "accounting.view")]
    public async Task<IActionResult> CashflowCsv([FromQuery] int days = 90, CancellationToken ct = default)
    {
        var d = await svc.CashflowAsync(days, ct);
        var sheet = new ExcelSheet(
            "Daily curve",
            new[]
            {
                new ExcelColumn("Date", ExcelColumnType.Date),
                new ExcelColumn("Inflow", ExcelColumnType.Currency),
                new ExcelColumn("Outflow", ExcelColumnType.Currency),
                new ExcelColumn("Net", ExcelColumnType.Currency),
            },
            d.DailyCurve.Select(p => (IReadOnlyList<object?>)new object?[] { p.Date, p.Inflow, p.Outflow, p.Net }).ToList());
        return Csv(excel.BuildCsv(sheet), $"cashflow_{DateTime.UtcNow:yyyyMMdd}.csv");
    }

    [HttpGet("vouchers.csv")]
    [Authorize(Policy = "accounting.view")]
    public async Task<IActionResult> VouchersCsv([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct = default)
    {
        var d = await svc.VouchersAsync(from, to, ct);
        var sheet = new ExcelSheet(
            "Daily outflow",
            new[]
            {
                new ExcelColumn("Date", ExcelColumnType.Date),
                new ExcelColumn("Vouchers", ExcelColumnType.Number, "#,##0"),
                new ExcelColumn("Amount", ExcelColumnType.Currency),
            },
            d.DailyOutflow.Select(p => (IReadOnlyList<object?>)new object?[] { p.Date, p.Count, p.Amount }).ToList());
        return Csv(excel.BuildCsv(sheet), $"vouchers_{DateTime.UtcNow:yyyyMMdd}.csv");
    }

    [HttpGet("receipts.csv")]
    [Authorize(Policy = "accounting.view")]
    public async Task<IActionResult> ReceiptsCsv([FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
        [FromQuery] Guid? fundTypeId, CancellationToken ct = default)
    {
        var d = await svc.ReceiptsAsync(from, to, fundTypeId, ct);
        var sheet = new ExcelSheet(
            "Daily inflow",
            new[]
            {
                new ExcelColumn("Date", ExcelColumnType.Date),
                new ExcelColumn("Receipts", ExcelColumnType.Number, "#,##0"),
                new ExcelColumn("Amount", ExcelColumnType.Currency),
            },
            d.DailyInflow.Select(p => (IReadOnlyList<object?>)new object?[] { p.Date, p.Count, p.Amount }).ToList());
        return Csv(excel.BuildCsv(sheet), $"receipts_{DateTime.UtcNow:yyyyMMdd}.csv");
    }

    [HttpGet("annual-summary.csv")]
    [Authorize(Policy = "reports.export")]
    public async Task<IActionResult> AnnualSummaryCsv([FromQuery] int year, CancellationToken ct = default)
    {
        var d = await svc.AnnualSummaryAsync(year, ct);
        var sheet = new ExcelSheet(
            "Monthly",
            new[]
            {
                new ExcelColumn("Month", ExcelColumnType.Number),
                new ExcelColumn("Income", ExcelColumnType.Currency),
                new ExcelColumn("Expense", ExcelColumnType.Currency),
                new ExcelColumn("Net", ExcelColumnType.Currency),
            },
            d.Monthly.Select(p => (IReadOnlyList<object?>)new object?[] { p.Month, p.Income, p.Expense, p.Net }).ToList());
        return Csv(excel.BuildCsv(sheet), $"annual-summary_{d.Year}.csv");
    }

    [HttpGet("user-activity.csv")]
    [Authorize(Policy = "admin.audit")]
    public async Task<IActionResult> UserActivityCsv([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct = default)
    {
        var d = await svc.UserActivityAsync(from, to, ct);
        var sheet = new ExcelSheet(
            "Recent events",
            new[]
            {
                new ExcelColumn("When", ExcelColumnType.DateTime),
                new ExcelColumn("User"),
                new ExcelColumn("Action"),
                new ExcelColumn("Entity"),
                new ExcelColumn("Entity id"),
            },
            d.RecentEvents.Select(r => (IReadOnlyList<object?>)new object?[]
                { r.AtUtc.UtcDateTime, r.UserName, r.Action, r.EntityName, r.EntityId ?? "" }).ToList());
        return Csv(excel.BuildCsv(sheet), $"user-activity_{DateTime.UtcNow:yyyyMMdd}.csv");
    }

    private FileContentResult Xlsx(byte[] bytes, string filename) =>
        File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename);

    private FileContentResult Csv(byte[] bytes, string filename) =>
        File(bytes, "text/csv", filename);
}
