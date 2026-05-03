using Jamaat.Application.SystemMonitor;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

/// <summary>Runtime-control surface for the SuperAdmin: GC, activity counters, runtime info.
/// Every write action writes to the operator-audit feed. Restart-the-service is intentionally
/// NOT here - that's an operating-system action that has to come from outside the process
/// (the Windows Service Manager or sc.exe), so we surface it on the UI as a documented
/// `sc.exe stop JamaatApi && sc.exe start JamaatApi` command rather than try to suicide-and-
/// resurrect ourselves from inside the process.</summary>
[ApiController]
[Authorize]
[Route("api/v1/system/runtime")]
public sealed class ServiceControlController(IServiceControl svc, ISystemAuditLogger audit) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "system.view")]
    [ProducesResponseType(typeof(RuntimeInfoDto), StatusCodes.Status200OK)]
    public IActionResult Info() => Ok(svc.GetRuntimeInfo());

    [HttpPost("gc")]
    [Authorize(Policy = "system.service.manage")]
    [ProducesResponseType(typeof(GcResultDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> ForceGc(CancellationToken ct)
    {
        var result = svc.ForceGc();
        await audit.RecordAsync(
            actionKey: "runtime.gc",
            summary: $"Forced GC: freed {result.FreedBytes / 1024 / 1024} MB in {result.DurationMs} ms",
            targetRef: null,
            detail: result,
            ct: ct);
        return Ok(result);
    }

    [HttpPost("reset-activity")]
    [Authorize(Policy = "system.service.manage")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> ResetActivity(CancellationToken ct)
    {
        svc.ResetActivityCounters();
        await audit.RecordAsync(
            actionKey: "runtime.activity.reset",
            summary: "Reset in-memory activity counters",
            ct: ct);
        return NoContent();
    }
}
