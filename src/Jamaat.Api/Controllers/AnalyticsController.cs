using Jamaat.Application.Analytics;
using Jamaat.Contracts.Analytics;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

/// <summary>SuperAdmin analytics. Same permission family as the rest of the system module
/// (system.analytics.view) but on a separate path so the SystemMonitor / SystemAnalytics
/// pages can be split, navigated, and gated independently.</summary>
[ApiController]
[Authorize]
[Route("api/v1/system/analytics")]
public sealed class AnalyticsController(IAnalyticsService svc) : ControllerBase
{
    [HttpGet("overview")]
    [Authorize(Policy = "system.analytics.view")]
    [ProducesResponseType(typeof(AnalyticsOverviewDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> Overview(
        [FromQuery] DateOnly? from = null,
        [FromQuery] DateOnly? to = null,
        [FromQuery] Guid? tenantId = null,
        CancellationToken ct = default)
    {
        var t = to ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var f = from ?? t.AddDays(-29);
        return Ok(await svc.GetOverviewAsync(f, t, tenantId, ct));
    }

    [HttpGet("top-pages")]
    [Authorize(Policy = "system.analytics.view")]
    public async Task<IActionResult> TopPages([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, [FromQuery] int take = 20, [FromQuery] Guid? tenantId = null, CancellationToken ct = default)
    {
        var (f, t) = Range(from, to);
        return Ok(await svc.TopPagesAsync(f, t, take, tenantId, ct));
    }

    [HttpGet("top-actions")]
    [Authorize(Policy = "system.analytics.view")]
    public async Task<IActionResult> TopActions([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, [FromQuery] int take = 20, [FromQuery] Guid? tenantId = null, CancellationToken ct = default)
    {
        var (f, t) = Range(from, to);
        return Ok(await svc.TopActionsAsync(f, t, take, tenantId, ct));
    }

    [HttpGet("dau")]
    [Authorize(Policy = "system.analytics.view")]
    public async Task<IActionResult> Dau([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, [FromQuery] Guid? tenantId = null, CancellationToken ct = default)
    {
        var (f, t) = Range(from, to);
        return Ok(await svc.DailyActiveUsersAsync(f, t, tenantId, ct));
    }

    [HttpGet("heatmap")]
    [Authorize(Policy = "system.analytics.view")]
    public async Task<IActionResult> Heatmap([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, [FromQuery] Guid? tenantId = null, CancellationToken ct = default)
    {
        var (f, t) = Range(from, to);
        return Ok(await svc.HourlyHeatmapAsync(f, t, tenantId, ct));
    }

    [HttpGet("top-users")]
    [Authorize(Policy = "system.analytics.view")]
    public async Task<IActionResult> TopUsers([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, [FromQuery] int take = 20, [FromQuery] Guid? tenantId = null, CancellationToken ct = default)
    {
        var (f, t) = Range(from, to);
        return Ok(await svc.TopUsersAsync(f, t, take, tenantId, ct));
    }

    private static (DateOnly From, DateOnly To) Range(DateOnly? from, DateOnly? to)
    {
        var t = to ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var f = from ?? t.AddDays(-29);
        return (f, t);
    }
}
