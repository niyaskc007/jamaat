using Jamaat.Application.Members.Reliability;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

[ApiController]
[Route("api/v1")]
public sealed class ReliabilityController(IReliabilityService reliability) : ControllerBase
{
    /// <summary>Get a member's reliability profile (cached, recomputed lazily if stale).</summary>
    [HttpGet("members/{id:guid}/reliability")]
    [Authorize(Policy = "member.reliability.view")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var result = await reliability.GetAsync(id, ct);
        return result.IsSuccess
            ? Ok(result.Value)
            : ErrorMapper.ToActionResult(this, result.Error!);
    }

    /// <summary>Force a fresh recompute. Admin-only.</summary>
    [HttpPost("members/{id:guid}/reliability/recompute")]
    [Authorize(Policy = "member.reliability.recompute")]
    public async Task<IActionResult> Recompute(Guid id, CancellationToken ct)
    {
        var result = await reliability.RecomputeAsync(id, ct);
        return result.IsSuccess
            ? Ok(result.Value)
            : ErrorMapper.ToActionResult(this, result.Error!);
    }

    /// <summary>Cross-member distribution for the admin reliability dashboard.</summary>
    [HttpGet("admin/reliability/distribution")]
    [Authorize(Policy = "admin.reliability")]
    public async Task<IActionResult> Distribution(CancellationToken ct)
    {
        var result = await reliability.GetDistributionAsync(ct);
        return result.IsSuccess
            ? Ok(result.Value)
            : ErrorMapper.ToActionResult(this, result.Error!);
    }
}
