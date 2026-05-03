using Jamaat.Application.Analytics;
using Jamaat.Application.Common;
using Jamaat.Application.SystemMonitor;
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
public sealed class AnalyticsController(IAnalyticsService svc, IExcelExporter excel, ISystemAuditLogger audit) : ControllerBase
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

    /// <summary>Download all top-pages, top-actions, and DAU rows for the supplied range
    /// as XLSX (three sheets) or CSV (single sheet picked by `?sheet=...`). Default xlsx.
    /// Audited via SystemAuditLog so it's traceable who pulled which window.</summary>
    [HttpGet("export")]
    [Authorize(Policy = "system.analytics.export")]
    public async Task<IActionResult> Export(
        [FromQuery] DateOnly? from = null,
        [FromQuery] DateOnly? to = null,
        [FromQuery] string format = "xlsx",
        [FromQuery] string sheet = "pages",
        [FromQuery] Guid? tenantId = null,
        CancellationToken ct = default)
    {
        var (f, t) = Range(from, to);
        var pages = await svc.TopPagesAsync(f, t, take: 200, tenantId, ct);
        var actions = await svc.TopActionsAsync(f, t, take: 200, tenantId, ct);
        var dau = await svc.DailyActiveUsersAsync(f, t, tenantId, ct);

        var pagesSheet = new ExcelSheet(
            "Top pages",
            [new("Path"), new("Module"), new("Views", ExcelColumnType.Number), new("Unique users", ExcelColumnType.Number)],
            pages.Select(p => new object?[] { p.Path, p.Module, p.Views, p.UniqueUsers })
                .Cast<IReadOnlyList<object?>>().ToList());

        var actionsSheet = new ExcelSheet(
            "Top actions",
            [new("Action"), new("Module"), new("Method"), new("Calls", ExcelColumnType.Number),
             new("Unique users", ExcelColumnType.Number), new("Avg ms", ExcelColumnType.Number),
             new("p95 ms", ExcelColumnType.Number)],
            actions.Select(a => new object?[] { a.Action, a.Module, a.HttpMethod, a.Calls,
                a.UniqueUsers, a.AvgDurationMs, a.P95DurationMs })
                .Cast<IReadOnlyList<object?>>().ToList());

        var dauSheet = new ExcelSheet(
            "Daily activity",
            [new("Date", ExcelColumnType.Date), new("DAU", ExcelColumnType.Number),
             new("Page views", ExcelColumnType.Number), new("API calls", ExcelColumnType.Number)],
            dau.Select(d => new object?[] { d.Date.ToDateTime(TimeOnly.MinValue),
                d.DailyActiveUsers, d.PageViews, d.ActionCalls })
                .Cast<IReadOnlyList<object?>>().ToList());

        await audit.RecordAsync(
            actionKey: "analytics.export",
            summary: $"Exported analytics ({format}, {f:yyyy-MM-dd} to {t:yyyy-MM-dd})",
            targetRef: $"{f:yyyy-MM-dd}..{t:yyyy-MM-dd}",
            detail: new { format, sheet, tenantId, pageRows = pages.Count, actionRows = actions.Count },
            ct: ct);

        if (string.Equals(format, "csv", StringComparison.OrdinalIgnoreCase))
        {
            // CSV is one sheet; pick by ?sheet=pages|actions|dau (default pages).
            var pick = sheet?.ToLowerInvariant() switch
            {
                "actions" => actionsSheet,
                "dau" => dauSheet,
                _ => pagesSheet,
            };
            var bytes = excel.BuildCsv(pick);
            return File(bytes, "text/csv; charset=utf-8", $"jamaat-analytics-{pick.Name.Replace(' ', '-')}-{f:yyyyMMdd}-{t:yyyyMMdd}.csv");
        }

        // Default: XLSX with all three sheets.
        var xlsx = excel.Build([pagesSheet, actionsSheet, dauSheet]);
        return File(xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"jamaat-analytics-{f:yyyyMMdd}-{t:yyyyMMdd}.xlsx");
    }

    private static (DateOnly From, DateOnly To) Range(DateOnly? from, DateOnly? to)
    {
        var t = to ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var f = from ?? t.AddDays(-29);
        return (f, t);
    }
}
