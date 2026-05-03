using Jamaat.Application.Analytics;
using Jamaat.Contracts.Analytics;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

/// <summary>SPA-posted page-view tracker. Authenticated only - we don't track anonymous traffic
/// because there's no useful aggregation key. The endpoint returns 204 quickly; the actual
/// write goes through the bounded queue + flush worker so the request is never blocked on a
/// DB round-trip.</summary>
[ApiController]
[Authorize]
[Route("api/v1/usage")]
public sealed class UsageController(IAnalyticsService analytics) : ControllerBase
{
    [HttpPost("page")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> TrackPage([FromBody] TrackPageViewDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.Path)) return BadRequest(new { error = "path_required" });
        await analytics.TrackPageViewAsync(dto.Path, dto.DurationMs, ct);
        return NoContent();
    }
}
