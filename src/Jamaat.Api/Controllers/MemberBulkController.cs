using Jamaat.Application.Members;
using Jamaat.Contracts.Members;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jamaat.Api.Controllers;

/// Bulk operations for the Members module. Kept in its own controller so the route
/// doesn't collide with /api/v1/members/{id}/... path templates.
[ApiController]
[Authorize]
[Route("api/v1/members/bulk")]
public sealed class MemberBulkController(IMemberProfileService svc) : ControllerBase
{
    /// <summary>Mark many members as data-verified in a single transaction.</summary>
    /// <remarks>
    /// Request body accepts up to 500 distinct ids — anything larger is truncated.
    /// Missing ids are returned in the response so the caller can reconcile.
    /// </remarks>
    [HttpPost("verify-data")]
    [Authorize(Policy = "member.verify")]
    public async Task<IActionResult> VerifyDataBulk([FromBody] BulkVerifyRequestDto dto, CancellationToken ct)
    {
        var r = await svc.VerifyDataBulkAsync(dto, ct);
        return r.IsSuccess ? Ok(r.Value) : ErrorMapper.ToActionResult(this, r.Error);
    }
}
