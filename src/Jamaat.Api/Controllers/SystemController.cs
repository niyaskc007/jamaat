using Jamaat.Application.SystemMonitor;
using Jamaat.Contracts.SystemMonitor;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

/// <summary>
/// SuperAdmin-only diagnostics. Endpoints are intentionally cheap so the System Monitor page
/// can poll them on a 5-10s cadence; each call samples fresh values rather than tracking
/// historical series (that's a job for Prometheus / OpenTelemetry, not this controller).
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/system")]
public sealed class SystemController(ISystemService svc) : ControllerBase
{
    [HttpGet("overview")]
    [Authorize(Policy = "system.view")]
    [ProducesResponseType(typeof(SystemOverviewDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> Overview([FromQuery] int logTake = 200, CancellationToken ct = default)
        => Ok(await svc.GetOverviewAsync(logTake, ct));

    [HttpGet("server")]
    [Authorize(Policy = "system.view")]
    [ProducesResponseType(typeof(ServerStatsDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> Server(CancellationToken ct)
        => Ok(await svc.GetServerStatsAsync(ct));

    [HttpGet("database")]
    [Authorize(Policy = "system.view")]
    [ProducesResponseType(typeof(DatabaseStatsDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> Database(CancellationToken ct)
        => Ok(await svc.GetDatabaseStatsAsync(ct));

    [HttpGet("logs")]
    [Authorize(Policy = "system.logs.view")]
    [ProducesResponseType(typeof(LogTailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Logs([FromQuery] int take = 500, CancellationToken ct = default)
    {
        var r = await svc.GetRecentLogsAsync(take, ct);
        return r is null ? NotFound(new { error = "no_log_files" }) : Ok(r);
    }

    [HttpGet("tenants")]
    [Authorize(Policy = "system.tenants.view")]
    [ProducesResponseType(typeof(IReadOnlyList<TenantSummaryDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Tenants(CancellationToken ct)
        => Ok(await svc.GetTenantsAsync(ct));

    /// <summary>"Live ops" snapshot: users online, recent logins, recent errors, request-rate
    /// trend. Same cadence as /overview - intended for the live tile strip.</summary>
    [HttpGet("live")]
    [Authorize(Policy = "system.view")]
    [ProducesResponseType(typeof(LiveOpsDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> Live(CancellationToken ct)
        => Ok(await svc.GetLiveOpsAsync(ct));
}
