using Jamaat.Application.Accounting;
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
public sealed class ReportsController(IReportsService svc) : ControllerBase
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
